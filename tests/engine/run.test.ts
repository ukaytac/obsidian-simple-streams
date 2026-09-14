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
    const result = runStream(NOTES, parseQuery("folder: Journal\ngroup: day"), NOW, { locale: "en-GB" });
    expect(result.groups.map((g) => g.header)).toEqual(["4 September 2026", "3 September 2026"]);
    expect(result.groups[0].notes.map((n) => n.path)).toEqual(["Journal/04a.md", "Journal/04b.md"]);
    expect(result.matched).toBe(3);
    expect(result.shown).toBe(3);
    expect(kinds(result)).not.toContain("truncated");
  });

  it("applies the limit after sorting and reports truncation", () => {
    const result = runStream(NOTES, parseQuery("limit: 2"), NOW, { locale: "en-GB" });
    expect(result.shown).toBe(2);
    expect(result.matched).toBe(4);
    expect(result.notices).toContainEqual({ kind: "truncated", shown: 2, matched: 4 });
    expect(result.groups[0].notes.map((n) => n.path)).toEqual(["Journal/04a.md", "Journal/04b.md"]);
  });

  it("groups only the notes that survived the limit", () => {
    const result = runStream(NOTES, parseQuery("group: day\nlimit: 2"), NOW, { locale: "en-GB" });
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
    const result = runStream(journal, parseQuery("group: day\nsort: file.name asc"), NOW, { locale: "en-GB" });
    expect(result.groups.map((g) => g.header)).toEqual(["2 September 2026", "1 September 2026"]);
    expect(result.groups.map((g) => g.notes.map((note) => note.basename))).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
  });

  it("reports an empty result without groups", () => {
    const result = runStream(NOTES, parseQuery("tags: nonexistent"), NOW, { locale: "en-GB" });
    expect(result.groups).toEqual([]);
    expect(result.matched).toBe(0);
    expect(result.shown).toBe(0);
    expect(result.notices).toEqual([]);
  });

  it("reports a date fallback when a declared date-field reaches no note", () => {
    // The signature of `date-field: dat` — every note falls back to ctime.
    const result = runStream(NOTES, parseQuery("date-field: dat"), NOW, { locale: "en-GB" });
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
    const result = runStream(january, query, NOW, { locale: "en-GB" });
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
    const result = runStream(journal, query, NOW, { locale: "en-GB" });
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
    const result = runStream(NOTES, parseQuery("date-field: dat\nsort: dat desc"), NOW, { locale: "en-GB" });
    expect(kinds(result)).toContain("dateFallback");
    expect(kinds(result)).not.toContain("unresolvedSort");
  });

  it("reports a sort field that resolved for no note", () => {
    // `file.ctim` is a typo for `file.ctime`; every note ties and the order
    // silently falls through to the path tie-break.
    const result = runStream(NOTES, parseQuery("sort: file.ctim desc"), NOW, { locale: "en-GB" });
    expect(result.notices).toContainEqual({ kind: "unresolvedSort", fields: ["file.ctim"] });
  });

  it("reports no unresolved sort when the field resolves for some note", () => {
    const mixed = [
      note({ path: "a.md", frontmatter: { rating: 5 } }),
      note({ path: "b.md" }),
    ];
    expect(kinds(runStream(mixed, parseQuery("sort: rating desc"), NOW, { locale: "en-GB" }))).not.toContain(
      "unresolvedSort",
    );
    expect(kinds(runStream(NOTES, parseQuery(""), NOW, { locale: "en-GB" }))).not.toContain("unresolvedSort");
    expect(
      kinds(runStream(NOTES, parseQuery("tags: nonexistent\nsort: file.ctim"), NOW, { locale: "en-GB" })),
    ).not.toContain("unresolvedSort");
  });

  it("reports no date fallback when the field resolves, or when it is the default", () => {
    const dated = [note({ path: "a.md", frontmatter: { date: "2026-09-04" } })];
    expect(kinds(runStream(dated, parseQuery("date-field: date"), NOW, { locale: "en-GB" }))).not.toContain(
      "dateFallback",
    );
    // Only a *declared* field can be a typo; the default is nobody's mistake.
    expect(kinds(runStream(NOTES, parseQuery(""), NOW, { locale: "en-GB" }))).not.toContain("dateFallback");
    // Nor is an empty stream evidence of one.
    expect(
      kinds(runStream(NOTES, parseQuery("tags: nonexistent\ndate-field: dat"), NOW, { locale: "en-GB" })),
    ).not.toContain("dateFallback");
  });
});

