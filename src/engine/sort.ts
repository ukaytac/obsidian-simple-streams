import { resolveField } from "./fields";
import type { NoteMeta } from "./note";
import type { SortSpec } from "../query/types";

const DECIMAL = /^[+-]?\d+(\.\d+)?$/;

/**
 * `locale` is threaded rather than pinned, matching formatGroupHeader, so a
 * Turkish or Swedish user sorts their own notes in their own alphabet and a
 * test can still fix an order. Left undefined it follows the host.
 */
export function sortNotes(notes: NoteMeta[], sort: SortSpec[], locale?: string): NoteMeta[] {
  return [...notes].sort((a, b) => {
    for (const spec of sort) {
      const order = compareBySpec(a, b, spec, locale);
      if (order !== 0) {
        return order;
      }
    }
    // Stable tie-break, so equal rows keep their order across re-renders. It is
    // the hot path when nothing resolves the sort field, since then every pair
    // ties: measured at 2.0ms for 5000 notes and 4.2ms for 10000 against 0.7ms
    // and 1.4ms for a plain `<`. Three times slower, and 0.7% of the view's
    // 300ms refresh debounce.
    return a.path.localeCompare(b.path, locale);
  });
}

function compareBySpec(a: NoteMeta, b: NoteMeta, spec: SortSpec, locale?: string): number {
  const left = comparable(resolveField(a, spec.field));
  const right = comparable(resolveField(b, spec.field));

  // Missing values sort last regardless of direction: a note with no rating
  // should not lead a "rating desc" stream nor a "rating asc" one.
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  const order =
    typeof left === "number" && typeof right === "number"
      ? Math.sign(left - right)
      : String(left).localeCompare(String(right), locale, {
          numeric: true,
          sensitivity: "base",
        });

  return spec.direction === "desc" ? -order : order;
}

/**
 * Reduce a field value to a number or a string, or null when there is nothing
 * to sort on.
 *
 * An ISO date is deliberately left as text: ISO-8601 already sorts
 * chronologically under numeric collation, and converting it to a timestamp put
 * it on the same axis as ordinary numbers — a `year: 2026` field landed about
 * fifty-six years from a `year: "2026-01-01"` one, because 2026 as a timestamp
 * is two seconds into 1970. Only a decimal numeral becomes a number, so a
 * hex-looking `id: "0x10"` stays the text it looks like rather than becoming 16.
 */
function comparable(value: unknown): number | string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    // As an ISO day, so a Date and an ISO string sort together.
    return Number.isNaN(value.getTime()) ? null : isoDay(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? comparable(value[0]) : null;
  }

  const text = String(value).trim();
  if (text === "") {
    return null;
  }
  return DECIMAL.test(text) ? Number(text) : text.toLowerCase();
}

function isoDay(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
