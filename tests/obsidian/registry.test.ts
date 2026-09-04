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

  it("drops a pending refresh when stopped", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    registry.stop();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(stream.refreshes).toBe(0);
  });
});
