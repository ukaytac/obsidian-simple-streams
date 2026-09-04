// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { renderCalls, resetObsidianMock } from "../mocks/obsidian";
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

/** `StreamChild`'s own PAGE_SIZE, which it does not export. */
const PAGE_SIZE = 20;

const SOURCE = "sort: file.path asc\ngroup: none\nlimit: 100\ndisplay: full\n";

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
});

describe("lazy paging", () => {
  test("draws one page, then one more page per sentinel hit", async () => {
    const { scroller, container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toHaveLength(PAGE_SIZE);
    expect(peek(child).pages).toBe(1);
    expect(peek(child).rendered).toBe(PAGE_SIZE);

    // The sentinel is watched against the pane scroller, not the viewport, so
    // the 200px preload buffer is measured where the clipping actually happens.
    const observer = FakeIntersectionObserver.latest();
    expect(observer.root).toBe(scroller);
    expect(observer.rootMargin).toBe("200px");
    expect(observer.targets).toEqual([container.querySelector(".ss-sentinel")]);

    observer.fire();
    await settle();

    expect(drawnTitles(container)).toHaveLength(2 * PAGE_SIZE);
    expect(peek(child).pages).toBe(2);
    expect(peek(child).rendered).toBe(2 * PAGE_SIZE);
  });

  test("a sentinel hit that is not an intersection draws nothing", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    FakeIntersectionObserver.latest().fire(false);
    await settle();

    expect(drawnTitles(container)).toHaveLength(PAGE_SIZE);
    expect(peek(child).pages).toBe(1);
  });

  /**
   * The regression this file exists for.
   *
   * `renderUpTo` awaits `renderItem` per row and reads the cursor off `this`,
   * so a sentinel hit landing while an earlier page is still drawing used to
   * start a second loop of the *same* generation beside the first. Both cleared
   * the generation check, both read `rows[rendered]` for the same index across
   * the same await, and both then incremented. Measured over 100 notes with
   * four re-entries: 3 rows drawn twice, 3 notes never drawn at all, and the
   * cursor still claiming all 100 — a stream silently missing notes, which is
   * the one thing it exists to not do.
   *
   * Every assertion below is on the whole list rather than a count, because a
   * count alone passes on a list that has one note twice and another not at
   * all — exactly the shape of the defect.
   */
  test("repeated sentinel hits mid-page draw every note exactly once, in order", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();
    expect(drawnTitles(container)).toHaveLength(PAGE_SIZE);

    // A reader scroll-flicking: the sentinel re-enters the band four times
    // while the page each hit asked for is still being drawn. One turn between
    // hits, so the running loop has advanced a row and is suspended over the
    // next one — which is precisely where two loops used to collide.
    const observer = FakeIntersectionObserver.latest();
    for (let hit = 0; hit < 4; hit += 1) {
      observer.fire();
      await settle(1);
    }
    await settle(600);

    const expected = numberedNotes(100).map((note) =>
      note.path.replace(/^Notes\//, "").replace(/\.md$/, ""),
    );
    const drawn = drawnTitles(container);

    // Order, completeness and uniqueness in one assertion: a duplicate, a gap
    // or a swap all fail it, and the diff names the note.
    expect(drawn).toEqual(expected);
    expect(new Set(drawn).size).toBe(drawn.length);

    // The cursor has to describe the screen. It claiming rows nobody drew is
    // the half of the defect that survives a correct-looking row count.
    expect(peek(child).rendered).toBe(drawn.length);
    expect(peek(child).pages).toBe(5);

    // Each note was read once and rendered once, so no loop drew a row twice
    // into DOM that a later pass replaced.
    expect(vault.reads).toEqual(numberedNotes(100).map((note) => note.path));
    expect(renderCalls.map((call) => call.sourcePath)).toEqual(vault.reads);

    // Everything is drawn, so the sentinel and its observer are gone rather
    // than left behind to fire against a finished list.
    expect(container.querySelector(".ss-sentinel")).toBeNull();
    expect(observer.connected).toBe(false);
  });

  test("the last page stops at the row count, not at the page boundary", async () => {
    vault.setNotes(numberedNotes(25));
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    FakeIntersectionObserver.latest().fire();
    await settle();

    expect(drawnTitles(container)).toHaveLength(25);
    expect(peek(child).rendered).toBe(25);
    expect(container.querySelector(".ss-sentinel")).toBeNull();
  });

  test("a stream that fits in one page never gets a sentinel", async () => {
    vault.setNotes(numberedNotes(5));
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toHaveLength(5);
    expect(container.querySelector(".ss-sentinel")).toBeNull();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});
