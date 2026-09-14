# Adaptive Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Simple Streams sidebar that follows the active Markdown note, driven by a settings-held query whose `where` values may name properties of that note through `active.X`.

**Architecture:** `active.` becomes the sibling of `this.`, carried as a required `scope` on the existing `ref` condition and resolved by the same pure `resolveRefs`. A pure gate rejects the wrong scope at each use site, so the parser stays context-free. The sidebar is an `ItemView` that owns one `StreamChild` over a body element and rebuilds it whenever the followed note changes — reusing every paging, refresh and notice guarantee code blocks already have, rather than reaching into their invariants.

**Tech Stack:** TypeScript, Obsidian plugin API (`ItemView`, `MarkdownView`, `Workspace` events), Vitest with jsdom, esbuild.

**Spec:** `docs/superpowers/specs/2026-09-14-adaptive-sidebar-design.md`

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/query/scopes.ts` | Pure gate: reject refs of a scope the caller cannot answer |
| `src/settings.ts` | Settings shape and defaults. Data only, no imports |
| `src/obsidian/activeNote.ts` | Track which Markdown note the workspace is on, with stickiness |
| `src/view/StreamSidebarView.ts` | The sidebar `ItemView`: header, body, one `StreamChild`, rebuild on change |
| `src/view/SettingsTab.ts` | Settings UI, live query validation, debounced rebuild |
| `tests/fixtures/workspace.ts` | Fake workspace and vault events for tracker tests |
| `tests/query/scopes.test.ts` | Gate coverage, both directions |
| `tests/obsidian/active-note.test.ts` | The three rules, stickiness, rename, delete |
| `tests/view/sidebar.test.ts` | End-to-end sidebar behavior |

**Modified**

| File | Change |
|---|---|
| `src/query/types.ts` | `RefScope`; `scope` on the `ref` condition |
| `src/query/parse.ts` | Parse `active.` and `[[active.]]`; widen the near-miss guard |
| `src/query/describe.ts` | Echo the scope's prefix |
| `src/engine/refs.ts` | Take a `{ host, active }` context |
| `src/engine/run.ts` | `active` and `excludePath` options; `scope` on the notice |
| `src/obsidian/adapter.ts` | `hostNote` → `noteAt` |
| `src/view/StreamChild.ts` | Injected `StreamContext`; scope gating; sidebar scroller |
| `src/main.ts` | Settings, view registration, ribbon, command, tracker |
| `tests/mocks/obsidian.ts` | `ItemView`, `MarkdownView`, `WorkspaceLeaf` |
| `styles.css` | Sidebar header, body and empty state |
| `README.md`, `CHANGELOG.md`, `docs/manual-testing.md` | Documentation |

---

## Task 1: Record the scope on every ref condition

Mechanical and behavior-free: the type gains a required field and the one construction site fills in `"this"`. Everything still means what it meant.

**Files:**
- Modify: `src/query/types.ts`
- Modify: `src/query/parse.ts:399`
- Test: `tests/query/parse-where.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/query/parse-where.test.ts`, inside the top-level `describe`:

```ts
  it("records which note a reference names", () => {
    expect(whereOf("where:\n  Project: this.Project")).toEqual([
      {
        field: "Project",
        condition: { kind: "ref", field: "Project", link: false, scope: "this" },
      },
    ]);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/query/parse-where.test.ts -t "records which note"`
Expected: FAIL — the received condition has no `scope` key.

- [ ] **Step 3: Add the type**

In `src/query/types.ts`, above `WhereCondition`:

```ts
/**
 * Which note a `ref` condition names. `this` is the note holding the stream
 * block; `active` is the note the workspace is on, which only the sidebar
 * follows. One list, and the type derived from it, as `DISPLAY_MODES` already
 * is.
 */
export const REF_SCOPES = ["this", "active"] as const;
export type RefScope = (typeof REF_SCOPES)[number];
```

Then change the `ref` variant of `WhereCondition`:

```ts
  /**
   * A `this.X` or `active.X` value, until `resolveRefs` answers it from the
   * note its `scope` names. `link` records which spelling it was written in —
   * `this.X` or `[[this.X]]` — so the resolved value can be written back as a
   * link and an unresolved one can be described in the words the reader used.
   * Both are required rather than optional: every site then states the answer,
   * and the compiler finds every site.
   */
  | { kind: "ref"; field: string; link: boolean; scope: RefScope };
```

- [ ] **Step 4: Fill it in at the one construction site**

In `src/query/parse.ts`, in `parseCondition`, change the ref return:

```ts
      return { kind: "ref", field: target, link: linkRef !== null, scope: "this" };
```

- [ ] **Step 5: Update the existing assertions**

Eight assertions in `tests/query/parse-where.test.ts` spell out a `ref` condition
(around lines 106, 112, 118, 124, 148, 154, 160, 166). Add `scope: "this"` to
each. Run this to find every one:

```bash
grep -n 'kind: "ref"' tests/query/parse-where.test.ts tests/engine/refs.test.ts tests/query/describe.test.ts
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 7: Type-check and commit**

```bash
npm run build
git add src/query/types.ts src/query/parse.ts tests/query/parse-where.test.ts
git commit -m "refactor: record which note a reference names"
```

---

## Task 2: Parse `active.` references

**Files:**
- Modify: `src/query/parse.ts:283-326` (the ref regexes), `:374-399` (the ref branch)
- Test: `tests/query/parse-where.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/query/parse-where.test.ts`:

```ts
describe("parseQuery — active. references", () => {
  it("reads a plain active reference", () => {
    expect(whereOf("where:\n  Project: active.Project")).toEqual([
      {
        field: "Project",
        condition: { kind: "ref", field: "Project", link: false, scope: "active" },
      },
    ]);
  });

  it("matches the prefix case-insensitively and keeps the field's case", () => {
    expect(whereOf("where:\n  Project: Active.Project")).toEqual([
      {
        field: "Project",
        condition: { kind: "ref", field: "Project", link: false, scope: "active" },
      },
    ]);
  });

  it("reads file properties", () => {
    expect(whereOf("where:\n  Parent: active.file.name")).toEqual([
      {
        field: "Parent",
        condition: { kind: "ref", field: "file.name", link: false, scope: "active" },
      },
    ]);
  });

  it("reads the link spelling", () => {
    expect(whereOf('where:\n  Project: "[[active.Project]]"')).toEqual([
      {
        field: "Project",
        condition: { kind: "ref", field: "Project", link: true, scope: "active" },
      },
    ]);
  });

  it("tolerates whitespace inside the brackets", () => {
    expect(whereOf('where:\n  Project: "[[ active.Project ]]"')).toEqual([
      {
        field: "Project",
        condition: { kind: "ref", field: "Project", link: true, scope: "active" },
      },
    ]);
  });

  it("rejects a reference with no property name", () => {
    expect(() => whereOf("where:\n  Project: active.")).toThrow(/needs a property name/);
    expect(() => whereOf('where:\n  Project: "[[active.]]"')).toThrow(/needs a property name/);
  });

  it("rejects an alias or a heading", () => {
    expect(() => whereOf('where:\n  Project: "[[active.Project|MP]]"')).toThrow(
      /alias or heading/,
    );
    expect(() => whereOf('where:\n  Project: "[[active.Project#Log]]"')).toThrow(
      /alias or heading/,
    );
  });

  it("rejects a reference inside a list", () => {
    expect(() => whereOf("where:\n  Project: [active.Project, Beta]")).toThrow(
      /has to be the whole condition/,
    );
    expect(() => whereOf('where:\n  Project: ["[[active.Project]]", Beta]')).toThrow(
      /has to be the whole condition/,
    );
  });

  it("rejects a reference as a comparison operand", () => {
    expect(() => whereOf('where:\n  date: ">active.start"')).toThrow(
      /has to be the whole condition/,
    );
    expect(() => whereOf('where:\n  date: ">[[active.start]]"')).toThrow(
      /has to be the whole condition/,
    );
  });

  it("rejects a near-miss link rather than matching it literally", () => {
    expect(() => whereOf('where:\n  Project: "![[active.Project]]"')).toThrow(
      /has to be the whole value/,
    );
    expect(() => whereOf('where:\n  Project: "see [[active.Project]]"')).toThrow(
      /has to be the whole value/,
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/query/parse-where.test.ts -t "active. references"`
Expected: FAIL — `active.Project` currently parses as `{ kind: "equals", value: "active.Project" }`, and none of the rejections throw.

- [ ] **Step 3: Generalize the regexes**

In `src/query/parse.ts`, replace the `THIS_REF` / `LINK_REF` / `isThisRef` / `NEAR_LINK_REF` block with:

```ts
/**
 * A `this.` or `active.` value names a property of a note, resolved at run time
 * rather than here: a block is parsed once, when its note opens, so a value
 * resolved at parse time would freeze at what the note held then.
 *
 * The prefix is matched case-insensitively, as `exists` and `missing` already
 * are. Left strict, `This.Project` became the literal string `"This.Project"`,
 * matched nothing, and said nothing — the silent failure this file spends most
 * of its length preventing. The field name after the prefix keeps its own case:
 * frontmatter lookup is case-sensitive, here as in `where` field names and
 * `sort` fields.
 *
 * One regex over both prefixes, with the scope captured, rather than a pair per
 * spelling: four regexes and four gates is how one spelling gets quietly missed
 * by the list or comparison check, which is the state `[[this.Project]]` was in
 * before `isRef` existed.
 */
const PLAIN_REF = /^(this|active)\.(.*)$/i;

/**
 * The same reference written as a link, for the vaults where a relationship
 * property holds one: `Project: "[[active.Project]]"`. Matched
 * case-insensitively, and with the inner whitespace trimmed, on exactly the
 * terms `PLAIN_REF` already is.
 */
const LINK_REF = /^\[\[\s*(this|active)\.(.*?)\s*\]\]$/i;

/**
 * Either spelling, of either scope. Every gate in this file asks through here
 * rather than testing a regex of its own, so a spelling added to the condition
 * path cannot be quietly missed by the list and comparison gates.
 */
function isRef(text: string): boolean {
  return PLAIN_REF.test(text) || LINK_REF.test(text);
}

/**
 * Text reaching for a link reference without being one: `![[active.X]]`, a
 * doubled bracket, or anything with text either side of the brackets.
 * `LINK_REF` is anchored, so every one of these falls through to an ordinary
 * equality against its own literal text — no match, no error, the silent empty
 * stream this file exists to prevent, in the syntax it has just gained. Nobody
 * writes `[[this.` meaning those characters, so the near miss is worth a
 * sentence rather than a shrug. Whitespace is tolerated at each join — a space
 * inside the brackets or before the dot is a typo reaching for the same thing,
 * not a different value.
 */
const NEAR_LINK_REF = /\[\s*\[\s*(this|active)\s*\./i;
```

- [ ] **Step 4: Generalize the ref branch**

In `parseCondition`, replace from `const linkRef = LINK_REF.exec(text);` through the ref `return` with:

```ts
    // The link spelling first. It cannot collide — `PLAIN_REF` is anchored at
    // the prefix and a link starts with a bracket — but asking in this order
    // keeps `linkRef` the single thing the rest of the block branches on.
    const linkRef = LINK_REF.exec(text);
    const ref = linkRef ?? PLAIN_REF.exec(text);
    if (ref !== null) {
      const scope = ref[1].toLowerCase() as RefScope;
      // Trimmed as the operand and every list entry already are, so a stray
      // space after the dot is tolerated rather than treated as a typo — and
      // so `this. ` falls through to the "needs a property name" check below.
      const target = ref[2].trim();
      if (target === "") {
        throw new QueryError(
          linkRef === null
            ? `\`where.${field}\`: \`${scope}.\` needs a property name, as in ${field}: ${scope}.${field}.`
            : `\`where.${field}\`: \`[[${scope}.]]\` needs a property name, as in ${field}: "[[${scope}.${field}]]".`,
        );
      }
      // An alias or a heading has no meaning in a match, and the alternative to
      // saying so is looking up a frontmatter key literally named
      // `Project|MP` — reporting the note missing a property nobody wrote.
      if (linkRef !== null && /[|#]/.test(target)) {
        throw new QueryError(
          `\`where.${field}\` cannot use \`${text}\`. A \`${scope}.\` reference names a property, so an alias or heading has no meaning here.`,
        );
      }
      return { kind: "ref", field: target, link: linkRef !== null, scope };
    }
```

- [ ] **Step 5: Rename the remaining `isThisRef` call sites**

Three sites now call `isRef` instead. In the comparison branch:

```ts
      if (isRef(operand) || NEAR_LINK_REF.test(operand)) {
        throw new QueryError(
          `\`where.${field}\` cannot compare against \`${operand}\`. A \`this.\` or \`active.\` reference has to be the whole condition.`,
        );
      }
```

The near-miss branch below it:

```ts
    if (NEAR_LINK_REF.test(text)) {
      throw new QueryError(
        `\`where.${field}\` cannot use \`${text}\`. A link reference has to be the whole value, as in ${field}: "[[this.${field}]]".`,
      );
    }
```

And in `asAnyOfValue`:

```ts
    if (isRef(text) || NEAR_LINK_REF.test(text)) {
      throw new QueryError(
        `\`where.${field}\` cannot use \`${text}\` inside a list. A list means "any of these values"; a \`this.\` or \`active.\` reference has to be the whole condition.`,
      );
    }
```

- [ ] **Step 6: Import the type**

At the top of `src/query/parse.ts`, add `RefScope` to the existing type import from `./types`.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS. If an existing `this.`-rejection test asserts the old wording
("A `this.` reference has to be the whole condition"), update it to the new
sentence — the message now names both prefixes because either can be written
there.

- [ ] **Step 8: Type-check and commit**

```bash
npm run build
git add src/query/parse.ts tests/query/parse-where.test.ts
git commit -m "feat: parse active. references in where values"
```

---

## Task 3: Gate references by context

**Files:**
- Create: `src/query/scopes.ts`
- Test: `tests/query/scopes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/query/scopes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";
import { assertScope } from "../../src/query/scopes";
import { QueryError } from "../../src/query/types";

describe("assertScope", () => {
  it("passes a query holding no reference at all", () => {
    const query = parseQuery("where:\n  status: done");
    expect(() => assertScope(query, "this")).not.toThrow();
    expect(() => assertScope(query, "active")).not.toThrow();
  });

  it("passes a reference of the allowed scope", () => {
    expect(() => assertScope(parseQuery("where:\n  P: this.P"), "this")).not.toThrow();
    expect(() => assertScope(parseQuery("where:\n  P: active.P"), "active")).not.toThrow();
  });

  it("rejects active. where only this. can be answered", () => {
    const query = parseQuery("where:\n  Project: active.Project");
    expect(() => assertScope(query, "this")).toThrow(QueryError);
    expect(() => assertScope(query, "this")).toThrow(
      /cannot use `active.Project` here.*sidebar.*Use `this.Project`/s,
    );
  });

  it("rejects this. where only active. can be answered", () => {
    const query = parseQuery("where:\n  Project: this.Project");
    expect(() => assertScope(query, "active")).toThrow(
      /cannot use `this.Project` here.*no note holding the block.*Use `active.Project`/s,
    );
  });

  it("names the offending field, not the property it points at", () => {
    const query = parseQuery("where:\n  Owner: active.file.name");
    expect(() => assertScope(query, "this")).toThrow(/`where.Owner`/);
  });

  it("reports the first offender when several are wrong", () => {
    const query = parseQuery("where:\n  A: active.A\n  B: active.B");
    expect(() => assertScope(query, "this")).toThrow(/`where.A`/);
  });

  it("echoes the link spelling the reader wrote", () => {
    const query = parseQuery('where:\n  Project: "[[active.Project]]"');
    expect(() => assertScope(query, "this")).toThrow(/\[\[active\.Project\]\]/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/query/scopes.test.ts`
Expected: FAIL — cannot resolve `../../src/query/scopes`.

- [ ] **Step 3: Write the module**

Create `src/query/scopes.ts`:

```ts
import { QueryError, type RefScope, type StreamQuery } from "./types";

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
    // The spelling the reader wrote, and the one they wanted, in the same
    // shape — so the fix is a prefix swap they can see rather than a rule they
    // have to apply.
    const written = spell(condition.scope, condition.field, condition.link);
    const wanted = spell(allowed, condition.field, condition.link);
    throw new QueryError(
      `\`where.${clause.field}\` cannot use \`${written}\` here. ${reason(condition.scope)} Use \`${wanted}\`.`,
    );
  }
}

function spell(scope: RefScope, field: string, link: boolean): string {
  const bare = `${scope}.${field}`;
  return link ? `[[${bare}]]` : bare;
}

function reason(rejected: RefScope): string {
  return rejected === "active"
    ? "`active.` names the note you are looking at, which only the Simple Streams sidebar follows."
    : "`this.` names the note holding a stream block, and the sidebar has no note holding it.";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/query/scopes.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npm run build
git add src/query/scopes.ts tests/query/scopes.test.ts
git commit -m "feat: reject references a context cannot answer"
```

---

## Task 4: Describe a reference in its own prefix

**Files:**
- Modify: `src/query/describe.ts:62-71`
- Test: `tests/query/describe.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/query/describe.test.ts`, inside its top-level `describe`:

```ts
  it("echoes an unresolved active reference in its own spelling", () => {
    expect(describeQuery(parseQuery("where:\n  Project: active.Project"))).toContain(
      "Project = active.Project (not set here)",
    );
    expect(
      describeQuery(parseQuery('where:\n  Project: "[[active.Project]]"')),
    ).toContain("Project = [[active.Project]] (not set here)");
  });
```

If `describe.test.ts` imports differently, match its existing import list — it
already imports `describeQuery` and `parseQuery`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/query/describe.test.ts -t "active reference"`
Expected: FAIL — the received text says `this.Project`, because the prefix is hardcoded.

- [ ] **Step 3: Use the scope**

In `src/query/describe.ts`, in the `ref` case, replace the `written` line:

```ts
      const bare = `${condition.scope}.${condition.field}`;
      const written = condition.link ? `[[${bare}]]` : bare;
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/query/describe.ts tests/query/describe.test.ts
git commit -m "feat: describe a reference in the prefix it was written in"
```

---

## Task 5: Resolve references against a context

**Files:**
- Modify: `src/engine/refs.ts`
- Test: `tests/engine/refs.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/engine/refs.test.ts`, change the helper and add a block. The existing
helper passes a bare host; it becomes:

```ts
function conditionOf(source: string, refs: RefContext) {
  return resolveRefs(parseQuery(source), refs).query.where[0].condition;
}

/** The common case: a host note, and nothing active. */
function host(meta: NoteMeta | null): RefContext {
  return { host: meta, active: null };
}
```

Update the existing calls from `conditionOf(REF, hostNote)` to
`conditionOf(REF, host(hostNote))`, and add the imports:

```ts
import type { RefContext } from "../../src/engine/refs";
import type { NoteMeta } from "../../src/engine/note";
```

Then add:

```ts
describe("resolveRefs — scopes", () => {
  const ACTIVE = "where:\n  Project: active.Project";

  it("answers an active reference from the active note", () => {
    const refs = {
      host: note({ frontmatter: { Project: "Host" } }),
      active: note({ frontmatter: { Project: "Active" } }),
    };
    expect(conditionOf(ACTIVE, refs)).toEqual({ kind: "equals", value: "Active" });
  });

  it("answers a this reference from the host note, in the same context", () => {
    const refs = {
      host: note({ frontmatter: { Project: "Host" } }),
      active: note({ frontmatter: { Project: "Active" } }),
    };
    expect(conditionOf("where:\n  Project: this.Project", refs)).toEqual({
      kind: "equals",
      value: "Host",
    });
  });

  it("leaves an active reference unresolved when no note is active", () => {
    const resolution = resolveRefs(parseQuery(ACTIVE), { host: note({}), active: null });
    expect(resolution.query.where[0].condition).toEqual({
      kind: "ref",
      field: "Project",
      link: false,
      scope: "active",
    });
    // Asserted through the condition above, not through `unresolved`, whose
    // shape changes in Task 6. Task 6 covers it in its new form.
    expect(resolution.unresolved).toHaveLength(1);
  });

  it("reads a list on the active note as any-of", () => {
    const refs = { host: null, active: note({ frontmatter: { Project: ["A", "B"] } }) };
    expect(conditionOf(ACTIVE, refs)).toEqual({ kind: "anyOf", values: ["A", "B"] });
  });

  it("wraps a link-spelled active reference", () => {
    const refs = { host: null, active: note({ frontmatter: { Project: "A" } }) };
    expect(conditionOf('where:\n  Project: "[[active.Project]]"', refs)).toEqual({
      kind: "equals",
      value: "[[A]]",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/engine/refs.test.ts`
Expected: FAIL — `resolveRefs` takes a `NoteMeta | null`, not a context.

- [ ] **Step 3: Take a context**

In `src/engine/refs.ts`, add the type and change both functions:

```ts
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
```

`resolveRefs`'s signature and the one call inside it:

```ts
export function resolveRefs(query: StreamQuery, refs: RefContext): Resolution {
```

```ts
    const resolved = resolveCondition(clause.condition, refs);
```

And `resolveCondition` takes the whole condition, so it can read its own scope:

```ts
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
```

Update the doc comment on `resolveRefs` to say "the note a reference names" in
place of "the note holding the block", and leave the rest of the file alone.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/refs.test.ts`
Expected: PASS. `tests/engine/run.test.ts` and the view tests will still fail to
compile until Task 6 — that is expected; do not chase them here.

- [ ] **Step 5: Commit**

Commit with the run.ts change in Task 6, since the tree does not type-check
between them. Leave this uncommitted and move straight to Task 6.

---

## Task 6: Carry the active note and the notice's scope through `runStream`

**Files:**
- Modify: `src/engine/run.ts`
- Test: `tests/engine/run.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/run.test.ts`:

```ts
describe("runStream — active references", () => {
  const QUERY = "where:\n  Project: active.Project";

  it("matches against the active note", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { Project: "Alpha" } }),
      note({ path: "b.md", frontmatter: { Project: "Beta" } }),
    ];
    const result = runStream(notes, parseQuery(QUERY), new Date(), {
      active: note({ path: "Active.md", frontmatter: { Project: "Alpha" } }),
    });
    expect(result.groups.flatMap((group) => group.notes.map((n) => n.path))).toEqual([
      "a.md",
    ]);
  });

  it("raises a scoped notice when the active note cannot answer", () => {
    const result = runStream([note({ path: "a.md" })], parseQuery(QUERY), new Date(), {
      active: note({ path: "Active.md" }),
    });
    expect(result.notices).toContainEqual({
      kind: "unresolvedRef",
      scope: "active",
      fields: ["Project"],
    });
  });

  it("keeps the this scope on a host-note notice", () => {
    const result = runStream(
      [note({ path: "a.md" })],
      parseQuery("where:\n  Project: this.Project"),
      new Date(),
      { host: note({ path: "Host.md" }) },
    );
    expect(result.notices).toContainEqual({
      kind: "unresolvedRef",
      scope: "this",
      fields: ["Project"],
    });
  });
});
```

Match the file's existing `note(...)` fixture import; it already imports from
`../fixtures/notes`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/engine/run.test.ts -t "active references"`
Expected: FAIL — `active` is not a known option, and the notice has no `scope`.

- [ ] **Step 3: Report the scope from `resolveRefs`**

In `src/engine/refs.ts`, `unresolved` becomes a list of scoped entries so the
notice can be built without re-reading the query:

```ts
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
```

In the body, push `{ scope: clause.condition.scope, field: clause.condition.field }`
instead of the bare field, and deduplicate on the pair:

```ts
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
```

Import `RefScope` from `../query/types`.

Every existing assertion on `unresolved` now compares against the pair shape.
Find them and update each:

```bash
grep -rn "unresolved" tests/engine
```

`["Project"]` becomes `[{ scope: "this", field: "Project" }]`, and a length
assertion needs no change.

- [ ] **Step 4: Thread it through `runStream`**

In `src/engine/run.ts`:

```ts
export type StreamNotice =
  | { kind: "unresolvedRef"; scope: RefScope; fields: string[] }
```

```ts
export interface StreamOptions {
  /** Formatting locale for group headers and text sorting. Defaults to the runtime's. */
  locale?: string;
  /** The note holding the block, which `this.` references are resolved against. */
  host?: NoteMeta | null;
  /** The note the workspace is on, which `active.` references are resolved against. */
  active?: NoteMeta | null;
}
```

```ts
  const { query: concrete, unresolved } = resolveRefs(query, {
    host: options.host ?? null,
    active: options.active ?? null,
  });
```

And the notice. `assertScope` guarantees one scope per query, so grouping is a
single bucket in practice; building it from what actually went unresolved keeps
that a fact rather than an assumption:

```ts
  if (unresolved.length > 0) {
    // Grouped by scope rather than assumed to be one: `assertScope` does
    // enforce a single scope per query today, but a notice that quietly
    // mislabels half its fields if that ever changes is not worth the one
    // saved line.
    for (const scope of REF_SCOPES) {
      const fields = unresolved.filter((entry) => entry.scope === scope).map((e) => e.field);
      if (fields.length > 0) {
        notices.push({ kind: "unresolvedRef", scope, fields });
      }
    }
  }
```

Import `REF_SCOPES` and `type RefScope` from `../query/types`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: the engine and query suites PASS. `tests/view/this-refs.test.ts` may
fail on the notice shape — Task 8 fixes the view's wording. If it fails only
there, continue.

- [ ] **Step 6: Type-check and commit Tasks 5 and 6 together**

```bash
npm run build
git add src/engine/refs.ts src/engine/run.ts tests/engine/refs.test.ts tests/engine/run.test.ts
git commit -m "feat: resolve references against a host-and-active context"
```

---

## Task 7: Drop a path from the pool before filtering

**Files:**
- Modify: `src/engine/run.ts`
- Test: `tests/engine/run.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/engine/run.test.ts`:

```ts
describe("runStream — excludePath", () => {
  const notes = [
    note({ path: "a.md", frontmatter: { Project: "Alpha" } }),
    note({ path: "b.md", frontmatter: { Project: "Alpha" } }),
    note({ path: "c.md", frontmatter: { Project: "Alpha" } }),
  ];
  const query = parseQuery("where:\n  Project: Alpha\nsort: file.path asc");

  it("leaves the named note out of the results", () => {
    const result = runStream(notes, query, new Date(), { excludePath: "b.md" });
    expect(result.groups.flatMap((group) => group.notes.map((n) => n.path))).toEqual([
      "a.md",
      "c.md",
    ]);
  });

  it("counts only what is left, so truncation stays honest", () => {
    const result = runStream(notes, { ...query, limit: 2 }, new Date(), {
      excludePath: "b.md",
    });
    expect(result.matched).toBe(2);
    expect(result.shown).toBe(2);
    expect(result.notices).not.toContainEqual(
      expect.objectContaining({ kind: "truncated" }),
    );
  });

  it("is a no-op for a path no note has", () => {
    const result = runStream(notes, query, new Date(), { excludePath: "nowhere.md" });
    expect(result.matched).toBe(3);
  });

  it("excludes nothing when the option is left out", () => {
    expect(runStream(notes, query, new Date()).matched).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/engine/run.test.ts -t "excludePath"`
Expected: FAIL — `excludePath` is not a known option.

- [ ] **Step 3: Implement it**

In `src/engine/run.ts`, add to `StreamOptions`:

```ts
  /**
   * A path to drop from the pool before anything reads it. The sidebar passes
   * the note it is following: `Project: active.Project` matches that note by
   * construction, and a related-notes feed whose top result is the note already
   * on screen is noise.
   */
  excludePath?: string;
```

At the top of `runStream`, before `resolveRefs`:

```ts
  // Before the filter, not after the limit. Removing it later would leave
  // `matched` and the `truncated` notice counting a note the reader is never
  // shown — "Showing 20 of 21" over twenty results.
  const pool =
    options.excludePath === undefined
      ? notes
      : notes.filter((candidate) => candidate.path !== options.excludePath);
```

Then replace both `filterNotes(notes, ...)` calls with `filterNotes(pool, ...)`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engine/run.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/engine/run.ts tests/engine/run.test.ts
git commit -m "feat: let a run drop one path from the pool"
```

---

## Task 8: Say which note is missing the property

**Files:**
- Modify: `src/view/StreamChild.ts` (`describeNotice`)
- Test: `tests/view/this-refs.test.ts`

- [ ] **Step 1: Write the failing test**

The view's wording is reached through a rendered block. Add to
`tests/view/this-refs.test.ts` — it already has `noticeText`, `vaultWith`,
`mountPane` and `settle`:

```ts
  test("keeps the host wording for a this. reference", async () => {
    const vault = vaultWith(undefined);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(noticeText(container)).toContain("This note has no usable Project");
  });
```

That test is a regression guard and should pass before and after this task:
the `this.` wording does not change.

**The active wording has no test here, on purpose.** `describeNotice` is private
to `StreamChild` and reaches the screen only through a rendered stream, and the
only context that renders an `active` scope is the sidebar, which does not exist
yet. Task 14's sidebar test — "names the followed note when it has no usable
property" — is what drives this branch, and it will fail if this step is
skipped. Add the branch now so that task has one thing to prove, not two.

- [ ] **Step 2: Add the branch**

In `src/view/StreamChild.ts`, replace the `unresolvedRef` case:

```ts
    case "unresolvedRef": {
      // "no `Project`" and "add it" are both false for `Project: []` or
      // `Project: {}` — the property is right there, just empty or shaped
      // wrong to match on. "No usable" and "give it a value" hold for that
      // case and for a genuinely absent property alike: either way, there is
      // nothing on the note yet for the reference to match against.
      const fields = notice.fields.map((field) => `\`${field}\``).join(" or ");
      // Which note, in the reader's terms. In a block the note is the one they
      // are editing; in the sidebar it is the one they are looking at, which
      // is a different note from the one holding the query — "this note" there
      // would send them to the settings tab.
      const subject =
        notice.scope === "this" ? "This note has" : "The note you are looking at has";
      return `${subject} no usable ${fields}, so this stream matches nothing. Give it a value in the note's properties.`;
    }
```

- [ ] **Step 3: Run the view suite**

Run: `npx vitest run tests/view`
Expected: PASS — the `this.` wording is unchanged.

- [ ] **Step 4: Commit**

```bash
npm run build
git add src/view/StreamChild.ts tests/view/this-refs.test.ts
git commit -m "feat: name the right note in an unresolved-reference notice"
```

---

## Task 9: Rename `hostNote` to `noteAt`

The sidebar reads the *active* note by path through the same function. Leaving
it named `hostNote` would make every sidebar call site read as a lie.

**Files:**
- Modify: `src/obsidian/adapter.ts`, `src/view/StreamChild.ts`
- Test: `tests/obsidian/adapter.test.ts`

- [ ] **Step 1: Rename in the adapter**

In `src/obsidian/adapter.ts`, rename the export and retitle its comment:

```ts
/**
 * The note at a path, as plain data, or null when the path names nothing.
 *
 * Used for both reference scopes: the note holding a block, and the note the
 * workspace is on. A code block processor is handed a `sourcePath` that can be
 * empty in contexts with no file behind them, and a note can be deleted while
 * its block is still on screen, so both are ordinary, not exceptional. The
 * empty-path check stays explicit rather than left to `getFileByPath`: that
 * method is a lookup against an internal path map that no file is ever keyed by
 * `""` in, but that is Obsidian's unspecified behavior to keep, not this
 * function's to depend on.
 */
export function noteAt(app: App, path: string): NoteMeta | null {
  if (path === "") {
    return null;
  }
  const file = app.vault.getFileByPath(path);
  return file === null ? null : toNoteMeta(file, app.metadataCache.getFileCache(file));
}
```

- [ ] **Step 2: Update every caller**

```bash
grep -rn "hostNote" src tests
```

Expect `src/view/StreamChild.ts` (import and one call) and
`tests/obsidian/adapter.test.ts`. Rename in each.

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm run build
git add src/obsidian/adapter.ts src/view/StreamChild.ts tests/obsidian/adapter.test.ts
git commit -m "refactor: rename hostNote to noteAt, now both scopes read it"
```

---

## Task 10: Give `StreamChild` an injected context

**Files:**
- Modify: `src/view/StreamChild.ts`, `src/main.ts`
- Test: every file under `tests/view/` constructs a `StreamChild`

- [ ] **Step 1: Write the failing test**

Add to `tests/view/this-refs.test.ts`:

```ts
  test("refuses an active. reference in a block, naming the fix", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, "where:\n  Project: active.Project\n", {
      sourcePath: "Host.md",
      scope: "this",
      refs: () => ({ host: null, active: null }),
      excludePath: null,
    });
    child.load();
    await settle();

    expect(container.querySelector(".ss-error-message")?.textContent).toContain(
      "cannot use `active.Project` here",
    );
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/view/this-refs.test.ts -t "refuses an active"`
Expected: FAIL — the fourth argument is a string, so this does not compile.

- [ ] **Step 3: Define the context and take it**

In `src/view/StreamChild.ts`, add near the top:

```ts
/**
 * Everything a stream needs from the place it is rendered.
 *
 * `refs` is a function, not a value: the notes are read on every refresh, not
 * cached. Editing the followed note's properties is exactly the event this
 * plugin exists to follow, and a snapshot taken at construction would leave a
 * sidebar answering for a property that changed an hour ago.
 */
export interface StreamContext {
  /** Path used to resolve relative links in rendered previews. */
  sourcePath: string;
  /** The reference scope this context can answer. Any other is refused. */
  scope: RefScope;
  /** The notes references resolve against, read fresh on every refresh. */
  refs: () => RefContext;
  /** A path to drop from the pool before filtering, or null. */
  excludePath: string | null;
}
```

Replace the `sourcePath` field and the constructor:

```ts
  private readonly context: StreamContext;
```

```ts
  constructor(containerEl: HTMLElement, app: App, source: string, context: StreamContext) {
    super(containerEl);
    this.app = app;
    this.context = context;
    try {
      const query = parseQuery(source);
      // Right after parsing, before anything can run it. A block holding
      // `active.` and a sidebar holding `this.` both name a note their context
      // has no way to read, and resolving them anyway would report the note
      // "has no usable Project" — blaming the reader's frontmatter for the
      // plugin's own inability to answer.
      assertScope(query, context.scope);
      this.query = query;
    } catch (error) {
      this.failure = error;
    }
  }
```

Change `compute()`:

```ts
  private compute(): StreamResult {
    if (this.query === null) {
      throw new Error("Simple Streams: no query to run");
    }
    // Read per refresh, not cached: editing the followed note's properties is
    // exactly the event this feature exists to follow, and `StreamRegistry`
    // already refreshes on the `metadataCache` change that carries it.
    const refs = this.context.refs();
    return runStream(collectNotes(this.app), this.query, new Date(), {
      host: refs.host,
      active: refs.active,
      excludePath: this.context.excludePath ?? undefined,
    });
  }
```

And the one `sourcePath` use in `drawRows`:

```ts
        sourcePath: this.context.sourcePath,
```

Update the imports: drop `noteAt` (main.ts owns that call now), add
`assertScope` from `../query/scopes`, `type RefScope` from `../query/types`, and
`type RefContext` from `../engine/refs`.

- [ ] **Step 4: Teach `scrollerEl` about the sidebar**

A sidebar has neither `.cm-scroller` nor `.markdown-preview-view`, so the paging
observer would fall back to the viewport and preload nothing. In
`src/view/StreamChild.ts`:

```ts
  private scrollerEl(): HTMLElement | null {
    // `.ss-sidebar-body` is this plugin's own scroller, added for the sidebar,
    // where neither of the editor's scrollers exists. Without it the observer
    // roots on the viewport, the sidebar's own overflow clips the sentinel
    // first, and the 200px preload buffer does nothing.
    return this.containerEl.closest<HTMLElement>(
      ".markdown-preview-view, .cm-scroller, .ss-sidebar-body",
    );
  }
```

- [ ] **Step 5: Update the block call site**

In `src/main.ts`:

```ts
    this.registerMarkdownCodeBlockProcessor("stream", (source, el, ctx) => {
      const child = new StreamChild(el, this.app, source, {
        sourcePath: ctx.sourcePath,
        scope: "this",
        refs: () => ({ host: noteAt(this.app, ctx.sourcePath), active: null }),
        excludePath: null,
      });
      // Component.register runs on unload, so a closed note stops being refreshed.
      child.register(() => registry.unregister(child));
      registry.register(child);
      ctx.addChild(child);
    });
```

with `import { noteAt } from "./obsidian/adapter";` at the top.

- [ ] **Step 6: Update every test construction site**

```bash
grep -rn "new StreamChild(" tests
```

Each becomes the four-argument form. A block-scoped helper in
`tests/view/harness.ts` keeps them short — add it:

```ts
import type { StreamContext } from "../../src/view/StreamChild";
import { noteAt } from "../../src/obsidian/adapter";
import type { App } from "obsidian";

/** The context a code block is rendered in, for tests that only care about one. */
export function blockContext(app: App, sourcePath: string): StreamContext {
  return {
    sourcePath,
    scope: "this",
    refs: () => ({ host: noteAt(app, sourcePath), active: null }),
    excludePath: null,
  };
}
```

Then each site reads `new StreamChild(container, vault.app, SOURCE, blockContext(vault.app, "Host.md"))`.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, every file.

- [ ] **Step 8: Type-check and commit**

```bash
npm run build
git add src/view/StreamChild.ts src/main.ts tests/view
git commit -m "feat: render a stream from an injected context"
```

---

## Task 11: Settings data

**Files:**
- Create: `src/settings.ts`

No test: this file is a type and a constant, and asserting a constant equals
itself tests nothing. Task 16 covers the validation that has behavior.

- [ ] **Step 1: Write it**

Create `src/settings.ts`:

```ts
/** What the plugin persists. One query, for the sidebar. */
export interface SimpleStreamsSettings {
  /** The sidebar's stream query, in the same syntax a `stream` block uses. */
  sidebarQuery: string;
}

/**
 * A query that does something useful the moment the sidebar is opened, rather
 * than an empty box: notes sharing the active note's `Project`, newest first.
 * A vault with no `Project` property gets the unresolved-reference notice,
 * which names the property to add — a better first run than a blank pane with
 * no hint of what to type.
 */
export const DEFAULT_SETTINGS: SimpleStreamsSettings = {
  sidebarQuery: "where:\n  Project: active.Project\nsort: file.mtime desc\ndisplay: preview\n",
};
```

- [ ] **Step 2: Type-check and commit**

```bash
npm run build
git add src/settings.ts
git commit -m "feat: add the settings shape and its default sidebar query"
```

---

## Task 12: Mock the workspace pieces the sidebar needs

**Files:**
- Modify: `tests/mocks/obsidian.ts`
- Create: `tests/fixtures/workspace.ts`

- [ ] **Step 1: Add the view classes to the mock**

Append to `tests/mocks/obsidian.ts`:

```ts
/**
 * A leaf, as much of one as the sidebar view touches: somewhere to hang the
 * app. The real `WorkspaceLeaf` carries the view and the tab chrome; the view
 * under test only ever reads `this.app`, which Obsidian sets from the leaf.
 */
export interface MockLeaf {
  app: unknown;
}

/**
 * Obsidian's ItemView, to the depth the sidebar uses it: a content element to
 * draw into, a leaf, and the Component lifecycle it inherits. `onOpen` and
 * `onClose` are called by Obsidian in production and by the test directly.
 */
export class ItemView extends Component {
  readonly leaf: MockLeaf;
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;
  app: unknown;

  constructor(leaf: MockLeaf) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = document.createElement("div");
    // The real contentEl is `containerEl.children[1]`, after the header.
    this.containerEl.createDiv({ cls: "view-header" });
    this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
  }

  async onOpen(): Promise<void> {}

  async onClose(): Promise<void> {}
}

/**
 * Enough of a MarkdownView for `getActiveViewOfType` and the tracker's
 * `instanceof` check. `file` is the whole payload.
 */
export class MarkdownView extends Component {
  file: { path: string; basename: string; extension: string } | null = null;

  constructor(file: MarkdownView["file"] = null) {
    super();
    this.file = file;
  }
}
```

`ItemView` calls `createDiv`, which the jsdom harness installs — so any test
importing `ItemView` must also import the harness and carry
`// @vitest-environment jsdom`.

- [ ] **Step 2: Write the workspace fixture**

Create `tests/fixtures/workspace.ts`:

```ts
import { MarkdownView } from "../mocks/obsidian";

export interface FakeFile {
  path: string;
  basename: string;
  extension: string;
}

export function file(path: string, extension = "md"): FakeFile {
  const segments = path.split("/");
  return {
    path,
    basename: segments[segments.length - 1].replace(/\.[^.]+$/, ""),
    extension,
  };
}

/**
 * A workspace and a vault that fire the four events the tracker listens to,
 * and answer the three questions it asks. Everything is a plain field a test
 * sets directly, so a test reads as "this is what the workspace looks like
 * now, fire the event".
 */
export class FakeWorkspace {
  /** What `getActiveViewOfType(MarkdownView)` answers. */
  activeView: MarkdownView | null = null;
  /** What `getLeavesOfType("markdown")` answers, as leaves wrapping views. */
  markdownViews: MarkdownView[] = [];
  /** What `getActiveFile()` answers. */
  activeFile: FakeFile | null = null;

  private readonly handlers = new Map<string, Array<() => void>>();

  readonly app: {
    workspace: unknown;
    vault: unknown;
  };

  constructor() {
    this.app = { workspace: this.workspace(), vault: this.vault() };
  }

  /** Fire one event, the way Obsidian would after the state above changed. */
  fire(name: string): void {
    for (const handler of this.handlers.get(name) ?? []) {
      handler();
    }
  }

  /** Put a note on screen and in the open set, and fire the leaf change. */
  open(target: FakeFile): void {
    const view = new MarkdownView(target);
    this.activeView = view;
    this.activeFile = target;
    this.markdownViews = [...this.markdownViews.filter((v) => v.file?.path !== target.path), view];
    this.fire("active-leaf-change");
  }

  /** Move focus off every Markdown view, leaving the open set alone. */
  blur(): void {
    this.activeView = null;
    this.fire("active-leaf-change");
  }

  /** Close a note: out of the open set, and off screen if it was on it. */
  close(path: string): void {
    this.markdownViews = this.markdownViews.filter((view) => view.file?.path !== path);
    if (this.activeView?.file?.path === path) {
      this.activeView = null;
    }
    if (this.activeFile?.path === path) {
      this.activeFile = null;
    }
    this.fire("active-leaf-change");
  }

  private on(name: string, handler: () => void): { name: string } {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
    return { name };
  }

  private workspace(): unknown {
    return {
      on: (name: string, handler: () => void) => this.on(name, handler),
      getActiveViewOfType: (): MarkdownView | null => this.activeView,
      getLeavesOfType: (type: string): Array<{ view: MarkdownView }> =>
        type === "markdown" ? this.markdownViews.map((view) => ({ view })) : [],
      getActiveFile: (): FakeFile | null => this.activeFile,
    };
  }

  private vault(): unknown {
    return {
      on: (name: string, handler: () => void) => this.on(name, handler),
    };
  }
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npm run build
git add tests/mocks/obsidian.ts tests/fixtures/workspace.ts
git commit -m "test: mock the workspace pieces the sidebar needs"
```

---

## Task 13: Track the active note

**Files:**
- Create: `src/obsidian/activeNote.ts`
- Test: `tests/obsidian/active-note.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/obsidian/active-note.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import type { App } from "obsidian";
import { ActiveNoteTracker } from "../../src/obsidian/activeNote";
import { FakeWorkspace, file } from "../fixtures/workspace";

const A = file("Notes/A.md");
const B = file("Notes/B.md");

let workspace: FakeWorkspace;
let followed: Array<string | null>;
let tracker: ActiveNoteTracker;

beforeEach(() => {
  workspace = new FakeWorkspace();
  followed = [];
  tracker = new ActiveNoteTracker(workspace.app as unknown as App, (target) => {
    followed.push(target?.path ?? null);
  });
  tracker.start();
});

describe("ActiveNoteTracker", () => {
  test("follows the note that becomes active", () => {
    workspace.open(A);
    expect(followed).toEqual(["Notes/A.md"]);
    expect(tracker.current()?.path).toBe("Notes/A.md");
  });

  test("follows a move from one note to another", () => {
    workspace.open(A);
    workspace.open(B);
    expect(followed).toEqual(["Notes/A.md", "Notes/B.md"]);
  });

  test("keeps the note when focus leaves every Markdown view", () => {
    workspace.open(A);
    workspace.blur();
    expect(followed).toEqual(["Notes/A.md"]);
    expect(tracker.current()?.path).toBe("Notes/A.md");
  });

  test("keeps the note when a non-Markdown view takes focus", () => {
    workspace.open(A);
    workspace.activeView = null;
    workspace.activeFile = file("Scans/plan.pdf", "pdf");
    workspace.fire("active-leaf-change");
    expect(tracker.current()?.path).toBe("Notes/A.md");
  });

  test("lets go when the followed note is closed", () => {
    workspace.open(A);
    workspace.close("Notes/A.md");
    expect(followed).toEqual(["Notes/A.md", null]);
    expect(tracker.current()).toBeNull();
  });

  test("falls back to the active file when a note is open but unfocused at startup", () => {
    workspace.activeView = null;
    workspace.activeFile = A;
    workspace.fire("active-leaf-change");
    expect(followed).toEqual(["Notes/A.md"]);
  });

  test("ignores a non-Markdown active file in that fallback", () => {
    workspace.activeView = null;
    workspace.activeFile = file("Scans/plan.pdf", "pdf");
    workspace.fire("active-leaf-change");
    expect(followed).toEqual([]);
    expect(tracker.current()).toBeNull();
  });

  test("says nothing when the answer has not changed", () => {
    workspace.open(A);
    workspace.fire("active-leaf-change");
    workspace.fire("file-open");
    workspace.blur();
    expect(followed).toEqual(["Notes/A.md"]);
  });

  test("re-points when the followed note is renamed", () => {
    workspace.open(A);
    // Obsidian renames in place: the same file object, a new path.
    A.path = "Notes/Renamed.md";
    A.basename = "Renamed";
    workspace.fire("rename");
    expect(followed).toEqual(["Notes/A.md", "Notes/Renamed.md"]);
    // Put it back, so the shared fixture does not leak into the next test.
    A.path = "Notes/A.md";
    A.basename = "A";
  });

  test("lets go when the followed note is deleted", () => {
    workspace.open(A);
    workspace.close("Notes/A.md");
    workspace.fire("delete");
    expect(followed).toEqual(["Notes/A.md", null]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/obsidian/active-note.test.ts`
Expected: FAIL — cannot resolve `../../src/obsidian/activeNote`.

- [ ] **Step 3: Write the tracker**

Create `src/obsidian/activeNote.ts`:

```ts
import { MarkdownView, type App, type EventRef, type TFile } from "obsidian";

/** Told the note now followed, or null when none is. */
export type ActiveNoteListener = (file: TFile | null) => void;

/**
 * Which Markdown note the sidebar should answer for.
 *
 * "The active note" sounds like one question and is three, because focus moves
 * to places that are not notes. Clicking into the sidebar to scroll it, or
 * opening a PDF beside a note, both leave `getActiveViewOfType(MarkdownView)`
 * empty — and a sidebar that blanks the moment the reader reaches for it is
 * not a sidebar. So the answer is resolved in three rules, in order:
 *
 * 1. An active `MarkdownView` with a file — follow it.
 * 2. Otherwise, if the followed note is still open somewhere — keep it. This
 *    is the stickiness, and the only rule that makes the other two usable.
 * 3. Otherwise, the workspace's own active file, if it is Markdown. This
 *    covers startup, where a note is restored but focus sits elsewhere.
 *
 * Falling through all three follows nothing.
 */
export class ActiveNoteTracker {
  private readonly app: App;
  private readonly listener: ActiveNoteListener;
  private followed: TFile | null = null;
  /**
   * The path as of the last notification. Compared against instead of the file
   * object, because Obsidian renames in place: after a rename the followed
   * object *is* the current answer and its `path` has already changed, so an
   * identity check would call it unchanged and leave the sidebar rendering
   * previews against a path that no longer exists.
   */
  private followedPath: string | null = null;

  constructor(app: App, listener: ActiveNoteListener) {
    this.app = app;
    this.listener = listener;
  }

  /**
   * Subscribe to what can change the answer. The returned refs should be handed
   * to Plugin.registerEvent so they unsubscribe with the plugin.
   *
   * `rename` and `delete` are vault events rather than workspace ones because
   * neither moves focus: renaming the open note fires no leaf change, and the
   * sidebar would keep naming the old title until the reader clicked away.
   */
  start(): EventRef[] {
    return [
      this.app.workspace.on("active-leaf-change", () => this.sync()),
      this.app.workspace.on("file-open", () => this.sync()),
      this.app.vault.on("rename", () => this.sync()),
      this.app.vault.on("delete", () => this.sync()),
    ];
  }

  /** The note currently followed, or null. */
  current(): TFile | null {
    return this.followed;
  }

  /**
   * Re-resolve, and tell the listener only when the answer actually moved.
   *
   * The guard is what keeps the sidebar still: `active-leaf-change` fires on
   * every click into any pane, and rebuilding the feed on each one would throw
   * away the reader's scroll position several times a minute for a result that
   * is identical.
   */
  sync(): void {
    const next = this.resolve();
    const nextPath = next?.path ?? null;
    if (nextPath === this.followedPath) {
      return;
    }
    this.followed = next;
    this.followedPath = nextPath;
    this.listener(next);
  }

  private resolve(): TFile | null {
    const onScreen = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
    if (onScreen !== null) {
      return onScreen;
    }
    if (this.followed !== null && this.isOpen(this.followed)) {
      return this.followed;
    }
    const active = this.app.workspace.getActiveFile();
    // `extension`, not `instanceof TFile`: a folder never reaches here, and
    // asking for the extension is the same question every other Markdown check
    // in this plugin asks.
    return active !== null && active.extension === "md" ? active : null;
  }

  private isOpen(file: TFile): boolean {
    return this.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/obsidian/active-note.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npm run build
git add src/obsidian/activeNote.ts tests/obsidian/active-note.test.ts
git commit -m "feat: track which Markdown note the workspace is on"
```

---

## Task 14: The sidebar view

**Files:**
- Create: `src/view/StreamSidebarView.ts`
- Test: `tests/view/sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/view/sidebar.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TFile } from "obsidian";
import { resetObsidianMock } from "../mocks/obsidian";
import { FakeIntersectionObserver, FakeVault, drawnTitles, settle } from "./harness";
import { StreamSidebarView } from "../../src/view/StreamSidebarView";
import { StreamRegistry } from "../../src/obsidian/registry";

const QUERY = "sort: file.path asc\ndisplay: title\nwhere:\n  Project: active.Project\n";

function vaultWith(activeFrontmatter: Record<string, unknown> | undefined): FakeVault {
  return new FakeVault([
    { path: "Active.md", frontmatter: activeFrontmatter },
    { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    { path: "Notes/c.md", frontmatter: { Project: "Alpha" } },
  ]);
}

function fileAt(vault: FakeVault, path: string): TFile {
  const found = vault.app.vault.getFileByPath(path);
  if (found === null) {
    throw new Error(`no file at ${path}`);
  }
  return found;
}

function mount(vault: FakeVault, query = QUERY): StreamSidebarView {
  const view = new StreamSidebarView({ app: vault.app } as never, {
    registry: new StreamRegistry(vault.app),
    query: () => query,
  });
  document.body.appendChild(view.containerEl);
  view.load();
  return view;
}

function headerText(view: StreamSidebarView): string {
  return view.contentEl.querySelector(".ss-sidebar-header")?.textContent ?? "";
}

function noticeText(view: StreamSidebarView): string | null {
  return view.contentEl.querySelector(".ss-notice")?.textContent ?? null;
}

let view: StreamSidebarView | null = null;

beforeEach(() => {
  resetObsidianMock();
  FakeIntersectionObserver.reset();
  document.body.innerHTML = "";
});

afterEach(() => {
  view?.unload();
  view = null;
});

describe("the sidebar", () => {
  test("says so when no note is being followed", async () => {
    view = mount(vaultWith({ Project: "Alpha" }));
    await view.onOpen();
    await settle();

    expect(view.contentEl.querySelector(".ss-sidebar-empty")?.textContent).toBe(
      "Open a note to see related notes.",
    );
    expect(headerText(view)).toBe("");
  });

  test("shows the notes sharing the followed note's project", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a", "c"]);
    expect(headerText(view)).toBe("Following: Active");
  });

  test("leaves the followed note out of its own feed", async () => {
    const vault = new FakeVault([
      { path: "Active.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
    ]);
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual(["a"]);
  });

  test("follows a move to another note", async () => {
    const vault = new FakeVault([
      { path: "Alpha.md", frontmatter: { Project: "Alpha" } },
      { path: "Beta.md", frontmatter: { Project: "Beta" } },
      { path: "Notes/a.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/b.md", frontmatter: { Project: "Beta" } },
    ]);
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Alpha.md"));
    await settle();
    expect(drawnTitles(view.contentEl)).toEqual(["a"]);

    view.follow(fileAt(vault, "Beta.md"));
    await settle();
    expect(drawnTitles(view.contentEl)).toEqual(["b"]);
    expect(headerText(view)).toBe("Following: Beta");
  });

  test("goes back to the empty state when nothing is followed any more", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    view.follow(null);
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual([]);
    expect(view.contentEl.querySelector(".ss-sidebar-empty")).not.toBeNull();
  });

  test("names the followed note when it has no usable property", async () => {
    const vault = vaultWith(undefined);
    view = mount(vault);
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(drawnTitles(view.contentEl)).toEqual([]);
    expect(noticeText(view)).toContain("The note you are looking at has no usable Project");
  });

  test("refuses a this. reference, naming the fix", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault, "where:\n  Project: this.Project\n");
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(view.contentEl.querySelector(".ss-error-message")?.textContent).toContain(
      "cannot use `this.Project` here",
    );
  });

  test("shows a parse error rather than an empty pane", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    view = mount(vault, "sort: ???\n");
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    expect(view.contentEl.querySelector(".ss-error")).not.toBeNull();
  });

  test("leaves nothing registered once it unloads", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const registry = new StreamRegistry(vault.app);
    view = new StreamSidebarView({ app: vault.app } as never, {
      registry,
      query: () => QUERY,
    });
    document.body.appendChild(view.containerEl);
    view.load();
    await view.onOpen();
    view.follow(fileAt(vault, "Active.md"));
    await settle();

    const before = vault.scans;
    view.unload();
    view = null;
    await registry.flushNow();

    expect(vault.scans).toBe(before);
  });
});
```

The last test needs a way to make the registry flush without waiting 300 ms.
Add this to `src/obsidian/registry.ts`, beside `stop()`:

```ts
  /** Run a pending refresh now. For tests, and for callers that cannot wait. */
  async flushNow(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/view/sidebar.test.ts`
Expected: FAIL — cannot resolve `../../src/view/StreamSidebarView`.

- [ ] **Step 3: Write the view**

Create `src/view/StreamSidebarView.ts`:

```ts
import { ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import { StreamChild } from "./StreamChild";
import { noteAt } from "../obsidian/adapter";
import type { StreamRegistry } from "../obsidian/registry";

export const SIDEBAR_VIEW_TYPE = "simple-streams-sidebar";

/** What the sidebar needs from the plugin around it. */
export interface SidebarDeps {
  registry: StreamRegistry;
  /** The query text, read fresh on every rebuild so a settings edit lands. */
  query: () => string;
}

/**
 * A stream that follows the note you are looking at.
 *
 * The view owns exactly one `StreamChild` and throws it away whenever the
 * followed note changes. Re-pointing an existing child instead would mean
 * resetting its paging cursor, its render generation and its result signature
 * from outside — the three fields whose invariants that file spends most of its
 * length protecting. A rebuild gets all three right by construction, through
 * the unload path the block tests already cover.
 */
export class StreamSidebarView extends ItemView {
  private readonly deps: SidebarDeps;
  private headerEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private child: StreamChild | null = null;
  private followed: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, deps: SidebarDeps) {
    super(leaf);
    this.deps = deps;
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Simple Streams";
  }

  getIcon(): string {
    return "layers";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("ss-sidebar");
    this.headerEl = this.contentEl.createDiv({ cls: "ss-sidebar-header" });
    // The scroller. `StreamChild.scrollerEl` looks for this class by name, so
    // the paging observer roots on the element that actually scrolls here.
    this.bodyEl = this.contentEl.createDiv({ cls: "ss-sidebar-body" });
    this.rebuild();
  }

  async onClose(): Promise<void> {
    this.teardown();
  }

  onunload(): void {
    // Not only `onClose`. A plugin unload drops the view without closing the
    // leaf, and a child left in the registry would be refreshed forever.
    this.teardown();
  }

  /** Point at a note, or at nothing, and rebuild. */
  follow(file: TFile | null): void {
    this.followed = file;
    this.rebuild();
  }

  /** Rebuild with the current query. Called on a settings change too. */
  rebuild(): void {
    const body = this.bodyEl;
    const header = this.headerEl;
    // `onOpen` has not run yet — Obsidian constructs a view before opening it,
    // and the tracker can answer in that gap. `follow` has already recorded the
    // note, so the `rebuild` at the end of `onOpen` draws it.
    if (body === null || header === null) {
      return;
    }

    this.teardown();
    body.empty();

    const file = this.followed;
    if (file === null) {
      header.setText("");
      body.createDiv({
        cls: "ss-sidebar-empty",
        text: "Open a note to see related notes.",
      });
      return;
    }

    header.setText(`Following: ${file.basename}`);

    const child = new StreamChild(body, this.app, this.deps.query(), {
      // The followed note's path, so a preview's relative links resolve the way
      // they would in that note rather than against the sidebar's nowhere.
      sourcePath: file.path,
      scope: "active",
      // Re-read per refresh, never captured: an edit to this note's properties
      // is the event the whole sidebar exists to follow.
      refs: () => ({ host: null, active: noteAt(this.app, file.path) }),
      excludePath: file.path,
    });
    child.register(() => this.deps.registry.unregister(child));
    this.deps.registry.register(child);
    this.addChild(child);
    this.child = child;
  }

  private teardown(): void {
    if (this.child !== null) {
      // `removeChild` unloads it, which fires the `register` callback above and
      // takes it out of the registry. Dropping the reference without unloading
      // would leave a stream refreshing into detached DOM for the life of the
      // session.
      this.removeChild(this.child);
      this.child = null;
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/view/sidebar.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check and commit**

```bash
npm run build
git add src/view/StreamSidebarView.ts src/obsidian/registry.ts tests/view/sidebar.test.ts
git commit -m "feat: add a sidebar view that follows one note"
```

---

## Task 15: Wire it into the plugin

**Files:**
- Modify: `src/main.ts`

No new test: this file is composition, and every piece it composes is covered.
Task 18's manual pass is what exercises it.

- [ ] **Step 1: Rewrite `src/main.ts`**

```ts
import { Plugin, type WorkspaceLeaf } from "obsidian";
import { ActiveNoteTracker } from "./obsidian/activeNote";
import { noteAt } from "./obsidian/adapter";
import { StreamRegistry } from "./obsidian/registry";
import { DEFAULT_SETTINGS, type SimpleStreamsSettings } from "./settings";
import { StreamChild } from "./view/StreamChild";
import { SIDEBAR_VIEW_TYPE, StreamSidebarView } from "./view/StreamSidebarView";

export default class SimpleStreamsPlugin extends Plugin {
  settings: SimpleStreamsSettings = { ...DEFAULT_SETTINGS };

  private registry: StreamRegistry | null = null;
  private tracker: ActiveNoteTracker | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    const registry = new StreamRegistry(this.app);
    this.registry = registry;
    for (const ref of registry.start()) {
      this.registerEvent(ref);
    }

    this.registerMarkdownCodeBlockProcessor("stream", (source, el, ctx) => {
      const child = new StreamChild(el, this.app, source, {
        sourcePath: ctx.sourcePath,
        scope: "this",
        refs: () => ({ host: noteAt(this.app, ctx.sourcePath), active: null }),
        excludePath: null,
      });
      // Component.register runs on unload, so a closed note stops being refreshed.
      child.register(() => registry.unregister(child));
      registry.register(child);
      ctx.addChild(child);
    });

    this.registerView(
      SIDEBAR_VIEW_TYPE,
      (leaf) =>
        new StreamSidebarView(leaf, {
          registry,
          // A function, not the string: the sidebar rebuilds on a settings
          // change and must read what the setting says then, not at load.
          query: () => this.settings.sidebarQuery,
        }),
    );

    const tracker = new ActiveNoteTracker(this.app, (file) => {
      for (const view of this.sidebars()) {
        view.follow(file);
      }
    });
    this.tracker = tracker;
    for (const ref of tracker.start()) {
      this.registerEvent(ref);
    }
    // Once the workspace has restored its leaves. Asked any earlier, every rule
    // in the tracker answers "nothing open" and the sidebar opens blank beside
    // a note that is plainly on screen.
    this.app.workspace.onLayoutReady(() => tracker.sync());

    this.addRibbonIcon("layers", "Open Simple Streams sidebar", () => {
      void this.openSidebar();
    });
    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      callback: () => {
        void this.openSidebar();
      },
    });
  }

  onunload(): void {
    this.registry?.stop();
    this.registry = null;
    this.tracker = null;
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as object | null) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Redraw every open sidebar with whatever the settings now say. */
  rebuildSidebars(): void {
    for (const view of this.sidebars()) {
      view.rebuild();
    }
  }

  private sidebars(): StreamSidebarView[] {
    return this.app.workspace
      .getLeavesOfType(SIDEBAR_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .filter((view): view is StreamSidebarView => view instanceof StreamSidebarView);
  }

  /** Reveal the sidebar, opening it in the right split if it is not there. */
  private async openSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    const leaf: WorkspaceLeaf | null =
      existing[0] ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) {
      return;
    }
    await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
    // Point it at whatever is active before revealing, so it opens with
    // results rather than the empty state and a flicker.
    const view = leaf.view;
    if (view instanceof StreamSidebarView) {
      view.follow(this.tracker?.current() ?? null);
    }
    await this.app.workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: no errors. If `revealLeaf` is typed as returning `void` in the
