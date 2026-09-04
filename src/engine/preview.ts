/** The inner group is optional so an empty block, `---\n---\n`, is recognised too. */
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---\r?\n?/;
const LEADING_HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
}

/**
 * Turn markdown into the words it contains. Order matters: block constructs go
 * before inline ones, and embeds before links, since `![[x]]` also matches the
 * wiki-link pattern. Nothing here has to be perfect — an excerpt only needs to
 * read as prose, and anything missed degrades to a stray character rather than
 * to broken output.
 */
function stripMarkup(body: string): string {
  return (
    body
      // Fenced code is noise in an excerpt, not content.
      .replace(/^```[\s\S]*?^```[ \t]*$/gm, " ")
      .replace(/^~~~[\s\S]*?^~~~[ \t]*$/gm, " ")
      // Embeds carry nothing readable.
      .replace(/!\[\[[^\]]*\]\]/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      // A link keeps what the reader was meant to read.
      .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
      .replace(/\[\[([^\]]*)\]\]/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      // Line-leading markers: quotes, bullets, numbers, headings.
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "")
      .replace(/^#{1,6}[ \t]+/gm, "")
      // A table's rule row says nothing; its pipes become spacing.
      .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, " ")
      .replace(/[ \t]*\|[ \t]*/g, "  ")
      // Emphasis, longest marker first so `***x***` is not left with strays.
      .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(\*|_)(.+?)\1/g, "$2")
      .replace(/~~(.+?)~~/g, "$1")
  );
}

/**
 * A plain-text excerpt of a note's body, at most `length` characters plus an
 * ellipsis. Markdown markers are dropped rather than rendered — a truncated
 * markdown string cannot be rendered safely.
 */
export function extractPreview(content: string, basename: string, length: number): string {
  let body = stripFrontmatter(content).replace(/^\s+/, "");

  // A note whose first heading repeats its file name adds nothing to a stream
  // that already shows the title.
  const heading = LEADING_HEADING.exec(body);
  if (heading !== null && heading[1].trim().toLowerCase() === basename.trim().toLowerCase()) {
    body = body.slice(heading[0].length).replace(/^\s+/, "");
  }

  const text = stripMarkup(body).replace(/\s+/g, " ").trim();
  if (text.length <= length) {
    return text;
  }

  const cut = text.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  const onBoundary = lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${onBoundary.replace(/[\s,.;:!?-]+$/, "")}…`;
}
