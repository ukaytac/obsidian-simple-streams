# `this.` references Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `where` value name a property of the note holding the stream block — `Project: this.Project` — so one block dropped into a template gives every project, client or person note its own running history.

**Architecture:** The parser marks a `this.X` value as a new `{ kind: "ref"; field }` condition. A pure `resolveRefs(query, host)` in `src/engine/context.ts` turns those into `equals`/`anyOf` against the host note, or reports them unresolved. `runStream` calls it first, works from the resolved query, and emits a notice for anything unresolved. `StreamChild` supplies the host note via a new `hostNote` adapter helper. Resolution cannot live at parse time: a block is parsed once in the constructor, so the value would freeze at what the host note held when the note was opened.

**Tech Stack:** TypeScript, Obsidian plugin API, vitest (+ jsdom for the view layer), `yaml`.

**Spec:** `docs/superpowers/specs/2026-09-13-this-references-design.md`

**Conventions in this repo, worth knowing before you start:**
- Tests are vitest. Run one file with `npx vitest run <path>`, one case with `npx vitest run <path> -t "<name>"`, everything with `npm test`.
- `npm run build` runs `tsc --noEmit` first. Every task below must leave both `npm test` and `npm run build` green — that is why the type and its exhaustive consumers land together in Task 1.
- Comments in this codebase explain *why*, especially why an alternative was rejected. The comments given below are part of the deliverable; copy them.
- Commit messages: conventional prefix, lower-case subject, and end with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 1: The `ref` condition and its two exhaustive consumers

`WhereCondition` is a tagged union consumed by two `switch`es with no `default` — `matchesClause` in the filter and `describeCondition` in the summary. Adding a member breaks both until they handle it, so the type and both handlers land in one commit.

