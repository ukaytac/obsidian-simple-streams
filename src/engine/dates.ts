export type DateExpr =
  | { kind: "iso"; year: number; month: number; day: number }
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "offset"; amount: number; unit: "d" | "w" | "m" | "y" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET = /^([+-]?\d+)([dwmy])$/;

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
    const probe = new Date(year, month - 1, day);
    const real =
      probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
    if (!real) {
      throw new Error(`"${input}" is not a real date`);
    }
    return { kind: "iso", year, month, day };
  }

  const offset = OFFSET.exec(text);
  if (offset) {
    return { kind: "offset", amount: Number(offset[1]), unit: offset[2] as "d" | "w" | "m" | "y" };
  }

  throw new Error(
    `"${input}" is not a date. Use YYYY-MM-DD, today, yesterday, or an offset like -30d`,
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
          today.setMonth(today.getMonth() + expr.amount);
          break;
        case "y":
          today.setFullYear(today.getFullYear() + expr.amount);
          break;
      }
      return today;
  }
}
