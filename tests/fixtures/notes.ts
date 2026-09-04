import type { NoteMeta } from "../../src/engine/note";

/**
 * Exists only to give notes that don't need a real path a distinct one.
 * Tests must not assert against a literal generated path such as "note-3.md" —
 * editing an earlier test in the same file would shift it.
 */
let counter = 0;

/** Local-time midnight, 1 January 2026 — the default timestamp for fixtures. */
export const DEFAULT_TIME = new Date(2026, 0, 1).getTime();

/**
 * `basename` is derived from `path` unless it is explicitly overridden.
 * Passing both with values that disagree lets the override win — there is
 * no consistency check between them.
 */
export function note(overrides: Partial<NoteMeta> = {}): NoteMeta {
  const path = overrides.path ?? `Notes/note-${++counter}.md`;
  const base: NoteMeta = {
    path,
    basename: path.split("/").pop()!.replace(/\.md$/, ""),
    tags: [],
    frontmatter: {},
    ctime: DEFAULT_TIME,
    mtime: DEFAULT_TIME,
  };
  return { ...base, ...overrides };
}

/**
 * Local-time midnight for a Y-M-D triple. Never use `new Date("...")` — that is UTC.
 * `month` is 1-based — January is 1 — unlike `Date`'s 0-based month argument.
 */
export function localDate(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}
