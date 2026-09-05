/**
 * The DOM and vault the view layer is normally handed, close enough that the
 * shipped code runs unmodified.
 *
 * Importing this module installs two things into the surrounding jsdom, so
 * every view test file needs `// @vitest-environment jsdom` at the top:
 *
 * - the element helpers Obsidian adds to `Node`/`Element` (`createDiv`,
 *   `createEl`, `createSpan`, `empty`, `setText`), which are the only DOM
 *   calls `src/view/*` makes beyond the standard ones;
 * - a fireable `IntersectionObserver`, which jsdom does not implement at all,
 *   so a test can say "the sentinel came into view" instead of scrolling.
 *
 * Everything else — the element tree, `closest()`, `scrollTop`, `remove()` —
 * is jsdom's own, so the paging and self-reference guards are exercised against
 * real DOM semantics rather than a hand-rolled tree that agrees with them.
 */

import type { App } from "obsidian";

/* -------------------------------------------------------------------------- */
/* Obsidian's element helpers                                                 */
/* -------------------------------------------------------------------------- */

/** The subset of Obsidian's `DomElementInfo` that `src/view/*` actually passes. */
interface DomInfo {
  cls?: string | string[];
  text?: string;
  href?: string;
  title?: string;
  attr?: Record<string, string | number | boolean | null>;
}

function applyInfo(el: HTMLElement, info?: DomInfo | string): void {
  if (info === undefined) {
    return;
  }
  if (typeof info === "string") {
    el.className = info;
    return;
  }
  if (info.cls !== undefined) {
    el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
  }
  if (info.text !== undefined) {
    el.textContent = info.text;
  }
  if (info.href !== undefined) {
    el.setAttribute("href", info.href);
  }
  if (info.title !== undefined) {
    el.setAttribute("title", info.title);
  }
  for (const [name, value] of Object.entries(info.attr ?? {})) {
    if (value !== null) {
      el.setAttribute(name, String(value));
    }
  }
}

function create(
  parent: Node,
  tag: string,
  info?: DomInfo | string,
  callback?: (el: HTMLElement) => void,
): HTMLElement {
  const el = document.createElement(tag);
  applyInfo(el, info);
  parent.appendChild(el);
  callback?.(el);
  return el;
}

function installElementHelpers(): void {
  // Assigned through a loosely typed view of the prototypes on purpose. The
  // real `obsidian.d.ts` declares these as overloaded generic members of
  // `Node`, and a single plain function is not assignable to that; the
  // behaviour is what the tests need, not the type.
  const node = Node.prototype as unknown as Record<string, unknown>;
  const element = Element.prototype as unknown as Record<string, unknown>;

  node.createEl = function (
    this: Node,
    tag: string,
    info?: DomInfo | string,
    callback?: (el: HTMLElement) => void,
  ): HTMLElement {
    return create(this, tag, info, callback);
  };
  node.createDiv = function (
    this: Node,
    info?: DomInfo | string,
    callback?: (el: HTMLElement) => void,
  ): HTMLElement {
    return create(this, "div", info, callback);
  };
  node.createSpan = function (
    this: Node,
    info?: DomInfo | string,
    callback?: (el: HTMLElement) => void,
  ): HTMLElement {
    return create(this, "span", info, callback);
  };
  node.empty = function (this: Node): void {
    while (this.firstChild !== null) {
      this.removeChild(this.firstChild);
    }
  };
  element.setText = function (this: Element, value: string): void {
    this.textContent = value;
  };
}

/* -------------------------------------------------------------------------- */
/* A fireable IntersectionObserver                                           */
/* -------------------------------------------------------------------------- */

export class FakeIntersectionObserver {
  /** Every observer built since the last `reset()`, in order. */
  static readonly instances: FakeIntersectionObserver[] = [];

