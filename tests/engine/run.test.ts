import { describe, expect, it } from "vitest";
import { runStream, type StreamResult } from "../../src/engine/run";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4);

const kinds = (result: StreamResult): string[] => result.notices.map((notice) => notice.kind);

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
    expect(kinds(result)).not.toContain("truncated");
  });

  it("applies the limit after sorting and reports truncation", () => {
    const result = runStream(NOTES, parseQuery("limit: 2"), NOW, "en-GB");
    expect(result.shown).toBe(2);
    expect(result.matched).toBe(4);
    expect(result.notices).toContainEqual({ kind: "truncated", shown: 2, matched: 4 });
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
    expect(result.notices).toEqual([]);
  });

  it("reports a date fallback when a declared date-field reaches no note", () => {
    // The signature of `date-field: dat` — every note falls back to ctime.
    const result = runStream(NOTES, parseQuery("date-field: dat"), NOW, "en-GB");
    expect(result.notices).toContainEqual({ kind: "dateFallback", field: "dat" });
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
    expect(result.notices).toContainEqual({ kind: "dateFallback", field: "dat" });
  });

  it("keeps days contiguous even when the date field resolves for nothing", () => {
    // The lead-sort-key version tied every note on the unresolved field, let
    // the order fall to `file.name`, and split two days into five headers.
    const journal = [
      note({ path: "a.md", basename: "alpha", ctime: localDate(2026, 9, 1) }),
      note({ path: "b.md", basename: "bravo", ctime: localDate(2026, 9, 2) }),
      note({ path: "c.md", basename: "charlie", ctime: localDate(2026, 9, 1) }),
      note({ path: "d.md", basename: "delta", ctime: localDate(2026, 9, 2) }),
      note({ path: "e.md", basename: "echo", ctime: localDate(2026, 9, 1) }),
    ];
    const query = parseQuery("date-field: dat\ngroup: day\nsort: file.name asc");
    const result = runStream(journal, query, NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual([
      "2 September 2026",
      "1 September 2026",
    ]);
    expect(result.groups.map((g) => g.notes.map((n) => n.basename))).toEqual([
      ["bravo", "delta"],
      ["alpha", "charlie", "echo"],
    ]);
  });

  it("does not blame a sort field the limit merely cut off", () => {
    // `rating` resolves for d.md, which the limit excludes. Judging on the
    // shown notes called it unresolved and sent the reader hunting a typo.
    const notes = [
      note({ path: "a.md", frontmatter: { status: "a" } }),
      note({ path: "b.md", frontmatter: { status: "a" } }),
      note({ path: "c.md", frontmatter: { status: "a" } }),
      note({ path: "d.md", frontmatter: { status: "b", rating: 9 } }),
    ];
    const result = runStream(notes, parseQuery("sort: [status asc, rating desc]\nlimit: 3"), NOW);
    expect(result.shown).toBe(3);
    expect(kinds(result)).not.toContain("unresolvedSort");
  });

  it("leaves a declared sort on the date field to the date notice", () => {
    // Both diagnostics fired for one cause, wording it two different ways.
    const result = runStream(NOTES, parseQuery("date-field: dat\nsort: dat desc"), NOW, "en-GB");
    expect(kinds(result)).toContain("dateFallback");
    expect(kinds(result)).not.toContain("unresolvedSort");
  });

  it("reports a sort field that resolved for no note", () => {
    // `file.ctim` is a typo for `file.ctime`; every note ties and the order
    // silently falls through to the path tie-break.
    const result = runStream(NOTES, parseQuery("sort: file.ctim desc"), NOW, "en-GB");
    expect(result.notices).toContainEqual({ kind: "unresolvedSort", fields: ["file.ctim"] });
  });

  it("reports no unresolved sort when the field resolves for some note", () => {
    const mixed = [
      note({ path: "a.md", frontmatter: { rating: 5 } }),
      note({ path: "b.md" }),
    ];
    expect(kinds(runStream(mixed, parseQuery("sort: rating desc"), NOW, "en-GB"))).not.toContain(
      "unresolvedSort",
    );
    expect(kinds(runStream(NOTES, parseQuery(""), NOW, "en-GB"))).not.toContain("unresolvedSort");
    expect(
      kinds(runStream(NOTES, parseQuery("tags: nonexistent\nsort: file.ctim"), NOW, "en-GB")),
    ).not.toContain("unresolvedSort");
  });

  it("reports no date fallback when the field resolves, or when it is the default", () => {
    const dated = [note({ path: "a.md", frontmatter: { date: "2026-09-04" } })];
    expect(kinds(runStream(dated, parseQuery("date-field: date"), NOW, "en-GB"))).not.toContain(
      "dateFallback",
    );
    // Only a *declared* field can be a typo; the default is nobody's mistake.
    expect(kinds(runStream(NOTES, parseQuery(""), NOW, "en-GB"))).not.toContain("dateFallback");
    // Nor is an empty stream evidence of one.
    expect(
      kinds(runStream(NOTES, parseQuery("tags: nonexistent\ndate-field: dat"), NOW, "en-GB")),
    ).not.toContain("dateFallback");
  });
});
