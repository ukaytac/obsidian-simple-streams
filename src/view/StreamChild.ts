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
  /**
   * Bumped by every `render()`. `renderUpTo` awaits `renderItem` per row, so a
   * refresh landing mid-loop leaves the older loop suspended over state the
   * newer pass now owns; the older loop compares this against the generation it
   * captured and stops instead of writing to it.
   */
  private generation = 0;
  /**
   * The generation whose paging loop is currently running, or -1. A generation
   * is always >= 1, so -1 cannot collide with one.
   */
  private pagingGeneration = -1;
  /** Set by `onunload`. An unloaded block must render nothing more. */
  private dead = false;
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
    // `render()`'s own try covers `compute()` only. A throw from the item loop
    // leaves the block half-drawn with no sentinel — lazy loading dead for the
    // life of the block — and `void` sends the reason to the console, the one
    // place spec section 7 says a failure must never only live.
    void this.render().catch((error: unknown) => {
      this.showError(error);
    });
  }

  onunload(): void {
    // The generation too, and the fields. `drawRows` awaits per row, so an
    // in-flight pass outlives the unload: measured 15 further items rendered
    // into a detached tree after the block was gone, each one free to pull in
    // embeds and other plugins' post-processors, and 16 render children left
    // added to an already-unloaded parent — never loaded, per obsidian.d.ts
    // 1868, and so never unloaded, per 1855. That is the leak `items` exists
    // to prevent, reopened from the other end.
    this.dead = true;
    this.generation += 1;
    this.observer?.disconnect();
    this.observer = null;
    this.items = null;
    this.listEl = null;
    this.sentinelEl = null;
  }

  showError(error: unknown): void {
    // The signature has to describe what is on screen, and `render()` stores
    // it before the item loop. A throw mid-render therefore leaves it
    // describing a result nobody saw, and `refresh()`'s short-circuit then
    // makes the error box permanent — it outlives its own cause until the note
    // is closed and reopened. No result can produce `""` — `signatureOf` is a
    // `JSON.stringify`, so the emptiest one is `"[[],[]]"` — which makes this
    // a value the next refresh is guaranteed to disagree with.
    this.signature = "";
    renderError(this.containerEl, error);
  }

  /** Re-render only when the matching notes or their mtimes changed. */
  async refresh(): Promise<void> {
    if (this.dead || this.query === null) {
      return;
    }
    // Computed once and handed to `render`, not computed again there. Two
    // `runStream` calls per refresh cost two full vault scans, and they ran
    // against two different `new Date()`s — so a `from: today` boundary
    // crossing between them let the signature that was compared describe a
    // result that was then thrown away.
    let result: StreamResult;
    try {
      result = this.compute();
    } catch (error) {
      this.showError(error);
      return;
    }
    if (signatureOf(result) === this.signature) {
      return;
    }

    const scroller = this.scrollerEl();
    const scrollTop = scroller?.scrollTop ?? 0;
    await this.render(result);
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

  private async render(precomputed?: StreamResult): Promise<void> {
    if (this.dead) {
      return;
    }
    const generation = ++this.generation;
    this.observer?.disconnect();
    this.observer = null;
    // Unload the previous pass's item children before their DOM goes away.
    if (this.items !== null) {
      this.removeChild(this.items);
      this.items = null;
    }
    this.containerEl.empty();
    // All three name the pass whose DOM was just dropped. `items` alone being
    // null is what stopped `drawRows` writing into the other two — one field
    // carrying an invariant that belongs to three, with two early returns
    // below reaching `showError` without clearing them.
    this.listEl = null;
    this.sentinelEl = null;

    if (this.query === null) {
      this.showError(this.failure);
      return;
    }

    let result: StreamResult;
    if (precomputed === undefined) {
      try {
        result = this.compute();
      } catch (error) {
        this.showError(error);
        return;
      }
    } else {
      result = precomputed;
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
      return;
    }

    // Resolved before the item loop. `watchSentinel` used to call
    // `scrollerEl()` after every await, so a block detached mid-render found
    // no scroller and silently took `root: null` — a legal init meaning "the
    // viewport", hence an observer that looks fine and preloads nothing.
    const scroller = this.scrollerEl();
    this.items = new Component();
    this.addChild(this.items);
    this.listEl = root.createDiv({ cls: "ss-list" });
    this.sentinelEl = root.createDiv({ cls: "ss-sentinel" });
    await this.renderUpTo(generation);
    this.watchSentinel(scroller);
  }

  /**
   * Draw rows up to `this.pages`, one loop at a time.
   *
   * The target is read fresh each turn instead of being passed in, so a
   * sentinel hit that lands mid-loop raises the target the running loop is
   * already walking toward rather than starting a second loop beside it.
   */
  private async renderUpTo(generation: number): Promise<void> {
    // Two loops of the *same* generation were the sharper half of this bug.
    // Both clear the generation check, both read `rows[rendered]` for the same
    // index across the same await, and both then increment. Measured over 100
    // notes with four sentinel re-entries: 3 rows drawn twice, 3 notes never
    // drawn at all, and the cursor still claiming all 100 — a stream silently
    // missing notes, which is the one thing it exists to not do. Claiming the
    // index before the await would stop the duplicates but not the disorder,
    // since the later row can finish first and be appended above the earlier
    // one. Serializing is what actually holds.
    if (this.pagingGeneration === generation) {
      return;
    }
    this.pagingGeneration = generation;
    try {
      await this.drawRows(generation);
    } finally {
      if (this.pagingGeneration === generation) {
        this.pagingGeneration = -1;
      }
    }
  }

  private async drawRows(generation: number): Promise<void> {
    const list = this.listEl;
    const query = this.query;
    // Captured, not read per row: a pass that loses the race parents its last
    // in-flight item to its own component, which is already unloaded, instead
    // of hanging a stale note's render child on the live one. That leaves the
    // one orphan bounded either way — parented here it is never loaded and so
    // never unloaded; parented to the live component it would outlive its own
    // pass. Neither is free; this one at least cannot accumulate.
    const parent = this.items;
    if (list === null || query === null || parent === null) {
      return;
    }

    while (this.rendered < Math.min(this.pages * PAGE_SIZE, this.rows.length)) {
      // A refresh can start a new pass while this one waits on renderItem.
      // `rendered`, `rows` and `listEl` all belong to whichever pass is
      // current, so an unguarded stale loop appends to detached DOM and walks
      // `rendered` past what the new pass actually drew — which surfaces as
      // gaps or wrong items the moment the new pass resumes.
      if (generation !== this.generation) {
        return;
      }
      const row = this.rows[this.rendered];
      if (row.header !== null) {
        list.createDiv({ cls: "ss-group", text: row.header });
      }
      await renderItem(list, row.note, {
        app: this.app,
        query,
        parent,
        sourcePath: this.sourcePath,
      });
      if (generation !== this.generation) {
        return;
      }
      this.rendered += 1;
    }

    if (this.rendered >= this.rows.length) {
      this.observer?.disconnect();
      this.observer = null;
      this.sentinelEl?.remove();
      this.sentinelEl = null;
    }
  }

  private watchSentinel(scroller: HTMLElement | null): void {
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
        // Caught, not left to `void`: a throw from the item loop would
        // otherwise wedge paging mid-page and report itself only to the
        // console, which spec section 7 says a failure must never only do.
        void this.renderUpTo(this.generation).catch((error: unknown) => {
          this.showError(error);
        });
      },
      // `root` has to be the scroller, not the implicit viewport. An observer
      // clips the target against every overflow-clipping ancestor using those
      // ancestors' own unexpanded bounds, and expands only the final root rect
      // by `rootMargin`. Left implicit, `.cm-scroller` clips the sentinel
      // first and the 200px preload buffer does nothing — the next page starts
      // loading exactly when the sentinel is already on screen. A null scroller
      // falls back to the viewport, which is what an unscrolled pane wants.
      { root: scroller, rootMargin: "200px" },
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
  // JSON, not `path:mtime` joined on `|`: a path may contain both delimiters
  // — Obsidian's own UI forbids them in titles, but `getMarkdownFiles` still
  // lists a file created outside it — and an ambiguous signature reads as
  // unchanged, which is a refresh that never happens.
  const notes = result.groups.flatMap((group) =>
    group.notes.map((note) => [note.path, note.mtime] as const),
  );
  return JSON.stringify([notes, result.notices]);
}
