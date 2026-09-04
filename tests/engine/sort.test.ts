import { describe, expect, it } from "vitest";
import { sortNotes } from "../../src/engine/sort";
import { localDate, note } from "../fixtures/notes";

function pathsOf(notes: ReturnType<typeof note>[], sort: { field: string; direction: "asc" | "desc" }[]) {
  return sortNotes(notes, sort).map((n) => n.path);
}

describe("sortNotes", () => {
  it("sorts numbers numerically, not lexically", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { rating: 9 } }),
      note({ path: "b.md", frontmatter: { rating: 10 } }),
      note({ path: "c.md", frontmatter: { rating: 2 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "asc" }])).toEqual(["c.md", "a.md", "b.md"]);
  });

  it("sorts ISO dates chronologically", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { date: "2026-01-15" } }),
      note({ path: "b.md", frontmatter: { date: "2026-09-04" } }),
      note({ path: "c.md", frontmatter: { date: "2025-12-31" } }),
    ];
    expect(pathsOf(notes, [{ field: "date", direction: "desc" }])).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("sorts text case-insensitively", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { title: "banana" } }),
      note({ path: "b.md", frontmatter: { title: "Apple" } }),
    ];
    expect(pathsOf(notes, [{ field: "title", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("puts missing values last when ascending", () => {
    const notes = [
      note({ path: "a.md" }),
      note({ path: "b.md", frontmatter: { rating: 1 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("puts missing values last when descending too", () => {
    const notes = [
      note({ path: "a.md" }),
      note({ path: "b.md", frontmatter: { rating: 1 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "desc" }])).toEqual(["b.md", "a.md"]);
  });

  it("treats an empty string as missing", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { status: "" } }),
      note({ path: "b.md", frontmatter: { status: "todo" } }),
    ];
    expect(pathsOf(notes, [{ field: "status", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("applies sort keys in order", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { group: "x", rating: 1 } }),
      note({ path: "b.md", frontmatter: { group: "x", rating: 9 } }),
      note({ path: "c.md", frontmatter: { group: "a", rating: 5 } }),
    ];
    expect(
      pathsOf(notes, [
        { field: "group", direction: "asc" },
        { field: "rating", direction: "desc" },
      ]),
    ).toEqual(["c.md", "b.md", "a.md"]);
  });

  it("breaks ties on path ascending, so order is stable", () => {
    const notes = [
      note({ path: "z.md", frontmatter: { rating: 1 } }),
      note({ path: "a.md", frontmatter: { rating: 1 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "desc" }])).toEqual(["a.md", "z.md"]);
  });

  it("sorts by file properties", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 1, 1) }),
      note({ path: "b.md", ctime: localDate(2026, 9, 4) }),
    ];
    expect(pathsOf(notes, [{ field: "file.ctime", direction: "desc" }])).toEqual(["b.md", "a.md"]);
  });

  it("does not mutate the input array", () => {
    const notes = [note({ path: "b.md" }), note({ path: "a.md" })];
    sortNotes(notes, [{ field: "file.name", direction: "asc" }]);
    expect(notes.map((n) => n.path)).toEqual(["b.md", "a.md"]);
  });

  it("does not treat a plain word as a date", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { month: "May" } }),
      note({ path: "b.md", frontmatter: { month: "April" } }),
    ];
    expect(pathsOf(notes, [{ field: "month", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("keeps a plain year beside an ISO date instead of fifty-six years away", () => {
    // A timestamp conversion compared 2026 — two seconds into 1970 — against
    // 2026-01-01. ISO text already sorts chronologically.
    const notes = [
      note({ path: "iso.md", frontmatter: { year: "2026-01-01" } }),
      note({ path: "num.md", frontmatter: { year: 2026 } }),
      note({ path: "later.md", frontmatter: { year: "2027-01-01" } }),
    ];
    expect(pathsOf(notes, [{ field: "year", direction: "asc" }])).toEqual([
      "num.md",
      "iso.md",
      "later.md",
    ]);
  });

  it("does not read a hex-looking value as a number", () => {
    // As text "0x10" collates before "5"; as a number it would be 16 and follow.
    const notes = [
      note({ path: "a.md", frontmatter: { id: "0x10" } }),
      note({ path: "b.md", frontmatter: { id: "5" } }),
    ];
    expect(pathsOf(notes, [{ field: "id", direction: "asc" }])).toEqual(["a.md", "b.md"]);
  });

  it("orders text by the locale it is given", () => {
    // The host default puts these the other way round, which is the point.
    const notes = [
      note({ path: "a.md", frontmatter: { t: "ıyı" } }),
      note({ path: "b.md", frontmatter: { t: "Iyi" } }),
    ];
    expect(sortNotes(notes, [{ field: "t", direction: "asc" }], "tr").map((n) => n.path)).toEqual([
      "a.md",
      "b.md",
    ]);
  });
});
