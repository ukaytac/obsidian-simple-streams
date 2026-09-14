// @vitest-environment jsdom
import type { App } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import type SimpleStreamsPlugin from "../../src/main";
import { SimpleStreamsSettingTab, validateSidebarQuery } from "../../src/view/SettingsTab";
import { resetObsidianMock, textAreaComponents } from "../mocks/obsidian";
import "./harness";

describe("validateSidebarQuery", () => {
  it("accepts the default query", () => {
    expect(
      validateSidebarQuery(
        "where:\n  Project: active.Project\nsort: file.mtime desc\ndisplay: preview\n",
      ),
    ).toBeNull();
  });

  it("accepts an empty query, which means every note", () => {
    expect(validateSidebarQuery("")).toBeNull();
  });

  it("reports a parse error, with its line", () => {
    expect(validateSidebarQuery("limit: lots")).toMatch(/limit/);
  });

  it("reports a this. reference as the wrong scope here", () => {
    expect(validateSidebarQuery("where:\n  Project: this.Project")).toMatch(
      /cannot use `this.Project` here/,
    );
  });
});

/**
 * A stand-in for `SimpleStreamsPlugin` narrow enough for the tab's own
 * surface: settings it can mutate, and counters instead of the real
 * `saveSettings`/`rebuildSidebars` bodies (loading a note vault, redrawing
 * open leaves) that a settings-tab test has no business exercising.
 */
class FakePlugin {
  settings = { sidebarQuery: "" };
  saveCalls = 0;
  rebuildCalls = 0;

  async saveSettings(): Promise<void> {
    this.saveCalls += 1;
  }

  rebuildSidebars(): void {
    this.rebuildCalls += 1;
  }
}

describe("SimpleStreamsSettingTab", () => {
  beforeEach(() => {
    resetObsidianMock();
  });

  it("saves an invalid query immediately but only schedules the rebuild", () => {
    const plugin = new FakePlugin();
    const tab = new SimpleStreamsSettingTab(
      {} as unknown as App,
      plugin as unknown as SimpleStreamsPlugin,
    );

    tab.display();
    const area = textAreaComponents[textAreaComponents.length - 1];

    // A query with no `where` field name at all — invalid on its face, and
    // not a typo of anything valid, so this can never start passing by
    // accident if the parser's error text changes shape later.
    area.fireChange("limit: lots");

    // Saved anyway: a half-typed query in the field is not a reason to
    // refuse storing it, or the reader is locked out of the field they are
    // typing in.
    expect(plugin.settings.sidebarQuery).toBe("limit: lots");
    expect(plugin.saveCalls).toBe(1);
    // Not rebuilt yet: the rebuild is debounced on `DEBOUNCE_MS`, and no time
    // has passed since the keystroke.
    expect(plugin.rebuildCalls).toBe(0);
  });
});
