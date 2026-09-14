// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TFile } from "obsidian";
import { resetObsidianMock } from "../mocks/obsidian";
import { FakeIntersectionObserver, FakeVault, drawnTitles, settle } from "./harness";
import { StreamSidebarView } from "../../src/view/StreamSidebarView";
import { StreamRegistry } from "../../src/obsidian/registry";

const QUERY = "sort: file.path asc\ndisplay: title\nwhere:\n  Project: active.Project\n";

function vaultWith(activeFrontmatter: Record<string, unknown> | undefined): FakeVault {
  return new FakeVault([
    { path: "Active.md", frontmatter: activeFrontmatter },
    { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    { path: "Notes/c.md", frontmatter: { Project: "Alpha" } },
  ]);
}

function fileAt(vault: FakeVault, path: string): TFile {
  const found = vault.app.vault.getFileByPath(path);
  if (found === null) {
    throw new Error(`no file at ${path}`);
  }
  return found;
}

function mount(vault: FakeVault, query = QUERY): StreamSidebarView {
  const view = new StreamSidebarView({ app: vault.app } as never, {
    registry: new StreamRegistry(vault.app),
    query: () => query,
  });
  document.body.appendChild(view.containerEl);
  view.load();
  return view;
}

function headerText(view: StreamSidebarView): string {
  return view.contentEl.querySelector(".ss-sidebar-header")?.textContent ?? "";
}

function noticeText(view: StreamSidebarView): string | null {
  return view.contentEl.querySelector(".ss-notice")?.textContent ?? null;
}

function headerHidden(view: StreamSidebarView): boolean {
  const el = view.contentEl.querySelector(".ss-sidebar-header");
  if (el === null) {
    throw new Error("no .ss-sidebar-header in the DOM");
  }
  return (el as HTMLElement).hidden;
}

/**
 * How many streams a registry is still holding. `StreamRegistry` has no
 * public way to ask this — `register`/`unregister` are its whole surface —
 * so this reads the private field the same way `peek()` in `harness.ts` reads
 * a `StreamChild`'s. Needed because `refresh()` on a dead child is a no-op
 * before it ever reaches the vault, so a vault-scan count can't tell
 * "unregistered" apart from "still registered but dead".
 */
function registrySize(registry: StreamRegistry): number {
  return (registry as unknown as { streams: Set<unknown> }).streams.size;
}

let view: StreamSidebarView | null = null;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
});

afterEach(() => {
  view?.unload();
  view = null;
});