installed `obsidian` version, drop the `await` on it.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: register the sidebar, its command and its ribbon icon"
```

---

## Task 16: The settings tab

**Files:**
- Create: `src/view/SettingsTab.ts`
- Modify: `src/view/errorEl.ts` (export the message formatter), `src/main.ts`
- Test: `tests/view/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/view/settings.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "./harness";
import { validateSidebarQuery } from "../../src/view/SettingsTab";

describe("validateSidebarQuery", () => {
  it("accepts the default query", () => {
    expect(
      validateSidebarQuery(
        "where:\n  Project: active.Project\nsort: file.mtime desc\ndisplay: preview\n",
      ),
    ).toBeNull();
  });

  it("accepts an empty query, which means every note", () => {
    expect(validateSidebarQuery("")).toBeNull();
  });

  it("reports a parse error, with its line", () => {
    expect(validateSidebarQuery("limit: lots")).toMatch(/limit/);
  });

  it("reports a this. reference as the wrong scope here", () => {
    expect(validateSidebarQuery("where:\n  Project: this.Project")).toMatch(
      /cannot use `this.Project` here/,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/view/settings.test.ts`
Expected: FAIL — cannot resolve `../../src/view/SettingsTab`.

- [ ] **Step 3: Export the message formatter**

In `src/view/errorEl.ts`, rename `messageOf` to an exported `errorMessage` and
update its one caller in that file:

```ts
/** One line describing a failure, with a query's line number when it has one. */
export function errorMessage(error: unknown): string {
  if (error instanceof QueryError) {
    return error.line === undefined ? error.message : `Line ${error.line}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Write the tab**

Create `src/view/SettingsTab.ts`:

```ts
import { PluginSettingTab, Setting, type App } from "obsidian";
import type SimpleStreamsPlugin from "../main";
import { parseQuery } from "../query/parse";
import { assertScope } from "../query/scopes";
import { errorMessage } from "./errorEl";
import { DEBOUNCE_MS } from "../obsidian/registry";

/**
 * What is wrong with a sidebar query, or null when nothing is.
 *
 * Pure, and the same two gates the sidebar itself runs, so the message under
 * the field is the message in the pane rather than a second opinion about it.
 */
export function validateSidebarQuery(source: string): string | null {
  try {
    assertScope(parseQuery(source), "active");
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

export class SimpleStreamsSettingTab extends PluginSettingTab {
  private readonly plugin: SimpleStreamsPlugin;
  private timer: number | null = null;

  constructor(app: App, plugin: SimpleStreamsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    let errorEl: HTMLElement | null = null;

    new Setting(this.containerEl)
      .setName("Sidebar query")
      .setDesc(
        "The stream the sidebar shows, in the same syntax a `stream` block uses. Use active.Property to name a property of the note you are looking at.",
      )
      .addTextArea((area) => {
        area.setValue(this.plugin.settings.sidebarQuery);
        area.inputEl.rows = 10;
        area.inputEl.addClass("ss-settings-query");
        area.onChange((value) => {
          // Saved on every keystroke, as an Obsidian setting normally is. A
          // query that does not parse still saves: refusing to store what the
          // reader is halfway through typing locks them out of the field.
          this.plugin.settings.sidebarQuery = value;
          void this.plugin.saveSettings();

          const problem = validateSidebarQuery(value);
          if (errorEl !== null) {
            errorEl.setText(problem ?? "");
            errorEl.toggleClass("ss-settings-error", problem !== null);
          }

          // Debounced on the registry's own interval. Rebuilding per keystroke
          // re-scans the whole vault for every character of `active.Project`
          // and flickers an error box through every prefix of a word still
          // being typed.
          this.schedule();
        });
      });

    errorEl = this.containerEl.createDiv();
    const initial = validateSidebarQuery(this.plugin.settings.sidebarQuery);
    errorEl.setText(initial ?? "");
    errorEl.toggleClass("ss-settings-error", initial !== null);
  }

  hide(): void {
    // A tab can close mid-debounce, and the edit still has to land.
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
      this.plugin.rebuildSidebars();
    }
  }

  private schedule(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.plugin.rebuildSidebars();
    }, DEBOUNCE_MS);
  }
}
```

- [ ] **Step 5: Register the tab**

In `src/main.ts`, add the import and one line at the end of `onload`:

```ts
import { SimpleStreamsSettingTab } from "./view/SettingsTab";
```

```ts
    this.addSettingTab(new SimpleStreamsSettingTab(this.app, this));
```

- [ ] **Step 6: Add the mock classes the test needs**

`tests/view/settings.test.ts` imports `SettingsTab.ts`, which imports
`PluginSettingTab` and `Setting` from obsidian. Append stubs to
`tests/mocks/obsidian.ts` — they are never exercised by the test, only resolved:

```ts
/** Resolved, never exercised: the settings test calls only the pure validator. */
export class PluginSettingTab {
  readonly app: unknown;
  readonly containerEl: HTMLElement;

  constructor(app: unknown, _plugin: unknown) {
    this.app = app;
    this.containerEl = document.createElement("div");
  }

  display(): void {}

  hide(): void {}
}

export class Setting {
  constructor(readonly containerEl: HTMLElement) {}
  setName(_name: string): this {
    return this;
  }
  setDesc(_desc: string): this {
    return this;
  }
  addTextArea(_callback: (area: unknown) => void): this {
    return this;
  }
}
```

`PluginSettingTab`'s constructor calls `document.createElement`, so this test
file needs jsdom — it already declares it.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Type-check and commit**

```bash
npm run build
git add src/view/SettingsTab.ts src/view/errorEl.ts src/main.ts tests/mocks/obsidian.ts tests/view/settings.test.ts
git commit -m "feat: add a settings tab for the sidebar query"
```

---

## Task 17: Styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append the sidebar rules**

```css
/*
 * The sidebar. `.ss-sidebar-body` is the scroller — `StreamChild.scrollerEl`
 * looks for this class by name so the paging observer roots on the element
 * that actually scrolls, rather than falling back to the viewport and
 * preloading nothing.
 */
.ss-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
}

.ss-sidebar-header {
  flex: 0 0 auto;
  padding: var(--size-4-2) var(--size-4-3);
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  /* One line, whatever the note is called: a long title must not push the
     results down or wrap the pane into a second column of chrome. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Nothing followed, so nothing to say — and no empty bordered strip either. */
.ss-sidebar-header:empty {
  display: none;
}

.ss-sidebar-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--size-4-2) var(--size-4-3);
}

.ss-sidebar-empty {
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}

.ss-settings-query {
  width: 100%;
  min-height: 8em;
  font-family: var(--font-monospace, monospace);
}

.ss-settings-error {
  margin-top: var(--size-2-2);
  color: var(--text-error);
  font-size: var(--font-ui-smaller);
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: lay out the sidebar and its settings field"
```

---

## Task 18: Documentation

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `docs/manual-testing.md`

- [ ] **Step 1: Add the README section**

After the `this.` references section, add:

````markdown
## The sidebar

Simple Streams can also run one stream in a sidebar that follows whichever note
you are looking at. Open it from the ribbon icon, or from the command palette
with **Simple Streams: Open sidebar**.

Its query lives in **Settings → Simple Streams → Sidebar query**, and it is the
same syntax a `stream` block uses, with one addition: `active.Property` names a
property of the note you are currently on.

```yaml
where:
  Project: active.Project
sort: file.mtime desc
display: preview
```

Open a project note and the sidebar lists that project's notes; move to a client
note and it lists that client's. Nothing has to be added to the notes
themselves.

`active.file.name`, `active.file.path`, `active.file.ctime` and
`active.file.mtime` work too, as do the link spellings — `"[[active.Project]]"`
for vaults that store relationships as links.

**`this.` and `active.` are not interchangeable.** `this.` names the note
holding a stream block, so it works in a block and not in the sidebar.
`active.` names the note you are looking at, so it works in the sidebar and not
in a block — a block's results must not change depending on which pane has
focus. Writing either one in the wrong place is an error that names the spelling
to use instead.

The sidebar keeps following the last Markdown note when you click into the
sidebar itself or open a PDF, and leaves the followed note out of its own
results.
````

- [ ] **Step 2: Add the changelog entry**

At the top of `CHANGELOG.md`, under a new `## [Unreleased]` heading:

```markdown
### Added

- A sidebar view that follows the active Markdown note, opened from the ribbon
  or the **Simple Streams: Open sidebar** command. Its query lives in settings.
- `active.Property` references, naming a property of the note you are looking
  at. They work in the sidebar; `this.Property` continues to name the note
  holding a stream block, and works in a block. Either one in the wrong place is
  an error naming the spelling to use instead.
- The sidebar leaves the note it is following out of its own results.
```

- [ ] **Step 3: Add the manual pass**

Append to `docs/manual-testing.md`:

````markdown
## The sidebar

Set the sidebar query to:

```yaml
where:
  Project: active.Project
sort: file.mtime desc
display: preview
```

1. **Follows.** Open a note with `Project: Alpha`. Open the sidebar. It lists the
   other Alpha notes, header reads `Following: <that note>`, and the note itself
   is not in the list.
2. **Moves.** Open a note with `Project: Beta`. The list and the header both
   change.
3. **Sticks on focus.** Click into the sidebar and scroll it. The list does not
   change or reset. Open a PDF. Still unchanged.
4. **Sticks across panes.** Split the pane and click between two notes. The
   sidebar follows each click.
5. **Empties.** Close every note. The sidebar reads "Open a note to see related
   notes."
6. **Follows an edit.** With a note followed, change its `Project` in the
   Properties panel. Within a moment the list changes to the new project.
7. **Renames.** Rename the followed note. The header shows the new title and the
   list is unchanged.
8. **Deletes.** Delete the followed note. The sidebar falls back to another open
   note, or to the empty state.
9. **Says what is missing.** Open a note with no `Project`. The sidebar shows
   "The note you are looking at has no usable `Project`…".
10. **Refuses the wrong scope.** Put `Project: this.Project` in the sidebar
    query — the pane shows an error naming `active.Project`. Put
    `Project: active.Project` in a `stream` block in a note — the block shows an
    error naming `this.Project`.
11. **Settings do not flicker.** Type a query slowly in settings. The error line
    under the field updates as you type; the sidebar redraws only once you pause.
12. **Pages.** Point it at a project with more than 20 notes and scroll the
    sidebar to the bottom. More load, and they load before you reach the end.
````

- [ ] **Step 4: Run everything one last time**

```bash
npm test && npm run build && npm run check:floor
```

Expected: all tests pass, no type errors, the minimum app version check passes.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md docs/manual-testing.md
git commit -m "docs: document the sidebar and active. references"
```

---

## Done when

- `npm test` passes, including the new `scopes`, `active-note`, `sidebar` and
  `settings` suites.
- `npm run build` type-checks and bundles.
- The manual pass in Task 18 has been walked in a real vault.
