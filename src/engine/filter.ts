import { resolveDateExpr } from "./dates";
import { resolveNoteDate } from "./fields";
import { normalizeTag } from "./note";
import type { NoteMeta } from "./note";
import type { StreamQuery, TitleMatcher } from "../query/types";

/**
 * Path prefix match that breaks on a slash, so "journal" never matches
 * "Journal2". Normalizes its own argument rather than trusting the caller: the
 * parser already lower-cases and trims slashes, but a StreamQuery built by hand
 * with `folder: ["Journal"]` would otherwise match nothing, in silence.
 */
export function inFolder(path: string, folder: string): boolean {
  const wanted = trimSlashes(folder);
  if (wanted === "") {
    return true;
  }
  // The path gets the same treatment. A NoteMeta path is vault-relative and so
  // has no leading slash, but this function is exported and normalizing only
  // one of its two arguments is the kind of asymmetry that bites later.
  const lower = trimSlashes(path);
  return lower === wanted || lower.startsWith(`${wanted}/`);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * A tag matches itself and its descendants: "project" matches
 * "project/streams". Normalizes its own argument, for the same reason.
 */
export function hasTag(tags: string[], wanted: string): boolean {
  const needle = normalizeTag(wanted);
  // Both sides again. A NoteMeta's tags arrive normalized from the adapter, but
  // nothing enforces that, and an unnormalized tag would drop its note out of
  // every tag query in silence — the same asymmetry inFolder had.
  return tags.some((tag) => {
    const held = normalizeTag(tag);
    return held === needle || held.startsWith(`${needle}/`);
  });
}

export function matchesTitle(note: NoteMeta, matcher: TitleMatcher | null): boolean {
  if (matcher === null) {
    return true;
  }
  if (matcher.kind === "regex") {
    // Compiled per note rather than hoisted, so TitleMatcher stays plain data.
    // Hoisting would also be wrong, not merely different: a `g`-flagged regex
    // carries `lastIndex` between calls, so one shared instance returns true
    // then false for the same string, and titles would match or not depending
    // on their position in the list. The timing says the same thing — 5000
    // notes cost 1.69ms this way against 0.24ms compiled once, which is
    // nothing beside the view's 300ms refresh debounce.
    return new RegExp(matcher.source, matcher.flags).test(note.basename);
  }
  return note.basename.toLowerCase().includes(matcher.value);
}

/**
 * Query terms are re-normalized per note rather than hoisted, matching the
 * choice made in matchesTitle and for the same measured reason: 5000 notes with
 * five folders, five tags and four exclusions cost 4.19ms this way against
 * 1.99ms hoisted — 2.5x, and 1.4% of the view's 300ms refresh debounce.
 */
export function filterNotes(notes: NoteMeta[], query: StreamQuery, now: Date): NoteMeta[] {
  const from = query.from === null ? null : resolveDateExpr(query.from, now, "start");
  const to = query.to === null ? null : resolveDateExpr(query.to, now, "end");

  return notes.filter((note) => {
    if (query.folder.length > 0 && !query.folder.some((folder) => inFolder(note.path, folder))) {
      return false;
    }
    if (query.excludeFolder.some((folder) => inFolder(note.path, folder))) {
      return false;
    }
    if (!query.tags.every((tag) => hasTag(note.tags, tag))) {
      return false;
    }
    if (query.tagsAny.length > 0 && !query.tagsAny.some((tag) => hasTag(note.tags, tag))) {
      return false;
    }
    if (query.excludeTags.some((tag) => hasTag(note.tags, tag))) {
      return false;
    }
    if (!matchesTitle(note, query.title)) {
      return false;
    }
    if (from !== null || to !== null) {
      const date = resolveNoteDate(note, query.dateField);
      if (from !== null && date < from) {
        return false;
      }
      if (to !== null && date > to) {
        return false;
      }
    }
    return true;
  });
}
