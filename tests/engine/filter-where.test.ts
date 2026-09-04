import { describe, expect, it } from "vitest";
import { filterNotes, matchesClause } from "../../src/engine/filter";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4, 12, 0);

function condition(source: string) {
  return parseQuery(source).where[0];
}

describe("matchesClause — equality and any-of", () => {
  it("compares strings case-insensitively", () => {
    const n = note({ frontmatter: { status: "Done" } });
    expect(matchesClause(n, condition("where:\n  status: done"))).toBe(true);
  });

  it("compares numbers numerically across string and number values", () => {
    expect(matchesClause(note({ frontmatter: { rating: 5 } }), condition("where:\n  rating: 5"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { rating: "5" } }), condition("where:\n  rating: 5"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { rating: 4 } }), condition("where:\n  rating: 5"))).toBe(false);
  });

  it("compares booleans", () => {
    expect(matchesClause(note({ frontmatter: { published: true } }), condition("where:\n  published: true"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { published: false } }), condition("where:\n  published: true"))).toBe(false);
  });

  it("matches any listed value", () => {
    const clause = condition("where:\n  type: [article, book]");
    expect(matchesClause(note({ frontmatter: { type: "book" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { type: "video" } }), clause)).toBe(false);
  });

  it("matches when any element of an array-valued field matches", () => {
    const n = note({ frontmatter: { type: ["video", "book"] } });
    expect(matchesClause(n, condition("where:\n  type: book"))).toBe(true);
    expect(matchesClause(n, condition("where:\n  type: [book, article]"))).toBe(true);
  });
});

describe("matchesClause — exists and missing", () => {
  it("detects a present field", () => {
    expect(matchesClause(note({ frontmatter: { done: "yes" } }), condition("where:\n  done: exists"))).toBe(true);
    expect(matchesClause(note(), condition("where:\n  done: exists"))).toBe(false);
  });

  it("treats null as missing", () => {
    expect(matchesClause(note({ frontmatter: { done: null } }), condition("where:\n  done: missing"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { done: null } }), condition("where:\n  done: exists"))).toBe(false);
  });

  it("detects an absent field", () => {
    expect(matchesClause(note(), condition("where:\n  done: missing"))).toBe(true);
  });
});

describe("matchesClause — comparisons", () => {
  it("compares numbers", () => {
    const clause = condition('where:\n  rating: ">3"');
    expect(matchesClause(note({ frontmatter: { rating: 4 } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { rating: 3 } }), clause)).toBe(false);
    expect(matchesClause(note({ frontmatter: { rating: "4" } }), clause)).toBe(true);
  });

  it("honours >= and <=", () => {
    expect(matchesClause(note({ frontmatter: { r: 3 } }), condition('where:\n  r: ">=3"'))).toBe(true);
    expect(matchesClause(note({ frontmatter: { r: 3 } }), condition('where:\n  r: "<=3"'))).toBe(true);
    expect(matchesClause(note({ frontmatter: { r: 4 } }), condition('where:\n  r: "<=3"'))).toBe(false);
  });

  it("compares ISO dates chronologically", () => {
    const clause = condition('where:\n  due: ">2026-06-01"');
    expect(matchesClause(note({ frontmatter: { due: "2026-09-04" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { due: "2026-01-04" } }), clause)).toBe(false);
  });

  it("compares plain text lexically, never as a date", () => {
    // Date.parse("May") succeeds in some runtimes. Comparison must stay textual,
    // so "May" > "June" alphabetically even though May precedes June in the year.
    const clause = condition('where:\n  month: ">June"');
    expect(matchesClause(note({ frontmatter: { month: "May" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { month: "April" } }), clause)).toBe(false);
  });

  it("supports != on text", () => {
    const clause = condition('where:\n  status: "!=done"');
    expect(matchesClause(note({ frontmatter: { status: "todo" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { status: "done" } }), clause)).toBe(false);
  });

  it("fails every comparison for an absent field, != included", () => {
    expect(matchesClause(note(), condition('where:\n  status: "!=done"'))).toBe(false);
    expect(matchesClause(note(), condition('where:\n  rating: ">3"'))).toBe(false);
    expect(matchesClause(note(), condition("where:\n  rating: 3"))).toBe(false);
  });

  it("compares against file properties", () => {
    const n = note({ path: "Journal/a.md" });
    expect(matchesClause(n, condition("where:\n  file.path: Journal/a.md"))).toBe(true);
  });
});

describe("filterNotes — date range", () => {
  const notes = [
    note({ path: "a.md", frontmatter: { date: "2026-01-15" } }),
    note({ path: "b.md", frontmatter: { date: "2026-09-04" } }),
    note({ path: "c.md", frontmatter: { date: "2026-12-31" } }),
    note({ path: "d.md", ctime: localDate(2026, 6, 1) }),
  ];

  it("filters on the named date field", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-02-01\nto: 2026-10-01");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["b.md"]);
  });

  it("includes both bounds as whole days", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-09-04\nto: 2026-09-04");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["b.md"]);
  });

  it("falls back to ctime for a note without the date field", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-05-01\nto: 2026-07-01");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["d.md"]);
  });

  it("resolves relative bounds against the given now", () => {
    const query = parseQuery("date-field: date\nfrom: -30d\nto: today");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["b.md"]);
  });

  it("applies an open-ended lower bound", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-10-01");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["c.md"]);
  });
});
