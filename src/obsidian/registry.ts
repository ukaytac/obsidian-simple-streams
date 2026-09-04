import type { App, EventRef } from "obsidian";

export const DEBOUNCE_MS = 300;

/** What the registry needs from a stream. Keeps this file free of DOM concerns. */
export interface RefreshableStream {
  refresh(): Promise<void>;
  showError(error: unknown): void;
}

export class StreamRegistry {
  private readonly app: App;
  private readonly streams = new Set<RefreshableStream>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Subscribe to the events that can change a stream. The returned refs should
   * be handed to Plugin.registerEvent so they unsubscribe with the plugin.
   *
   * Call once per registry, and never after `stop()`: a stopped registry is
   * spent by design, because a plugin unload builds a fresh one on next load.
   */
  start(): EventRef[] {
    return [
      this.app.metadataCache.on("changed", () => this.schedule()),
      this.app.vault.on("create", () => this.schedule()),
      this.app.vault.on("delete", () => this.schedule()),
      this.app.vault.on("rename", () => this.schedule()),
    ];
  }

  register(stream: RefreshableStream): void {
    this.streams.add(stream);
  }

  unregister(stream: RefreshableStream): void {
    this.streams.delete(stream);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.streams.clear();
  }

  private schedule(): void {
    // Obsidian unsubscribes the handlers itself, through the refs `start()`
    // handed to `registerEvent`, so `stop()` cannot silence them first. An
    // event landing in that gap would otherwise arm a fresh timer that
    // outlives the plugin it belongs to.
    if (this.stopped) {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    for (const stream of [...this.streams]) {
      // Membership is re-checked each time round, not just snapshotted once.
      // `refresh()` is awaited per stream and takes as long as rendering that
      // block, so within one flush a note can be closed — which unregisters it
      // — or the plugin can unload. Refreshing a stream whose `onunload` has
      // already run makes it re-render and build a fresh IntersectionObserver
      // that nothing is left to disconnect.
      if (this.stopped) {
        return;
      }
      if (!this.streams.has(stream)) {
        continue;
      }
      try {
        await stream.refresh();
      } catch (error) {
        // A stream that cannot refresh says so in its own block, and the rest
        // of the streams still get their turn.
        stream.showError(error);
      }
    }
  }
}
