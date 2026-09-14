import { PluginSettingTab, Setting, type App } from "obsidian";
import type SimpleStreamsPlugin from "../main";
import { parseQuery } from "../query/parse";
import { assertScope } from "../query/scopes";
import { errorMessage } from "./errorEl";
import { DEBOUNCE_MS } from "../obsidian/registry";

/**
 * What is wrong with a sidebar query, or null when nothing is.
 *
 * Pure, and the same two gates the sidebar itself runs, so the message under
 * the field is the message in the pane rather than a second opinion about it.
 */
export function validateSidebarQuery(source: string): string | null {
  try {
    assertScope(parseQuery(source), "active");
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

/**
 * Rendered imperatively through `display()`, not declaratively through
 * `getSettingDefinitions()`.
 *
 * Obsidian's own typings call `display()` "a fallback for plugins that need to
 * support Obsidian versions older than 1.13.0", which is this plugin exactly:
 * the manifest promises 1.7.2. Adopting the declarative API would put
 * `SettingDefinitionItem` — a type that does not exist before 1.13.0 — in
 * `src/`, and `npm run check:floor` type-checks `src/` against the typings for
 * the version the manifest promises, so it would fail.
 *
 * Raising the floor again is not the answer it was for `revealLeaf`. That move
 * cost users on versions roughly two years old and bought a correctness fix.
 * This one would cost everyone who has not updated in the last few months —
 * 1.13.0 is one minor behind current — and buy a search index entry.
 *
 * Nor is declaring the shape by hand. `getSettingDefinitions` is called by
 * name at runtime, so a locally typed copy would work and would satisfy the
 * linter, but it means maintaining a mirror of somebody else's type surface
 * that nothing checks against the original.
 *
 * What the choice costs: on 1.13.0 and later these two settings do not appear
 * in Obsidian's settings search. The tab itself is still listed and still
 * opens. Worth revisiting the day `minAppVersion` reaches 1.13.0 for a reason
 * of its own, and not before.
 */
export class SimpleStreamsSettingTab extends PluginSettingTab {
  private readonly plugin: SimpleStreamsPlugin;
  private timer: number | null = null;

  constructor(app: App, plugin: SimpleStreamsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName("Show sidebar")
      .setDesc("Open the stream sidebar in the right split.")
      .addToggle((toggle) => {
        // Read off the workspace rather than out of a stored boolean. Obsidian
        // draws this screen as a modal, so nothing can open or close a leaf
        // while it is up, and an answer taken from the leaves themselves
        // cannot drift from them the way a saved `true` does the moment the
        // reader closes the pane by its tab.
        toggle.setValue(this.plugin.hasSidebar());
        toggle.onChange((value) => {
          if (value) {
            void this.plugin.openSidebar();
          } else {
            this.plugin.closeSidebar();
          }
        });
      });

    let errorEl: HTMLElement | null = null;

    new Setting(this.containerEl)
      // Drops the row to `display: block`, which puts the field under the
      // description at full width instead of into the narrow control column,
      // where a four-line query wraps into eleven fragments.
      .setClass("ss-settings-query-item")
      .setName("Sidebar query")
      .setDesc(
        "The stream the sidebar shows, in the same syntax a `stream` block uses. Use active.Property to name a property of the note you are looking at.",
      )
      .addTextArea((area) => {
        area.setValue(this.plugin.settings.sidebarQuery);
        area.inputEl.rows = 10;
        // `classList`, not Obsidian's `addClass` extension: same reason as
        // the sidebar view, and the native method works identically in a
        // real vault.
        area.inputEl.classList.add("ss-settings-query");
        area.onChange((value) => {
          // Saved on every keystroke, as an Obsidian setting normally is. A
          // query that does not parse still saves: refusing to store what the
          // reader is halfway through typing locks them out of the field.
          this.plugin.settings.sidebarQuery = value;
          void this.plugin.saveSettings();

          const problem = validateSidebarQuery(value);
          if (errorEl !== null) {
            errorEl.setText(problem ?? "");
            errorEl.classList.toggle("ss-settings-error", problem !== null);
          }

          // Debounced on the registry's own interval. Rebuilding per keystroke
          // re-scans the whole vault for every character of `active.Project`
          // and flickers an error box through every prefix of a word still
          // being typed.
          this.schedule();
        });
      });

    errorEl = this.containerEl.createDiv();
    const initial = validateSidebarQuery(this.plugin.settings.sidebarQuery);
    errorEl.setText(initial ?? "");
    errorEl.classList.toggle("ss-settings-error", initial !== null);
  }

  hide(): void {
    // A tab can close mid-debounce, and the edit still has to land.
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
      this.plugin.rebuildSidebars();
    }
  }

  private schedule(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.plugin.rebuildSidebars();
    }, DEBOUNCE_MS);
  }
}
