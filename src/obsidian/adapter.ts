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

/**
 * The note holding a stream block, for `this.` references, or null when the
 * path names nothing. A code block processor is handed a `sourcePath` that can
 * be empty in contexts with no file behind them, and a note can be deleted
 * while its block is still on screen, so both are ordinary, not exceptional.
 */
export function hostNote(app: App, sourcePath: string): NoteMeta | null {
  if (sourcePath === "") {
    return null;
  }
  const file = app.vault.getFileByPath(sourcePath);
  return file === null ? null : toNoteMeta(file, app.metadataCache.getFileCache(file));
}
