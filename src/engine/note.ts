/** A note reduced to plain data. The engine never sees anything else. */
export interface NoteMeta {
  /** Vault-relative path, e.g. "Journal/2026-09-04.md" */
  path: string;
  /** File name without the extension, e.g. "2026-09-04" */
  basename: string;
  /** Normalized tags: no leading "#", lower case, e.g. ["project/streams"] */
  tags: string[];
  frontmatter: Record<string, unknown>;
  /** Creation time, ms since epoch */
  ctime: number;
  /** Modification time, ms since epoch */
  mtime: number;
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").toLowerCase();
}
