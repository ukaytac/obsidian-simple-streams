import { getAllTags, type App, type CachedMetadata, type TFile } from "obsidian";
import { normalizeTag, type NoteMeta } from "../engine/note";

export function toNoteMeta(file: TFile, cache: CachedMetadata | null): NoteMeta {
  const tags = cache === null ? [] : (getAllTags(cache) ?? []);
  return {
    path: file.path,
    basename: file.basename,
    tags: tags.map(normalizeTag),
    frontmatter: (cache?.frontmatter ?? {}) as Record<string, unknown>,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
  };
}

/** Every markdown note in the vault, as plain data. Both sources are already in memory. */
export function collectNotes(app: App): NoteMeta[] {
  return app.vault
    .getMarkdownFiles()
    .map((file) => toNoteMeta(file, app.metadataCache.getFileCache(file)));
}
