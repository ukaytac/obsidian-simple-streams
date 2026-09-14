import { describe, expect, it } from "vitest";
import { resolveRefs } from "../../src/engine/refs";
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

  it("resolves a Date-valued host property to its local ISO string", () => {
    const host = note({ frontmatter: { Project: new Date(2026, 8, 13) } });
    expect(conditionOf(REF, host)).toEqual({ kind: "equals", value: "2026-09-13" });
  });

  it("resolves a Date inside a list the same way", () => {
    const host = note({ frontmatter: { Project: [new Date(2026, 8, 13), "Beta"] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["2026-09-13", "Beta"] });
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
      expect(resolved.query.where[0].condition).toEqual({
        kind: "ref",
        field: "Project",
        link: false,
      });
      expect(resolved.unresolved).toEqual(["Project"]);
    }
  });

  it("drops a blank member of a list, keeping the rest", () => {
    const host = note({ frontmatter: { Project: ["Alpha", "", "  ", "Beta"] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["Alpha", "Beta"] });
  });

  it("leaves every reference unresolved when there is no host note", () => {
    const resolved = resolveRefs(parseQuery(REF), null);
    expect(resolved.query.where[0].condition).toEqual({
      kind: "ref",
      field: "Project",
      link: false,
    });
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

const LINK_REF = 'where:\n  Project: "[[this.Project]]"';

describe("resolveRefs — a link reference", () => {
  it("wraps a plain host value", () => {
    const host = note({ frontmatter: { Project: "My Project" } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[My Project]]" });
  });

  it("unwraps before it wraps, so a host link yields one link", () => {
    const host = note({ frontmatter: { Project: "[[My Project]]" } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[My Project]]" });
  });

  it("drops an alias the host wrote", () => {
    const host = note({ frontmatter: { Project: "[[My Project|MP]]" } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[My Project]]" });
  });

  it("wraps every member of a list", () => {
    const host = note({ frontmatter: { Project: ["Alpha", "[[Beta]]"] } });
    expect(conditionOf(LINK_REF, host)).toEqual({
      kind: "anyOf",
      values: ["[[Alpha]]", "[[Beta]]"],
    });
  });

  it("wraps a date after converting it, so daily-note links work", () => {
    const host = note({ frontmatter: { Project: new Date(2026, 8, 14) } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[2026-09-14]]" });
  });

  it("wraps the host note's own name", () => {
    const host = note({ path: "Projects/Orbit.md" });
    expect(conditionOf('where:\n  Parent: "[[this.file.name]]"', host)).toEqual({
      kind: "equals",
      value: "[[Orbit]]",
    });
  });

  it("leaves a blank host property unresolved rather than wrapping nothing", () => {
    const host = note({ frontmatter: { Project: "   " } });
    expect(conditionOf(LINK_REF, host)).toEqual({
      kind: "ref",
      field: "Project",
      link: true,
    });
  });

  it("leaves an absent host property unresolved", () => {
    const host = note({ frontmatter: {} });
    expect(conditionOf(LINK_REF, host)).toEqual({
      kind: "ref",
      field: "Project",
      link: true,
    });
  });
});
