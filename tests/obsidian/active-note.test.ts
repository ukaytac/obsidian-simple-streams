// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import type { App } from "obsidian";
import { ActiveNoteTracker } from "../../src/obsidian/activeNote";
import { FakeWorkspace, file } from "../fixtures/workspace";

const A = file("Notes/A.md");
const B = file("Notes/B.md");

let workspace: FakeWorkspace;
let followed: Array<string | null>;
let tracker: ActiveNoteTracker;

beforeEach(() => {
  workspace = new FakeWorkspace();
  followed = [];
  tracker = new ActiveNoteTracker(workspace.app as unknown as App, (target) => {
    followed.push(target?.path ?? null);
  });
  tracker.start();
});

describe("ActiveNoteTracker", () => {
  test("follows the note that becomes active", () => {
    workspace.open(A);
    expect(followed).toEqual(["Notes/A.md"]);
    expect(tracker.current()?.path).toBe("Notes/A.md");
  });

  test("follows a move from one note to another", () => {
    workspace.open(A);
    workspace.open(B);
    expect(followed).toEqual(["Notes/A.md", "Notes/B.md"]);
  });

  test("keeps the note when focus leaves every Markdown view", () => {
    workspace.open(A);
    workspace.blur();
    expect(followed).toEqual(["Notes/A.md"]);
    expect(tracker.current()?.path).toBe("Notes/A.md");
  });

  // This is the test that actually proves rule 2 (the `isOpen` stickiness
  // branch) exists. Setting `activeFile` to a non-Markdown file invalidates
  // rule 3's fallback, so only rule 2 can keep the note followed. The blur
  // test above it looks like the same case but isn't: `FakeWorkspace.blur()`
  // leaves `activeFile` pointing at the note, so rule 3 alone would satisfy
  // it even with rule 2 deleted. Do not remove this one as "redundant" with
  // the blur test above — it is the only thing holding rule 2 in place.
  test("keeps the note when a non-Markdown view takes focus", () => {
    workspace.open(A);
    workspace.activeView = null;
    workspace.activeFile = file("Scans/plan.pdf", "pdf");
    workspace.fire("active-leaf-change");
    expect(tracker.current()?.path).toBe("Notes/A.md");
  });

  test("lets go when the followed note is closed", () => {
    workspace.open(A);
    workspace.close("Notes/A.md");
    expect(followed).toEqual(["Notes/A.md", null]);
    expect(tracker.current()).toBeNull();
  });

  test("falls back to the active file when a note is open but unfocused at startup", () => {
    workspace.activeView = null;
    workspace.activeFile = A;
    workspace.fire("active-leaf-change");
    expect(followed).toEqual(["Notes/A.md"]);
  });

  test("ignores a non-Markdown active file in that fallback", () => {
    workspace.activeView = null;
    workspace.activeFile = file("Scans/plan.pdf", "pdf");
    workspace.fire("active-leaf-change");
    expect(followed).toEqual([]);
    expect(tracker.current()).toBeNull();
  });

  test("says nothing when the answer has not changed", () => {
    workspace.open(A);
    workspace.fire("active-leaf-change");
    workspace.fire("file-open");
    workspace.blur();
    expect(followed).toEqual(["Notes/A.md"]);
  });

  // The plan's version mutated the module-level `A` constant in place and
  // restored it afterward. That is fragile: if an assertion between the
  // mutation and the restore ever failed, `A` would stay mutated and every
  // later test in this file would silently run against the wrong path. This
  // version uses its own local file object instead, so nothing leaks
  // regardless of outcome.
  test("re-points when the followed note is renamed", () => {
    const moved = file("Notes/Moved.md");
    workspace.open(moved);
    // Obsidian renames in place: the same file object, a new path.
    moved.path = "Notes/Renamed.md";
    moved.basename = "Renamed";
    workspace.fire("rename");
    expect(followed).toEqual(["Notes/Moved.md", "Notes/Renamed.md"]);
  });

  // Closing first and then firing "delete" would prove nothing: `close()`
  // already fires `active-leaf-change`, which alone drives the tracker to
  // null before "delete" is ever fired. This puts the workspace directly
  // into the post-delete state — off screen, out of the open set, and no
  // longer the active file — with no leaf-change in between, so the only
  // thing that can produce the `null` notification is the tracker's own
  // subscription to "delete".
  test("lets go when the followed note is deleted, from the delete event alone", () => {
    workspace.open(A);
    workspace.markdownViews = [];
    workspace.activeView = null;
    workspace.activeFile = null;
    workspace.fire("delete");
    expect(followed).toEqual(["Notes/A.md", null]);
    expect(tracker.current()).toBeNull();
  });
});