  /** The observer the current render is using. */
  static latest(): FakeIntersectionObserver {
    const io = FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1];
    if (io === undefined) {
      throw new Error("no IntersectionObserver was created");
    }
    return io;
  }

  static reset(): void {
    FakeIntersectionObserver.instances.length = 0;
  }

  /** What `watchSentinel` passed as `root` — the pane scroller, or null. */
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly targets: Element[] = [];
  /** False once `disconnect()` has run. */
  connected = true;

  private readonly callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

  constructor(
    callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void,
    init?: { root?: Element | Document | null; rootMargin?: string },
  ) {
    this.callback = callback;
    this.root = init?.root ?? null;
    this.rootMargin = init?.rootMargin ?? "0px";
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(target: Element): void {
    const at = this.targets.indexOf(target);
    if (at !== -1) {
      this.targets.splice(at, 1);
    }
  }

  disconnect(): void {
    this.connected = false;
  }

  takeRecords(): Array<{ target: Element; isIntersecting: boolean }> {
    return [];
  }

  /**
   * Report every observed target, the way a scroll would. Throws on a
   * disconnected observer, since the browser would never call back into one —
   * a test that hits this has found paging running off a dead observer.
   */
  fire(isIntersecting = true): void {
    if (!this.connected) {
      throw new Error("fired a disconnected IntersectionObserver");
    }
    this.callback(this.targets.map((target) => ({ target, isIntersecting })));
  }
}

function installIntersectionObserver(): void {
  (globalThis as unknown as Record<string, unknown>).IntersectionObserver =
    FakeIntersectionObserver;
}

installElementHelpers();
installIntersectionObserver();

/* -------------------------------------------------------------------------- */
/* Turning the event loop                                                     */
/* -------------------------------------------------------------------------- */

/** One macrotask turn. `setImmediate`, so nothing here waits on a clock. */
export function hop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Turn the event loop `hops` times, which is how a test waits for the view.
 *
 * A count of turns, not a delay: every await in the render path resolves off
 * the immediate queue, so this is deterministic — the same number of turns
 * always gets to the same place — and a run that needs more turns than the
 * bound fails an assertion instead of hanging.
 */
export async function settle(hops = 200): Promise<void> {
  for (let i = 0; i < hops; i += 1) {
    await hop();
  }
}

/* -------------------------------------------------------------------------- */
/* A vault                                                                    */
/* -------------------------------------------------------------------------- */

export interface FakeNote {
  path: string;
  /** What `cachedRead` returns. Only `display: full`/`preview` ever asks. */
  content?: string;
  ctime?: number;
  mtime?: number;
  frontmatter?: Record<string, unknown>;
  /** Inline tags, hash-prefixed or not — the mock's `getAllTags` normalizes. */
  tags?: string[];
}

interface FakeFile {
  path: string;
  basename: string;
  extension: string;
  stat: { ctime: number; mtime: number; size: number };
}

/** Local-time midnight, 1 January 2026. Matches `tests/fixtures/notes.ts`. */
export const DAY_ONE = new Date(2026, 0, 1).getTime();

/**
 * A vault the real `collectNotes` adapter and the real `renderItem` can both
 * read, plus counters for the things the view is supposed to do sparingly:
 * whole-vault scans and file reads.
 */
export class FakeVault {
  /** `getMarkdownFiles()` calls. One per `runStream`, so one per vault scan. */
  scans = 0;
  /** Paths handed to `cachedRead`, in call order. */
  readonly reads: string[] = [];
  /** Links the item header opened, in order. */
  readonly opened: Array<{ path: string; sourcePath: string; newLeaf: boolean }> = [];

  readonly app: App;

  private notes: FakeNote[] = [];
  private unopenable: string | null = null;
  private unreadable: string | null = null;
  private brokenScan: string | null = null;
  private hidden = new Set<string>();

  constructor(notes: FakeNote[] = []) {
    this.notes = notes;
    this.app = this.buildApp();
  }

  /** Swap what the vault holds, the way an edit or a new note would. */
  setNotes(notes: FakeNote[]): void {
    this.notes = notes;
  }

  /** Make `cachedRead` reject for one path, as an I/O failure would. */
  failReadsFor(path: string | null): void {
    this.unreadable = path;
  }

  /**
   * Make `openLinkText` reject for one path, the way clicking a note renamed
   * since the stream rendered does.
   */
  failOpensFor(path: string | null): void {
    this.unopenable = path;
  }

  /** Make the whole vault scan throw, the way a broken query run would. */
  failScans(message: string | null): void {
    this.brokenScan = message;
  }

  /** Make `getFileByPath` report a path as gone while it still lists. */
  hideFile(path: string): void {
    this.hidden.add(path);
  }

  private find(path: string): FakeNote | undefined {
    return this.notes.find((note) => note.path === path);
  }