**Files:**
- Modify: `src/query/types.ts` (the `WhereCondition` union)
- Modify: `src/engine/filter.ts` (`matchesClause`'s switch)
- Modify: `src/query/describe.ts` (`describeCondition`'s switch)
- Test: `tests/engine/filter-where.test.ts`, `tests/query/describe.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/filter-where.test.ts` (its existing `condition()` helper parses a source string; a ref cannot be parsed yet, so build the clause literally):

```ts
describe("matchesClause — an unresolved reference", () => {
  it("matches no note, whatever the note holds", () => {
    const clause: WhereClause = { field: "Project", condition: { kind: "ref", field: "Project" } };
    expect(matchesClause(note({ frontmatter: { Project: "Alpha" } }), clause)).toBe(false);
    expect(matchesClause(note({ frontmatter: {} }), clause)).toBe(false);
  });
});
```

Add the type to that file's imports — `tsconfig.json` includes `tests/**/*.ts`, so
`npm run build` type-checks these files too:

```ts
import type { WhereClause } from "../../src/query/types";
```

Append to `tests/query/describe.test.ts`:

```ts
describe("describeQuery — an unresolved reference", () => {
  it("names the reference and says the host note does not carry it", () => {
    const query = {
      ...defaultQuery(),
      where: [{ field: "Project", condition: { kind: "ref" as const, field: "Project" } }],
    };
    expect(describeQuery(query)).toContain("Project = this.Project (not set here)");
  });
});
```

Add `defaultQuery` to that file's imports:

```ts
import { defaultQuery } from "../../src/query/types";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/filter-where.test.ts tests/query/describe.test.ts`
Expected: FAIL — the filter case returns `undefined` (received `undefined`, expected `false`) and the summary omits the text.

- [ ] **Step 3: Add the union member**

In `src/query/types.ts`, extend `WhereCondition`:

```ts
export type WhereCondition =
  | { kind: "equals"; value: string | number | boolean }
  | { kind: "anyOf"; values: Array<string | number | boolean> }
  | { kind: "exists" }
  | { kind: "missing" }
  | { kind: "compare"; op: CompareOp; operand: string }
  /** A `this.X` value, until `resolveRefs` answers it from the host note. */
  | { kind: "ref"; field: string };
```

- [ ] **Step 4: Handle it in the filter**

In `src/engine/filter.ts`, add the last case of `matchesClause`'s switch, after `case "compare"`:

```ts
    case "ref":
      // A reference the host note could not answer. Matching nothing is the
      // decision, not an oversight: dropping the condition instead would turn
      // a template note whose property is not filled in yet into a stream of
      // the whole vault. `runStream` raises a notice saying so.
      return false;
```

- [ ] **Step 5: Handle it in the summary**

In `src/query/describe.ts`, add the last case of `describeCondition`'s switch:

```ts
    case "ref":
      // Only an *unresolved* reference reaches here: `runStream` hands the
      // view its resolved query, where an answered reference is already an
      // `equals` or an `anyOf` printing the host note's real value.
      return `= this.${condition.field} (not set here)`;
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run tests/engine/filter-where.test.ts tests/query/describe.test.ts && npm run build`
Expected: PASS, and the build completes with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/query/types.ts src/engine/filter.ts src/query/describe.ts tests/engine/filter-where.test.ts tests/query/describe.test.ts
git commit -m "$(cat <<'MSG'
feat: a where condition that references the host note

An unresolved reference matches no note, rather than dropping the condition:
a template whose property is not filled in yet must not stream the vault.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Parse `this.X`

**Files:**
- Modify: `src/query/parse.ts` (`parseCondition`)
- Test: `tests/query/parse-where.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/query/parse-where.test.ts`, inside the existing `describe("parseQuery — where", ...)` block:

```ts
  it("reads a this. value as a reference to the host note", () => {
    expect(whereOf("where:\n  Project: this.Project")).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project" } },
    ]);
  });

  it("matches the this. prefix case-insensitively and keeps the field's case", () => {
    expect(whereOf("where:\n  Project: This.Project")).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project" } },
    ]);
  });

  it("references a file property as readily as a frontmatter key", () => {
    expect(whereOf("where:\n  Parent: this.file.name")).toEqual([
      { field: "Parent", condition: { kind: "ref", field: "file.name" } },
    ]);
  });

  it("tolerates space after the prefix", () => {
    expect(whereOf("where:\n  Project: this. Project")).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project" } },
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: FAIL — each yields `{ kind: "equals", value: "this.Project" }` instead of a ref.

- [ ] **Step 3: Add the pattern**

In `src/query/parse.ts`, beneath the existing `COMPARISON` / `RESERVED` declarations:

```ts
/**
 * A `this.` value names a property of the note holding the block, resolved at
 * run time rather than here: a block is parsed once, when its note opens, so a
 * value resolved at parse time would freeze at what the host note held then.
 *
 * The prefix is matched case-insensitively, as `exists` and `missing` already
 * are. Left strict, `This.Project` became the literal string `"This.Project"`,
 * matched nothing, and said nothing — the silent failure this file spends most
 * of its length preventing. The field name after the prefix keeps its own case:
 * frontmatter lookup is case-sensitive, here as in `where` field names and
 * `sort` fields.
 */
const THIS_REF = /^this\.(.*)$/i;
```

- [ ] **Step 4: Read it in `parseCondition`**

In `src/query/parse.ts`, inside `parseCondition`, immediately after the `missing` branch and *before* the `COMPARISON` branch:

```ts
    const ref = THIS_REF.exec(text);
    if (ref !== null) {
      const target = ref[1].trim();
      if (target === "") {
        throw new QueryError(
          `\`where.${field}\`: \`this.\` needs a property name, as in ${field}: this.${field}.`,
        );
      }
      return { kind: "ref", field: target };
    }
```

Order matters: `exists`/`missing` first so a property actually named `exists` is not shadowed, and before `COMPARISON` is free — a comparison starts with its operator, so the two patterns cannot both match.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query/parse.ts tests/query/parse-where.test.ts
git commit -m "$(cat <<'MSG'
feat: parse a this. value in where as a host-note reference

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Reject the three references that cannot work

Each of these would otherwise be read as literal text and match nothing, in silence — the same failure mode the existing comparison and list guards exist for.

**Files:**
- Modify: `src/query/parse.ts` (`parseCondition`'s comparison branch, `asAnyOfValue`)
- Test: `tests/query/parse-where.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe` block in `tests/query/parse-where.test.ts`:

```ts
  it("rejects a this. with no property name", () => {
    expect(() => parseQuery("where:\n  Project: this.")).toThrow(
      /`this\.` needs a property name/,
    );
  });

  it("rejects a reference inside a list", () => {
    expect(() => parseQuery("where:\n  Project: [this.Project, Alpha]")).toThrow(
      /cannot use `this\.Project` inside a list/,
    );
  });

  it("rejects a reference as a comparison operand", () => {
    expect(() => parseQuery('where:\n  date: ">this.start"')).toThrow(
      /cannot compare against `this\.start`/,
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: FAIL on the last two — the list case yields `anyOf ["this.Project", "Alpha"]` and the comparison yields `compare > "this.start"`, neither throwing. The first already passes, from Task 2 step 4.

- [ ] **Step 3: Reject a reference in a comparison operand**

In `src/query/parse.ts`, inside `parseCondition`'s `if (comparison)` branch, after the existing empty-operand check:

```ts
      if (THIS_REF.test(operand)) {
        throw new QueryError(
          `\`where.${field}\` cannot compare against \`${operand}\`. A \`this.\` reference has to be the whole condition.`,
        );
      }
```

- [ ] **Step 4: Reject a reference inside a list**

In `src/query/parse.ts`, inside `asAnyOfValue`, before the existing `COMPARISON`/`RESERVED` check:

```ts
    if (THIS_REF.test(text)) {
      throw new QueryError(
        `\`where.${field}\` cannot use \`${text}\` inside a list. A list means "any of these values"; a \`this.\` reference has to be the whole condition.`,
      );
    }
```

A separate check rather than folding `this.` into `RESERVED`: the reference deserves its own sentence, and `RESERVED` holds whole words while this is a prefix.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: PASS, all three.

- [ ] **Step 6: Commit**

```bash
git add src/query/parse.ts tests/query/parse-where.test.ts
git commit -m "$(cat <<'MSG'
feat: reject a this. reference where it could only match literally

Inside a list and as a comparison operand it would be compared as text and
match nothing, without an error — the failure this file exists to prevent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `resolveRefs`

**Files:**
- Create: `src/engine/context.ts`
- Test: `tests/engine/context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveRefs } from "../../src/engine/context";
import { parseQuery } from "../../src/query/parse";
import { note } from "../fixtures/notes";

const REF = "where:\n  Project: this.Project";

function conditionOf(source: string, host: Parameters<typeof resolveRefs>[1]) {
  return resolveRefs(parseQuery(source), host).query.where[0].condition;
}

describe("resolveRefs", () => {
  it("reads a scalar as equality", () => {
    const host = note({ frontmatter: { Project: "Alpha" } });
    expect(conditionOf(REF, host)).toEqual({ kind: "equals", value: "Alpha" });
  });

  it("keeps a number and a boolean as themselves", () => {
    expect(conditionOf("where:\n  n: this.n", note({ frontmatter: { n: 5 } }))).toEqual({
      kind: "equals",
      value: 5,
    });
    expect(conditionOf("where:\n  b: this.b", note({ frontmatter: { b: false } }))).toEqual({
      kind: "equals",
      value: false,
    });
  });

  it("reads a list as any-of", () => {
    const host = note({ frontmatter: { Project: ["Alpha", "Beta"] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["Alpha", "Beta"] });
  });

  it("drops non-scalar members of a list", () => {
    const host = note({ frontmatter: { Project: ["Alpha", { nested: 1 }, null] } });
    expect(conditionOf(REF, host)).toEqual({ kind: "anyOf", values: ["Alpha"] });
  });

  it("resolves a file property", () => {
    const host = note({ path: "Projects/Alpha.md" });
    expect(conditionOf("where:\n  Parent: this.file.name", host)).toEqual({
      kind: "equals",
      value: "Alpha",
    });
  });

  it("leaves the reference unresolved when the host cannot answer it", () => {
    const cases = [
      note({ frontmatter: {} }),
      note({ frontmatter: { Project: null } }),
      note({ frontmatter: { Project: [] } }),
      note({ frontmatter: { Project: [{ nested: 1 }] } }),
      note({ frontmatter: { Project: { nested: 1 } } }),
    ];
    for (const host of cases) {
      const resolved = resolveRefs(parseQuery(REF), host);
      expect(resolved.query.where[0].condition).toEqual({ kind: "ref", field: "Project" });
      expect(resolved.unresolved).toEqual(["Project"]);
    }
  });

  it("leaves every reference unresolved when there is no host note", () => {
    const resolved = resolveRefs(parseQuery(REF), null);
    expect(resolved.query.where[0].condition).toEqual({ kind: "ref", field: "Project" });
    expect(resolved.unresolved).toEqual(["Project"]);
  });

  it("names each unresolved field once", () => {
    const query = parseQuery("where:\n  a: this.Project\n  b: this.Project");
    expect(resolveRefs(query, note()).unresolved).toEqual(["Project"]);
  });

  it("leaves the other conditions alone", () => {
    const query = parseQuery("where:\n  status: done\n  Project: this.Project");
    const resolved = resolveRefs(query, note({ frontmatter: { Project: "Alpha" } }));
    expect(resolved.query.where).toEqual([
      { field: "status", condition: { kind: "equals", value: "done" } },
      { field: "Project", condition: { kind: "equals", value: "Alpha" } },
    ]);
  });

  it("returns a reference-free query untouched, allocating nothing", () => {
    const query = parseQuery("where:\n  status: done");
    const resolved = resolveRefs(query, note({ frontmatter: { Project: "Alpha" } }));
    expect(resolved.query).toBe(query);
    expect(resolved.unresolved).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/engine/context.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/engine/context"`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/context.ts`:

```ts
import { resolveField } from "./fields";
import type { NoteMeta } from "./note";
import type { StreamQuery, WhereCondition } from "../query/types";

export interface ResolvedQuery {
  /** The query with every answerable `this.` reference replaced by a value. */
  query: StreamQuery;
  /** Host fields a reference named and the host note could not answer, once each. */
  unresolved: string[];
}

/**
 * Answer the query's `this.` references from the note holding the block.
 *
 * Pure, and run per refresh rather than per parse: a block is parsed once when
 * its note opens, so a reference resolved there would still be showing the old
 * project an hour after the property was edited.
 *
 * A reference the host cannot answer is left as it is rather than dropped. The
 * filter then matches nothing on it, which is the point — dropping it would
 * turn a template note with an unfilled property into a stream of the whole
 * vault, the loudest possible wrong answer.
 */
export function resolveRefs(query: StreamQuery, host: NoteMeta | null): ResolvedQuery {
  // No copy for the common query. Every stream refreshes on every vault change,
  // and most hold no reference at all.
  if (!query.where.some((clause) => clause.condition.kind === "ref")) {
    return { query, unresolved: [] };
  }

  const unresolved: string[] = [];
  const where = query.where.map((clause) => {
    if (clause.condition.kind !== "ref") {
      return clause;
    }
    const resolved = resolveCondition(clause.condition.field, host);
    if (resolved === null) {
      unresolved.push(clause.condition.field);
      return clause;
    }
    return { field: clause.field, condition: resolved };
  });

  // Deduplicated: two clauses may reference the same host field, and the notice
  // reads as a list of what the note is missing, not of where it was asked for.
  return { query: { ...query, where }, unresolved: [...new Set(unresolved)] };
}

/** The condition a host field yields, or null when it yields nothing usable. */
function resolveCondition(field: string, host: NoteMeta | null): WhereCondition | null {
  if (host === null) {
    return null;
  }
  // `resolveField`, not a bare frontmatter lookup, so `this.file.name` and the
  // other file properties resolve on exactly the terms every other field
  // reference in this plugin does.
  const raw = resolveField(host, field);
  if (Array.isArray(raw)) {
    // A list is any-of, matching what writing the list out by hand means. A
    // nested list or map inside it has no scalar to compare against, so it is
    // dropped; a list of nothing but those leaves nothing to match on.
    const values = raw.filter(isScalar);
    return values.length === 0 ? null : { kind: "anyOf", values };
  }
  return isScalar(raw) ? { kind: "equals", value: raw } : null;
}

/** Absent, null and nested structures all fail this, and all mean unresolved. */
function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run tests/engine/context.test.ts && npm run build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add src/engine/context.ts tests/engine/context.test.ts
git commit -m "$(cat <<'MSG'
feat: resolve this. references against the host note

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Give `runStream` an options object

Pure refactor, no behavior change — landed on its own so the next task's diff is only the feature. `runStream` is about to need a second optional argument, and two optional positionals is where a host note gets passed as a locale.

**Files:**
- Modify: `src/engine/run.ts` (`runStream`'s signature)
- Modify: `tests/engine/run.test.ts` (call sites)

- [ ] **Step 1: Change the signature**

In `src/engine/run.ts`, replace `runStream`'s parameter list and add the interface above it:

```ts
export interface StreamOptions {
  /** Formatting locale for group headers and text sorting. Defaults to the host's. */
  locale?: string;
}

export function runStream(
  notes: NoteMeta[],
  query: StreamQuery,
  now: Date,
  options: StreamOptions = {},
): StreamResult {
  const { locale } = options;
```

The body already reads `locale` as a bare identifier in its two `arrange` and `groupNotes` calls, so nothing else in the function changes.

- [ ] **Step 2: Update the test call sites**

Run:

```bash
sed -i '' 's/NOW, "en-GB")/NOW, { locale: "en-GB" })/g' tests/engine/run.test.ts
grep -c 'locale: "en-GB"' tests/engine/run.test.ts
```

Expected: a count of 16. Then check nothing was missed:

```bash
grep -n '"en-GB"' tests/engine/run.test.ts | grep -v 'locale:'
```

Expected: no output.

- [ ] **Step 3: Run the suite and the type check**

Run: `npm test && npm run build`
Expected: every test passes, clean build. `src/view/StreamChild.ts` passes three arguments and still compiles, since `options` has a default.

- [ ] **Step 4: Commit**

```bash
git add src/engine/run.ts tests/engine/run.test.ts
git commit -m "$(cat <<'MSG'
refactor: give runStream an options object

It is about to take a host note as well as a locale, and two optional
positionals is where one gets passed as the other.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: Wire resolution into `runStream`, with its notice

**Files:**
- Modify: `src/engine/run.ts` (`StreamOptions`, `StreamNotice`, `StreamResult`, `runStream`)
- Test: `tests/engine/run.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine/run.test.ts`:

```ts
describe("runStream — this. references", () => {
  const SOURCE = "where:\n  Project: this.Project";

  it("filters by the host note's value", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { Project: "Alpha" } }),
      note({ path: "b.md", frontmatter: { Project: "Beta" } }),
    ];
    const host = note({ path: "Host.md", frontmatter: { Project: "Alpha" } });
    const result = runStream(notes, parseQuery(SOURCE), NOW, { host });
    expect(result.groups.flatMap((g) => g.notes.map((n) => n.path))).toEqual(["a.md"]);
    expect(kinds(result)).not.toContain("unresolvedRef");
  });

  it("matches nothing and says why when the host note lacks the property", () => {
    const notes = [note({ path: "a.md", frontmatter: { Project: "Alpha" } })];
    const result = runStream(notes, parseQuery(SOURCE), NOW, { host: note({ path: "Host.md" }) });
    expect(result.matched).toBe(0);
    expect(result.notices[0]).toEqual({ kind: "unresolvedRef", fields: ["Project"] });
  });

  it("matches nothing when there is no host note at all", () => {
    const notes = [note({ path: "a.md", frontmatter: { Project: "Alpha" } })];
    expect(runStream(notes, parseQuery(SOURCE), NOW).matched).toBe(0);
  });

  it("returns the resolved query, so the summary can name a real value", () => {
    const host = note({ path: "Host.md", frontmatter: { Project: "Alpha" } });
    const result = runStream([], parseQuery(SOURCE), NOW, { host });
    expect(result.query.where).toEqual([
      { field: "Project", condition: { kind: "equals", value: "Alpha" } },
    ]);
  });
});
```

No new imports: `tests/engine/run.test.ts` already defines
`const kinds = (result: StreamResult): string[] => result.notices.map((n) => n.kind);`
at the top, already imports `note` from `../fixtures/notes`, and already declares
`const NOW = new Date(2026, 8, 4);`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/engine/run.test.ts`
Expected: FAIL — `host` is not a known option, no `unresolvedRef` notice is produced, and `result.query` is undefined.

