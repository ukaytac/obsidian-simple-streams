// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { renderCalls, resetObsidianMock } from "../mocks/obsidian";
import {
  DAY_ONE,
  FakeIntersectionObserver,
  FakeVault,
  drawnTitles,
  mountBareBlock,
  mountPane,
  settle,
  type FakeNote,
} from "./harness";
import { formatGroupHeader } from "../../src/engine/dates";
import { StreamChild } from "../../src/view/StreamChild";

/** The block's own children, class by class, top to bottom. */
function classesIn(container: HTMLElement, selector: string): string[] {
  const parent = container.querySelector(selector);
  return parent === null ? [] : Array.from(parent.children).map((el) => el.className);
}

function noticeTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".ss-notice")).map((el) => el.textContent ?? "");
}

/** The same formatter `formatItemDate` uses, following the host locale. */
function itemDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

const JAN_10 = new Date(2026, 0, 10, 12).getTime();
const DAY = 86_400_000;

let vault: FakeVault;
let child: StreamChild | null = null;

function open(source: string, notes: FakeNote[]): HTMLElement {
  vault.setNotes(notes);
  const { container } = mountPane();
  child = new StreamChild(container, vault.app, source, "Host.md");
  child.load();
  return container;
}

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
  vault = new FakeVault();
});

afterEach(() => {
  child?.unload();
  child = null;
});

describe("notices", () => {
  test("says a typo'd date-field sent every date to the ctime fallback", async () => {
    const container = open("date-field: dat\ndisplay: title\ngroup: none\n", [
      { path: "a.md", ctime: JAN_10 },
      { path: "b.md", ctime: JAN_10 + DAY },
    ]);
    await settle();

    expect(noticeTexts(container)).toEqual([
      "No note here has a usable `dat`, so this stream falls back to file creation time for its dates.",
    ]);
  });

  test("says a sort key nothing resolves had no effect", async () => {
    const container = open("sort: ratng desc\ndisplay: title\ngroup: none\n", [
      { path: "a.md", ctime: JAN_10 },
      { path: "b.md", ctime: JAN_10 + 1000 },
    ]);
    await settle();

    expect(noticeTexts(container)).toEqual([
      "No note here has `ratng`, so that part of the sort had no effect.",
    ]);
  });

  test("says how many notes the limit cut off", async () => {
    const container = open("limit: 2\ndisplay: title\ngroup: none\n", [
      { path: "a.md", ctime: JAN_10 },
      { path: "b.md", ctime: JAN_10 + 1000 },
      { path: "c.md", ctime: JAN_10 + 2000 },
    ]);
    await settle();

    expect(noticeTexts(container)).toEqual([
      "Showing 2 of 3 notes. Raise `limit` to see more.",
    ]);
    expect(drawnTitles(container)).toHaveLength(2);
  });

  /**
   * An empty stream is exactly when a typo'd date-field needs explaining: the
   * typo sends every note onto the `file.ctime` fallback and the range then
   * empties the stream, so a notice rendered only alongside results would
   * suppress the one that explains the absence.
   */
  test("a notice is printed above the empty state, not instead of it", async () => {
    const container = open(
      "date-field: dat\nfrom: 2026-06-01\nto: 2026-06-30\nfolder: Journal\ntags: [daily]\n",
      [
        { path: "Journal/a.md", ctime: JAN_10, tags: ["daily"] },
        { path: "Journal/b.md", ctime: JAN_10 + DAY, tags: ["daily"] },
      ],
    );
    await settle();

    expect(classesIn(container, ".simple-streams")).toEqual([
      "ss-notice",
      "ss-empty",
      "ss-empty-summary",
    ]);
    expect(noticeTexts(container)).toHaveLength(1);
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "folders journal",
    );
  });

  test("a clean stream says nothing", async () => {
    const container = open("display: title\ngroup: none\n", [{ path: "a.md", ctime: JAN_10 }]);
    await settle();

    expect(noticeTexts(container)).toEqual([]);
  });
});

