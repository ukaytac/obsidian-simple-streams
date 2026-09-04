// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { renderCalls, resetObsidianMock, setRenderHook } from "../mocks/obsidian";
import {
  DAY_ONE,
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
const TITLES = "sort: file.path asc\ngroup: none\nlimit: 100\ndisplay: title\n";
const FULL = "sort: file.path asc\ngroup: none\nlimit: 100\ndisplay: full\n";

let vault: FakeVault;
let child: StreamChild | null = null;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
  vault = new FakeVault(numberedNotes(100));
});

afterEach(() => {
  child?.unload();
  child = null;
  setRenderHook(null);
});

describe("refresh", () => {
  test("an unchanged result touches no DOM and scans the vault once", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, TITLES, "Host.md");
    child.load();
    await settle();

    const root = container.querySelector(".simple-streams");
    const list = container.querySelector(".ss-list");
    const before = drawnTitles(container);
    vault.scans = 0;

    await child.refresh();

    // Element identity, not row counts: a re-render calls `empty()` and builds
    // a fresh root, so the same nodes still being in place is the only proof
    // that nothing was redrawn.
    expect(container.querySelector(".simple-streams")).toBe(root);
    expect(container.querySelector(".ss-list")).toBe(list);
    expect(drawnTitles(container)).toEqual(before);
    // One scan. `refresh` used to compute the result twice — once to compare
    // the signature and once inside `render` — which cost two whole-vault
    // scans per vault event and compared a result it then threw away.
    expect(vault.scans).toBe(1);
  });

  test("a changed result repaints, keeping the pages already loaded", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, TITLES, "Host.md");
    child.load();
    await settle();

    FakeIntersectionObserver.latest().fire();
    await settle();
    expect(drawnTitles(container)).toHaveLength(2 * PAGE_SIZE);

    const root = container.querySelector(".simple-streams");
    vault.setNotes(numberedNotes(100, DAY_ONE + 500_000));
    vault.scans = 0;
    await child.refresh();

    expect(container.querySelector(".simple-streams")).not.toBe(root);
    // Two pages were open, so two pages come back. Dropping to one would
    // scroll the reader's position out from under them on every vault event.
    expect(peek(child).pages).toBe(2);
    expect(peek(child).rendered).toBe(2 * PAGE_SIZE);
    expect(drawnTitles(container)).toHaveLength(2 * PAGE_SIZE);
    expect(vault.scans).toBe(1);
  });

  test("a changed result restores the scroll position it was read at", async () => {
    const { scroller, container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    scroller.scrollTop = 1234;

    // Emptying the block collapses the pane in a real browser, and jsdom has
    // no layout to collapse — so the collapse is staged here, from inside the
    // repaint, which is where it would happen. Without it the assertion below
    // would pass on a `refresh` that never restored anything.
    let collapsed = false;
    setRenderHook(() => {
      if (!collapsed) {
        collapsed = true;
        scroller.scrollTop = 0;
      }
    });

    vault.setNotes(numberedNotes(100, DAY_ONE + 500_000));
    await child.refresh();

    expect(collapsed).toBe(true);
    expect(scroller.scrollTop).toBe(1234);
  });

  test("a refresh after unload does nothing at all", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, TITLES, "Host.md");
    child.load();
    await settle();
    const drawn = drawnTitles(container);

    child.unload();
    vault.setNotes(numberedNotes(100, DAY_ONE + 500_000));
    vault.scans = 0;
    const rendersBefore = renderCalls.length;

    await child.refresh();
    await settle();

    // Not even a scan: a refresh past `onunload` would rebuild the block and
    // hand it a fresh IntersectionObserver that nothing is left to disconnect.
    expect(vault.scans).toBe(0);
    expect(renderCalls).toHaveLength(rendersBefore);
    expect(drawnTitles(container)).toEqual(drawn);
    expect(peek(child).dead).toBe(true);

    child = null;
  });

  test("a refresh whose notes vanished shows the empty state", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, TITLES, "Host.md");
    child.load();
    await settle();

    vault.setNotes([]);
    await child.refresh();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty")?.textContent).toBe(
      "No notes match this stream.",
    );
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain("whole vault");
  });
});
