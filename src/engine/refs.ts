import { isoDateString } from "./dates";
import { resolveField } from "./fields";
import { asLink } from "./links";
import type { NoteMeta } from "./note";
import type { RefScope, StreamQuery, WhereCondition } from "../query/types";

/**
 * The notes a query's references can be answered from. Both may be null: a
 * code block has no active note to offer, and a sidebar has no host note, and
 * `assertScope` has already refused any reference asking for the missing one.
 */
export interface RefContext {
  /** The note holding the block, for `this.`. */
  host: NoteMeta | null;
  /** The note the workspace is on, for `active.`. */
  active: NoteMeta | null;
}

/** A reference that went unanswered, and which note could not answer it. */
export interface UnresolvedRef {
  scope: RefScope;
  field: string;
}

export interface Resolution {
  /** The query with every answerable reference replaced by a value. */
  query: StreamQuery;
  /** Fields a reference named that its note could not answer, once each. */
  unresolved: UnresolvedRef[];
}

/**
 * Answer the query's references, each from the note a reference names.
 *
 * Pure, and run per refresh rather than per parse: a block is parsed once when
 * its note opens, so a reference resolved there would still be showing the old
 * project an hour after the property was edited.
 *
 * A reference the note cannot answer is left as it is rather than dropped. The
 * filter then matches nothing on it, which is the point — dropping it would
 * turn a template note with an unfilled property into a stream of the whole
 * vault, the loudest possible wrong answer.
 */
export function resolveRefs(query: StreamQuery, refs: RefContext): Resolution {
  // No copy for the common query. Every stream refreshes on every vault change,
  // and most hold no reference at all.
  if (!query.where.some((clause) => clause.condition.kind === "ref")) {
    return { query, unresolved: [] };
  }

  const unresolved: UnresolvedRef[] = [];
  const where = query.where.map((clause) => {
    if (clause.condition.kind !== "ref") {
      return clause;
    }
    const resolved = resolveCondition(clause.condition, refs);
    if (resolved === null) {
      unresolved.push({ scope: clause.condition.scope, field: clause.condition.field });
      return clause;
    }
    return { field: clause.field, condition: resolved };
  });

  // Deduplicated: two clauses may reference the same field, and the notice
  // reads as a list of what the note is missing, not of where it was asked for.
  const seen = new Set<string>();
  const distinct = unresolved.filter((entry) => {
    const key = `${entry.scope}.${entry.field}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return { query: { ...query, where }, unresolved: distinct };
}

/** The condition a reference yields, or null when it yields nothing usable. */
function resolveCondition(
  condition: Extract<WhereCondition, { kind: "ref" }>,
  refs: RefContext,
): WhereCondition | null {
  const note = condition.scope === "this" ? refs.host : refs.active;
  if (note === null) {
    return null;
  }
  // `resolveField`, not a bare frontmatter lookup, so `this.file.name` and the
  // other file properties resolve on exactly the terms every other field
  // reference in this plugin does.
  const raw = resolveField(note, condition.field);
  if (Array.isArray(raw)) {
    // A list is any-of, matching what writing the list out by hand means. A
    // nested list or map inside it has no scalar to compare against, so it is
    // dropped; a list of nothing but those leaves nothing to match on.
    const values = raw
      .map(dateAware)
      .filter(isUsable)
      .map((value) => wrap(value, condition.link));
    return values.length === 0 ? null : { kind: "anyOf", values };
  }
  const value = dateAware(raw);
  return isUsable(value) ? { kind: "equals", value: wrap(value, condition.link) } : null;
}

/**
 * A value written back in the spelling the reader asked for. `asLink` unwraps
 * before it wraps, so a property that already holds a link — on the host note
 * or the active one, whichever the reference's scope named — resolves to one
 * link rather than to `[[[[My Project]]]]` — the common case, since a vault
 * that stores relationships as links stores them that way on that note too.
 *
 * Runs after `isUsable`, never before: a blank or absent property is
 * unresolved, and wrapping first would turn it into `[[]]`, a condition that
 * matches nothing while claiming to have been answered.
 */
function wrap(value: string | number | boolean, link: boolean): string | number | boolean {
  return link ? asLink(value) : value;
}

/**
 * A Date-valued property — read off whichever note the reference's scope
 * named, host or active — converted to the `YYYY-MM-DD` text `isoDateString`
 * (`src/engine/dates.ts`) produces, before `isUsable` gets a look at it. Left
 * as a Date, `isUsable` would call it unresolved — a Date is none of its
 * string, number or boolean — and the reader would be told the note has no
 * usable value on a property that plainly holds one. That answer would also
 * be the odd one out: `parse.ts`'s `parseDateBound` already turns a `from`/`to`
 * Date into this same text, and `dates.ts`'s own `coerceDate`/`dateValue`
 * already read a Date back as a real date. Rejecting a Date only here would
 * make this file the one place in the plugin that calls a Date unusable.
 */
function dateAware(value: unknown): unknown {
  return value instanceof Date ? isoDateString(value) : value;
}

/**
 * Absent, null and nested structures all fail this, and all mean unresolved —
 * and so does a blank string. `parseCondition` in `src/query/parse.ts` already
 * refuses an empty *written* `where` value for the same reason: an unquoted
 * `>3` folds to `""` under YAML, and matching it literally turns a mistake
 * into a silent empty stream instead of an error. A property of `""` (or all
 * whitespace) on the note a reference's scope named — host or active — is the
 * same value reaching the same condition by a different door — `Project: ""`
 * in that note's frontmatter is far more likely to be a property nobody
 * filled in than one somebody meant to leave blank and match on — so it gets
 * the same answer: unresolved, not `equals`. `0` and `false` are left alone;
 * they are complete values, not stand-ins for "nothing here".
 */
function isUsable(value: unknown): value is string | number | boolean {
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  return typeof value === "number" || typeof value === "boolean";
}
