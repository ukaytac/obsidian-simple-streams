export interface MockCachedMetadata {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{ tag: string }>;
}

export function getAllTags(cache: MockCachedMetadata): string[] | null {
  const tags: string[] = [];

  const fromFrontmatter = cache.frontmatter?.tags;
  if (typeof fromFrontmatter === "string") {
    tags.push(...fromFrontmatter.split(/[,\s]+/).filter((tag) => tag.length > 0));
  } else if (Array.isArray(fromFrontmatter)) {
    tags.push(...fromFrontmatter.map(String));
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