- [ ] **Step 3: Extend the option, the notice and the result**

In `src/engine/run.ts`, import the resolver and the note type is already imported:

```ts
import { resolveRefs } from "./context";
```

Add the option:

```ts
export interface StreamOptions {
  /** Formatting locale for group headers and text sorting. Defaults to the host's. */
  locale?: string;
  /** The note holding the block, which `this.` references are resolved against. */
  host?: NoteMeta | null;
}
```

Add the notice, **first** in the union, and document it beside the others:

```ts
 * - `unresolvedRef` — a `this.` reference the host note could not answer, so
 *   every clause holding one matches nothing. Listed first: it is the notice
 *   that explains an empty stream, and the others describe a result that in
 *   this case does not exist.
```

```ts
export type StreamNotice =
  | { kind: "unresolvedRef"; fields: string[] }
  | { kind: "dateFallback"; field: string }
  | { kind: "unresolvedSort"; fields: string[] }
  | { kind: "truncated"; shown: number; matched: number };
```

Extend `StreamResult`:

```ts
export interface StreamResult {
  groups: StreamGroup[];
  /** How many notes matched, before the limit. */
  matched: number;
  /** How many notes the groups actually hold. */
  shown: number;
  notices: StreamNotice[];
  /**
   * The query actually run: the written one with its `this.` references
   * answered. The view describes this rather than what the block says, so an
   * empty stream's summary names the value it looked for.
   */
  query: StreamQuery;
}
```

