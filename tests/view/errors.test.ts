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

const FULL = "sort: file.path asc\ngroup: none\nlimit: 100\ndisplay: full\n";

/** The registry's own flush: refresh the stream, and show what it throws. */
async function flush(child: StreamChild): Promise<void> {
  try {
    await child.refresh();
  } catch (error) {
    child.showError(error);
  }
}

function errorMessage(container: HTMLElement): string | null {
  const box = container.querySelector(".ss-error .ss-error-message");
  return box === null ? null : box.textContent;
}

let vault: FakeVault;
let child: StreamChild | null = null;
let rejections: unknown[] = [];
const record = (reason: unknown): void => {
  rejections.push(reason);
};

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
  vault = new FakeVault(numberedNotes(30));
  rejections = [];
  process.on("unhandledRejection", record);
});

afterEach(() => {
  process.off("unhandledRejection", record);
  child?.unload();
  child = null;
  setRenderHook(null);
});

describe("error paths", () => {
  /**
   * `render()`'s own try covers `compute()` only, so a throw from the item loop
   * used to leave the block half-drawn with no sentinel — lazy loading dead for
   * the life of the block — and report itself to the console, the one place a
   * failure must never only live.
   */
  test("a throw from item rendering shows the error box, not the console", async () => {
    setRenderHook((call) => {
      if (call.sourcePath === "Notes/002.md") {
        throw new Error("boom in the item loop");
      }
    });

    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    expect(errorMessage(container)).toBe("boom in the item loop");
    // The error box replaces the block rather than sitting under a partial
    // list, so the reader is never shown half a stream that looks whole.
    expect(container.querySelector(".ss-list")).toBeNull();
    expect(drawnTitles(container)).toEqual([]);
    expect(rejections).toEqual([]);
  });

  /**
   * The error box used to outlive its own cause. `render()` stores the
   * signature before drawing items, so a mid-render throw left it describing a
   * result nobody saw, and the next refresh short-circuited against it — the
   * box stayed until the note was closed and reopened.
   */
  test("a clean refresh after an item throw repaints instead of short-circuiting", async () => {
    vault.setNotes(numberedNotes(5));
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();
    expect(drawnTitles(container)).toHaveLength(5);

    // A note is edited, and rendering it throws.
    vault.setNotes(numberedNotes(5, DAY_ONE + 500_000));
    setRenderHook((call) => {
      if (call.sourcePath === "Notes/003.md") {
        throw new Error("boom mid-refresh");
      }
    });
    await flush(child);
    expect(errorMessage(container)).toBe("boom mid-refresh");

    // The renderer stops throwing and another vault event lands. Nothing else
    // about the vault changed, which is exactly the case that used to make the
    // box permanent.
    setRenderHook(null);
    await flush(child);

    expect(container.querySelector(".ss-error")).toBeNull();
    expect(drawnTitles(container)).toHaveLength(5);
    expect(rejections).toEqual([]);
    // And the mechanism, so a future reader knows what the repaint hangs on:
    // `showError` clears the signature to a value no result can produce —
    // `signatureOf` is a `JSON.stringify`, so its emptiest output is
    // `"[[],[]]"` — which the next refresh is guaranteed to disagree with.
    expect(peek(child).signature).not.toBe("");
  });

  /**
   * The other `render` call site. A throw from a page the sentinel asked for
   * would otherwise wedge paging mid-page and report itself only to the
   * console, leaving a block that has stopped growing and does not say why.
   */
  test("a throw from a sentinel-triggered page shows the error box", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();
    expect(drawnTitles(container)).toHaveLength(20);

    setRenderHook((call) => {
      if (call.sourcePath === "Notes/025.md") {
        throw new Error("boom on page two");
      }
    });
    FakeIntersectionObserver.latest().fire();
    await settle();

    expect(errorMessage(container)).toBe("boom on page two");
    expect(container.querySelector(".ss-list")).toBeNull();
    expect(rejections).toEqual([]);
  });

  test("a parse failure shows its message, and refresh leaves it alone", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, "display: nonsense\n", "Host.md");
    child.load();
    await settle();

    // The message's backticks are code spans now, not characters in the text.
    expect(errorMessage(container)).toContain("display must be one of");
    expect(
      Array.from(container.querySelectorAll(".ss-error-message code")).map((c) => c.textContent),
    ).toContain("display");
    const box = container.querySelector(".ss-error");
    vault.scans = 0;

    await child.refresh();
    await settle();

    // A query that cannot be parsed cannot be re-run, so a vault event must
    // not scan on its behalf or redraw the box it is already showing.
    expect(vault.scans).toBe(0);
    expect(container.querySelector(".ss-error")).toBe(box);
    expect(renderCalls).toEqual([]);
  });

  test("a query that cannot be run shows the error on first paint", async () => {
    vault.failScans("the vault is unavailable");
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    expect(errorMessage(container)).toBe("the vault is unavailable");
    expect(container.querySelector(".ss-list")).toBeNull();
  });

  test("a failing refresh shows the error and keeps the block refreshable", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    vault.failScans("the vault is unavailable");
    await flush(child);
    expect(errorMessage(container)).toBe("the vault is unavailable");

    vault.failScans(null);
    vault.setNotes(numberedNotes(3));
    await flush(child);

    expect(container.querySelector(".ss-error")).toBeNull();
    expect(drawnTitles(container)).toHaveLength(3);
  });

  test("one unreadable note warns in its own row and the rest still render", async () => {
    vault.setNotes(numberedNotes(3));
    vault.failReadsFor("Notes/001.md");
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    expect(container.querySelector(".ss-error")).toBeNull();
    expect(drawnTitles(container)).toEqual(["000", "001", "002"]);
    expect(container.querySelector(".ss-item-warning")?.textContent).toBe(
      "Could not read Notes/001.md: cannot read Notes/001.md",
    );
    expect(renderCalls.map((call) => call.sourcePath)).toEqual([
      "Notes/000.md",
      "Notes/002.md",
    ]);
  });

  test("a note that vanished between the scan and the read warns in its own row", async () => {
    vault.setNotes(numberedNotes(2));
    vault.hideFile("Notes/000.md");
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, FULL, "Host.md");
    child.load();
    await settle();

    expect(container.querySelector(".ss-item-warning")?.textContent).toBe(
      "Could not open Notes/000.md",
    );
    expect(drawnTitles(container)).toEqual(["000", "001"]);
    // No read was even attempted for the missing file.
    expect(vault.reads).toEqual(["Notes/001.md"]);
  });
});
