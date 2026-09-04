/** A note reduced to plain data. The engine never sees anything else. */
export interface NoteMeta {
  /** Vault-relative path, e.g. "Journal/2026-09-04.md" */
  path: string;
  /** File name without the extension, e.g. "2026-09-04" */
  basename: string;
  /** Normalized tags: no leading "#", lower case, e.g. ["project/streams"] */
  tags: string[];
  /**
   * Read-only because the adapter hands over a live reference into Obsidian's
   * own metadata cache rather than a copy. The engine only ever reads it, and
   * the type is what keeps that true — writing here would corrupt Obsidian's
   * cache, and copying every note's frontmatter on every render to avoid the
   * risk would cost more than the guarantee is worth.
   */
  frontmatter: Readonly<Record<string, unknown>>;
  /** Creation time, ms since epoch */
  ctime: number;
  /** Modification time, ms since epoch */
  mtime: number;
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").toLowerCase();
}
