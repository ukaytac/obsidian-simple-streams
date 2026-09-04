import { coerceDate } from "./dates";
import type { NoteMeta } from "./note";

export const FILE_FIELDS = ["file.ctime", "file.mtime", "file.name", "file.path"] as const;

/**
 * Resolve a field reference against a note. `file.` is a reserved prefix: an
 * unknown `file.something` is undefined rather than a frontmatter lookup, so a
 * note cannot shadow a built-in property.
 */
export function resolveField(note: NoteMeta, field: string): unknown {
  switch (field) {
    case "file.ctime":
      return note.ctime;
    case "file.mtime":
      return note.mtime;
    case "file.name":
      return note.basename;
    case "file.path":
      return note.path;
    default:
      return field.startsWith("file.") ? undefined : note.frontmatter[field];
  }
}

/** The note's date for range filtering and grouping, falling back to ctime. */
export function resolveNoteDate(note: NoteMeta, dateField: string): number {
  return coerceDate(resolveField(note, dateField)) ?? note.ctime;
}
