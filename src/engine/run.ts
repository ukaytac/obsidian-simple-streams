import { coerceDate } from "./dates";
import { resolveField } from "./fields";
import { filterNotes } from "./filter";
import { groupNotes, type StreamGroup } from "./group";
import { sortNotes } from "./sort";
import type { NoteMeta } from "./note";
import type { SortSpec, StreamQuery } from "../query/types";

/**
 * Grouping only reads chronologically, so when it is on the resolved date leads
 * the sort and the declared keys order notes inside each group. Without this,
 * `group: day` with `sort: title asc` scatters the days and emits one header per
 * note — five notes across three days gave five headers, two dates repeating
 * non-adjacently. The direction follows the declared sort when its first key is
 * the date field, and is newest-first otherwise.
 */
function effectiveSort(query: StreamQuery): SortSpec[] {
  if (query.group === "none") {
    return query.sort;
  }
  const [first] = query.sort;
  const direction =
    first !== undefined && first.field === query.dateField ? first.direction : "desc";
  const within = query.sort.filter((spec) => spec.field !== query.dateField);
  return [{ field: query.dateField, direction }, ...within];
}

export interface StreamResult {
  groups: StreamGroup[];
  /** How many notes matched, before the limit. */
  matched: number;
  /** How many notes the groups actually hold. */
  shown: number;
  truncated: boolean;
  /**
   * True when a declared `date-field` yielded a usable date for no note on
   * screen — the signature of a typo in the field name, which would otherwise
   * order the whole stream by file creation time with nothing to say so.
   */
  dateFallback: boolean;
  /**
   * Sort fields that resolved for no note on screen. A missing value sorts
   * last, so a key nothing resolves leaves every note tied and the order falls
   * through to the `file.path` tie-break: `sort: file.ctim desc` quietly
   * becomes alphabetical by path, which looks like a working stream.
   */
  unresolvedSort: string[];
}

export function runStream(
  notes: NoteMeta[],
  query: StreamQuery,
  now: Date,
  locale?: string,
): StreamResult {
  const matched = filterNotes(notes, query, now);
  const shown = sortNotes(matched, effectiveSort(query), locale).slice(0, query.limit);

  // The date-field check is judged against the notes the query reached *before*
  // its range narrowed them. A typo'd date-field puts every note on the ctime
  // fallback, the range then filters on creation time and can exclude them all,
  // and an empty result would suppress the very notice that explains the typo.
  const reached =
    query.from === null && query.to === null
      ? matched
      : filterNotes(notes, { ...query, from: null, to: null }, now);

  return {
    groups: groupNotes(shown, query, locale),
    matched: matched.length,
    shown: shown.length,
    truncated: matched.length > shown.length,
    dateFallback:
      query.dateField !== "file.ctime" &&
      reached.length > 0 &&
      reached.every((note) => coerceDate(resolveField(note, query.dateField)) === null),
    unresolvedSort:
      shown.length === 0
        ? []
        : query.sort
            .filter((spec) =>
              shown.every((note) => resolveField(note, spec.field) === undefined),
            )
            .map((spec) => spec.field),
  };
}
