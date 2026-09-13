import { describe, expect, it } from "vitest";
import { resolveRefs } from "../../src/engine/context";
import { parseQuery } from "../../src/query/parse";
import { note } from "../fixtures/notes";

const REF = "where:\n  Project: this.Project";

function conditionOf(source: string, host: Parameters<typeof resolveRefs>[1]) {
  return resolveRefs(parseQuery(source), host).query.where[0].condition;
}

describe("resolveRefs", () => {
  it("reads a scalar as equality", () => {
    const host = note({ frontmatter: { Project: "Alpha" } });
    expect(conditionOf(REF, host)).toEqual({ kind: "equals", value: "Alpha" });
  });

  it("keeps a number and a boolean as themselves", () => {
    expect(conditionOf("where:\n  n: this.n", note({ frontmatter: { n: 5 } }))).toEqual({
      kind: "equals",
      value: 5,
    });
    expect(conditionOf("where:\n  b: this.b", note({ frontmatter: { b: false } }))).toEqual({
      kind: "equals",
      value: false,
    });
  });

  it("keeps 0 as a value to match, not an absence", () => {
    expect(conditionOf("where:\n  n: this.n", note({ frontmatter: { n: 0 } }))).toEqual({
      kind: "equals",
      value: 0,
    });
  });

  it("reads a list as any-of", () => {
    const host = note({ frontmatter: { Project: ["Alpha", "Beta"] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["Alpha", "Beta"] });
  });

  it("drops non-scalar members of a list", () => {
    const host = note({ frontmatter: { Project: ["Alpha", { nested: 1 }, null] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["Alpha"] });
  });

  it("resolves a file property", () => {
    const host = note({ path: "Projects/Alpha.md" });
    expect(conditionOf("where:\n  Parent: this.file.name", host)).toEqual({
      kind: "equals",
      value: "Alpha",
    });
  });

  it("leaves the reference unresolved when the host cannot answer it", () => {
    const cases = [
      note({ frontmatter: {} }),
      note({ frontmatter: { Project: null } }),
      note({ frontmatter: { Project: [] } }),
      note({ frontmatter: { Project: [{ nested: 1 }] } }),
      note({ frontmatter: { Project: { nested: 1 } } }),
      note({ frontmatter: { Project: "" } }),
      note({ frontmatter: { Project: "   " } }),
    ];
    for (const host of cases) {
      const resolved = resolveRefs(parseQuery(REF), host);
      expect(resolved.query.where[0].condition).toEqual({ kind: "ref", field: "Project" });
      expect(resolved.unresolved).toEqual(["Project"]);
    }
  });

  it("drops a blank member of a list, keeping the rest", () => {
    const host = note({ frontmatter: { Project: ["Alpha", "", "  ", "Beta"] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["Alpha", "Beta"] });
  });

  it("leaves every reference unresolved when there is no host note", () => {
    const resolved = resolveRefs(parseQuery(REF), null);
    expect(resolved.query.where[0].condition).toEqual({ kind: "ref", field: "Project" });
    expect(resolved.unresolved).toEqual(["Project"]);
  });

  it("names each unresolved field once", () => {
    const query = parseQuery("where:\n  a: this.Project\n  b: this.Project");
    expect(resolveRefs(query, note()).unresolved).toEqual(["Project"]);
  });

  it("leaves the other conditions alone", () => {
    const query = parseQuery("where:\n  status: done\n  Project: this.Project");
    const resolved = resolveRefs(query, note({ frontmatter: { Project: "Alpha" } }));
    expect(resolved.query.where).toEqual([
      { field: "status", condition: { kind: "equals", value: "done" } },
      { field: "Project", condition: { kind: "equals", value: "Alpha" } },
    ]);
  });

  it("returns a reference-free query untouched, allocating nothing", () => {
    const query = parseQuery("where:\n  status: done");
    const resolved = resolveRefs(query, note({ frontmatter: { Project: "Alpha" } }));
    expect(resolved.query).toBe(query);
    expect(resolved.unresolved).toEqual([]);
  });
});
