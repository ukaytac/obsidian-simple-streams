/**
 * Obsidian reads `[[My Project]]`, `[[My Project#Goals]]` and
 * `[[My Project|MP]]` as one note. Frontmatter reaches this plugin as raw text
 * with the brackets in it, so without reducing a link to the note it names, one
 * relationship written two ways compares as two different values — and a stream
 * whose host note and candidates disagree about the spelling comes out empty,
 * in silence.
 */

/** A whole wikilink and nothing else: no bracket inside it, no text outside it. */
const WIKILINK = /^\[\[([^[\]]+)\]\]$/;

/**
 * A whole wikilink reduced to the note it names; any other text, trimmed,
 * as itself.
 *
 * An embed (`![[x]]`) and a bare heading link (`[[#Goals]]`) are deliberately
 * not links here. The first is a rendering instruction, not a value, and
 * treating it as one would make `![[x]]` and `[[x]]` match; the second names no
 * note, so there is nothing to reduce it to.
 *
 * Plain text is trimmed as well, so a caller can compare the results directly
 * rather than remembering to trim one of the two paths through here.
 */
export function unwrapLink(text: string): string {
  const trimmed = text.trim();
  const match = WIKILINK.exec(trimmed);
  if (match === null) {
    return trimmed;
  }
  // Alias before heading: Obsidian writes `[[target#heading|alias]]`, so
  // splitting on `|` first leaves `target#heading` for the `#` split. The
  // other order would leave the alias stuck to the target.
  const target = match[1].split("|")[0].split("#")[0].trim();
  return target === "" ? trimmed : target;
}

/**
 * The value as exactly one wikilink.
 *
 * Unwrapped before it is wrapped, so a host property already holding a link
 * yields `[[My Project]]` rather than `[[[[My Project]]]]`. That is the common
 * case, not the edge one: a vault that stores relationships as links stores
 * them that way on the host note too.
 *
 * Takes the scalars a property can hold, not just strings. `5` and `true` are
 * complete values, and a note may well be named `5`.
 */
export function asLink(value: string | number | boolean): string {
  return `[[${unwrapLink(String(value))}]]`;
}
