import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";
import { assertScope } from "../../src/query/scopes";
import { QueryError } from "../../src/query/types";

describe("assertScope", () => {
  it("passes a query holding no reference at all", () => {
    const query = parseQuery("where:\n  status: done");
    expect(() => assertScope(query, "this")).not.toThrow();
    expect(() => assertScope(query, "active")).not.toThrow();
  });

  it("passes a reference of the allowed scope", () => {
    expect(() => assertScope(parseQuery("where:\n  P: this.P"), "this")).not.toThrow();
    expect(() => assertScope(parseQuery("where:\n  P: active.P"), "active")).not.toThrow();
  });

  it("rejects active. where only this. can be answered", () => {
    const query = parseQuery("where:\n  Project: active.Project");
    expect(() => assertScope(query, "this")).toThrow(QueryError);
    expect(() => assertScope(query, "this")).toThrow(
      /cannot use `active.Project` here.*only the Simple Streams sidebar follows.*Use `this.Project`/s,
    );
  });

  it("rejects this. where only active. can be answered", () => {
    const query = parseQuery("where:\n  Project: this.Project");
    expect(() => assertScope(query, "active")).toThrow(
      /cannot use `this.Project` here.*sidebar has no note holding it.*Use `active.Project`/s,
    );
  });

  it("names the offending field, not the property it points at", () => {
    const query = parseQuery("where:\n  Owner: active.file.name");
    expect(() => assertScope(query, "this")).toThrow(/`where.Owner`/);
  });

  it("reports the first offender when several are wrong", () => {
    const query = parseQuery("where:\n  A: active.A\n  B: active.B");
    expect(() => assertScope(query, "this")).toThrow(/`where.A`/);
  });

  it("echoes the link spelling the reader wrote", () => {
    const query = parseQuery('where:\n  Project: "[[active.Project]]"');
    expect(() => assertScope(query, "this")).toThrow(/\[\[active\.Project\]\]/);
  });

  it("reconstructs the spelling from the parsed condition, not the reader's literal text", () => {
    // The parser already lower-cases the scope keyword and closes up bracket
    // whitespace, so `Active.Project` and a spaced-out link both come back
    // normalized — proving `spell()` rebuilds from `condition.scope`, not from
    // whatever case or spacing the reader happened to type.
    const bare = parseQuery("where:\n  Project: Active.Project");
    expect(() => assertScope(bare, "this")).toThrow(/`active\.Project`/);

    const link = parseQuery('where:\n  Project: "[[ active.Project ]]"');
    expect(() => assertScope(link, "this")).toThrow(/\[\[active\.Project\]\]/);
  });
});
