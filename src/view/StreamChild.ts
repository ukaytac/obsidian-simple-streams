import { Component, MarkdownRenderChild, type App } from "obsidian";
import { runStream, type StreamNotice, type StreamResult } from "../engine/run";
import { collectNotes } from "../obsidian/adapter";
import { describeQuery } from "../query/describe";
import { parseQuery } from "../query/parse";
import { renderError } from "./errorEl";
import { renderItem } from "./itemEl";
import type { NoteMeta } from "../engine/note";
import type { StreamQuery } from "../query/types";

const PAGE_SIZE = 20;

interface Row {
  /** The group header to print above this row, or null. */
  header: string | null;
  note: NoteMeta;
}

export class StreamChild extends MarkdownRenderChild {
  private readonly app: App;
  private readonly sourcePath: string;
  private query: StreamQuery | null = null;
  private failure: unknown = null;

  private rows: Row[] = [];
  private rendered = 0;
  private pages = 1;
  private signature = "";

  private listEl: HTMLElement | null = null;
  private sentinelEl: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  /**
   * One throwaway parent per render pass, holding that pass's per-item render
   * children. `render()` runs again on every refresh, so adding those children
   * straight to this long-lived child would pile up a fresh batch each time and
   * never drop the old one — a leak that grows with every vault change while
   * the note stays open, which is the very thing parenting them was for.
   *
   * Emptying the container is not enough on its own. A MarkdownRenderChild does
   * auto-unload when its element stops being live, but that mechanism is
   * Obsidian's own and is not part of the public declarations, so its timing
   * for a plugin calling `empty()` on its own container is unverifiable.
   * Unloading a parent we own is deterministic and synchronous.
   */
  private items: Component | null = null;

  constructor(containerEl: HTMLElement, app: App, source: string, sourcePath: string) {
    super(containerEl);
    this.app = app;
    this.sourcePath = sourcePath;
    try {
      this.query = parseQuery(source);
    } catch (error) {
      this.failure = error;
    }
  }

  onload(): void {
    void this.render();
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  showError(error: unknown): void {
    renderError(this.containerEl, error);
  }

  /** Re-render only when the matching notes or their mtimes changed. */
  async refresh(): Promise<void> {
    if (this.query === null) {
      return;
    }
    let next: string;
    try {
      next = signatureOf(this.compute());
    } catch (error) {
      this.showError(error);
      return;
    }
    if (next === this.signature) {
      return;
    }

    const scroller = this.scrollerEl();
    const scrollTop = scroller?.scrollTop ?? 0;
    await this.render();
    if (scroller !== null) {
      scroller.scrollTop = scrollTop;
    }
  }

  private compute(): StreamResult {
    if (this.query === null) {
      throw new Error("Simple Streams: no query to run");
    }
    return runStream(collectNotes(this.app), this.query, new Date());
  }

  private async render(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    // Unload the previous pass's item children before their DOM goes away.
    if (this.items !== null) {
      this.removeChild(this.items);
      this.items = null;
    }
    this.containerEl.empty();

    if (this.query === null) {
      this.showError(this.failure);
      return;
    }

    let result: StreamResult;
    try {
      result = this.compute();
    } catch (error) {
      this.showError(error);
      return;
    }

    this.signature = signatureOf(result);
    this.rows = toRows(result);
    this.rendered = 0;

    const root = this.containerEl.createDiv({ cls: "simple-streams" });

    // Before the empty branch, not after. An empty stream is exactly when a
    // typo'd date-field needs explaining, and runStream judges that check
    // before the date range for the same reason — rendering the notices only
    // alongside results would undo it one layer up.
    renderNotices(root, result);

    if (this.rows.length === 0) {
      root.createDiv({ cls: "ss-empty", text: "No notes match this stream." });
      root.createDiv({ cls: "ss-empty-summary", text: describeQuery(this.query) });
      this.listEl = null;
      this.sentinelEl = null;
      return;
    }

    this.items = new Component();
    this.addChild(this.items);
    this.listEl = root.createDiv({ cls: "ss-list" });
    this.sentinelEl = root.createDiv({ cls: "ss-sentinel" });
    await this.renderUpTo(this.pages);
    this.watchSentinel();
  }

  private async renderUpTo(pages: number): Promise<void> {
    const list = this.listEl;
    const query = this.query;
    if (list === null || query === null) {
      return;
    }

    const target = Math.min(pages * PAGE_SIZE, this.rows.length);
    while (this.rendered < target) {
      const row = this.rows[this.rendered];
      if (row.header !== null) {
        list.createDiv({ cls: "ss-group", text: row.header });
      }
      await renderItem(list, row.note, {
        app: this.app,
        query,
        parent: this.items ?? this,
        sourcePath: this.sourcePath,
      });
      this.rendered += 1;
    }

    if (this.rendered >= this.rows.length) {
      this.observer?.disconnect();
      this.observer = null;
      this.sentinelEl?.remove();
      this.sentinelEl = null;
    }
  }

  private watchSentinel(): void {
    const sentinel = this.sentinelEl;
    if (sentinel === null) {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        this.pages += 1;
        void this.renderUpTo(this.pages);
      },
      { rootMargin: "200px" },
    );
    this.observer.observe(sentinel);
  }

  private scrollerEl(): HTMLElement | null {
    return this.containerEl.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
  }
}

/** Say each of the engine's notices once, for the whole block. */
function renderNotices(root: HTMLElement, result: StreamResult): void {
  for (const notice of result.notices) {
    root.createDiv({ cls: "ss-notice", text: describeNotice(notice) });
  }
}

/**
 * The engine reports facts; the words live here. Exhaustive on purpose: a new
 * notice kind fails to compile until someone gives it a sentence, which is the
 * whole reason the engine returns a tagged list instead of flags.
 */
function describeNotice(notice: StreamNotice): string {
  switch (notice.kind) {
    case "dateFallback":
      return `No note here has a usable \`${notice.field}\`, so this stream is ordered and grouped by file creation time.`;
    case "unresolvedSort": {
      const fields = notice.fields.map((field) => `\`${field}\``).join(" or ");
      return `No note here has ${fields}, so that part of the sort had no effect.`;
    }
    case "truncated":
      return `Showing ${notice.shown} of ${notice.matched} notes. Raise \`limit\` to see more.`;
    default:
      return assertNeverNotice(notice);
  }
}

/** Unreachable. A new StreamNotice kind fails to compile until described above. */
function assertNeverNotice(notice: never): never {
  throw new Error(`Undescribed stream notice: ${JSON.stringify(notice)}`);
}

function toRows(result: StreamResult): Row[] {
  const rows: Row[] = [];
  for (const group of result.groups) {
    group.notes.forEach((note, index) => {
      rows.push({ header: index === 0 ? group.header : null, note });
    });
  }
  return rows;
}

/**
 * What has to change for a re-render to be worth doing. The shown notes and
 * their mtimes, plus the notices — the notices because `matched` can move while
 * the shown list does not: one more note arriving beyond the `limit` leaves the
 * list identical and the "Showing 50 of 60" line wrong, and a `date:` added to
 * a note past the limit can flip the date-fallback notice the same way.
 */
function signatureOf(result: StreamResult): string {
  const notes = result.groups.flatMap((group) =>
    group.notes.map((note) => `${note.path}:${note.mtime}`),
  );
  return [...notes, JSON.stringify(result.notices)].join("|");
}
