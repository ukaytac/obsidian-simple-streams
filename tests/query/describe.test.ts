import { describe, expect, it } from "vitest";
import { describeQuery } from "../../src/query/describe";
import { parseQuery } from "../../src/query/parse";

function summaryOf(source: string) {
  return describeQuery(parseQuery(source));
}

describe("describeQuery", () => {
  it("describes the default query", () => {
    expect(summaryOf("")).toBe("whole vault · sorted by file.ctime desc · limit 50");
  });

  it("names folders and tags", () => {
    expect(summaryOf("folder: [Journal, Books]\ntags: [book, read]")).toContain(
      "folders journal, books",
    );
    expect(summaryOf("tags: [book, read]")).toContain("all tags book, read");
    expect(summaryOf("tags-any: [film, tv]")).toContain("any tag film, tv");
  });

  it("names exclusions", () => {
    const summary = summaryOf("exclude-folder: Archive\nexclude-tags: draft");
    expect(summary).toContain("not in archive");
    expect(summary).toContain("not tagged draft");
  });

  it("describes a title match", () => {
    expect(summaryOf("title: weekly")).toContain('title contains "weekly"');
    expect(summaryOf("title: /^20/")).toContain("title matches /^20/");
  });

  it("describes where conditions", () => {
    expect(summaryOf("where:\n  status: done")).toContain("status = done");
    expect(summaryOf("where:\n  type: [a, b]")).toContain("type is one of a, b");
    expect(summaryOf('where:\n  rating: ">3"')).toContain("rating > 3");
    expect(summaryOf("where:\n  due: exists")).toContain("due exists");
    expect(summaryOf("where:\n  due: missing")).toContain("due missing");
  });

  it("describes a date range", () => {
    expect(summaryOf("date-field: date\nfrom: 2026-01-01\nto: today")).toContain(
      "date from 2026-01-01 to today",
    );
    expect(summaryOf("from: -30d")).toContain("file.ctime from -30d onwards");
    expect(summaryOf("to: 2026-01-01")).toContain("file.ctime up to 2026-01-01");
  });

  it("describes grouping when it is on", () => {
    expect(summaryOf("group: month")).toContain("grouped by month");
    expect(summaryOf("")).not.toContain("grouped by");
  });
});
