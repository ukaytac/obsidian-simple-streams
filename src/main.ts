import { Plugin, type WorkspaceLeaf } from "obsidian";
import { ActiveNoteTracker } from "./obsidian/activeNote";
import { noteAt } from "./obsidian/adapter";
import { StreamRegistry } from "./obsidian/registry";
import { DEFAULT_SETTINGS, type SimpleStreamsSettings } from "./settings";
import { SimpleStreamsSettingTab } from "./view/SettingsTab";
import { StreamChild } from "./view/StreamChild";
import { SIDEBAR_VIEW_TYPE, StreamSidebarView } from "./view/StreamSidebarView";

export default class SimpleStreamsPlugin extends Plugin {
  settings: SimpleStreamsSettings = { ...DEFAULT_SETTINGS };

  private registry: StreamRegistry | null = null;
  private tracker: ActiveNoteTracker | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    const registry = new StreamRegistry(this.app);
    this.registry = registry;
    for (const ref of registry.start()) {
      this.registerEvent(ref);
    }

    this.registerMarkdownCodeBlockProcessor("stream", (source, el, ctx) => {
      const child = new StreamChild(el, this.app, source, {
        sourcePath: ctx.sourcePath,
        scope: "this",
        note: () => noteAt(this.app, ctx.sourcePath),
        excludePath: null,
      });
      // Component.register runs on unload, so a closed note stops being refreshed.
      child.register(() => registry.unregister(child));
      registry.register(child);
      ctx.addChild(child);
    });

    this.registerView(
      SIDEBAR_VIEW_TYPE,
      (leaf) =>
        new StreamSidebarView(leaf, {
          registry,
          // A function, not the string: the sidebar rebuilds on a settings
          // change and must read what the setting says then, not at load.
          query: () => this.settings.sidebarQuery,
        }),
    );

    const tracker = new ActiveNoteTracker(this.app, (file) => {
      for (const view of this.sidebars()) {
        view.follow(file);
      }
    });
    this.tracker = tracker;
    for (const ref of tracker.start()) {
      this.registerEvent(ref);
    }
    // Once the workspace has restored its leaves. Asked any earlier, every rule
    // in the tracker answers "nothing open" and the sidebar opens blank beside
    // a note that is plainly on screen.
    this.app.workspace.onLayoutReady(() => tracker.sync());

    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      callback: () => {
        void this.openSidebar();
      },
    });

    this.addSettingTab(new SimpleStreamsSettingTab(this.app, this));
  }

  onunload(): void {
    this.registry?.stop();
    this.registry = null;
    this.tracker = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as object | null) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Redraw every open sidebar with whatever the settings now say. */
  rebuildSidebars(): void {
    for (const view of this.sidebars()) {
      view.rebuild();
    }
  }

  private sidebars(): StreamSidebarView[] {
    return this.app.workspace
      .getLeavesOfType(SIDEBAR_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .filter((view): view is StreamSidebarView => view instanceof StreamSidebarView);
  }

  /** Whether a sidebar is on screen. What the settings toggle reads. */
  hasSidebar(): boolean {
    return this.sidebars().length > 0;
  }

  /** Reveal the sidebar, opening it in the right split if it is not there. */
  async openSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    const leaf: WorkspaceLeaf | null = existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) {
      return;
    }
    await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    // Point it at whatever is active before revealing, so it opens with
    // results rather than the empty state and a flicker.
    const view = leaf.view;
    if (view instanceof StreamSidebarView) {
      view.follow(this.tracker?.current() ?? null);
    }
    // Not awaited, deliberately. `revealLeaf` returns `void` at the 1.5.7 floor
    // the manifest promises and `Promise<void>` from 1.7.2 on, so awaiting it
    // claims a guarantee the floor does not make. `await undefined` is harmless
    // at runtime, which is exactly why this is worth a comment: nothing — not
    // `tsc`, not `npm run check:floor`, both of which pass on the awaited
    // version — can catch it, because awaiting a non-promise is legal
    // TypeScript. Nothing here depends on the reveal having finished.
    void this.app.workspace.revealLeaf(leaf);
  }

  /** Close every sidebar. The other half of the settings toggle. */
  closeSidebar(): void {
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
  }
}
