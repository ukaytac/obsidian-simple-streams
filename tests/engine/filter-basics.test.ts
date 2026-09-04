import { describe, expect, it } from "vitest";
import { filterNotes, hasTag, inFolder, matchesTitle } from "../../src/engine/filter";
import { parseQuery } from "../../src/query/parse";
import { note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4);

function pathsOf(source: string, notes = SAMPLE) {
  return filterNotes(notes, parseQuery(source), NOW).map((n) => n.path);
}

const SAMPLE = [
  note({ path: "Journal/2026-09-04.md", tags: ["daily"] }),
  note({ path: "Journal/Trips/lisbon.md", tags: ["travel"] }),
  note({ path: "Journal2/other.md", tags: ["daily"] }),
  note({ path: "Books/dune.md", tags: ["book", "scifi"] }),
  note({ path: "Books/draft-idea.md", tags: ["book", "draft"] }),
  note({ path: "Projects/streams.md", tags: ["project/simple-streams"] }),
];

describe("inFolder", () => {
  it("matches the folder itself and its descendants", () => {
    expect(inFolder("Journal/2026-09-04.md", "journal")).toBe(true);
    expect(inFolder("Journal/Trips/lisbon.md", "journal")).toBe(true);
    expect(inFolder("Journal/Trips/lisbon.md", "journal/trips")).toBe(true);
  });

  it("does not match a folder that merely starts with the same letters", () => {
    expect(inFolder("Journal2/other.md", "journal")).toBe(false);
  });

  it("matches everything for an empty prefix", () => {
    expect(inFolder("Books/dune.md", "")).toBe(true);
  });

  it("normalizes its own argument, so a hand-built query still works", () => {
    expect(inFolder("Journal/2026-09-04.md", "Journal")).toBe(true);
    expect(inFolder("Journal/2026-09-04.md", "/Journal/")).toBe(true);
  });
});

describe("hasTag", () => {
  it("matches the tag itself", () => {
    expect(hasTag(["book"], "book")).toBe(true);
  });

  it("matches a descendant tag", () => {
    expect(hasTag(["project/simple-streams"], "project")).toBe(true);
  });

  it("does not match a sibling that shares a prefix", () => {
    expect(hasTag(["bookmark"], "book")).toBe(false);
  });

  it("normalizes its own argument", () => {
    expect(hasTag(["book"], "#Book")).toBe(true);
    expect(hasTag(["project/streams"], "#Project")).toBe(true);
  });
});

describe("matchesTitle", () => {
  it("matches a case-insensitive substring", () => {
    expect(matchesTitle(note({ path: "Journal/2026-09-04.md" }), { kind: "text", value: "2026-" })).toBe(true);
    expect(matchesTitle(note({ path: "Books/Dune.md" }), { kind: "text", value: "dune" })).toBe(true);
  });

  it("matches a regex", () => {
    expect(matchesTitle(note({ path: "J/2026-09-04.md" }), { kind: "regex", source: "^20\\d\\d-", flags: "" })).toBe(true);
    expect(matchesTitle(note({ path: "J/lisbon.md" }), { kind: "regex", source: "^20\\d\\d-", flags: "" })).toBe(false);
  });

  it("matches everything when there is no matcher", () => {
    expect(matchesTitle(note(), null)).toBe(true);
  });
});

describe("filterNotes", () => {
  it("returns everything for an empty query", () => {
    expect(pathsOf("")).toHaveLength(SAMPLE.length);
  });

  it("filters by folder without catching a same-prefix sibling", () => {
    expect(pathsOf("folder: Journal")).toEqual([
      "Journal/2026-09-04.md",
      "Journal/Trips/lisbon.md",
    ]);
  });

  it("accepts several folders", () => {
    expect(pathsOf("folder: [Books, Projects]")).toEqual([
      "Books/dune.md",
      "Books/draft-idea.md",
      "Projects/streams.md",
    ]);
  });

  it("requires every tag in `tags`", () => {
    expect(pathsOf("tags: [book, scifi]")).toEqual(["Books/dune.md"]);
  });

  it("accepts any tag in `tags-any`", () => {
    expect(pathsOf("tags-any: [travel, scifi]")).toEqual([
      "Journal/Trips/lisbon.md",
      "Books/dune.md",
    ]);
  });

  it("matches an ancestor tag", () => {
    expect(pathsOf("tags: project")).toEqual(["Projects/streams.md"]);
  });

  it("drops excluded folders and tags", () => {
    expect(pathsOf("tags: book\nexclude-tags: draft")).toEqual(["Books/dune.md"]);
    expect(pathsOf("exclude-folder: [Journal, Journal2, Books]")).toEqual(["Projects/streams.md"]);
  });

  it("combines a folder and a title match", () => {
    expect(pathsOf("folder: Journal\ntitle: 2026-")).toEqual(["Journal/2026-09-04.md"]);
  });
});