- [ ] **Step 4: Resolve first, then run from the resolved query**

In `src/engine/run.ts`, rewrite the body of `runStream`. Every later mention of the written `query` becomes `concrete` — including the second `filterNotes` call and the `dateField` and `sort` reads:

```ts
export function runStream(
  notes: NoteMeta[],
  query: StreamQuery,
  now: Date,
  options: StreamOptions = {},
): StreamResult {
  const { locale } = options;
  // Before anything reads the query. A reference the host cannot answer stays
  // a `ref`, which `matchesClause` refuses for every note, so the rest of this
  // function runs over an empty result and the notice below explains it.
  const { query: concrete, unresolved } = resolveRefs(query, options.host ?? null);

  const matched = filterNotes(notes, concrete, now);
  const shown = arrange(matched, concrete, locale).slice(0, concrete.limit);

  const reached =
    concrete.from === null && concrete.to === null
      ? matched
      : filterNotes(notes, { ...concrete, from: null, to: null }, now);

  const notices: StreamNotice[] = [];

  if (unresolved.length > 0) {
    notices.push({ kind: "unresolvedRef", fields: unresolved });
  }

  if (
    concrete.dateField !== "file.ctime" &&
    reached.length > 0 &&
    reached.every((note) => coerceDate(resolveField(note, concrete.dateField)) === null)
  ) {
    notices.push({ kind: "dateFallback", field: concrete.dateField });
  }

  const unresolvedSort =
    matched.length === 0
      ? []
      : concrete.sort
          .filter((spec) => spec.field !== concrete.dateField)
          .filter((spec) => matched.every((note) => resolveField(note, spec.field) == null))
          .map((spec) => spec.field);
  if (unresolvedSort.length > 0) {
    notices.push({ kind: "unresolvedSort", fields: unresolvedSort });
  }

  if (matched.length > shown.length) {
    notices.push({ kind: "truncated", shown: shown.length, matched: matched.length });
  }

  return {
    groups: groupNotes(shown, concrete, locale),
    matched: matched.length,
    shown: shown.length,
    notices,
    query: concrete,
  };
}
```