describe("the sidebar", () => {
  test("says so when no note is being followed", async () => {
    view = mount(vaultWith({ Project: "Alpha" }));
    await view.onOpen();
    await settle();

    expect(view.contentEl.querySelector(".ss-sidebar-empty")?.textContent).toBe(
      "Open a note to see related notes.",
    );
    expect(headerText(view)).toBe("");
  });

  test("hides the header explicitly rather than relying on it being empty", async () => {
    // Pins Finding 1: the header must be hidden through its own `hidden`
    // property, not through a `.ss-sidebar-header:empty` CSS rule keyed off
    // `setText("")` leaving no child nodes — behavior of Obsidian's real
    // `setText` this repo cannot verify, since `obsidian` ships only type
    // declarations here, no runtime.
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault);
    await view.onOpen();
    await settle();

    expect(headerHidden(view)).toBe(true);

    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(headerHidden(view)).toBe(false);
    expect(headerText(view)).toBe("Following: Active");
  });

  test("shows the notes sharing the followed note's project", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a", "c"]);
    expect(headerText(view)).toBe("Following: Active");
  });

  test("leaves the followed note out of its own feed", async () => {
    const vault = new FakeVault([
      { path: "Active.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    ]);
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a"]);
  });

  test("follows a move to another note", async () => {
    const vault = new FakeVault([
      { path: "Alpha.md", frontmatter: { Project: "Alpha" } },
      { path: "Beta.md", frontmatter: { Project: "Beta" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    ]);
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Alpha.md"));
    await settle();
    expect(drawnTitles(view.contentEl)).toEqual(["a"]);

    view.follow(fileAt(vault, "Beta.md"));
    await settle();
    expect(drawnTitles(view.contentEl)).toEqual(["b"]);
    expect(headerText(view)).toBe("Following: Beta");
  });

  test("goes back to the empty state when nothing is followed any more", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    view.follow(null);
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual([]);
    expect(view.contentEl.querySelector(".ss-sidebar-empty")).not.toBeNull();
  });

  test("names the followed note when it has no usable property", async () => {
    const vault = vaultWith(undefined);
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual([]);
    expect(noticeText(view)).toContain("The note you are looking at has no usable Project");
  });

  test("refuses a this. reference, naming the fix", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault, "where:\n  Project: this.Project\n");
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(view.contentEl.querySelector(".ss-error-message")?.textContent).toContain(
      "cannot use this.Project here",
    );
  });

  test("shows a parse error rather than an empty pane", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault, "sort: file.mtime ???\n");
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(view.contentEl.querySelector(".ss-error")).not.toBeNull();
  });

  test("leaves nothing registered once it unloads", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const registry = new StreamRegistry(vault.app);
    view = new StreamSidebarView({ app: vault.app } as never, {
      registry,
      query: () => QUERY,
    });
    document.body.appendChild(view.containerEl);
    view.load();
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(registrySize(registry)).toBe(1);

    const before = vault.scans;
    view.unload();
    view = null;
    await registry.flushNow();

    // The membership check is the one that carries this test: a leaked
    // registration and a genuinely unregistered stream both leave `scans`
    // unchanged here, since `StreamChild.refresh()` already refuses to touch
    // the vault once it is dead. Only reading `streams` itself tells apart
    // "unregistered" from "registered but dead".
    expect(registrySize(registry)).toBe(0);
    expect(vault.scans).toBe(before);
  });

  test("re-reads the followed note on refresh, not just on follow()", async () => {
    // Active.md starts in Alpha; only Notes/a.md shares it. The followed file
    // itself never changes — no further `follow()` call below — only the
    // vault's copy of its frontmatter does, the way editing the note's
    // properties in the editor would.
    const vault = new FakeVault([
      { path: "Active.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    ]);
    const registry = new StreamRegistry(vault.app);
    view = new StreamSidebarView({ app: vault.app } as never, {
      registry,
      query: () => QUERY,
    });
    document.body.appendChild(view.containerEl);
    view.load();
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a"]);

    // The context's `note` thunk has to re-read per refresh for this to work:
    // one captured once at construction would keep answering "Alpha" forever,
    // and the feed would silently go stale the moment the reader edited the
    // very note the sidebar exists to watch.
    vault.setNotes([
      { path: "Active.md", frontmatter: { Project: "Beta" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    ]);
    await registry.flushNow();

    expect(drawnTitles(view.contentEl)).toEqual(["b"]);
  });

  test("keeps self-exclusion and the header current after a rename, once told to follow again", async () => {
    const vault = new FakeVault([
      { path: "Notes/Old.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    ]);
    view = mount(vault);
    await view.onOpen();

    const file = fileAt(vault, "Notes/Old.md");
    view.follow(file);
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a"]);
    expect(headerText(view)).toBe("Following: Old");

    // Obsidian renames a TFile in place: the same object's `path` and
    // `basename` change, nothing is reconstructed. The vault's own listing has
    // to agree, the way a real rename updates both at once.
    vault.setNotes([
      { path: "Notes/New.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    ]);
    file.path = "Notes/New.md";
    file.basename = "New";

    // The same file object, told again — `ActiveNoteTracker`'s job in
    // production, firing because its own `followedPath` no longer matches.
    // Without this call, `rebuild()`'s captured `excludePath` would still name
    // "Notes/Old.md", which no longer exists, so "Notes/New.md" would stop
    // being excluded and reappear in its own feed.
    view.follow(file);
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a"]);
    expect(headerText(view)).toBe("Following: New");
  });

  test("leaves nothing registered once onClose runs, not just unload", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const registry = new StreamRegistry(vault.app);
    view = new StreamSidebarView({ app: vault.app } as never, {
      registry,
      query: () => QUERY,
    });
    document.body.appendChild(view.containerEl);
    view.load();
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(registrySize(registry)).toBe(1);

    // The leaf closing while the plugin stays loaded: Obsidian calls
    // `onClose()` alone here, never `unload()`. `teardown()` is shared between
    // both paths for exactly this reason — leaving the registry holding a dead
    // stream until the plugin itself unloads would refresh it forever from a
    // pane that no longer exists.
    await view.onClose();

    expect(registrySize(registry)).toBe(0);
  });
});
