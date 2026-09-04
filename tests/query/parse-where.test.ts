import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";
import { QUERY_FIELDS } from "../../src/query/types";

function whereOf(source: string) {
  return parseQuery(source).where;
}

describe("parseQuery — where", () => {
  it("reads a scalar as equality", () => {
    expect(whereOf("where:\n  status: done")).toEqual([
      { field: "status", condition: { kind: "equals", value: "done" } },
    ]);
  });

  it("keeps numbers and booleans as themselves", () => {
    expect(whereOf("where:\n  rating: 5\n  published: true")).toEqual([
      { field: "rating", condition: { kind: "equals", value: 5 } },
      { field: "published", condition: { kind: "equals", value: true } },
    ]);
  });

  it("reads a list as any-of", () => {
    expect(whereOf("where:\n  type: [article, book]")).toEqual([
      { field: "type", condition: { kind: "anyOf", values: ["article", "book"] } },
    ]);
  });

  it("reads exists and missing, case-insensitively", () => {
    expect(whereOf("where:\n  finished: exists\n  blocked: MISSING")).toEqual([
      { field: "finished", condition: { kind: "exists" } },
      { field: "blocked", condition: { kind: "missing" } },
    ]);
  });

  it("reads every comparison operator", () => {
    expect(whereOf('where:\n  a: ">3"\n  b: ">=3"\n  c: "<3"\n  d: "<=3"\n  e: "!=done"')).toEqual([
      { field: "a", condition: { kind: "compare", op: ">", operand: "3" } },
      { field: "b", condition: { kind: "compare", op: ">=", operand: "3" } },
      { field: "c", condition: { kind: "compare", op: "<", operand: "3" } },
      { field: "d", condition: { kind: "compare", op: "<=", operand: "3" } },
      { field: "e", condition: { kind: "compare", op: "!=", operand: "done" } },
    ]);
  });

  it("tolerates space after the operator", () => {
    expect(whereOf('where:\n  rating: "> 3"')).toEqual([
      { field: "rating", condition: { kind: "compare", op: ">", operand: "3" } },
    ]);
  });

  it("preserves the field name's case", () => {
    expect(whereOf("where:\n  Status: Done")).toEqual([
      { field: "Status", condition: { kind: "equals", value: "Done" } },
    ]);
  });

  it("rejects a where that is not a map", () => {
    expect(() => parseQuery("where: done")).toThrow(/`where` expects a map/);
    expect(() => parseQuery("where: [a, b]")).toThrow(/`where` expects a map/);
  });

  it("rejects a nested map as a condition", () => {
    expect(() => parseQuery("where:\n  status:\n    nested: 1")).toThrow(
      /`where.status` expects text, a number, a boolean, or a list/,
    );
  });

  it("rejects an operator with nothing to compare against", () => {
    // `">="` used to backtrack into `>` and compare against the string "=",
    // and `"> "` compared against nothing. Both silently matched the wrong notes.
    for (const value of ['">="', '"<="', '">"', '"!="', '"> "', '">   "']) {
      expect(() => parseQuery(`where:\n  rating: ${value}`), value).toThrow(
        /with nothing to compare against/,
      );
    }
  });
});

/** A smallest valid value for each field, to prove the field is wired up. */
const MINIMAL: Record<(typeof QUERY_FIELDS)[number], string> = {
  folder: "Journal",
  tags: "book",
  "tags-any": "book",
  "exclude-folder": "Archive",
  "exclude-tags": "draft",
  title: "weekly",
  where: "\n  status: done",
  "date-field": "date",
  from: "2026-01-01",
  to: "today",
  sort: "date desc",
  group: "day",
  display: "full",
  "preview-length": "80",
  limit: "10",
};

describe("parseQuery — every advertised field is wired up", () => {
  it("accepts each field in QUERY_FIELDS", () => {
    for (const field of QUERY_FIELDS) {
      expect(() => parseQuery(`${field}: ${MINIMAL[field]}`), field).not.toThrow();
    }
  });
});
