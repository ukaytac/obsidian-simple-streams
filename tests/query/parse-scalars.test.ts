import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";

describe("parseQuery — title", () => {
  it("treats plain text as a lower-cased substring match", () => {
    expect(parseQuery("title: 2026-").title).toEqual({ kind: "text", value: "2026-" });
    expect(parseQuery("title: Weekly").title).toEqual({ kind: "text", value: "weekly" });
  });

  it("treats slash-wrapped text as a regex", () => {
    expect(parseQuery("title: /^20\\d\\d-/").title).toEqual({
      kind: "regex",
      source: "^20\\d\\d-",
      flags: "",
    });
  });

  it("keeps regex flags", () => {
    expect(parseQuery("title: /weekly/i").title).toEqual({
      kind: "regex",
      source: "weekly",
      flags: "i",
    });
  });

  it("rejects an invalid regex", () => {
    expect(() => parseQuery("title: /([/")).toThrow(/`title` has an invalid regex/);
  });
});

describe("parseQuery — a missing value explains itself the same way everywhere", () => {
  it("gives the hash hint on single-value fields too, not just list fields", () => {
    // `tags: #x` already explained itself; `date-field: #x` used to say only
    // that the field expects text.
    expect(() => parseQuery("date-field: #x")).toThrow(/`date-field` has no value.*quote it/s);
    expect(() => parseQuery("title:")).toThrow(/`title` has no value/);
    expect(() => parseQuery("group: #x")).toThrow(/`group` has no value/);
  });

  it("suggests a form the field actually accepts", () => {
    // Bracketed advice on a single-value field would land the reader in a
    // second error: `date-field: ["#book"]` is the wrong shape.
    expect(() => parseQuery("date-field: #x")).toThrow(/as in date-field: "#book"/);
    expect(() => parseQuery('date-field: ["#book"]')).toThrow(/expects a single piece of text/);
    expect(parseQuery('date-field: "#book"').dateField).toBe("#book");
  });

  it("still rejects a structured value as the wrong shape", () => {
    expect(() => parseQuery("date-field:\n  a: 1")).toThrow(/expects a single piece of text/);
  });
});

describe("parseQuery — date-field, from and to", () => {
  it("reads the date field verbatim, preserving case", () => {
    expect(parseQuery("date-field: Created").dateField).toBe("Created");
  });

  it("stores from and to unresolved", () => {
    const query = parseQuery("from: 2026-01-01\nto: today");
    expect(query.from).toEqual({ kind: "iso", year: 2026, month: 1, day: 1 });
    expect(query.to).toEqual({ kind: "today" });
  });

  it("accepts a relative offset", () => {
    expect(parseQuery("from: -30d").from).toEqual({ kind: "offset", amount: -30, unit: "d" });
  });

  it("reports a bad date against the field that held it", () => {
    expect(() => parseQuery("from: last tuesday")).toThrow(/`from`:.*YYYY-MM-DD/s);
  });
});

describe("parseQuery — sort", () => {
  it("defaults to newest first by creation time", () => {
    expect(parseQuery("").sort).toEqual([{ field: "file.ctime", direction: "desc" }]);
  });

  it("parses a single sort key", () => {
    expect(parseQuery("sort: date desc").sort).toEqual([{ field: "date", direction: "desc" }]);
  });

  it("defaults the direction to ascending", () => {
    expect(parseQuery("sort: rating").sort).toEqual([{ field: "rating", direction: "asc" }]);
  });

  it("parses several sort keys in order", () => {
    expect(parseQuery("sort: [date desc, file.name asc]").sort).toEqual([
      { field: "date", direction: "desc" },
      { field: "file.name", direction: "asc" },
    ]);
  });

  it("rejects an unknown direction", () => {
    expect(() => parseQuery("sort: date sideways")).toThrow(/direction "sideways" is not valid/);
  });

  it("rejects an entry with too many words", () => {
    expect(() => parseQuery("sort: date desc extra")).toThrow(/"<field> <asc\|desc>"/);
  });

  it("rejects an empty sort", () => {
    expect(() => parseQuery("sort: []")).toThrow(/`sort` needs at least one field/);
  });
});

describe("parseQuery — group, display and numbers", () => {
  it("parses the grouping modes", () => {
    expect(parseQuery("group: day").group).toBe("day");
    expect(parseQuery("group: month").group).toBe("month");
    expect(parseQuery("group: year").group).toBe("year");
    expect(parseQuery("group: none").group).toBe("none");
  });

  it("rejects an unknown grouping and lists the choices", () => {
    expect(() => parseQuery("group: week")).toThrow(/`group`.*day, month, year, none/s);
  });

  it("parses the display modes", () => {
    expect(parseQuery("display: full").display).toBe("full");
    expect(parseQuery("display: title").display).toBe("title");
  });

  it("rejects an unknown display mode", () => {
    expect(() => parseQuery("display: everything")).toThrow(/`display`.*full, preview, title/s);
  });

  it("parses positive integers", () => {
    const query = parseQuery("limit: 10\npreview-length: 80");
    expect(query.limit).toBe(10);
    expect(query.previewLength).toBe(80);
  });

  it("rejects a non-positive or non-integer number", () => {
    expect(() => parseQuery("limit: 0")).toThrow(/`limit` expects a whole number above zero/);
    expect(() => parseQuery("limit: -5")).toThrow(/`limit` expects a whole number above zero/);
    expect(() => parseQuery("limit: 2.5")).toThrow(/`limit` expects a whole number above zero/);
    expect(() => parseQuery("limit: many")).toThrow(/`limit` expects a whole number above zero/);
  });
});
