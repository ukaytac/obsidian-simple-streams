import { describe, expect, it } from "vitest";
import { resolveField, resolveNoteDate } from "../../src/engine/fields";
import { localDate, note } from "../fixtures/notes";

describe("resolveField", () => {
  it("reads a frontmatter key by name", () => {
    const n = note({ frontmatter: { rating: 5, status: "done" } });
    expect(resolveField(n, "rating")).toBe(5);
    expect(resolveField(n, "status")).toBe("done");
  });

  it("reads the reserved file properties", () => {
    const n = note({ path: "Journal/2026-09-04.md", ctime: 111, mtime: 222 });
    expect(resolveField(n, "file.path")).toBe("Journal/2026-09-04.md");
    expect(resolveField(n, "file.name")).toBe("2026-09-04");
    expect(resolveField(n, "file.ctime")).toBe(111);
    expect(resolveField(n, "file.mtime")).toBe(222);
  });

  it("never reads frontmatter through the reserved file. prefix", () => {
    const n = note({ frontmatter: { "file.name": "spoofed" } });
    expect(resolveField(n, "file.name")).toBe(n.basename);
    expect(resolveField(n, "file.bogus")).toBeUndefined();
  });

  it("returns undefined for a missing frontmatter key", () => {
    expect(resolveField(note(), "nope")).toBeUndefined();
  });

  it("does not let inherited object members pose as frontmatter", () => {
    // Otherwise `where: { toString: exists }` matches every note, and sorting
    // on one hands a function to the comparator.
    const n = note();
    for (const key of [
      "constructor",
      "toString",
      "hasOwnProperty",
      "valueOf",
      "isPrototypeOf",
      "__proto__",
    ]) {
      expect(resolveField(n, key), key).toBeUndefined();
    }
  });
});

describe("resolveNoteDate", () => {
  it("reads the named frontmatter date", () => {
    const n = note({ frontmatter: { date: "2026-09-04" } });
    expect(resolveNoteDate(n, "date")).toBe(localDate(2026, 9, 4));
  });

  it("falls back to ctime when the field is missing", () => {
    const n = note({ ctime: localDate(2026, 1, 15) });
    expect(resolveNoteDate(n, "date")).toBe(localDate(2026, 1, 15));
  });

  it("falls back to ctime when the field is not a date", () => {
    const n = note({ frontmatter: { date: "someday" }, ctime: localDate(2026, 1, 15) });
    expect(resolveNoteDate(n, "date")).toBe(localDate(2026, 1, 15));
  });

  it("reads file.ctime directly, which is the default date field", () => {
    const n = note({ ctime: localDate(2026, 3, 1) });
    expect(resolveNoteDate(n, "file.ctime")).toBe(localDate(2026, 3, 1));
  });
});
