import { describe, expect, it } from "vitest";
import { coerceDate, dateValue, formatGroupHeader, groupKey, looksLikeDate } from "../../src/engine/dates";

describe("coerceDate", () => {
  it("reads a Date", () => {
    const d = new Date(2026, 8, 4);
    expect(coerceDate(d)).toBe(d.getTime());
  });

  it("passes a finite number through as a timestamp", () => {
    expect(coerceDate(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("reads a date-only string as LOCAL midnight, not UTC", () => {
    expect(coerceDate("2026-09-04")).toBe(new Date(2026, 8, 4).getTime());
  });

  it("reads a date-time string", () => {
    expect(coerceDate("2026-09-04T08:30")).toBe(new Date(2026, 8, 4, 8, 30).getTime());
  });

  it("returns null for values that are not dates", () => {
    expect(coerceDate("not a date")).toBeNull();
    expect(coerceDate(undefined)).toBeNull();
    expect(coerceDate(null)).toBeNull();
    expect(coerceDate({})).toBeNull();
    expect(coerceDate(Number.NaN)).toBeNull();
  });

  it("returns null for an ISO-shaped triple that is not a real date", () => {
    // Left unchecked, JavaScript rolls these over: 2026-02-30 becomes 1 March
    // and the note would sort and group as 1 March with nothing to explain it.
    expect(coerceDate("2026-02-30")).toBeNull();
    expect(coerceDate("2026-13-40")).toBeNull();
    expect(coerceDate("2026-99-99")).toBeNull();
    expect(dateValue("2026-13-40")).toBeNull();
  });
});

describe("looksLikeDate / dateValue", () => {
  it("only accepts ISO-shaped strings", () => {
    expect(looksLikeDate("2026-09-04")).toBe(true);
    expect(looksLikeDate("2026-09-04T08:00")).toBe(true);
    expect(looksLikeDate("May")).toBe(false);
    expect(looksLikeDate(20260904)).toBe(false);
  });

  it("refuses to date-ify a plain word even if Date.parse would", () => {
    expect(dateValue("May")).toBeNull();
    expect(dateValue("done")).toBeNull();
  });

  it("accepts Date objects and ISO strings", () => {
    expect(dateValue("2026-09-04")).toBe(new Date(2026, 8, 4).getTime());
    expect(dateValue(new Date(2026, 8, 4))).toBe(new Date(2026, 8, 4).getTime());
  });
});

describe("groupKey", () => {
  const ms = new Date(2026, 8, 4).getTime();

  it("keys by day, month and year", () => {
    expect(groupKey(ms, "day")).toBe("2026-09-04");
    expect(groupKey(ms, "month")).toBe("2026-09");
    expect(groupKey(ms, "year")).toBe("2026");
  });

  it("returns an empty key when grouping is off", () => {
    expect(groupKey(ms, "none")).toBe("");
  });

  it("separates a month boundary", () => {
    const aug31 = new Date(2026, 7, 31).getTime();
    const sep1 = new Date(2026, 8, 1).getTime();
    expect(groupKey(aug31, "month")).not.toBe(groupKey(sep1, "month"));
  });

  it("separates a year boundary", () => {
    const dec31 = new Date(2026, 11, 31).getTime();
    const jan1 = new Date(2027, 0, 1).getTime();
    expect(groupKey(dec31, "year")).not.toBe(groupKey(jan1, "year"));
    expect(groupKey(dec31, "month")).not.toBe(groupKey(jan1, "month"));
  });
});

describe("formatGroupHeader", () => {
  const ms = new Date(2026, 8, 4).getTime();

  it("formats a day, month and year header", () => {
    expect(formatGroupHeader(ms, "day", "en-GB")).toBe("4 September 2026");
    expect(formatGroupHeader(ms, "month", "en-GB")).toBe("September 2026");
    expect(formatGroupHeader(ms, "year", "en-GB")).toBe("2026");
  });

  it("returns an empty header when grouping is off", () => {
    expect(formatGroupHeader(ms, "none", "en-GB")).toBe("");
  });
});
