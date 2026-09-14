import { ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import { StreamChild } from "./StreamChild";
import { noteAt } from "../obsidian/adapter";
import type { StreamRegistry } from "../obsidian/registry";

export const SIDEBAR_VIEW_TYPE = "simple-streams-sidebar";

/** What the sidebar needs from the plugin around it. */
export interface SidebarDeps {
  registry: StreamRegistry;
  /** The query text, read fresh on every rebuild so a settings edit lands. */
  query: () => string;
}

/**
 * A stream that follows the note you are looking at.
 *
 * The view owns exactly one `StreamChild` and throws it away whenever the
 * followed note changes. Re-pointing an existing child instead would mean
 * resetting its paging cursor, its render generation and its result signature
 * from outside — the three fields whose invariants that file spends most of its
 * length protecting. A rebuild gets all three right by construction, through
 * the unload path the block tests already cover.
 */
export class StreamSidebarView extends ItemView {
  private readonly deps: SidebarDeps;
  private headerEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private child: StreamChild | null = null;
  private followed: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, deps: SidebarDeps) {
    super(leaf);
    this.deps = deps;
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Simple Streams";
  }

  getIcon(): string {
    return "layers";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    // `classList`, not Obsidian's `addClass` extension: the test harness's
    // jsdom shims cover the `createEl`-family helpers this file otherwise
    // uses, not that one, and the native method works identically in a real
    // vault.
    this.contentEl.classList.add("ss-sidebar");
    this.headerEl = this.contentEl.createDiv({ cls: "ss-sidebar-header" });
    // The scroller. `StreamChild.scrollerEl` looks for this class by name, so
    // the paging observer roots on the element that actually scrolls here.
    this.bodyEl = this.contentEl.createDiv({ cls: "ss-sidebar-body" });
    this.rebuild();
  }

  async onClose(): Promise<void> {
    this.teardown();
  }

  onunload(): void {
    // Not only `onClose`. A plugin unload drops the view without closing the
    // leaf, and a child left in the registry would be refreshed forever.
    this.teardown();
  }

  /** Point at a note, or at nothing, and rebuild. */
  follow(file: TFile | null): void {
    this.followed = file;
    this.rebuild();
  }

  /** Rebuild with the current query. Called on a settings change too. */
  rebuild(): void {
    const body = this.bodyEl;
    const header = this.headerEl;
    // `onOpen` has not run yet — Obsidian constructs a view before opening it,
    // and the tracker can answer in that gap. `follow` has already recorded the
    // note, so the `rebuild` at the end of `onOpen` draws it.
    if (body === null || header === null) {
      return;
    }

    this.teardown();
    body.empty();

    const file = this.followed;
    if (file === null) {
      // Hidden via the `hidden` property rather than a `.ss-sidebar-header:empty`
      // CSS rule keyed off `setText("")`: `:empty` only matches an element with
      // no child nodes at all, and `obsidian` ships only type declarations in
      // this repo, no runtime, so whether its real `setText` clears the element
      // outright or does something like `empty(); appendChild(textNode)` can't
      // be verified here. If it's the latter, `setText("")` leaves an empty text
      // node behind, `:empty` stops matching, and a bare bordered strip appears
      // above "Open a note to see related notes." on every first run — fresh
      // install, no note open yet. Setting `hidden` directly does not depend on
      // that guess.
      header.hidden = true;
      header.setText("");
      body.createDiv({
        cls: "ss-sidebar-empty",
        text: "Open a note to see related notes.",
      });
      return;
    }

    header.hidden = false;
    header.setText(`Following: ${file.basename}`);

    // `sourcePath` and `excludePath` below are `file.path` captured by value,
    // right here, once per rebuild — correct as of this moment, not kept
    // current. `note`, just below them, is different on purpose: it closes
    // over `file` itself and calls `noteAt` fresh each time, so it tracks a
    // rename for free — Obsidian mutates the same `TFile` in place, so the
    // object's `.path` is already the new one. A plain string has no such
    // update to ride along on. So after a rename this rebuild's `sourcePath`
    // and `excludePath` would go on naming the note's old path: previews would
    // resolve relative links against a path nothing lives at any more, and
    // `excludePath` would stop matching the live note, which is what would let
    // the followed note reappear in its own feed. What actually prevents that
    // is `follow()` running again with the renamed file, which rebuilds these
    // strings from its current `.path` — and that call is `ActiveNoteTracker`'s
    // job, since it watches `vault.rename` and re-emits the moment its own
    // `followedPath` stops matching. If the followed note is ever seen back in
    // its own feed after a rename, that wiring is the first place to look.
    const child = new StreamChild(body, this.app, this.deps.query(), {
      // The followed note's path, so a preview's relative links resolve the way
      // they would in that note rather than against the sidebar's nowhere.
      sourcePath: file.path,
      scope: "active",
      // Re-read per refresh, never captured: an edit to this note's properties
      // is the event the whole sidebar exists to follow.
      note: () => noteAt(this.app, file.path),
      excludePath: file.path,
    });
    child.register(() => this.deps.registry.unregister(child));
    this.deps.registry.register(child);
    this.addChild(child);
    this.child = child;
  }

  private teardown(): void {
    if (this.child !== null) {
      // `removeChild` unloads it, which fires the `register` callback above and
      // takes it out of the registry. Dropping the reference without unloading
      // would leave a stream refreshing into detached DOM for the life of the
      // session.
      this.removeChild(this.child);
      this.child = null;
    }
  }
}
