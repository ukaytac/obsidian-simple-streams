import { describe, expect, it } from "vitest";
import { parseQuery } from "../src/query/parse";
import { assertScope } from "../src/query/scopes";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("DEFAULT_SETTINGS.sidebarQuery", () => {
  it("parses without throwing", () => {
    expect(() => parseQuery(DEFAULT_SETTINGS.sidebarQuery)).not.toThrow();
  });

  it("passes the sidebar's scope gate — every reference is active., not this.", () => {
    const query = parseQuery(DEFAULT_SETTINGS.sidebarQuery);
    expect(() => assertScope(query, "active")).not.toThrow();
  });

  it("matches notes sharing the active note's Project, newest first, as a preview", () => {
    const query = parseQuery(DEFAULT_SETTINGS.sidebarQuery);
    expect(query.where).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project", link: false, scope: "active" } },
    ]);
    expect(query.sort).toEqual([{ field: "file.mtime", direction: "desc" }]);
    expect(query.display).toBe("preview");
  });
});
