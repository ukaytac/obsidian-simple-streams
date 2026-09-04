// @vitest-environment jsdom
import { Component } from "obsidian";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { renderCalls, resetObsidianMock } from "../mocks/obsidian";
import { FakeIntersectionObserver, FakeVault, mountPane, settle } from "./harness";
import { extractPreview, stripFrontmatter } from "../../src/engine/preview";
import { parseQuery } from "../../src/query/parse";
import { StreamChild } from "../../src/view/StreamChild";
import { renderItem } from "../../src/view/itemEl";

const HOST_BODY = `---
date: 2026-09-04
---

Body of the host note, long enough to read as a preview of itself.

\`\`\`stream
folder: Journal
\`\`\`
`;

const PREVIEW_WARNING =
  "Shown as a preview: this is the note holding the stream, and rendering it in full would nest the stream inside itself.";

const NESTED_NOTICE =
  "This stream sits inside a note that another stream is showing, so it is not run here.";

let vault: FakeVault;
let child: StreamChild | null = null;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
  vault = new FakeVault([
    { path: "Streams.md", content: HOST_BODY },
    { path: "Journal/x.md", content: "# x\n\nA journal entry.\n" },
  ]);
});

afterEach(() => {
  child?.unload();
  child = null;
});

describe("a stream that would render itself", () => {
  /**
   * The host note is in its own stream, which a `folder`-less query does by
   * default. Rendering its body in full re-renders the very block doing the
   * rendering — the code block processor is registered app-wide, so it fires
   * again on this note's own `stream` fence — and the stream renders itself
   * inside itself without end. A preview says the same thing and terminates.
   */
  test("the host note's own row degrades to a preview and says so", async () => {
    const list = document.createElement("div");
    list.className = "ss-list";
    document.body.appendChild(list);

    await renderItem(
      list,
      {
        path: "Streams.md",
        basename: "Streams",
        tags: [],
        frontmatter: {},
        ctime: 0,
        mtime: 0,
      },
      {
        app: vault.app,
        query: parseQuery("display: full\n"),
        parent: new Component(),
        sourcePath: "Streams.md",
      },
    );

    expect(list.querySelector(".ss-item-body")?.textContent).toBe(
      extractPreview(HOST_BODY, "Streams", 200),
    );
    expect(list.querySelector(".ss-item-warning")?.textContent).toBe(PREVIEW_WARNING);
    // The guard is the absence of this call, not the presence of the warning:
    // one `MarkdownRenderer.render` of the host body is the whole recursion.
    expect(renderCalls).toEqual([]);
  });

  test("a different note in the same stream still renders in full", async () => {
    const list = document.createElement("div");
    list.className = "ss-list";
    document.body.appendChild(list);

    await renderItem(
      list,
      {
        path: "Journal/x.md",
        basename: "x",
        tags: [],
        frontmatter: {},
        ctime: 0,
        mtime: 0,
      },
      {
        app: vault.app,
        query: parseQuery("display: full\n"),
        parent: new Component(),
        sourcePath: "Streams.md",
      },
    );

    expect(renderCalls.map((call) => call.sourcePath)).toEqual(["Journal/x.md"]);
    expect(renderCalls[0].markdown).toBe(stripFrontmatter("# x\n\nA journal entry.\n"));
    expect(renderCalls[0].el).toBe(list.querySelector(".ss-item-body"));
    expect(list.querySelector(".ss-item-warning")).toBeNull();
  });

  /**
   * The second half of the guard, and the one the first cannot see: two notes
   * streaming each other, or any longer cycle. `.ss-item-body` is this plugin's
   * own container, so refusing to run at that depth ends every shape of it.
   */
  test("a block inside a streamed note's body prints a notice and runs nothing", async () => {
    const { container: outer } = mountPane();
    const body = document.createElement("div");
    body.className = "ss-item-body";
    outer.appendChild(body);
    const nested = document.createElement("div");
    nested.className = "block-language-stream";
    body.appendChild(nested);

    child = new StreamChild(nested, vault.app, "sort: file.path asc\n", "Streams.md");
    child.load();
    await settle();

    expect(nested.querySelector(".ss-notice")?.textContent).toBe(NESTED_NOTICE);
    expect(nested.querySelector(".simple-streams")).toBeNull();
    expect(nested.querySelector(".ss-list")).toBeNull();
    expect(nested.children).toHaveLength(1);
    // Not run at all: no vault scan, no read, no observer to keep paging a
    // block that must never grow.
    expect(vault.scans).toBe(0);
    expect(vault.reads).toEqual([]);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  test("a top-level block is unaffected by the nesting guard", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, "sort: file.path asc\n", "Streams.md");
    child.load();
    await settle();

    expect(container.querySelector(".ss-notice")).toBeNull();
    expect(container.querySelectorAll(".ss-item")).toHaveLength(2);
    expect(vault.scans).toBe(1);
  });

  test("a block that is emptied into an item body stops running on refresh", async () => {
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, "sort: file.path asc\n", "Streams.md");
    child.load();
    await settle();
    expect(container.querySelectorAll(".ss-item")).toHaveLength(2);

    // The block ends up inside another stream's item body — the shape a second
    // note streaming this one produces once its own paint reaches this note.
    const body = document.createElement("div");
    body.className = "ss-item-body";
    document.body.appendChild(body);
    body.appendChild(container);

    vault.setNotes([{ path: "Streams.md", content: HOST_BODY, mtime: 99 }]);
    await child.refresh();

    expect(container.querySelector(".ss-notice")?.textContent).toBe(NESTED_NOTICE);
    expect(container.querySelector(".ss-list")).toBeNull();
  });
});
