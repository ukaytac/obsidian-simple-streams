/** The inner group is optional so an empty block, `---\n---\n`, is recognised too. */
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---\r?\n?/;
const LEADING_HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
}

/**
 * Turn markdown into the words it contains. Order matters: block constructs go
 * before inline ones, and embeds before links, since `![[x]]` also matches the
 * wiki-link pattern. An excerpt only needs to read as prose, so a construct
 * missed here costs a stray character.
 *
 * Deliberately absent: raw HTML. Stripping `<[^>]*>` looks obvious and is the
 * same mistake the unguarded underscore rule was — measured, it turns
 * `2 < 3 and 4 > 5 is true` into `2  5 is true`. A literal `<b>` in an excerpt
 * is ugly; a mangled sentence is worse, and HTML in a journal note is rare.
 * Footnote markers like `[^1]` are left for the same reason at smaller stakes.
 */
function stripMarkup(body: string): string {
  return (
    body
      // Fenced code is noise in an excerpt, not content.
      .replace(/^```[\s\S]*?^```[ \t]*$/gm, " ")
      .replace(/^~~~[\s\S]*?^~~~[ \t]*$/gm, " ")
      // A %% comment %% is content the note asked not to show. Showing it in
      // the stream would contradict the note itself.
      .replace(/%%[\s\S]*?%%/g, " ")
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
      // A callout's `[!note]` is syntax; its title is words. After the quote
      // strip, because the marker sits behind the `>`.
      .replace(/^\[!\w+\][-+]?[ \t]*/gm, "")
      .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "")
      .replace(/^#{1,6}[ \t]+/gm, "")
      // A table's rule row says nothing; its pipes become spacing.
      .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, " ")
      .replace(/[ \t]*\|[ \t]*/g, "  ")
      // Emphasis, longest marker first so `***x***` leaves no strays. An
      // underscore only counts at a word boundary, which is what CommonMark
      // says and what keeps `get_user_data` from becoming `getuserdata` — an
      // unguarded rule paired the two underscores with each other and merged
      // three words into one. No delimiter may be followed by a space either,
      // so `2 * 3 * 4` stays arithmetic instead of losing its asterisks.
      // `__init__` does still become `init`, and that is right rather than a
      // gap: markdown reads it as bold, so `display: full` shows `init` too.
      .replace(/(^|[^\w])___([^\s_][^_]*?)___(?=[^\w]|$)/g, "$1$2")
      .replace(/(^|[^\w])__([^\s_][^_]*?)__(?=[^\w]|$)/g, "$1$2")
      .replace(/(^|[^\w])_([^\s_][^_]*?)_(?=[^\w]|$)/g, "$1$2")
      .replace(/\*\*\*([^\s*][^*]*?)\*\*\*/g, "$1")
      .replace(/\*\*([^\s*][^*]*?)\*\*/g, "$1")
      .replace(/\*([^\s*][^*]*?)\*/g, "$1")
      .replace(/~~([^\s~][^~]*?)~~/g, "$1")
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
