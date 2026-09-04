const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const LEADING_HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;
const HEADING_MARKERS = /^#{1,6}[ \t]+/gm;

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
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

  const text = body.replace(HEADING_MARKERS, "").replace(/\s+/g, " ").trim();
  if (text.length <= length) {
    return text;
  }

  const cut = text.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  const onBoundary = lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${onBoundary.replace(/[\s,.;:!?-]+$/, "")}…`;
}