Keep the existing explanatory comments on `reached`, on the `== null` check and on the `dateFallback` branch exactly where they are — only the identifiers change. The local formerly called `unresolved` is renamed `unresolvedSort` to leave the name free for the reference list.

- [ ] **Step 4b: Give the notice its words**

In `src/view/StreamChild.ts`, add the case to `describeNotice`'s switch, first, matching the union's order. The engine reports facts and the view owns every sentence; several fields join with `or`, as `unresolvedSort` already does, and the backticks render as code because the message goes through `setCodeText`:

```ts
    case "unresolvedRef": {
      const fields = notice.fields.map((field) => `\`${field}\``).join(" or ");
      return `This note has no ${fields}, so this stream matches nothing. Add it to the note's properties.`;
    }
```

Nothing else in that file changes here — `compute()`, the empty-stream summary and `signatureOf` are Task 8.

- [ ] **Step 5: Run the suite and the type check**

Run: `npm test && npm run build`
Expected: every test passes, and the build is green **only because of Step 4b above**. `StreamResult` merely gaining a field would indeed leave the view compiling, but `StreamNotice` gaining a member does not: `describeNotice` in `src/view/StreamChild.ts` switches exhaustively over that union and ends in `assertNeverNotice`, so a member with no case fails to compile. That is the guard working as designed — the comment above `StreamNotice` says as much — and it means the notice's words belong in this same commit, not two tasks later.

- [ ] **Step 6: Commit**

```bash
git add src/engine/run.ts src/view/StreamChild.ts tests/engine/run.test.ts
git commit -m "$(cat <<'MSG'
feat: run streams against resolved this. references

