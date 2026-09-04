export type DateExpr =
  | { kind: "iso"; year: number; month: number; day: number }
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "offset"; amount: number; unit: "d" | "w" | "m" | "y" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET = /^([+-]\d+)([dwmy])$/;
const UNSIGNED_OFFSET = /^\d+[dwmy]$/;
/** Past this, Date arithmetic overflows to NaN and a bound would silently vanish. */
const MAX_OFFSET = 100000;

export function parseDateExpr(input: string): DateExpr {
  const text = input.trim().toLowerCase();
  if (text === "today") {
    return { kind: "today" };
  }
  if (text === "yesterday") {
    return { kind: "yesterday" };
  }

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (localDateFrom(year, month, day) === null) {
      throw new Error(`"${input}" is not a real date`);
    }
    return { kind: "iso", year, month, day };
  }

  const offset = OFFSET.exec(text);
  if (offset) {
    const amount = Number(offset[1]);
    if (Math.abs(amount) > MAX_OFFSET) {
      throw new Error(`"${input}" is too large an offset. Keep it under ${MAX_OFFSET} units`);
    }
    return { kind: "offset", amount, unit: offset[2] as "d" | "w" | "m" | "y" };
  }

  // A bare "30d" is ambiguous, and guessing a direction turns a typo into an
  // empty stream with no explanation.
  if (UNSIGNED_OFFSET.test(text)) {
    throw new Error(`"${input}" needs a sign: -${text} for the past, +${text} for the future`);
  }

  throw new Error(
    `"${input}" is not a date. Use YYYY-MM-DD, today, yesterday, or a signed offset like -30d`,
  );
}

export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
}

export function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

export function resolveDateExpr(expr: DateExpr, now: Date, bound: "start" | "end"): number {
  const day = resolveToDay(expr, now);
  return bound === "start" ? startOfDay(day) : endOfDay(day);
}

function resolveToDay(expr: DateExpr, now: Date): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (expr.kind) {
    case "iso":
      return new Date(expr.year, expr.month - 1, expr.day);
    case "today":
      return today;
    case "yesterday":
      today.setDate(today.getDate() - 1);
      return today;
    case "offset":
      switch (expr.unit) {
        case "d":
          today.setDate(today.getDate() + expr.amount);
          break;
        case "w":
          today.setDate(today.getDate() + expr.amount * 7);
          break;
        case "m":
          addMonths(today, expr.amount);
          break;
        case "y":
          addMonths(today, expr.amount * 12);
          break;
      }
      return today;
  }
}

/**
 * Shift by whole months, clamping to the end of the target month, in place.
 * `setMonth` alone overflows: 31 March minus one month computes 31 February and
 * rolls forward to 3 March, and 31 May minus one month lands back on 1 May.
 */
function addMonths(date: Date, months: number): void {
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(Math.min(day, daysInMonth(date.getFullYear(), date.getMonth())));
}

/** Day 0 of the next month is the last day of this one. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Local midnight for a Y-M-D triple, or null when the triple is not a real
 * date. The round trip is the check: JavaScript rolls 2026-02-30 over into
 * 1 March rather than rejecting it, so comparing the components back out is
 * the only way to tell the difference. Both halves of this module rely on
 * this one definition of "a real date".
 */
function localDateFrom(year: number, month: number, day: number): Date | null {
  const probe = new Date(year, month - 1, day);
  const real =
    probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
  return real ? probe : null;
}

export type GroupMode = "day" | "month" | "year" | "none";

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Turn a declared date value into a timestamp. Permissive on purpose: this runs
 * on fields the query named as dates, so trying hard is the right behaviour.
 */
export function coerceDate(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly) {
    // Local midnight on purpose: new Date("2026-09-04") is UTC midnight, which
    // lands on the previous day for anyone west of UTC. An impossible triple is
    // unparseable rather than rolled over, so the caller falls back to
    // file.ctime instead of silently sorting the note as 1 March.
    const d = localDateFrom(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
    return d === null ? null : d.getTime();
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Is this value shaped like an ISO date? Used to keep Date.parse away from plain words. */
export function looksLikeDate(value: unknown): boolean {
  return typeof value === "string" && ISO_PREFIX.test(value.trim());
}

/**
 * Strict counterpart to coerceDate, for fields nobody declared to be dates —
 * sorting and `where` comparisons. Returns null unless the value really is one.
 */
export function dateValue(value: unknown): number | null {
  if (value instanceof Date) {
    return coerceDate(value);
  }
  return looksLikeDate(value) ? coerceDate(value) : null;
}

export function groupKey(ms: number, mode: GroupMode): string {
  if (mode === "none") {
    return "";
  }
  const d = new Date(ms);
  const year = String(d.getFullYear());
  if (mode === "year") {
    return year;
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  if (mode === "month") {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatGroupHeader(ms: number, mode: GroupMode, locale?: string): string {
  if (mode === "none") {
    return "";
  }
  const options: Intl.DateTimeFormatOptions =
    mode === "year"
      ? { year: "numeric" }
      : mode === "month"
        ? { year: "numeric", month: "long" }
        : { year: "numeric", month: "long", day: "numeric" };
  return new Intl.DateTimeFormat(locale, options).format(new Date(ms));
}
