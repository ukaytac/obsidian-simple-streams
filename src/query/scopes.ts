import { QueryError, type RefScope, spell, type StreamQuery } from "./types";

/**
 * Refuse a query holding references the caller cannot answer.
 *
 * `parseQuery` is context-free on purpose: it does not know whether it is
 * reading a code block or the sidebar setting, and giving it that knowledge
 * would mean two parsers with one name. The gate lives here instead, called at
 * each use site right after parsing, so a reference reaching the engine is one
 * the caller has a note for.
 *
 * A code block must refuse `active.`: its results would otherwise depend on
 * which pane has focus, and two panes showing the same note would disagree
 * about what that note's stream contains. The sidebar must refuse `this.`:
 * there is no note holding it.
 *
 * Throws on the first offender rather than collecting them all. The message
 * carries a spelling to use instead, which is the same advice for every
 * clause, and a list of identical advice reads as noise.
 */
export function assertScope(query: StreamQuery, allowed: RefScope): void {
  for (const clause of query.where) {
    const { condition } = clause;
    if (condition.kind !== "ref" || condition.scope === allowed) {
      continue;
    }
    // Rebuilt from the parsed condition, not the reader's literal text — the
    // scope keyword comes back lower-cased and bracket whitespace closed up,
    // same as the parser already normalized it, while the field name, which
    // is case-sensitive and load-bearing, comes back untouched. Written and
    // wanted in the same shape either way, so the fix reads as a prefix swap
    // rather than a rule to apply.
    const written = spell(condition.scope, condition.field, condition.link);
    const wanted = spell(allowed, condition.field, condition.link);
    throw new QueryError(
      `\`where.${clause.field}\` cannot use \`${written}\` here. ${reason(condition.scope)} Use \`${wanted}\`.`,
    );
  }
}

function reason(rejected: RefScope): string {
  return rejected === "active"
    ? "`active.` names the note you are looking at, which only the Simple Streams sidebar follows."
    : "`this.` names the note holding a stream block, and the sidebar has no note holding it.";
}
