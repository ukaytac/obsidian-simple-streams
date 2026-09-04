import { describe, expect, it } from "vitest";
import { endOfDay, parseDateExpr, resolveDateExpr, startOfDay } from "../../src/engine/dates";

const NOW = new Date(2026, 8, 4, 14, 30); // 4 September 2026, 14:30 local

describe("parseDateExpr", () => {
  it("parses an ISO date", () => {
    expect(parseDateExpr("2026-01-31")).toEqual({ kind: "iso", year: 2026, month: 1, day: 31 });
  });

  it("parses today and yesterday, case-insensitively", () => {
    expect(parseDateExpr("today")).toEqual({ kind: "today" });
    expect(parseDateExpr(" YESTERDAY ")).toEqual({ kind: "yesterday" });
  });

  it("parses relative offsets", () => {
    expect(parseDateExpr("-30d")).toEqual({ kind: "offset", amount: -30, unit: "d" });
    expect(parseDateExpr("-2w")).toEqual({ kind: "offset", amount: -2, unit: "w" });
    expect(parseDateExpr("+6m")).toEqual({ kind: "offset", amount: 6, unit: "m" });
    expect(parseDateExpr("1y")).toEqual({ kind: "offset", amount: 1, unit: "y" });
  });

  it("rejects a date that does not exist", () => {
    expect(() => parseDateExpr("2026-02-30")).toThrow(/not a real date/);
  });

  it("rejects text it does not understand", () => {
    expect(() => parseDateExpr("last tuesday")).toThrow(/YYYY-MM-DD/);
  });
});

describe("day boundaries", () => {
  it("snaps to the start of the local day", () => {
    expect(new Date(startOfDay(NOW)).getHours()).toBe(0);
    expect(new Date(startOfDay(NOW)).getDate()).toBe(4);
  });

  it("snaps to the last millisecond of the local day", () => {
    const end = new Date(endOfDay(NOW));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("resolveDateExpr", () => {
  it("resolves today to the current local day", () => {
    expect(resolveDateExpr({ kind: "today" }, NOW, "start")).toBe(new Date(2026, 8, 4).getTime());
  });

  it("resolves yesterday", () => {
    expect(resolveDateExpr({ kind: "yesterday" }, NOW, "start")).toBe(new Date(2026, 8, 3).getTime());
  });

  it("resolves a day offset across a month boundary", () => {
    expect(resolveDateExpr({ kind: "offset", amount: -30, unit: "d" }, NOW, "start"))
      .toBe(new Date(2026, 7, 5).getTime());
  });

  it("resolves a month offset", () => {
    expect(resolveDateExpr({ kind: "offset", amount: -6, unit: "m" }, NOW, "start"))
      .toBe(new Date(2026, 2, 4).getTime());
  });

  it("resolves an ISO date to the end of that day when asked for the end bound", () => {
    expect(resolveDateExpr({ kind: "iso", year: 2026, month: 1, day: 1 }, NOW, "end"))
      .toBe(new Date(2026, 0, 1, 23, 59, 59, 999).getTime());
  });
});