An unanswerable reference empties the stream, so its notice goes first: it
is the one that explains the emptiness the others describe.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: `hostNote` in the adapter

**Files:**
- Modify: `src/obsidian/adapter.ts`
- Test: `tests/obsidian/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/obsidian/adapter.test.ts`, add `getFileByPath` to the existing `fakeApp` helper:

```ts
function fakeApp(entries: Array<[TFile, CachedMetadata | null]>): App {
  return {
    vault: {
      getMarkdownFiles: () => entries.map(([f]) => f),
      getFileByPath: (path: string) => entries.find(([f]) => f.path === path)?.[0] ?? null,
    },
    metadataCache: {
      getFileCache: (target: TFile) =>
        entries.find(([f]) => f.path === target.path)?.[1] ?? null,
    },
  } as unknown as App;
}
```

Append the suite, and add `hostNote` to the file's import from `../../src/obsidian/adapter`:

```ts
describe("hostNote", () => {
  const app = () =>
    fakeApp([
      [file("Projects/Alpha.md"), { frontmatter: { Project: "Alpha" } } as unknown as CachedMetadata],
    ]);

  it("reads the note at the given path", () => {
    const host = hostNote(app(), "Projects/Alpha.md");
    expect(host?.basename).toBe("Alpha");
    expect(host?.frontmatter).toEqual({ Project: "Alpha" });
  });

  it("returns null for a path naming no note", () => {
    expect(hostNote(app(), "Projects/Gone.md")).toBeNull();
  });

  it("returns null for an empty path", () => {
    expect(hostNote(app(), "")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/obsidian/adapter.test.ts`
Expected: FAIL — `hostNote is not a function` (no such export).

- [ ] **Step 3: Write the implementation**

