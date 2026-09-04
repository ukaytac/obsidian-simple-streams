import { describe, expect, it } from "vitest";
import { runStream } from "../../src/engine/run";
import { parseQuery } from "../../src/query/parse";
import type { NoteMeta } from "../../src/engine/note";

/**
 * The one budget test. Everything else in this suite asks whether the engine is
 * right; this asks whether it is fast enough to be usable, which no other test
 * can see because they all run on a handful of notes.
 *
 * It exists because a real regression hid here for the whole build: `sortNotes`
 * called `localeCompare` with an options object per comparison, which costs
 * 157ms for 5000 notes on the query below — synchronously, on every refresh, for
 * every open block. Two files nearby had each measured their own comparator
 * against the 300ms debounce and found it cheap; nobody measured the whole run.
 */
function vault(count: number): NoteMeta[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `Journal/${i}.md`,
    basename: String(i),
    tags: ["#daily"],
    // A string date, because that is what Obsidian hands over from frontmatter,
    // and a string is what routes the sort through text collation.
    frontmatter: { date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, "0")}` },
    ctime: 1_700_000_000_000 + i * 1000,
    mtime: 1_700_000_000_000 + i * 1000,
  }));
}

function fastest(runs: number, work: () => void): number {
  let best = Infinity;
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    work();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe("runStream at vault scale", () => {
  it("sorts and groups 5000 notes well inside the refresh debounce", () => {
    // The most ordinary query this plugin has, and the worst case for sorting:
    // a text date field, sorted, then grouped by day.
    const query = parseQuery("date-field: date\nsort: date desc\ngroup: day\nlimit: 5000\n");
    const notes = vault(5000);
    runStream(notes, query, new Date());

    // Measured at 22ms here, against 157ms before the collators were hoisted.
    // 100ms is deliberately loose enough for a slow or shared machine and still
    // tight enough to fail on that regression, which is the point of the number.
    const best = fastest(3, () => runStream(notes, query, new Date()));
    expect(best).toBeLessThan(100);
  });

  it("returns the whole vault, so the timing is not measuring an early exit", () => {
    const query = parseQuery("date-field: date\nsort: date desc\ngroup: day\nlimit: 5000\n");
    const result = runStream(vault(5000), query, new Date());
    expect(result.matched).toBe(5000);
    expect(result.shown).toBe(5000);
    expect(result.groups.reduce((total, group) => total + group.notes.length, 0)).toBe(5000);
  });
});