describe("runStream — this. references", () => {
  const SOURCE = "where:\n  Project: this.Project";

  it("filters by the host note's value", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { Project: "Alpha" } }),
      note({ path: "b.md", frontmatter: { Project: "Beta" } }),
    ];
    const host = note({ path: "Host.md", frontmatter: { Project: "Alpha" } });
    const result = runStream(notes, parseQuery(SOURCE), NOW, { host });
    expect(result.groups.flatMap((g) => g.notes.map((n) => n.path))).toEqual(["a.md"]);
    expect(kinds(result)).not.toContain("unresolvedRef");
  });

  it("matches nothing and says why when the host note lacks the property", () => {
    const notes = [note({ path: "a.md", frontmatter: { Project: "Alpha" } })];
    const result = runStream(notes, parseQuery(SOURCE), NOW, { host: note({ path: "Host.md" }) });
    expect(result.matched).toBe(0);
    expect(result.notices[0]).toEqual({
      kind: "unresolvedRef",
      scope: "this",
      fields: ["Project"],
    });
  });

  it("matches nothing when there is no host note at all", () => {
    const notes = [note({ path: "a.md", frontmatter: { Project: "Alpha" } })];
    expect(runStream(notes, parseQuery(SOURCE), NOW).matched).toBe(0);
  });

  it("returns the resolved query, so the summary can name a real value", () => {
    const host = note({ path: "Host.md", frontmatter: { Project: "Alpha" } });
    const result = runStream([], parseQuery(SOURCE), NOW, { host });
    expect(result.query.where).toEqual([
      { field: "Project", condition: { kind: "equals", value: "Alpha" } },
    ]);
  });

  it("reports only the unresolved reference, not the pile of notices an unresolved ref would otherwise earn", () => {
    // date-field, sort and limit each name a field or cutoff that would raise
    // its own notice if anything had matched. Nothing does, because the ref
    // is unresolved, and each of those three notices is separately guarded
    // against an empty result: `dateFallback` needs `reached.length > 0`,
    // `unresolvedSort` needs `matched.length > 0`, `truncated` needs
    // `matched > shown`. This pins that the three guards still agree, so the
    // reader sees exactly the one notice that explains the empty stream.
    // `from`/`to` are in the mix too, so this also pins that skipping the
    // second `filterNotes` pass `reached` runs for a date range — pointless
    // here, since `matched` is already empty on the unresolved `ref` clause
    // alone — changes nothing about which notices come out.
    const notes = [note({ path: "a.md", frontmatter: { Project: "Alpha" } })];
    const query = parseQuery(
      `${SOURCE}\ndate-field: nope\nsort: nope desc\nlimit: 1\nfrom: 2026-01-01\nto: 2026-12-31`,
    );
    const result = runStream(notes, query, NOW, { host: note({ path: "Host.md" }) });
    expect(result.notices).toEqual([
      { kind: "unresolvedRef", scope: "this", fields: ["Project"] },
    ]);
  });
});

describe("runStream — active references", () => {
  const QUERY = "where:\n  Project: active.Project";

  it("matches against the active note", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { Project: "Alpha" } }),
      note({ path: "b.md", frontmatter: { Project: "Beta" } }),
    ];
    const result = runStream(notes, parseQuery(QUERY), new Date(), {
      active: note({ path: "Active.md", frontmatter: { Project: "Alpha" } }),
    });
    expect(result.groups.flatMap((group) => group.notes.map((n) => n.path))).toEqual([
      "a.md",
    ]);
  });

  it("raises a scoped notice when the active note cannot answer", () => {
    const result = runStream([note({ path: "a.md" })], parseQuery(QUERY), new Date(), {
      active: note({ path: "Active.md" }),
    });
    expect(result.notices).toContainEqual({
      kind: "unresolvedRef",
      scope: "active",
      fields: ["Project"],
    });
  });

  it("keeps the this scope on a host-note notice", () => {
    const result = runStream(
      [note({ path: "a.md" })],
      parseQuery("where:\n  Project: this.Project"),
      new Date(),
      { host: note({ path: "Host.md" }) },
    );
    expect(result.notices).toContainEqual({
      kind: "unresolvedRef",
      scope: "this",
      fields: ["Project"],
    });
  });

  it("raises one notice per scope, this before active, each naming only its own fields", () => {
    // REF_SCOPES is ["this", "active"], and the notice loop walks it in that
    // order — pinned here so a reorder (or a collapse back to one notice) is
    // caught rather than silently reshuffling which note the reader is told
    // to go fix first.
    const result = runStream(
      [note({ path: "a.md" })],
      parseQuery("where:\n  a: this.Project\n  b: active.Team"),
      new Date(),
      { host: note({ path: "Host.md" }), active: note({ path: "Active.md" }) },
    );
    expect(result.notices).toEqual([
      { kind: "unresolvedRef", scope: "this", fields: ["Project"] },
      { kind: "unresolvedRef", scope: "active", fields: ["Team"] },
    ]);
  });
});