Append to `src/obsidian/adapter.ts`:

```ts
/**
 * The note holding a stream block, for `this.` references, or null when the
 * path names nothing. A code block processor is handed a `sourcePath` that can
 * be empty in contexts with no file behind them, and a note can be deleted
 * while its block is still on screen, so both are ordinary, not exceptional.
 */
export function hostNote(app: App, sourcePath: string): NoteMeta | null {
  if (sourcePath === "") {
    return null;
  }
  const file = app.vault.getFileByPath(sourcePath);
  return file === null ? null : toNoteMeta(file, app.metadataCache.getFileCache(file));
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run tests/obsidian/adapter.test.ts && npm run build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/adapter.ts tests/obsidian/adapter.test.ts
git commit -m "$(cat <<'MSG'
feat: read the note holding a stream block

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: Wire the view

**Files:**
- Modify: `src/view/StreamChild.ts` (`compute`, the empty branch, `describeNotice`, `signatureOf`)

- [ ] **Step 1: Pass the host note**

In `src/view/StreamChild.ts`, extend the adapter import and `compute`:

```ts
import { collectNotes, hostNote } from "../obsidian/adapter";
```

```ts
  private compute(): StreamResult {
    if (this.query === null) {
      throw new Error("Simple Streams: no query to run");
    }
    // Read per refresh, not cached: editing the host note's properties is
    // exactly the event this feature exists to follow, and `StreamRegistry`
    // already refreshes on the `metadataCache` change that carries it.
    return runStream(collectNotes(this.app), this.query, new Date(), {
      host: hostNote(this.app, this.sourcePath),
    });
  }
```

- [ ] **Step 2: Describe the query that actually ran**

In `render`, the empty branch becomes:

```ts
    if (this.rows.length === 0) {
      root.createDiv({ cls: "ss-empty", text: "No notes match this stream." });
      // `result.query`, not `this.query`: the written query still says
      // `this.Project`, and what the reader needs is the value it stood for.
      root.createDiv({ cls: "ss-empty-summary", text: describeQuery(result.query) });
      return;
    }
```

- [ ] **Step 3: Put the resolved conditions in the signature**

Replace `signatureOf`'s return and extend its doc comment:

```ts
  // The resolved `where` clauses too. A `this.` reference moving from one
  // value to another while both match nothing leaves groups and notices
  // identical, so no re-render fires and the summary on screen keeps naming
  // the old value — the one line whose whole job is saying what was looked for.
  return JSON.stringify([notes, result.notices, result.query.where]);
```

- [ ] **Step 4: Run the suite and the type check**

Run: `npm test && npm run build`
Expected: every test passes, clean build. The view tests all use queries with no reference, so their signatures are unchanged in content.

- [ ] **Step 5: Commit**

```bash
git add src/view/StreamChild.ts
git commit -m "$(cat <<'MSG'
feat: resolve this. references against the note on screen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: End-to-end, through the view

**Files:**
- Create: `tests/view/this-refs.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/view/this-refs.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resetObsidianMock, setRenderHook } from "../mocks/obsidian";
import { FakeIntersectionObserver, FakeVault, drawnTitles, mountPane, settle } from "./harness";
import { StreamChild } from "../../src/view/StreamChild";

const SOURCE =
  "folder: Notes\nsort: file.path asc\ndisplay: title\nwhere:\n  Project: this.Project\n";

/** A vault of two projects' notes, plus the note the block lives in. */
function vaultWith(hostFrontmatter: Record<string, unknown> | undefined): FakeVault {
  return new FakeVault([
    { path: "Host.md", frontmatter: hostFrontmatter },
    { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    { path: "Notes/c.md", frontmatter: { Project: "Alpha" } },
  ]);
}

function noticeText(container: HTMLElement): string | null {
  const el = container.querySelector(".ss-notice");
  return el === null ? null : el.textContent;
}

let child: StreamChild | null = null;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
});

afterEach(() => {
  child?.unload();
  child = null;
  setRenderHook(null);
});

describe("this. references in the view", () => {
  test("shows the notes sharing the host note's project", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("matches nothing and says why when the host note has no such property", async () => {
    const vault = vaultWith(undefined);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty")).not.toBeNull();
    expect(noticeText(container)).toContain("This note has no Project");
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = this.Project (not set here)",
    );
  });

  test("names the resolved value in the summary of an empty stream", async () => {
    const vault = vaultWith({ Project: "Gamma" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual([]);
    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = Gamma",
    );
  });

  test("follows an edit to the host note's property", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();
    expect(drawnTitles(container)).toEqual(["a", "c"]);

    vault.setNotes([
      { path: "Host.md", frontmatter: { Project: "Beta" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
      { path: "Notes/c.md", frontmatter: { Project: "Alpha" } },
    ]);
    await child.refresh();
    await settle();

    expect(drawnTitles(container)).toEqual(["b"]);
  });

  test("redraws the summary when the reference moves between two values that match nothing", async () => {
    const vault = vaultWith({ Project: "Gamma" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    vault.setNotes([
      { path: "Host.md", frontmatter: { Project: "Delta" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
      { path: "Notes/c.md", frontmatter: { Project: "Alpha" } },
    ]);
    await child.refresh();
    await settle();

    expect(container.querySelector(".ss-empty-summary")?.textContent).toContain(
      "Project = Delta",
    );
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/view/this-refs.test.ts`
Expected: PASS, all five. Tasks 1–8 already implement every behavior; this test exists because none of them exercised the whole path, and the last case is the only one that fails if `signatureOf` drops `result.query.where`.