  private file(note: FakeNote): FakeFile {
    const segments = note.path.split("/");
    return {
      path: note.path,
      basename: segments[segments.length - 1].replace(/\.md$/, ""),
      extension: "md",
      stat: {
        ctime: note.ctime ?? DAY_ONE,
        mtime: note.mtime ?? note.ctime ?? DAY_ONE,
        size: (note.content ?? "").length,
      },
    };
  }

  private buildApp(): App {
    const vault = {
      getMarkdownFiles: (): FakeFile[] => {
        this.scans += 1;
        if (this.brokenScan !== null) {
          throw new Error(this.brokenScan);
        }
        return this.notes.map((note) => this.file(note));
      },
      getFileByPath: (path: string): FakeFile | null => {
        if (this.hidden.has(path)) {
          return null;
        }
        const note = this.find(path);
        return note === undefined ? null : this.file(note);
      },
      cachedRead: async (file: { path: string }): Promise<string> => {
        this.reads.push(file.path);
        // One turn per read, so a page is genuinely drawn over several turns
        // and a sentinel hit can land in the middle of one.
        await hop();
        if (this.unreadable === file.path) {
          throw new Error(`cannot read ${file.path}`);
        }
        return this.find(file.path)?.content ?? "";
      },
    };
    const metadataCache = {
      getFileCache: (file: { path: string }): unknown => {
        const note = this.find(file.path);
        if (note === undefined) {
          return null;
        }
        return {
          frontmatter: note.frontmatter,
          tags: (note.tags ?? []).map((tag) => ({ tag })),
        };
      },
    };
    const workspace = {
      // Returns a promise, as the real one does: the view attaches a `catch`
      // to it, and a `void` fake would fail on the click rather than in a
      // test that means to exercise the failure.
      openLinkText: (path: string, sourcePath: string, newLeaf?: boolean): Promise<void> => {
        this.opened.push({ path, sourcePath, newLeaf: newLeaf === true });
        return this.unopenable === path
          ? Promise.reject(new Error(`No file named ${path}`))
          : Promise.resolve();
      },
    };
    // The one cast in the harness. `App` has hundreds of members and the view
    // touches five of them; naming those five here is the honest description.
    return { vault, metadataCache, workspace } as unknown as App;
  }
}

/**
 * `count` notes named so their path order, name order and creation order all
 * agree, which lets a paging test read "every note exactly once, in order"
 * straight off the DOM.
 */
export function numberedNotes(count: number, mtimeBase = DAY_ONE): FakeNote[] {
  return Array.from({ length: count }, (_unused, index) => ({
    path: `Notes/${String(index).padStart(3, "0")}.md`,
    content: `Body of note ${index}.`,
    ctime: DAY_ONE + index * 1000,
    mtime: mtimeBase + index * 1000,
  }));
}

/* -------------------------------------------------------------------------- */
/* The block's surroundings                                                   */
/* -------------------------------------------------------------------------- */

export interface Pane {
  /** The `.cm-scroller` ancestor `scrollerEl()` is meant to find. */
  scroller: HTMLElement;
  /** The element the code block processor hands to `StreamChild`. */
  container: HTMLElement;
}

/**
 * A code block inside a scrolling pane, attached to the document — attached
 * because `scrollerEl()` walks real ancestors and the paging observer's `root`
 * is supposed to be the scroller rather than the implicit viewport.
 */
export function mountPane(): Pane {
  const scroller = document.createElement("div");
  scroller.className = "cm-scroller";
  const container = document.createElement("div");
  container.className = "block-language-stream";
  scroller.appendChild(container);
  document.body.appendChild(scroller);
  return { scroller, container };
}

/** A code block with no scrolling pane around it, as an unscrolled note has. */
export function mountBareBlock(): HTMLElement {
  const container = document.createElement("div");
  container.className = "block-language-stream";
  document.body.appendChild(container);
  return container;
}

/* -------------------------------------------------------------------------- */
/* Reading the block back                                                     */
/* -------------------------------------------------------------------------- */

/** The item titles on screen, top to bottom. */
export function drawnTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".ss-item .ss-item-title")).map(
    (el) => el.textContent ?? "",
  );
}

/**
 * The fields the tests have to read off `StreamChild` that its own callers
 * never do. The paging cursor especially: "every note exactly once" is only
 * half the property, and the other half is that the cursor agrees with the
 * screen rather than claiming rows nobody drew.
 */
export interface Internals {
  rendered: number;
  pages: number;
  generation: number;
  signature: string;
  dead: boolean;
}

export function peek(child: object): Internals {
  return child as unknown as Internals;
}
