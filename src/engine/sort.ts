import { dateValue } from "./dates";
import { resolveField } from "./fields";
import type { NoteMeta } from "./note";
import type { SortSpec } from "../query/types";

export function sortNotes(notes: NoteMeta[], sort: SortSpec[]): NoteMeta[] {
  return [...notes].sort((a, b) => {
    for (const spec of sort) {
      const order = compareBySpec(a, b, spec);
      if (order !== 0) {
        return order;
      }
    }
    // Stable tie-break, so equal rows keep their order across re-renders.
    return a.path.localeCompare(b.path);
  });
}

function compareBySpec(a: NoteMeta, b: NoteMeta, spec: SortSpec): number {
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
      : String(left).localeCompare(String(right), undefined, {
          numeric: true,
          sensitivity: "base",
        });

  return spec.direction === "desc" ? -order : order;
}

/** Reduce a field value to a number or a string, or null when there is nothing to sort on. */
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
    return dateValue(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? comparable(value[0]) : null;
  }

  const text = String(value).trim();
  if (text === "") {
    return null;
  }
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }
  const asDate = dateValue(text);
  if (asDate !== null) {
    return asDate;
  }
  return text.toLowerCase();
}
