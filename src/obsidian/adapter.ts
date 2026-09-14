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
 * The note at a path, as plain data, or null when the path names nothing.
 *
 * Used for both reference scopes: the note holding a block, and the note the
 * workspace is on. A code block processor is handed a `sourcePath` that can
 * be empty in contexts with no file behind them, and a note can be deleted
 * while its block is still on screen, so both are ordinary, not exceptional.
 * The empty-path check stays explicit rather than left to `getFileByPath`:
 * that method is a lookup against an internal path map that no file is ever
 * keyed by `""` in, but that is Obsidian's unspecified behavior to keep, not
 * this function's to depend on.
 */
export function noteAt(app: App, path: string): NoteMeta | null {
  if (path === "") {
    return null;
  }
  const file = app.vault.getFileByPath(path);
  return file === null ? null : toNoteMeta(file, app.metadataCache.getFileCache(file));
}
