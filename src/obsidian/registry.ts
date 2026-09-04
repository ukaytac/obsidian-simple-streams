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

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Subscribe to the events that can change a stream. The returned refs should
   * be handed to Plugin.registerEvent so they unsubscribe with the plugin.
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
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.streams.clear();
  }

  private schedule(): void {
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
