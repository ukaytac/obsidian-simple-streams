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

  it("leaves identifiers, filenames and arithmetic alone", () => {
    // An unguarded underscore rule paired the two in `get_user_data` with each
    // other and merged three words into one.
    expect(extractPreview("Run the get_user_data function now.", "note", 200)).toBe(
      "Run the get_user_data function now.",
    );
    expect(extractPreview("See my_var and other_var here.", "note", 200)).toBe(
      "See my_var and other_var here.",
    );
    expect(extractPreview("A file named report_2026_final.md", "note", 200)).toBe(
      "A file named report_2026_final.md",
    );
    expect(extractPreview("2 * 3 * 4 = 24", "note", 200)).toBe("2 * 3 * 4 = 24");
  });

  it("still strips real emphasis", () => {
    expect(extractPreview("This is _italic_ and __bold__ and ***both***.", "note", 200)).toBe(
      "This is italic and bold and both.",
    );
  });

  it("drops a hidden comment, which the note asked not to show", () => {
    expect(extractPreview("Visible text %%a private aside%% more text.", "note", 200)).toBe(
      "Visible text more text.",
    );
    expect(extractPreview("Before %%hidden\nacross lines%% after.", "note", 200)).toBe(
      "Before after.",
    );
  });

  it("drops a callout's type marker but keeps its words", () => {
    expect(extractPreview("> [!note] Remember\n> body of callout", "note", 200)).toBe(
      "Remember body of callout",
    );
    expect(extractPreview("> [!warning]- Folded\n> hidden body", "note", 200)).toBe(
      "Folded hidden body",
    );
  });

  it("leaves HTML alone rather than risk a comparison", () => {
    // A naive `<[^>]*>` strip turns "2 < 3 and 4 > 5 is true" into "2  5 is true".
    expect(extractPreview("Some <b>bold</b> text.", "note", 200)).toBe("Some <b>bold</b> text.");
    expect(extractPreview("2 < 3 and 4 > 5 is true", "note", 200)).toBe("2 < 3 and 4 > 5 is true");
  });

  it("treats a dunder name the way a markdown renderer does", () => {
    // Markdown reads `__init__` as bold, so `display: full` shows `init` too.
    // Matching the renderer is the standard here, not preserving the source.
    expect(extractPreview("__init__ and __main__ are hooks.", "note", 200)).toBe(
      "init and main are hooks.",
    );
  });
});
