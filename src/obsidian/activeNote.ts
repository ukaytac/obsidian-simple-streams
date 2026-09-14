import { MarkdownView, type App, type EventRef, type TFile } from "obsidian";

/** Told the note now followed, or null when none is. */
export type ActiveNoteListener = (file: TFile | null) => void;

/**
 * Which Markdown note the sidebar should answer for.
 *
 * "The active note" sounds like one question and is three, because focus moves
 * to places that are not notes. Clicking into the sidebar to scroll it, or
 * opening a PDF beside a note, both leave `getActiveViewOfType(MarkdownView)`
 * empty — and a sidebar that blanks the moment the reader reaches for it is
 * not a sidebar. So the answer is resolved in three rules, in order:
 *
 * 1. An active `MarkdownView` with a file — follow it.
 * 2. Otherwise, if the followed note is still open somewhere — keep it. This
 *    is the stickiness, and the only rule that makes the other two usable.
 * 3. Otherwise, the workspace's own active file, if it is Markdown. This
 *    covers startup, where a note is restored but focus sits elsewhere.
 *
 * Falling through all three follows nothing.
 */
export class ActiveNoteTracker {
  private readonly app: App;
  private readonly listener: ActiveNoteListener;
  private followed: TFile | null = null;
  /**
   * The path as of the last notification. Compared against instead of the file
   * object, because Obsidian renames in place: after a rename the followed
   * object *is* the current answer and its `path` has already changed, so an
   * identity check would call it unchanged and leave the sidebar rendering
   * previews against a path that no longer exists.
   */
  private followedPath: string | null = null;

  constructor(app: App, listener: ActiveNoteListener) {
    this.app = app;
    this.listener = listener;
  }

  /**
   * Subscribe to what can change the answer. The returned refs should be handed
   * to Plugin.registerEvent so they unsubscribe with the plugin.
   *
   * `rename` and `delete` are vault events rather than workspace ones because
   * neither moves focus: renaming the open note fires no leaf change, and the
   * sidebar would keep naming the old title until the reader clicked away.
   */
  start(): EventRef[] {
    return [
      this.app.workspace.on("active-leaf-change", () => this.sync()),
      this.app.workspace.on("file-open", () => this.sync()),
      this.app.vault.on("rename", () => this.sync()),
      this.app.vault.on("delete", () => this.sync()),
    ];
  }

  /** The note currently followed, or null. */
  current(): TFile | null {
    return this.followed;
  }

  /**
   * Re-resolve, and tell the listener only when the answer actually moved.
   *
   * The guard is what keeps the sidebar still: `active-leaf-change` fires on
   * every click into any pane, and rebuilding the feed on each one would throw
   * away the reader's scroll position several times a minute for a result that
   * is identical.
   */
  sync(): void {
    const next = this.resolve();
    const nextPath = next?.path ?? null;
    if (nextPath === this.followedPath) {
      return;
    }
    this.followed = next;
    this.followedPath = nextPath;
    this.listener(next);
  }

  private resolve(): TFile | null {
    const onScreen = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
    if (onScreen !== null) {
      return onScreen;
    }
    if (this.followed !== null && this.isOpen(this.followed)) {
      return this.followed;
    }
    const active = this.app.workspace.getActiveFile();
    // `extension`, not `instanceof TFile`: a folder never reaches here, and
    // asking for the extension is the same question every other Markdown check
    // in this plugin asks.
    return active !== null && active.extension === "md" ? active : null;
  }

  private isOpen(file: TFile): boolean {
    return this.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
  }
}
