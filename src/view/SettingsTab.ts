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

export class SimpleStreamsSettingTab extends PluginSettingTab {
  private readonly plugin: SimpleStreamsPlugin;
  private timer: number | null = null;

  constructor(app: App, plugin: SimpleStreamsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    let errorEl: HTMLElement | null = null;

    new Setting(this.containerEl)
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
