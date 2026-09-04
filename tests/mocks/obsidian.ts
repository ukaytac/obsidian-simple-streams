export interface MockCachedMetadata {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{ tag: string }>;
}

/**
 * Enough of Obsidian's `getAllTags` for the adapter's tests: frontmatter tags
 * plus inline tags, each hash-prefixed, or `null` when a note has none.
 *
 * Fidelity caveat: this reads only the plural `tags` key. Obsidian's own
 * `parseFrontMatterTags` also accepts a singular `tag`, so a note using that
 * key looks untagged here and tagged in a real vault. Task 23's manual pass
 * over a live vault is what covers the difference; nothing in the engine
 * branches on which key was used.
 */
export function getAllTags(cache: MockCachedMetadata): string[] | null {
  const tags: string[] = [];

  const fromFrontmatter = cache.frontmatter?.tags;
  if (typeof fromFrontmatter === "string") {
    tags.push(...fromFrontmatter.split(/[,\s]+/).filter((tag) => tag.length > 0));
  } else if (Array.isArray(fromFrontmatter)) {
    // Strings only. `String()` coerces a nested `["book", "read"]` into the
    // single tag `"book,read"` and `null` into `"null"`, inventing tags the
    // real `getAllTags` would never report from the same frontmatter.
    tags.push(...fromFrontmatter.filter((tag): tag is string => typeof tag === "string"));
  }

  for (const inline of cache.tags ?? []) {
    tags.push(inline.tag);
  }

  if (tags.length === 0) {
    return null;
  }
  return tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

/** Placeholders so a test that touches the view layer does not crash on import. */
export class Component {}
export class MarkdownRenderChild extends Component {}
export class Plugin extends Component {}
