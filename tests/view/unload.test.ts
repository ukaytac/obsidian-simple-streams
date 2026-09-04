// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { renderCalls, renderChildren, resetObsidianMock } from "../mocks/obsidian";
import {
  FakeIntersectionObserver,
  FakeVault,
  drawnTitles,
  mountPane,
  numberedNotes,
  peek,
  settle,
} from "./harness";
import { StreamChild } from "../../src/view/StreamChild";

const PAGE_SIZE = 20;
const FULL = "sort: file.path asc\ngroup: none\nlimit: 100\ndisplay: full\n";

/** The render children `renderItem` builds, one per item body it renders. */
function itemChildren(): Array<{ loaded: boolean; everLoaded: boolean }> {
  return renderChildren.filter((rc) => rc.containerEl.classList.contains("ss-item-body"));
}

let vault: FakeVault;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
  vault = new FakeVault(numberedNotes(100));
});

describe("onunload", () => {
  /**
   * The reader closes the note while the first page is still drawing. Before
   * `onunload` set `dead` and bumped the generation, the suspended loop carried
   * on: measured 15 further items rendered into a detached tree, each one free
   * to pull in embeds and other plugins' post-processors, and 16 render children
   * added to an already-unloaded parent — never loaded, and so never unloaded.
   */
  test("stops the page that was still drawing", async () => {
    const { container } = mountPane();
    const child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    // Part-way into the first page, and no observer yet: `watchSentinel` runs
    // only after the first page finishes, so this is the window where an
    // in-flight loop is the only thing still writing to the block.
    await settle(4);
    const atUnload = renderCalls.length;
    const rowsAtUnload = drawnTitles(container).length;
    expect(atUnload).toBeGreaterThan(0);
    expect(atUnload).toBeLessThan(PAGE_SIZE);

    child.unload();
    await settle();

    // At most one more: the item already awaiting its own read finishes, which
    // `drawRows` documents as the one bounded orphan. What must not happen is
    // the rest of the page arriving, which is what the un-guarded loop did.
    expect(renderCalls.length).toBeLessThanOrEqual(atUnload + 1);
    expect(drawnTitles(container).length).toBeLessThanOrEqual(rowsAtUnload + 1);
    expect(renderCalls.length).toBeLessThan(PAGE_SIZE);
    expect(peek(child).dead).toBe(true);

    // The orphan is bounded too: one child parented to an unloaded component,
    // not a page's worth.
    expect(itemChildren().filter((rc) => !rc.everLoaded)).toHaveLength(1);
  });

  test("disconnects the sentinel observer", async () => {
    const { container } = mountPane();
    const child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    const observer = FakeIntersectionObserver.latest();
    expect(observer.connected).toBe(true);

    child.unload();

    expect(observer.connected).toBe(false);
    // Nothing is left holding the observer, so a later render cannot find one
    // to disconnect and a stale one cannot keep paging a dead block.
    expect(() => {
      observer.fire();
    }).toThrow(/disconnected/);
  });

  test("unloads every per-item render child it had loaded", async () => {
    const { container } = mountPane();
    const child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    const items = itemChildren();
    expect(items).toHaveLength(PAGE_SIZE);
    expect(items.every((rc) => rc.loaded)).toBe(true);

    child.unload();

    expect(items.every((rc) => rc.everLoaded && !rc.loaded)).toBe(true);
  });

  test("a repaint unloads the previous pass's item children", async () => {
    const { container } = mountPane();
    const child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    const firstPass = itemChildren();
    expect(firstPass).toHaveLength(PAGE_SIZE);

    vault.setNotes(numberedNotes(100, Date.now()));
    await child.refresh();
    await settle();

    // The first pass's children are gone rather than piling up beside the new
    // ones — a leak that would grow with every vault change while the note
    // stays open, which is the very thing parenting them was for.
    expect(firstPass.every((rc) => !rc.loaded)).toBe(true);
    const live = itemChildren().filter((rc) => rc.loaded);
    expect(live).toHaveLength(PAGE_SIZE);

    child.unload();
    expect(itemChildren().some((rc) => rc.loaded)).toBe(false);
  });
});
