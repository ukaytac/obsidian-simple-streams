import { describe, expect, it } from "vitest";
import { runStream } from "../../src/engine/run";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4);

const NOTES = [
  note({ path: "Journal/03.md", tags: ["daily"], ctime: localDate(2026, 9, 3) }),
  note({ path: "Journal/04a.md", tags: ["daily"], ctime: localDate(2026, 9, 4) }),
  note({ path: "Journal/04b.md", tags: ["daily"], ctime: localDate(2026, 9, 4) }),
  note({ path: "Books/dune.md", tags: ["book"], ctime: localDate(2026, 1, 1) }),
];

describe("runStream", () => {
  it("filters, sorts and groups in that order", () => {
    const result = runStream(NOTES, parseQuery("folder: Journal\ngroup: day"), NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual(["4 September 2026", "3 September 2026"]);
    expect(result.groups[0].notes.map((n) => n.path)).toEqual(["Journal/04a.md", "Journal/04b.md"]);
    expect(result.matched).toBe(3);
    expect(result.shown).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("applies the limit after sorting and reports truncation", () => {
    const result = runStream(NOTES, parseQuery("limit: 2"), NOW, "en-GB");
    expect(result.shown).toBe(2);
    expect(result.matched).toBe(4);
    expect(result.truncated).toBe(true);
    expect(result.groups[0].notes.map((n) => n.path)).toEqual(["Journal/04a.md", "Journal/04b.md"]);
  });

  it("groups only the notes that survived the limit", () => {
    const result = runStream(NOTES, parseQuery("group: day\nlimit: 2"), NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual(["4 September 2026"]);
  });

  it("keeps days contiguous when the declared sort is on something else", () => {
    // Without the date leading the sort, this gave one header per note.
    const journal = [
      note({ path: "Journal/c.md", basename: "c", ctime: localDate(2026, 9, 1) }),
      note({ path: "Journal/a.md", basename: "a", ctime: localDate(2026, 9, 2) }),
      note({ path: "Journal/b.md", basename: "b", ctime: localDate(2026, 9, 1) }),
      note({ path: "Journal/d.md", basename: "d", ctime: localDate(2026, 9, 2) }),
    ];
    const result = runStream(journal, parseQuery("group: day\nsort: file.name asc"), NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual(["2 September 2026", "1 September 2026"]);
    expect(result.groups.map((g) => g.notes.map((note) => note.basename))).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
  });

  it("reports an empty result without groups", () => {
    const result = runStream(NOTES, parseQuery("tags: nonexistent"), NOW, "en-GB");
    expect(result.groups).toEqual([]);
    expect(result.matched).toBe(0);
    expect(result.shown).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("reports a date fallback when a declared date-field reaches no note", () => {
    // The signature of `date-field: dat` — every note falls back to ctime.
    const result = runStream(NOTES, parseQuery("date-field: dat"), NOW, "en-GB");
    expect(result.dateFallback).toBe(true);
  });

  it("still reports a date fallback when the range emptied the result", () => {
    // The typo puts every note on the ctime fallback, the June range then
    // excludes them all, and judging after the range would go quiet.
    const january = [
      note({ path: "a.md", ctime: localDate(2026, 1, 5) }),
      note({ path: "b.md", ctime: localDate(2026, 1, 9) }),
    ];
    const query = parseQuery("date-field: dat\nfrom: 2026-06-01\nto: 2026-06-30");
    const result = runStream(january, query, NOW, "en-GB");
    expect(result.shown).toBe(0);
    expect(result.dateFallback).toBe(true);
  });

  it("reports a sort field that resolved for no note", () => {
    // `file.ctim` is a typo for `file.ctime`; every note ties and the order
    // silently falls through to the path tie-break.
    const result = runStream(NOTES, parseQuery("sort: file.ctim desc"), NOW, "en-GB");
    expect(result.unresolvedSort).toEqual(["file.ctim"]);
  });

  it("reports no unresolved sort when the field resolves for some note", () => {
    const mixed = [
      note({ path: "a.md", frontmatter: { rating: 5 } }),
      note({ path: "b.md" }),
    ];
    expect(runStream(mixed, parseQuery("sort: rating desc"), NOW, "en-GB").unresolvedSort).toEqual(
      [],
    );
    expect(runStream(NOTES, parseQuery(""), NOW, "en-GB").unresolvedSort).toEqual([]);
    expect(
      runStream(NOTES, parseQuery("tags: nonexistent\nsort: file.ctim"), NOW, "en-GB")
        .unresolvedSort,
    ).toEqual([]);
  });

  it("reports no date fallback when the field resolves, or when it is the default", () => {
    const dated = [note({ path: "a.md", frontmatter: { date: "2026-09-04" } })];
    expect(runStream(dated, parseQuery("date-field: date"), NOW, "en-GB").dateFallback).toBe(false);
    // Only a *declared* field can be a typo; the default is nobody's mistake.
    expect(runStream(NOTES, parseQuery(""), NOW, "en-GB").dateFallback).toBe(false);
    // Nor is an empty stream evidence of one.
    expect(
      runStream(NOTES, parseQuery("tags: nonexistent\ndate-field: dat"), NOW, "en-GB").dateFallback,
    ).toBe(false);
  });
});
