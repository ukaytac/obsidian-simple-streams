// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resetObsidianMock, setRenderHook } from "../mocks/obsidian";
import {
  FakeIntersectionObserver,
  FakeVault,
  blockContext,
  drawnTitles,
  mountPane,
  settle,
} from "./harness";
import { StreamChild } from "../../src/view/StreamChild";

const PREVIEW_WARNING =
  "Shown as a preview: this is the note holding the stream, and rendering it in full would nest the stream inside itself.";

const SOURCE =
  "folder: Notes\nsort: file.path asc\ndisplay: title\nwhere:\n  Project: this.Project\n";

/** Two projects' notes, plus the note the block lives in, with only the host varying. */
function notesWith(hostFrontmatter: Record<string, unknown> | undefined) {
  return [
    { path: "Host.md", frontmatter: hostFrontmatter },
    { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    { path: "Notes/c.md", frontmatter: { Project: "Alpha" } },
  ];
}

/** A vault of two projects' notes, plus the note the block lives in. */
function vaultWith(hostFrontmatter: Record<string, unknown> | undefined): FakeVault {
  return new FakeVault(notesWith(hostFrontmatter));
}

function noticeText(container: HTMLElement): string | null {
  const el = container.querySelector(".ss-notice");
  return el === null ? null : el.textContent;
}

let child: StreamChild | null = null;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
});

afterEach(() => {
  child?.unload();
  child = null;
  setRenderHook(null);
});

// Every layer here is unit-tested on its own: parsing, resolveRefs, runStream,
// the notice text. What none of those tests can see is a real StreamChild
// running the whole path — load() drawing the resolved notes, and refresh()
// deciding whether a this. reference actually changed anything. Tests 4, 5 and
// 6 are the ones that exercise signatureOf and the refresh path; no unit test
// below this file reaches either.
describe("this. references in the view", () => {
  test("shows the notes sharing the host note's project", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("matches nothing and says why when the host note has no such property", async () => {
    const vault = vaultWith(undefined);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty")).not.toBeNull();
    expect(noticeText(container)).toContain("This note has no usable Project");
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = this.Project (not set here)",
    );
  });

  test("matches nothing and says why when the host note's property is present but empty", async () => {
    // `Project: []` is what an emptied list property looks like in Obsidian's
    // Properties panel — present, not absent — so the notice must not claim
    // the note has no such property.
    const vault = vaultWith({ Project: [] });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty")).not.toBeNull();
    expect(noticeText(container)).toContain("This note has no usable Project");
  });

  test("names the resolved value in the summary of an empty stream", async () => {
    const vault = vaultWith({ Project: "Gamma" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = Gamma",
    );
  });

  test("follows an edit to the host note's property", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();
    expect(drawnTitles(container)).toEqual(["a", "c"]);

    vault.setNotes(notesWith({ Project: "Beta" }));
    await child.refresh();
    await settle();

    expect(drawnTitles(container)).toEqual(["b"]);
  });

  test("picks up the notes once an empty property is filled in, and drops them again when it's cleared", async () => {
    const vault = vaultWith(undefined);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(noticeText(container)).toContain("This note has no usable Project");

    vault.setNotes(notesWith({ Project: "Alpha" }));
    await child.refresh();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();

    vault.setNotes(notesWith(undefined));
    await child.refresh();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(noticeText(container)).toContain("This note has no usable Project");
  });

  test("redraws the summary when the reference moves between two values that match nothing", async () => {
    const vault = vaultWith({ Project: "Gamma" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    vault.setNotes(notesWith({ Project: "Delta" }));
    await child.refresh();
    await settle();

    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = Delta",
    );
  });

  // `where: { Project: this.Project }` matches the host note against itself by
  // construction — its own Project always equals its own Project, which is
  // exactly the flagship "put this in a project template" configuration. The
  // self-reference guard in itemEl.ts is untouched by this feature and is
  // already covered end to end in tests/view/self-reference.test.ts; this only
  // confirms a *resolved* reference reaches that same guard rather than
  // re-testing the guard itself.
  test("a this. reference that matches the host note itself falls back to the preview guard", async () => {
    const HOST_BODY =
      "---\nProject: Alpha\n---\n\nBody of the host note, long enough to read as a preview of itself.\n";
    const vault = new FakeVault([
      { path: "Host.md", content: HOST_BODY, frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    ]);
    const { container } = mountPane();
    child = new StreamChild(
      container,
      vault.app,
      "sort: file.path asc\ndisplay: full\nwhere:\n  Project: this.Project\n",
      blockContext(vault.app, "Host.md"),
    );
    child.load();
    await settle();

    const hostRow = Array.from(container.querySelectorAll(".ss-item")).find(
      (item) =>
        item.querySelector<HTMLAnchorElement>(".ss-item-title")?.getAttribute("href") ===
        "Host.md",
    );
    expect(hostRow?.querySelector(".ss-item-warning")?.textContent).toBe(PREVIEW_WARNING);
  });
});

/** The same block as SOURCE, with the reference written as a link. */
const LINK_SOURCE =
  'folder: Notes\nsort: file.path asc\ndisplay: title\nwhere:\n  Project: "[[this.Project]]"\n';

describe("link-valued properties in the view", () => {
  test("reads a link reference against plain candidates", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, LINK_SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("reads a link reference when the host property is itself a link", async () => {
    const vault = vaultWith({ Project: "[[Alpha]]" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, LINK_SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("matches linked candidates from a plain host, through the plain spelling", async () => {
    const vault = new FakeVault([
      { path: "Host.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "[[Alpha]]" } },
      { path: "Notes/b.md", frontmatter: { Project: "[[Beta]]" } },
      { path: "Notes/c.md", frontmatter: { Project: "[[Alpha|A]]" } },
    ]);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"));
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
  });
});

describe("scope violations in the view", () => {
  test("refuses an active. reference in a block, naming the fix", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, "where:\n  Project: active.Project\n", {
      sourcePath: "Host.md",
      scope: "this",
      note: () => null,
      excludePath: null,
    });
    child.load();
    await settle();

    // Not "cannot use `active.Project` here" verbatim: `setCodeText` (used by
    // `renderError`) consumes backticks as delimiters for `<code>` spans
    // rather than keeping them in the rendered text, same as every other
    // error this plugin shows on screen.
    expect(container.querySelector(".ss-error-message")?.textContent).toContain(
      "cannot use active.Project here",
    );
  });
});
