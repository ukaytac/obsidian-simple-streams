import { coerceDate } from "./dates";
import { resolveField, resolveNoteDate } from "./fields";
import { filterNotes } from "./filter";
import { groupNotes, type StreamGroup } from "./group";
import { sortNotes } from "./sort";
import type { NoteMeta } from "./note";
import type { StreamQuery } from "../query/types";

/**
 * Arrange the notes the way the view reads them: the declared sort keys first,
 * then — when grouping is on — a stable re-sort by the same date the grouping
 * reads, so each group arrives as one contiguous run.
 *
 * Two passes rather than one synthetic lead sort key, and that is the point. A
 * sort key can only name a field, and `sortNotes` resolves a named field with
 * no fallback, while `groupNotes` reads `resolveNoteDate`, which falls back to
 * `file.ctime`. So a lead key naming a field nothing resolves tied for every
 * note, the order fell through to the next declared key, and the days
 * fragmented again — five notes across two days came out as five headers,
 * while the notice claimed creation-time order when the order was by file name.
 * Sorting on the resolved value makes the two agree by construction.
 *
 * `Array.prototype.sort` is stable, so the declared order survives inside each
 * group. The date direction follows the declared sort when its first key is the
 * date field, and is newest-first otherwise.
 */
function arrange(notes: NoteMeta[], query: StreamQuery, locale?: string): NoteMeta[] {
  const ordered = sortNotes(notes, query.sort, locale);
  if (query.group === "none") {
    return ordered;
  }
  const [first] = query.sort;
  const ascending =
    first !== undefined && first.field === query.dateField && first.direction === "asc";
  const sign = ascending ? 1 : -1;
  return [...ordered].sort(
    (a, b) =>
      sign *
      Math.sign(resolveNoteDate(a, query.dateField) - resolveNoteDate(b, query.dateField)),
  );
}

/**
 * A fact the view has to tell the reader.
 *
 * A tagged list rather than a set of flags, because a flag has to be
 * remembered and this project has twice failed to: `truncated` was computed
 * and never rendered anywhere, and the date notice was rendered in a branch
 * that an empty result skipped — which was exactly the case it existed for.
 * With a union the view switches exhaustively, so a fourth notice fails to
 * compile until someone gives it words. These carry facts, never sentences:
 * the engine holds no user-facing English, and the view owns every word.
 *
 * - `dateFallback` — a declared `date-field` yielded a usable date for no note
 *   the query reached, the signature of a typo in the field name. Judged before
 *   the date range narrowed the result, since a typo sends every note onto the
 *   `file.ctime` fallback and the range can then empty the stream.
 * - `unresolvedSort` — declared sort fields that resolved for no matched note.
 *   A missing value sorts last, so such a key leaves every note tied and the
 *   order falls through to the `file.path` tie-break: `sort: file.ctim desc`
 *   quietly becomes alphabetical by path. Judged on matched rather than shown,
 *   because a field resolving only below the `limit` is not a typo. A declared
 *   sort on the `date-field` is left out, since `dateFallback` tells that story.
 * - `truncated` — the `limit` cut notes off, so a group header can show two of
 *   a day's five notes and otherwise read as a complete day.
 */
export type StreamNotice =
  | { kind: "dateFallback"; field: string }
  | { kind: "unresolvedSort"; fields: string[] }
  | { kind: "truncated"; shown: number; matched: number };

export interface StreamResult {
  groups: StreamGroup[];
  /** How many notes matched, before the limit. */
  matched: number;
  /** How many notes the groups actually hold. */
  shown: number;
  notices: StreamNotice[];
}

export function runStream(
  notes: NoteMeta[],
  query: StreamQuery,
  now: Date,
  locale?: string,
): StreamResult {
  const matched = filterNotes(notes, query, now);
  const shown = arrange(matched, query, locale).slice(0, query.limit);

  // The date-field check is judged against the notes the query reached *before*
  // its range narrowed them. A typo'd date-field puts every note on the ctime
  // fallback, the range then filters on creation time and can exclude them all,
  // and an empty result would suppress the very notice that explains the typo.
  const reached =
    query.from === null && query.to === null
      ? matched
      : filterNotes(notes, { ...query, from: null, to: null }, now);

  const notices: StreamNotice[] = [];

  if (
    query.dateField !== "file.ctime" &&
    reached.length > 0 &&
    reached.every((note) => coerceDate(resolveField(note, query.dateField)) === null)
  ) {
    notices.push({ kind: "dateFallback", field: query.dateField });
  }

  const unresolved =
    matched.length === 0
      ? []
      : query.sort
          .filter((spec) => spec.field !== query.dateField)
          .filter((spec) => matched.every((note) => resolveField(note, spec.field) === undefined))
          .map((spec) => spec.field);
  if (unresolved.length > 0) {
    notices.push({ kind: "unresolvedSort", fields: unresolved });
  }

  if (matched.length > shown.length) {
    notices.push({ kind: "truncated", shown: shown.length, matched: matched.length });
  }

  return {
    groups: groupNotes(shown, query, locale),
    matched: matched.length,
    shown: shown.length,
    notices,
  };
}
