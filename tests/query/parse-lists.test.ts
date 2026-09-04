import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";
import { defaultQuery } from "../../src/query/types";

describe("parseQuery — empty and malformed input", () => {
  it("returns the defaults for an empty block", () => {
    expect(parseQuery("")).toEqual(defaultQuery());
    expect(parseQuery("   \n  ")).toEqual(defaultQuery());
  });

  it("rejects a block that is not a field map", () => {
    expect(() => parseQuery("- one\n- two")).toThrow(/field: value/);
    expect(() => parseQuery("just some text")).toThrow(/field: value/);
  });

  it("reports invalid YAML with a line number", () => {
    try {
      parseQuery("folder: Journal\ntags: [unclosed\n");
      throw new Error("expected parseQuery to throw");
    } catch (error) {
      expect((error as Error).name).toBe("QueryError");
      expect((error as { line?: number }).line).toBeGreaterThan(0);
    }
  });
});

describe("parseQuery — unknown fields", () => {
  it("rejects an unknown field and suggests the nearest one", () => {
    expect(() => parseQuery("tag: book")).toThrow(/Unknown field `tag`.*Did you mean `tags`/s);
  });

  it("lists the valid fields when nothing is close", () => {
    expect(() => parseQuery("qqqqqqqqqq: 1")).toThrow(/Valid fields: folder, tags/);
  });

  it("lists the valid fields even when it has a suggestion", () => {
    // A guess can be wrong; it must never be the only thing the reader gets.
    expect(() => parseQuery("tag: book")).toThrow(/Valid fields: folder, tags/);
  });
});

describe("parseQuery — folders", () => {
  it("accepts a single folder", () => {
    expect(parseQuery("folder: Journal").folder).toEqual(["journal"]);
  });

  it("accepts a list of folders", () => {
    expect(parseQuery("folder: [Journal, Notes/Books]").folder).toEqual(["journal", "notes/books"]);
  });

  it("trims surrounding slashes", () => {
    expect(parseQuery("folder: /Journal/").folder).toEqual(["journal"]);
  });

  it("parses exclude-folder", () => {
    expect(parseQuery("exclude-folder: [Archive]").excludeFolder).toEqual(["archive"]);
  });
});

describe("parseQuery — tags", () => {
  it("normalizes tags with and without a hash", () => {
    // The hash must be quoted; YAML would read a bare one as a comment.
    expect(parseQuery('tags: ["#Book", reading]').tags).toEqual(["book", "reading"]);
  });

  it("accepts a single tag as a scalar", () => {
    expect(parseQuery("tags: book").tags).toEqual(["book"]);
  });

  it("parses tags-any and exclude-tags", () => {
    const query = parseQuery("tags-any: [film, series]\nexclude-tags: draft");
    expect(query.tagsAny).toEqual(["film", "series"]);
    expect(query.excludeTags).toEqual(["draft"]);
  });

  it("rejects a list holding a map", () => {
    expect(() => parseQuery("tags:\n  - a: 1")).toThrow(/`tags` expects text/);
  });
});

describe("parseQuery — a bare hash is a YAML comment", () => {
  it("names the real cause when the hash breaks the parse", () => {
    expect(() => parseQuery("tags: [#book, reading]")).toThrow(/quote it/);
  });

  it("names the real cause when the hash silently empties the value", () => {
    // `tags: #book` parses as `tags: null`, so without this the message would
    // only say the field expects text.
    expect(() => parseQuery("tags: #book")).toThrow(/`tags` has no value.*quote it/s);
    expect(() => parseQuery("tags:\n  - #book")).toThrow(/`tags` has no value/);
  });

  it("accepts the quoted form", () => {
    expect(parseQuery('tags: "#book"').tags).toEqual(["book"]);
    expect(parseQuery('exclude-tags: ["#draft"]').excludeTags).toEqual(["draft"]);
  });
});
