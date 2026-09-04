import type { NoteMeta } from "../../src/engine/note";

let counter = 0;

/** Local-time midnight, 1 January 2026 — the default timestamp for fixtures. */
export const DEFAULT_TIME = new Date(2026, 0, 1).getTime();

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

/** Local-time midnight for a Y-M-D triple. Never use `new Date("...")` — that is UTC. */
export function localDate(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}
