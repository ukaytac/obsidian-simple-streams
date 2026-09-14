import { MarkdownView } from "../mocks/obsidian";

export interface FakeFile {
  path: string;
  basename: string;
  extension: string;
}

export function file(path: string, extension = "md"): FakeFile {
  const segments = path.split("/");
  return {
    path,
    basename: segments[segments.length - 1].replace(/\.[^.]+$/, ""),
    extension,
  };
}

/**
 * A workspace and a vault that fire the four events the tracker listens to,
 * and answer the three questions it asks. Everything is a plain field a test
 * sets directly, so a test reads as "this is what the workspace looks like
 * now, fire the event".
 */
export class FakeWorkspace {
  /** What `getActiveViewOfType(MarkdownView)` answers. */
  activeView: MarkdownView | null = null;
  /** What `getLeavesOfType("markdown")` answers, as leaves wrapping views. */
  markdownViews: MarkdownView[] = [];
  /** What `getActiveFile()` answers. */
  activeFile: FakeFile | null = null;

  private readonly handlers = new Map<string, Array<() => void>>();

  readonly app: { workspace: unknown; vault: unknown };

  constructor() {
    this.app = { workspace: this.workspace(), vault: this.vault() };
  }

  /** Fire one event, the way Obsidian would after the state above changed. */
  fire(name: string): void {
    for (const handler of this.handlers.get(name) ?? []) {
      handler();
    }
  }

  /** Put a note on screen and in the open set, and fire the leaf change. */
  open(target: FakeFile): void {
    const view = new MarkdownView(target);
    this.activeView = view;
    this.activeFile = target;
    this.markdownViews = [...this.markdownViews.filter((v) => v.file?.path !== target.path), view];
    this.fire("active-leaf-change");
  }

  /** Move focus off every Markdown view, leaving the open set alone. */
  blur(): void {
    this.activeView = null;
    this.fire("active-leaf-change");
  }

  /** Close a note: out of the open set, and off screen if it was on it. */
  close(path: string): void {
    this.markdownViews = this.markdownViews.filter((view) => view.file?.path !== path);
    if (this.activeView?.file?.path === path) {
      this.activeView = null;
    }
    if (this.activeFile?.path === path) {
      this.activeFile = null;
    }
    this.fire("active-leaf-change");
  }

  private on(name: string, handler: () => void): { name: string } {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
    return { name };
  }

  private workspace(): unknown {
    return {
      on: (name: string, handler: () => void) => this.on(name, handler),
      getActiveViewOfType: (): MarkdownView | null => this.activeView,
      getLeavesOfType: (type: string): Array<{ view: MarkdownView }> =>
        type === "markdown" ? this.markdownViews.map((view) => ({ view })) : [],
      getActiveFile: (): FakeFile | null => this.activeFile,
    };
  }

  private vault(): unknown {
    return { on: (name: string, handler: () => void) => this.on(name, handler) };
  }
}
