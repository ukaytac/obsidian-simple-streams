/** The inner group is optional so an empty block, `---\n---\n`, is recognised too. */
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---\r?\n?/;
const LEADING_HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
}

const SECTION_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
const SECTION_FENCE = /^[ \t]*(```+|~~~+)/;

/**
 * The text under the first heading named `heading`, or null when the note has
 * no such heading.
 *
 * Matching is exact on the trimmed, lower-cased heading text, close to what
 * `normalizeTag` does for tags. Vaults spell headings inconsistently;
 * they do not usually spell them approximately, so a substring rule would pull
 * `## Project Notes` into a stream asking for `Notes`. Heading level is not
 * part of the match, because someone asking for a section by name is not
 * thinking about its depth.
 *
 * The section ends at the next heading of the same or a shallower level, so its
 * own sub-headings stay inside it. The matched heading line itself is left out:
 * the query already names the section, and under `display: preview` repeating
 * it would spend the character budget on a word the reader supplied.
 *
 * A heading with nothing under it yields `""`, which is a different fact from
 * the `null` above even though `renderItem` treats both as "no body".
 */
export function sliceSection(content: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase();
  const lines = stripFrontmatter(content).split(/\r?\n/);

  let level = 0;
  /** -1 until the heading is found, then the index of the section's first line. */
  let start = -1;
  /** The fence marker currently open — "`" or "~" — or null outside a fence. */
  let fence: string | null = null;
  let fenceLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = SECTION_FENCE.exec(lines[index]);
    if (fenceMatch !== null) {
      // The marker is remembered rather than a boolean toggled, because a
      // `~~~` line inside a ``` block is code, not a closing fence, and a
      // toggle would end the block there and let the next `#` line split the
      // section. The run length is tracked alongside it because CommonMark
      // only closes a fence with one at least as long as it opened with — a
      // note about markdown that nests a ``` example inside a ```` fence
      // would otherwise have that inner fence read as the close, exposing
      // its own `#` lines as headings.
      const marker = fenceMatch[1][0];
      if (fence === null) {
        fence = marker;
        fenceLength = fenceMatch[1].length;
      } else if (fence === marker && fenceMatch[1].length >= fenceLength) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      continue;
    }

    const match = SECTION_HEADING.exec(lines[index]);
    if (match === null) {
      continue;
    }
    if (start === -1) {
      // A trailing ATX closing sequence (`## Objective ##`) is punctuation,
      // not part of the heading text; CommonMark requires whitespace before
      // it. The guard keeps that whitespace mandatory so a heading that
      // simply ends in a hash, like `## C#`, is not mistaken for one and
      // stripped down to `C`.
      if (match[2].replace(/[ \t]+#+[ \t]*$/, "").trim().toLowerCase() === wanted) {
        level = match[1].length;
        start = index + 1;
      }
      continue;
    }
    if (match[1].length <= level) {
      return lines.slice(start, index).join("\n").trim();
    }
  }

  return start === -1 ? null : lines.slice(start).join("\n").trim();
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
      // Line-leading markers: quotes, bullets, numbers, headings. The quote
      // marker repeats, because `> > [!warning] Inner` is a callout nested in
      // a quote: a single pass leaves a stray `>` that then reads as content,
      // and it also hides the inner `[!warning]` from the callout rule below.
      .replace(/^[ \t]*(?:>[ \t]?)+/gm, "")
      // A callout's `[!note]` is syntax; its title is words. After the quote
      // strip, because the marker sits behind the `>`.
      .replace(/^\[!\w+\][-+]?[ \t]*/gm, "")
      .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "")
      .replace(/^#{1,6}[ \t]+/gm, "")
      // A table's rule row says nothing; its pipes become spacing.
      .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, " ")
      // Pipes collapse only on a line shaped like a table row. A pipe is also
      // ordinary prose (`Either a | b works.`) and a shell pipe outlives the
      // inline-code strip above, so an unscoped rule silently ate the `|` out
      // of `grep foo | wc -l`.
      .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_match, inner: string) =>
        inner.replace(/[ \t]*\|[ \t]*/g, "  "),
      )
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
