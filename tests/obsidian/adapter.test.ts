import { describe, expect, it } from "vitest";
import type { App, CachedMetadata, TFile } from "obsidian";
import { collectNotes, toNoteMeta } from "../../src/obsidian/adapter";

function file(path: string, ctime = 1_000, mtime = 2_000): TFile {
  return {
    path,
    basename: path.split("/").pop()!.replace(/\.md$/, ""),
    stat: { ctime, mtime, size: 0 },
  } as unknown as TFile;
}

function fakeApp(entries: Array<[TFile, CachedMetadata | null]>): App {
  return {
    vault: { getMarkdownFiles: () => entries.map(([f]) => f) },
    metadataCache: {
      getFileCache: (target: TFile) =>
        entries.find(([f]) => f.path === target.path)?.[1] ?? null,
    },
  } as unknown as App;
}

describe("toNoteMeta", () => {
  it("copies path, basename and timestamps", () => {
    const meta = toNoteMeta(file("Journal/2026-09-04.md", 111, 222), null);
    expect(meta.path).toBe("Journal/2026-09-04.md");
    expect(meta.basename).toBe("2026-09-04");
    expect(meta.ctime).toBe(111);
    expect(meta.mtime).toBe(222);
  });

  it("normalizes tags from frontmatter and inline tags together", () => {
    const cache = {
      frontmatter: { tags: ["Book"] },
      tags: [{ tag: "#Reading" }],
    } as unknown as CachedMetadata;
    expect(toNoteMeta(file("a.md"), cache).tags).toEqual(["book", "reading"]);
  });

  it("yields empty collections for a note with no cache", () => {
    const meta = toNoteMeta(file("a.md"), null);
    expect(meta.tags).toEqual([]);
    expect(meta.frontmatter).toEqual({});
  });

  it("keeps frontmatter as plain data", () => {
    const cache = { frontmatter: { rating: 5, status: "done" } } as unknown as CachedMetadata;
    expect(toNoteMeta(file("a.md"), cache).frontmatter).toEqual({ rating: 5, status: "done" });
  });
});

describe("collectNotes", () => {
  it("maps every markdown file in the vault", () => {
    const app = fakeApp([
      [file("a.md"), { frontmatter: { rating: 1 } } as unknown as CachedMetadata],
      [file("b.md"), null],
    ]);
    const notes = collectNotes(app);
    expect(notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
    expect(notes[0].frontmatter).toEqual({ rating: 1 });
  });

  it("returns an empty list for an empty vault", () => {
    expect(collectNotes(fakeApp([]))).toEqual([]);
  });
});
