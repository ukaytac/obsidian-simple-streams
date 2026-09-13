// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resetObsidianMock, setRenderHook } from "../mocks/obsidian";
import { FakeIntersectionObserver, FakeVault, drawnTitles, mountPane, settle } from "./harness";
import { StreamChild } from "../../src/view/StreamChild";

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
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("matches nothing and says why when the host note has no such property", async () => {
    const vault = vaultWith(undefined);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty")).not.toBeNull();
    expect(noticeText(container)).toContain("This note has no Project");
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = this.Project (not set here)",
    );
  });

  test("names the resolved value in the summary of an empty stream", async () => {
    const vault = vaultWith({ Project: "Gamma" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
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
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
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
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(noticeText(container)).toContain("This note has no Project");

    vault.setNotes(notesWith({ Project: "Alpha" }));
    await child.refresh();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();

    vault.setNotes(notesWith(undefined));
    await child.refresh();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(noticeText(container)).toContain("This note has no Project");
  });

  test("redraws the summary when the reference moves between two values that match nothing", async () => {
    const vault = vaultWith({ Project: "Gamma" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    vault.setNotes(notesWith({ Project: "Delta" }));
    await child.refresh();
    await settle();

    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = Delta",
    );
  });
});
