import { describe, expect, it } from "vitest";
import { extractPreview, stripFrontmatter } from "../../src/engine/preview";

describe("stripFrontmatter", () => {
  it("removes a leading frontmatter block", () => {
    expect(stripFrontmatter("---\ndate: 2026-09-04\n---\nBody text")).toBe("Body text");
  });

  it("handles CRLF line endings", () => {
    expect(stripFrontmatter("---\r\ndate: x\r\n---\r\nBody")).toBe("Body");
  });

  it("leaves a note without frontmatter alone", () => {
    expect(stripFrontmatter("# Title\n\nBody")).toBe("# Title\n\nBody");
  });

  it("does not remove a horizontal rule further down", () => {
    expect(stripFrontmatter("Body\n\n---\n\nMore")).toBe("Body\n\n---\n\nMore");
  });

  it("removes an empty frontmatter block", () => {
    expect(stripFrontmatter("---\n---\nBody")).toBe("Body");
  });
});

describe("extractPreview", () => {
  it("drops frontmatter and collapses whitespace", () => {
    const content = "---\ndate: 2026-09-04\n---\n\nFirst line.\n\nSecond   line.";
    expect(extractPreview(content, "2026-09-04", 200)).toBe("First line. Second line.");
  });

  it("drops a leading heading that repeats the file name", () => {
    expect(extractPreview("# Dune\n\nA desert planet.", "Dune", 200)).toBe("A desert planet.");
  });

  it("keeps a leading heading that says something else, without its markers", () => {
    expect(extractPreview("# Summary\n\nA desert planet.", "Dune", 200)).toBe(
      "Summary A desert planet.",
    );
  });

  it("returns short content untouched", () => {
    expect(extractPreview("Short.", "note", 200)).toBe("Short.");
  });

  it("cuts on a word boundary and adds an ellipsis", () => {
    const preview = extractPreview("alpha bravo charlie delta echo", "note", 20);
    expect(preview).toBe("alpha bravo charlie…");
  });

  it("cuts mid-word when there is no usable space", () => {
    const preview = extractPreview("abcdefghijklmnopqrstuvwxyz", "note", 10);
    expect(preview).toBe("abcdefghij…");
  });

  it("trims trailing punctuation before the ellipsis", () => {
    expect(extractPreview("alpha bravo, charlie", "note", 12)).toBe("alpha bravo…");
  });

  it("returns an empty string for an empty note", () => {
    expect(extractPreview("---\ndate: x\n---\n", "note", 200)).toBe("");
  });

  it("reads a real note as a sentence rather than as source", () => {
    const content = [
      "Read **two chapters** of [[Dune]] on the tram, see [notes](https://x.com).",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "> a blockquote line",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "![[cover.png]]",
      "",
      "Final *paragraph* with `inline code` and ~~struck~~ text.",
    ].join("\n");
    expect(extractPreview(content, "note", 400)).toBe(
      "Read two chapters of Dune on the tram, see notes. bullet one bullet two " +
        "a blockquote line a b 1 2 Final paragraph with inline code and struck text.",
    );
  });

  it("keeps a wiki link's alias rather than its target", () => {
    expect(extractPreview("See [[2026-09-04|yesterday]] for context.", "note", 200)).toBe(
      "See yesterday for context.",
    );
  });

  it("drops an embed entirely", () => {
    expect(extractPreview("![[cover.png]] Text after.", "note", 200)).toBe("Text after.");
  });
});
