import { formatGroupHeader, groupKey } from "./dates";
import { resolveNoteDate } from "./fields";
import type { NoteMeta } from "./note";
import type { StreamQuery } from "../query/types";

export interface StreamGroup {
  key: string;
  /** null when grouping is off, so the view knows to render no header. */
  header: string | null;
  notes: NoteMeta[];
}

export function groupNotes(
  notes: NoteMeta[],
  query: StreamQuery,
  locale?: string,
): StreamGroup[] {
  if (notes.length === 0) {
    return [];
  }
  if (query.group === "none") {
    return [{ key: "", header: null, notes: [...notes] }];
  }

  const groups: StreamGroup[] = [];
  for (const note of notes) {
    const date = resolveNoteDate(note, query.dateField);
    const key = groupKey(date, query.group);
    const last = groups[groups.length - 1];
    // Only merge with the group directly above, so the headers always describe
    // the order actually on screen.
    if (last !== undefined && last.key === key) {
      last.notes.push(note);
      continue;
    }
    groups.push({ key, header: formatGroupHeader(date, query.group, locale), notes: [note] });
  }
  return groups;
}
