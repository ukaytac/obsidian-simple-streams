import { describe, expect, it } from "vitest";
import { resolveRefs, type RefContext } from "../../src/engine/refs";
import { parseQuery } from "../../src/query/parse";
import { note } from "../fixtures/notes";
import type { NoteMeta } from "../../src/engine/note";

const REF = "where:\n  Project: this.Project";

function conditionOf(source: string, refs: RefContext) {
  return resolveRefs(parseQuery(source), refs).query.where[0].condition;
}

/** The common case: a host note, and nothing active. */
function host(meta: NoteMeta | null): RefContext {
  return { host: meta, active: null };
}

describe("resolveRefs", () => {
  it("reads a scalar as equality", () => {
    const hostNote = note({ frontmatter: { Project: "Alpha" } });
    expect(conditionOf(REF, host(hostNote))).toEqual({ kind: "equals", value: "Alpha" });
  });

  it("keeps a number and a boolean as themselves", () => {
    expect(
      conditionOf("where:\n  n: this.n", host(note({ frontmatter: { n: 5 } }))),
    ).toEqual({
      kind: "equals",
      value: 5,
    });
    expect(
      conditionOf("where:\n  b: this.b", host(note({ frontmatter: { b: false } }))),
    ).toEqual({
      kind: "equals",
      value: false,
    });
  });

  it("keeps 0 as a value to match, not an absence", () => {
    expect(
      conditionOf("where:\n  n: this.n", host(note({ frontmatter: { n: 0 } }))),
    ).toEqual({
      kind: "equals",
      value: 0,
    });
  });

  it("reads a list as any-of", () => {
    const hostNote = note({ frontmatter: { Project: ["Alpha", "Beta"] } });
    expect(conditionOf(REF, host(hostNote))).toEqual({ kind: "anyOf", values: ["Alpha", "Beta"] });
  });

  it("drops non-scalar members of a list", () => {
    const hostNote = note({ frontmatter: { Project: ["Alpha", { nested: 1 }, null] } });
    expect(conditionOf(REF, host(hostNote))).toEqual({ kind: "anyOf", values: ["Alpha"] });
  });

  it("resolves a Date-valued host property to its local ISO string", () => {
    const hostNote = note({ frontmatter: { Project: new Date(2026, 8, 13) } });
    expect(conditionOf(REF, host(hostNote))).toEqual({ kind: "equals", value: "2026-09-13" });
  });

  it("resolves a Date inside a list the same way", () => {
    const hostNote = note({ frontmatter: { Project: [new Date(2026, 8, 13), "Beta"] } });
    expect(conditionOf(REF, host(hostNote))).toEqual({
      kind: "anyOf",
      values: ["2026-09-13", "Beta"],
    });
  });

  it("resolves a file property", () => {
    const hostNote = note({ path: "Projects/Alpha.md" });
    expect(conditionOf("where:\n  Parent: this.file.name", host(hostNote))).toEqual({
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
    for (const hostNote of cases) {
      const resolved = resolveRefs(parseQuery(REF), host(hostNote));
      expect(resolved.query.where[0].condition).toEqual({
        kind: "ref",
        field: "Project",
        link: false,
        scope: "this",
      });
      expect(resolved.unresolved).toEqual([{ scope: "this", field: "Project" }]);
    }
  });

  it("drops a blank member of a list, keeping the rest", () => {
    const hostNote = note({ frontmatter: { Project: ["Alpha", "", "  ", "Beta"] } });
    expect(conditionOf(REF, host(hostNote))).toEqual({
      kind: "anyOf",
      values: ["Alpha", "Beta"],
    });
  });

  it("leaves every reference unresolved when there is no host note", () => {
    const resolved = resolveRefs(parseQuery(REF), host(null));
    expect(resolved.query.where[0].condition).toEqual({
      kind: "ref",
      field: "Project",
      link: false,
      scope: "this",
    });
    expect(resolved.unresolved).toEqual([{ scope: "this", field: "Project" }]);
  });

  it("names each unresolved field once", () => {
    const query = parseQuery("where:\n  a: this.Project\n  b: this.Project");
    expect(resolveRefs(query, host(note())).unresolved).toEqual([
      { scope: "this", field: "Project" },
    ]);
  });

  it("leaves the other conditions alone", () => {
    const query = parseQuery("where:\n  status: done\n  Project: this.Project");
    const resolved = resolveRefs(query, host(note({ frontmatter: { Project: "Alpha" } })));
    expect(resolved.query.where).toEqual([
      { field: "status", condition: { kind: "equals", value: "done" } },
      { field: "Project", condition: { kind: "equals", value: "Alpha" } },
    ]);
  });

  it("returns a reference-free query untouched, allocating nothing", () => {
    const query = parseQuery("where:\n  status: done");
    const resolved = resolveRefs(query, host(note({ frontmatter: { Project: "Alpha" } })));
    expect(resolved.query).toBe(query);
    expect(resolved.unresolved).toEqual([]);
  });
});

const LINK_REF = 'where:\n  Project: "[[this.Project]]"';

describe("resolveRefs — a link reference", () => {
  it("wraps a plain host value", () => {
    const hostNote = note({ frontmatter: { Project: "My Project" } });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "equals",
      value: "[[My Project]]",
    });
  });

  it("unwraps before it wraps, so a host link yields one link", () => {
    const hostNote = note({ frontmatter: { Project: "[[My Project]]" } });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "equals",
      value: "[[My Project]]",
    });
  });

  it("drops an alias the host wrote", () => {
    const hostNote = note({ frontmatter: { Project: "[[My Project|MP]]" } });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "equals",
      value: "[[My Project]]",
    });
  });

  it("wraps every member of a list", () => {
    const hostNote = note({ frontmatter: { Project: ["Alpha", "[[Beta]]"] } });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "anyOf",
      values: ["[[Alpha]]", "[[Beta]]"],
    });
  });

  it("wraps a date after converting it, so daily-note links work", () => {
    const hostNote = note({ frontmatter: { Project: new Date(2026, 8, 14) } });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "equals",
      value: "[[2026-09-14]]",
    });
  });

  it("wraps the host note's own name", () => {
    const hostNote = note({ path: "Projects/Orbit.md" });
    expect(conditionOf('where:\n  Parent: "[[this.file.name]]"', host(hostNote))).toEqual({
      kind: "equals",
      value: "[[Orbit]]",
    });
  });

  it("leaves a blank host property unresolved rather than wrapping nothing", () => {
    const hostNote = note({ frontmatter: { Project: "   " } });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "ref",
      field: "Project",
      link: true,
      scope: "this",
    });
  });

  it("leaves an absent host property unresolved", () => {
    const hostNote = note({ frontmatter: {} });
    expect(conditionOf(LINK_REF, host(hostNote))).toEqual({
      kind: "ref",
      field: "Project",
      link: true,
      scope: "this",
    });
  });
});

