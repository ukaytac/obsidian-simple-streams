import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, EventRef } from "obsidian";
import { DEBOUNCE_MS, StreamRegistry, type RefreshableStream } from "../../src/obsidian/registry";

type Handler = () => void;

function fakeApp() {
  const handlers: Record<string, Handler[]> = {};
  const on = (event: string, handler: Handler) => {
    handlers[event] = [...(handlers[event] ?? []), handler];
    return { event } as unknown as EventRef;
  };
  const app = {
    vault: { on },
    metadataCache: { on },
  } as unknown as App;
  return {
    app,
    fire(event: string) {
      for (const handler of handlers[event] ?? []) {
        handler();
      }
    },
    events: () => Object.keys(handlers),
  };
}

function stubStream() {
  return {
    refreshes: 0,
    errors: [] as unknown[],
    async refresh() {
      this.refreshes += 1;
    },
    showError(error: unknown) {
      this.errors.push(error);
    },
  };
}

/** A stream whose refresh hangs until released, to stall a flush mid-loop. */
function suspendableStream() {
  let release: () => void = () => {};
  return {
    refresh: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    showError: () => {},
    release: () => release(),
  };
}

let harness: ReturnType<typeof fakeApp>;
let registry: StreamRegistry;

beforeEach(() => {
  vi.useFakeTimers();
  harness = fakeApp();
  registry = new StreamRegistry(harness.app);
  registry.start();
});

afterEach(() => {
  registry.stop();
  vi.useRealTimers();
});

describe("StreamRegistry", () => {
  it("subscribes to the four events that can change a stream", () => {
    expect(harness.events().sort()).toEqual(["changed", "create", "delete", "rename"]);
  });

  it("refreshes a registered stream after the debounce", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    expect(stream.refreshes).toBe(0);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(stream.refreshes).toBe(1);
  });

  it("coalesces a burst of events into one refresh", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    harness.fire("create");
    harness.fire("delete");
    harness.fire("rename");

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(stream.refreshes).toBe(1);
  });

  it("refreshes every registered stream", async () => {
    const a = stubStream();
    const b = stubStream();
    registry.register(a);
    registry.register(b);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(a.refreshes).toBe(1);
    expect(b.refreshes).toBe(1);
  });

  it("stops refreshing an unregistered stream", async () => {
    const stream = stubStream();
    registry.register(stream);
    registry.unregister(stream);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(stream.refreshes).toBe(0);
  });

  it("shows a failing stream its error and still refreshes the others", async () => {
    const boom = new Error("boom");
    const broken: RefreshableStream & { errors: unknown[] } = {
      errors: [],
      refresh: () => Promise.reject(boom),
      showError(error: unknown) {
        this.errors.push(error);
      },
    };
    const healthy = stubStream();
    registry.register(broken);
    registry.register(healthy);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(broken.errors).toEqual([boom]);
    expect(healthy.refreshes).toBe(1);
  });

  it("arms no timer once stopped", async () => {
    // stop() clears the pending timer, but the event handlers stay live until
    // Obsidian drops the refs it was given, so an event can still arrive.
    const stream = stubStream();
    registry.register(stream);
    registry.stop();

    harness.fire("changed");
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(stream.refreshes).toBe(0);
  });

  it("skips a stream that closed while an earlier refresh was in flight", async () => {
    const slow = suspendableStream();
    const closing = stubStream();
    registry.register(slow);
    registry.register(closing);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(closing.refreshes).toBe(0);

    // The note holding `closing` is closed mid-flush; Component.register
    // unregisters it. Refreshing it now would re-render an unloaded block.
    registry.unregister(closing);
    slow.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(closing.refreshes).toBe(0);
  });

  it("abandons the rest of a flush when the plugin unloads mid-way", async () => {
    const slow = suspendableStream();
    const later = stubStream();
    registry.register(slow);
    registry.register(later);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    registry.stop();
    slow.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(later.refreshes).toBe(0);
  });

  it("drops a pending refresh when stopped", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    registry.stop();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(stream.refreshes).toBe(0);
  });
});
