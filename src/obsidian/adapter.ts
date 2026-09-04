import { getAllTags, type App, type CachedMetadata, type TFile } from "obsidian";
import { normalizeTag, type NoteMeta } from "../engine/note";

export function toNoteMeta(file: TFile, cache: CachedMetadata | null): NoteMeta {
  // `frontmatter` below is Obsidian's own object, not a copy. NoteMeta types it
  // read-only for that reason; see the comment there.
  const tags = cache === null ? [] : (getAllTags(cache) ?? []);
  return {
    path: file.path,
    basename: file.basename,
    tags: tags.map(normalizeTag),
    // No cast: `FrontMatterCache` is an index signature of `any`, which a
    // `Record<string, unknown>` parameter accepts on its own.
    frontmatter: cache?.frontmatter ?? {},
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
