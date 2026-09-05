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

    // A smoke test, not the guard. 22ms on this machine, 121ms on a GitHub
    // runner — 5x, which is what a shared two-core box costs — so 100ms failed
    // there on code that was never slow. A single wall-clock number cannot be
    // both loose enough for the slowest machine that runs it and tight enough
    // to fail on a regression on the fastest: 250ms clears a runner with room,
    // and the 157ms regression this file exists for would have passed it here.
    // So the number below only says "not catastrophically slow anywhere"; the
    // test after it is what actually catches the regression, on any machine.
    const best = fastest(3, () => runStream(notes, query, new Date()));
    expect(best).toBeLessThan(250);
  });

  /**
   * The regression was `localeCompare` with an options object per comparison,
   * which re-resolves a collator every call. That is countable, and counting it
   * is machine-independent: 5000 notes sort in ~60,000 comparisons, so the
   * difference between hoisted and not is 2 collators against tens of
   * thousands. No timing, no threshold to tune, no flake.
   */
  it("builds its collators once per sort, not once per comparison", () => {
    const RealCollator = Intl.Collator;
    const realLocaleCompare = String.prototype.localeCompare;
    let collators = 0;
    let localeCompares = 0;

    Object.defineProperty(Intl, "Collator", {
      configurable: true,
      writable: true,
      value: function CountingCollator(...args: ConstructorParameters<typeof Intl.Collator>) {
        collators += 1;
        return new RealCollator(...args);
      },
    });
    String.prototype.localeCompare = function (
      that: string,
      locales?: Intl.LocalesArgument,
      options?: Intl.CollatorOptions,
    ): number {
      localeCompares += 1;
      return realLocaleCompare.call(this, that, locales, options);
    };

    try {
      const query = parseQuery("date-field: date\nsort: date desc\ngroup: day\nlimit: 5000\n");
      runStream(vault(5000), query, new Date());
    } finally {
      Object.defineProperty(Intl, "Collator", {
        configurable: true,
        writable: true,
        value: RealCollator,
      });
      String.prototype.localeCompare = realLocaleCompare;
    }

    // Two today: one for values, one for the path tie-break.
    expect(collators).toBeLessThanOrEqual(4);
    // `localeCompare` is the call that cannot take the engine's fast path with
    // options. Sorting must not reach for it at all.
    expect(localeCompares).toBe(0);
  });

  it("returns the whole vault, so the timing is not measuring an early exit", () => {
    const query = parseQuery("date-field: date\nsort: date desc\ngroup: day\nlimit: 5000\n");
    const result = runStream(vault(5000), query, new Date());
    expect(result.matched).toBe(5000);
    expect(result.shown).toBe(5000);
    expect(result.groups.reduce((total, group) => total + group.notes.length, 0)).toBe(5000);
  });
});