describe("resolveRefs — scopes", () => {
  const ACTIVE = "where:\n  Project: active.Project";

  it("answers an active reference from the active note", () => {
    const refs = {
      host: note({ frontmatter: { Project: "Host" } }),
      active: note({ frontmatter: { Project: "Active" } }),
    };
    expect(conditionOf(ACTIVE, refs)).toEqual({ kind: "equals", value: "Active" });
  });

  it("answers a this reference from the host note, in the same context", () => {
    const refs = {
      host: note({ frontmatter: { Project: "Host" } }),
      active: note({ frontmatter: { Project: "Active" } }),
    };
    expect(conditionOf("where:\n  Project: this.Project", refs)).toEqual({
      kind: "equals",
      value: "Host",
    });
  });

  it("leaves an active reference unresolved when no note is active", () => {
    const resolution = resolveRefs(parseQuery(ACTIVE), { host: note({}), active: null });
    expect(resolution.query.where[0].condition).toEqual({
      kind: "ref",
      field: "Project",
      link: false,
      scope: "active",
    });
    expect(resolution.unresolved).toHaveLength(1);
  });

  it("reads a list on the active note as any-of", () => {
    const refs = { host: null, active: note({ frontmatter: { Project: ["A", "B"] } }) };
    expect(conditionOf(ACTIVE, refs)).toEqual({ kind: "anyOf", values: ["A", "B"] });
  });

  it("wraps a link-spelled active reference", () => {
    const refs = { host: null, active: note({ frontmatter: { Project: "A" } }) };
    expect(conditionOf('where:\n  Project: "[[active.Project]]"', refs)).toEqual({
      kind: "equals",
      value: "[[A]]",
    });
  });

  it("does not dedup the same field name across two different scopes", () => {
    // The dedup key is `${scope}.${field}`, not the bare field — a `this.Project`
    // and an `active.Project` that both go unanswered name two different notes'
    // missing properties, and collapsing them into one entry would silently drop
    // half of what the reader needs fixed.
    const query = parseQuery("where:\n  a: this.Project\n  b: active.Project");
    const resolved = resolveRefs(query, { host: note({}), active: note({}) });
    expect(resolved.unresolved).toEqual([
      { scope: "this", field: "Project" },
      { scope: "active", field: "Project" },
    ]);
  });
});