- [ ] **Step 3: Prove the last case earns its place**

Temporarily revert the signature line to `JSON.stringify([notes, result.notices])` and run the file again.
Expected: the last test FAILS with the summary still reading `Project = Gamma`. Restore the line and confirm it passes again.

- [ ] **Step 4: Commit**

```bash
git add tests/view/this-refs.test.ts
git commit -m "$(cat <<'MSG'
test: this. references end to end through the view

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: Documentation

**Files:**
- Modify: `README.md` (the field table note and the `where` rules)
- Modify: `CHANGELOG.md`
- Modify: `docs/manual-testing.md`

- [ ] **Step 1: Document the syntax in the README**

In `README.md`, in the "Matching rules" section, directly after the paragraph beginning "Equality looks inside a frontmatter list too", insert:

```markdown
A `where` value may also name a property of the note the block sits in, by
writing `this.` in front of it:

```stream
folder: Notes
sort: file.ctime desc
where:
  Project: this.Project
```

In a note whose properties say `Project: Orbit`, that stream shows every note
whose `Project` is `Orbit`. Put the block in a template and every project note
made from it carries its own running history, with nothing to edit per note.
Beyond frontmatter keys, `this.file.name` and `this.file.path` reference the
host note itself.

If the host note's property holds a list, the stream matches any of its values.
If the note has no such property — a template's note before it is filled in —
the stream matches nothing and says so, rather than quietly widening to the
whole vault. A `this.` reference has to be the whole condition: it cannot sit
inside a list or after a comparison operator.
```

- [ ] **Step 2: Note it in the field table**

In `README.md`, change the `where` row of the field table to:

```markdown
| `where`          | map                      | —                 | Frontmatter conditions, including `this.` references to the host note |
```

- [ ] **Step 3: Add the changelog entry**

At the top of `CHANGELOG.md`, above the most recent released version's heading, add — matching the file's existing heading and bullet style:

```markdown
## Unreleased

### Added

- `where` values can reference the note holding the block: `Project: this.Project`
  matches notes whose `Project` equals the host note's. A block in a template
  then gives every note made from it its own stream. A host property holding a
  list matches any of its values; a host note without the property matches
  nothing and says so.
```

- [ ] **Step 4: Add the manual test cases**

Append to `docs/manual-testing.md`, matching the numbering and shape of the cases already there:

```markdown
- **A `this.` reference resolves against the note on screen.** Give a note the
  property `Project: Orbit`, give two other notes the same property, and add a
  block with `where: {Project: this.Project}`. Both notes appear; notes with
  another project do not.
- **An unfilled property explains itself.** Make a note from a template holding
  that block, and leave `Project` empty. The stream is empty, and says "This
  note has no `Project`" with `Project` rendered as code rather than as
  backticks.
- **Editing the property moves the stream.** With the stream on screen, change
  the host note's `Project` in the Properties panel. Within a moment the stream
  shows the other project's notes.
```

- [ ] **Step 5: Verify the whole suite and the build**

Run: `npm test && npm run build`
Expected: every test passes, clean build.

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md docs/manual-testing.md
git commit -m "$(cat <<'MSG'
docs: this. references in where values

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## Done when

- `npm test` and `npm run build` both pass.
- A block reading `where: {Project: this.Project}` in a note carrying `Project: Orbit` streams that project's notes, and follows an edit to the property.
- A host note without the property yields an empty stream carrying the notice, not a stream of the vault.
- The three rejected forms each raise their own error rather than matching literally.
- README, CHANGELOG and the manual testing doc describe the feature.

The version bump, `versions.json` and the release itself are deliberately out of scope: `docs/publishing.md` owns that process and it runs when a release is actually cut.
