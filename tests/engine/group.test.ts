import { describe, expect, it } from "vitest";
import { groupNotes } from "../../src/engine/group";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

describe("groupNotes", () => {
  it("returns a single headerless group when grouping is off", () => {
    const notes = [note({ path: "a.md" }), note({ path: "b.md" })];
    const groups = groupNotes(notes, parseQuery(""), "en-GB");
    expect(groups).toHaveLength(1);
    expect(groups[0].header).toBeNull();
    expect(groups[0].notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupNotes([], parseQuery("group: day"), "en-GB")).toEqual([]);
  });

  it("groups consecutive notes from the same day", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 9, 4) }),
      note({ path: "b.md", ctime: localDate(2026, 9, 4) }),
      note({ path: "c.md", ctime: localDate(2026, 9, 3) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: day"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual(["4 September 2026", "3 September 2026"]);
    expect(groups[0].notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("groups by month across a month boundary", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 9, 1) }),
      note({ path: "b.md", ctime: localDate(2026, 8, 31) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: month"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual(["September 2026", "August 2026"]);
  });

  it("groups by year across a year boundary", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2027, 1, 1) }),
      note({ path: "b.md", ctime: localDate(2026, 12, 31) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: year"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual(["2027", "2026"]);
  });

  it("uses the named date field", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { date: "2026-03-02" }, ctime: localDate(2020, 1, 1) }),
    ];
    const groups = groupNotes(notes, parseQuery("date-field: date\ngroup: day"), "en-GB");
    expect(groups[0].header).toBe("2 March 2026");
  });

  it("repeats a header when the order revisits a day", () => {
    // A property of this function, not something a reader sees: runStream
    // sorts by the resolved date when grouping is on, so runs stay contiguous.
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 9, 4) }),
      note({ path: "b.md", ctime: localDate(2026, 9, 3) }),
      note({ path: "c.md", ctime: localDate(2026, 9, 4) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: day"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual([
      "4 September 2026",
      "3 September 2026",
      "4 September 2026",
    ]);
  });
});