describe("rows", () => {
  test("a group header is printed once, above the first row of its group", async () => {
    const container = open("group: day\ndisplay: title\n", [
      { path: "a.md", ctime: JAN_10 },
      { path: "b.md", ctime: JAN_10 + 1000 },
      { path: "c.md", ctime: JAN_10 + 3 * DAY },
    ]);
    await settle();

    // Newest day first, and the two notes sharing a day share one header.
    expect(classesIn(container, ".ss-list")).toEqual([
      "ss-group",
      "ss-item",
      "ss-group",
      "ss-item",
      "ss-item",
    ]);
    expect(Array.from(container.querySelectorAll(".ss-group")).map((el) => el.textContent)).toEqual([
      formatGroupHeader(JAN_10 + 3 * DAY, "day"),
      formatGroupHeader(JAN_10, "day"),
    ]);
    expect(drawnTitles(container)).toEqual(["c", "b", "a"]);
  });

  test("group: none prints no headers", async () => {
    const container = open("group: none\ndisplay: title\n", [
      { path: "a.md", ctime: JAN_10 },
      { path: "b.md", ctime: JAN_10 + 3 * DAY },
    ]);
    await settle();

    expect(classesIn(container, ".ss-list")).toEqual(["ss-item", "ss-item"]);
  });

  test("display: title reads no files at all", async () => {
    const container = open("display: title\ngroup: none\n", [
      { path: "a.md", content: "A body nobody should have read.", ctime: JAN_10 },
      { path: "b.md", content: "Nor this one.", ctime: JAN_10 + 1000 },
    ]);
    await settle();

    expect(drawnTitles(container)).toEqual(["b", "a"]);
    // The point of the mode: a title-only stream over a large vault must not
    // pull every note's text through the cache.
    expect(vault.reads).toEqual([]);
    expect(renderCalls).toEqual([]);
    expect(container.querySelector(".ss-item-body")).toBeNull();
  });

  test("display: preview shows an excerpt and renders no markdown", async () => {
    const container = open("display: preview\ngroup: none\n", [
      { path: "a.md", content: "# Heading\n\nThe **body** of the note.\n", ctime: JAN_10 },
    ]);
    await settle();

    expect(container.querySelector(".ss-item-body")?.textContent).toBe(
      "Heading The body of the note.",
    );
    expect(renderCalls).toEqual([]);
    expect(vault.reads).toEqual(["a.md"]);
  });

  test("a row carries the note's title, resolved date and tags", async () => {
    const container = open("display: title\ngroup: none\n", [
      { path: "Journal/a.md", ctime: JAN_10, tags: ["Daily", "#book"] },
    ]);
    await settle();

    const link = container.querySelector<HTMLAnchorElement>(".ss-item-title");
    expect(link?.textContent).toBe("a");
    expect(link?.getAttribute("href")).toBe("Journal/a.md");
    expect(container.querySelector(".ss-item-date")?.textContent).toBe(itemDate(JAN_10));
    expect(Array.from(container.querySelectorAll(".ss-item-tag")).map((el) => el.textContent)).toEqual([
      "#daily",
      "#book",
    ]);
  });

  test("clicking a row's title opens the note instead of following the href", async () => {
    const container = open("display: title\ngroup: none\n", [
      { path: "Journal/a.md", ctime: JAN_10 },
    ]);
    await settle();

    const link = container.querySelector<HTMLAnchorElement>(".ss-item-title");
    const plain = new MouseEvent("click", { cancelable: true });
    link?.dispatchEvent(plain);
    const modified = new MouseEvent("click", { cancelable: true, metaKey: true });
    link?.dispatchEvent(modified);

    expect(plain.defaultPrevented).toBe(true);
    expect(vault.opened).toEqual([
      { path: "Journal/a.md", sourcePath: "Host.md", newLeaf: false },
      { path: "Journal/a.md", sourcePath: "Host.md", newLeaf: true },
    ]);
  });

  test("an unscrolled pane leaves the observer on the implicit viewport", async () => {
    vault.setNotes(
      Array.from({ length: 30 }, (_unused, index) => ({
        path: `n${String(index).padStart(2, "0")}.md`,
        ctime: DAY_ONE + index * 1000,
      })),
    );
    const container = mountBareBlock();
    child = new StreamChild(container, vault.app, "display: title\ngroup: none\n", "Host.md");
    child.load();
    await settle();

    // No `.cm-scroller` above the block, so `root: null` — which is the legal
    // "the viewport" and the right fallback for a pane that does not scroll.
    expect(FakeIntersectionObserver.latest().root).toBeNull();
    expect(drawnTitles(container)).toHaveLength(20);
  });
});
