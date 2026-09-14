// @vitest-environment jsdom
import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type SimpleStreamsPlugin from "../../src/main";
import { DEBOUNCE_MS } from "../../src/obsidian/registry";
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

  // Real timers, restored unconditionally even if a test above fails an
  // assertion mid-run: `vi.useFakeTimers()` otherwise leaks into whichever
  // test in this file runs next.
  afterEach(() => {
    vi.useRealTimers();
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

  it("fires the scheduled rebuild once the debounce elapses", () => {
    vi.useFakeTimers();

    const plugin = new FakePlugin();
    const tab = new SimpleStreamsSettingTab(
      {} as unknown as App,
      plugin as unknown as SimpleStreamsPlugin,
    );

    tab.display();
    const area = textAreaComponents[textAreaComponents.length - 1];
    area.fireChange("limit: lots");

    // Still nothing before the debounce elapses — the companion to the test
    // above, carried out to the far side of the timer instead of stopping
    // short of it.
    expect(plugin.rebuildCalls).toBe(0);

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(plugin.rebuildCalls).toBe(1);
  });

  it("flushes a pending edit immediately when the tab closes, and does not rebuild a second time once the debounce would have fired", () => {
    vi.useFakeTimers();

    const plugin = new FakePlugin();
    const tab = new SimpleStreamsSettingTab(
      {} as unknown as App,
      plugin as unknown as SimpleStreamsPlugin,
    );

    tab.display();
    const area = textAreaComponents[textAreaComponents.length - 1];
    area.fireChange("limit: lots");

    // The reader closes the tab before the debounce has a chance to fire on
    // its own, so `hide()` is the only thing standing between this edit and
    // being lost.
    tab.hide();

    expect(plugin.rebuildCalls).toBe(1);

    // The pending timer has to be cleared, not merely beaten to the punch: if
    // `hide()` rebuilt without cancelling it, the original timer would still
    // fire here and double the rebuild.
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(plugin.rebuildCalls).toBe(1);
  });
});
