# Wikilink property values — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match frontmatter property values as the notes they name, so `[[My Project]]`, `[[My Project#Goals]]`, `[[My Project|MP]]` and `My Project` all match each other, and accept `[[this.<field>]]` as a `where` value.

**Architecture:** One new pure module, `src/engine/links.ts`, reduces a whole wikilink to the note it names. `src/engine/filter.ts` runs both sides of every text comparison through it, which is the load-bearing change. On top of that, `src/query/parse.ts` learns a second spelling of a `this.` reference and `src/engine/refs.ts` writes the resolved value back as a link.

**Tech Stack:** TypeScript, vitest, esbuild. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-wikilink-values-design.md`

**Commands:**
- One test file: `npx vitest run tests/path/file.test.ts`
- One test by name: `npx vitest run tests/path/file.test.ts -t "name"`
- Everything: `npm test`
- Types + production build: `npm run build`

---

### Task 1: `unwrapLink` and `asLink`

The whole feature rests on one rule: what counts as a wikilink, and what note it
names. It gets its own module and its own tests.

**Files:**
- Create: `src/engine/links.ts`
- Test: `tests/engine/links.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { asLink, unwrapLink } from "../../src/engine/links";

describe("unwrapLink", () => {
  it("reduces a plain link to the note it names", () => {
    expect(unwrapLink("[[My Project]]")).toBe("My Project");
  });

  it("drops an alias", () => {
    expect(unwrapLink("[[My Project|MP]]")).toBe("My Project");
  });

  it("drops a heading", () => {
    expect(unwrapLink("[[My Project#Goals]]")).toBe("My Project");
  });

  it("drops a heading and an alias together", () => {
    expect(unwrapLink("[[My Project#Goals|MP]]")).toBe("My Project");
  });

  it("trims inside and outside the brackets", () => {
    expect(unwrapLink("  [[ My Project ]]  ")).toBe("My Project");
  });

  it("leaves text that is not a link alone", () => {
    expect(unwrapLink("My Project")).toBe("My Project");
    expect(unwrapLink("see [[My Project]]")).toBe("see [[My Project]]");
    expect(unwrapLink("[[a]] [[b]]")).toBe("[[a]] [[b]]");
  });

  it("leaves an embed alone", () => {
    expect(unwrapLink("![[My Project]]")).toBe("![[My Project]]");
  });

  it("leaves a bare heading link alone, having no note to name", () => {
    expect(unwrapLink("[[#Goals]]")).toBe("[[#Goals]]");
  });

  it("trims plain text too, so callers need no second trim", () => {
    expect(unwrapLink("  My Project  ")).toBe("My Project");
  });
});

describe("asLink", () => {
  it("wraps plain text", () => {
    expect(asLink("My Project")).toBe("[[My Project]]");
  });

  it("unwraps first, so a link in, a link out", () => {
    expect(asLink("[[My Project]]")).toBe("[[My Project]]");
    expect(asLink("[[My Project|MP]]")).toBe("[[My Project]]");
    expect(asLink("[[My Project#Goals]]")).toBe("[[My Project]]");
  });

  it("takes the other scalars a property can hold", () => {
    expect(asLink(5)).toBe("[[5]]");
    expect(asLink(true)).toBe("[[true]]");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/links.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/engine/links"`.

- [ ] **Step 3: Write the implementation**

Create `src/engine/links.ts`:

```ts
/**
 * Obsidian reads `[[My Project]]`, `[[My Project#Goals]]` and
 * `[[My Project|MP]]` as one note. Frontmatter reaches this plugin as raw text
 * with the brackets in it, so without reducing a link to the note it names, one
 * relationship written two ways compares as two different values — and a stream
 * whose host note and candidates disagree about the spelling comes out empty,
 * in silence.
 */

/** A whole wikilink and nothing else: no bracket inside it, no text outside it. */
const WIKILINK = /^\[\[([^[\]]+)\]\]$/;

/**
 * A whole wikilink reduced to the note it names; any other text, trimmed,
 * as itself.
 *
 * An embed (`![[x]]`) and a bare heading link (`[[#Goals]]`) are deliberately
 * not links here. The first is a rendering instruction, not a value, and
 * treating it as one would make `![[x]]` and `[[x]]` match; the second names no
 * note, so there is nothing to reduce it to.
 *
 * Plain text is trimmed as well, so a caller can compare the results directly
 * rather than remembering to trim one of the two paths through here.
 */
export function unwrapLink(text: string): string {
  const trimmed = text.trim();
  const match = WIKILINK.exec(trimmed);
  if (match === null) {
    return trimmed;
  }
  // Alias before heading: Obsidian writes `[[target#heading|alias]]`, so
  // splitting on `|` first leaves `target#heading` for the `#` split. The
  // other order would leave the alias stuck to the target.
  const target = match[1].split("|")[0].split("#")[0].trim();
  return target === "" ? trimmed : target;
}

/**
 * The value as exactly one wikilink.
 *
 * Unwrapped before it is wrapped, so a host property already holding a link
 * yields `[[My Project]]` rather than `[[[[My Project]]]]`. That is the common
 * case, not the edge one: a vault that stores relationships as links stores
 * them that way on the host note too.
 *
 * Takes the scalars a property can hold, not just strings. `5` and `true` are
 * complete values, and a note may well be named `5`.
 */
export function asLink(value: string | number | boolean): string {
  return `[[${unwrapLink(String(value))}]]`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/links.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/links.ts tests/engine/links.test.ts
git commit -m "feat: reduce a wikilink to the note it names"
```

---

### Task 2: Compare property values as the notes they name

This is the change that makes the feature work. Everything after it is syntax.

**Files:**
- Modify: `src/engine/filter.ts` — `scalarEquals` (~line 147) and `compareOrder` (~line 172)
- Test: `tests/engine/filter-where.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/filter-where.test.ts`:

```ts
describe("matchesClause — link-valued properties", () => {
  it("matches a linked candidate against a plain query value", () => {
    const n = note({ frontmatter: { Project: "[[My Project]]" } });
    expect(matchesClause(n, condition("where:\n  Project: My Project"))).toBe(true);
  });

  it("matches a plain candidate against a linked query value", () => {
    const n = note({ frontmatter: { Project: "My Project" } });
    expect(matchesClause(n, condition('where:\n  Project: "[[My Project]]"'))).toBe(true);
  });

  it("matches across an alias and a heading", () => {
    const aliased = note({ frontmatter: { Project: "[[My Project|MP]]" } });
    const headed = note({ frontmatter: { Project: "[[My Project#Goals]]" } });
    const clause = condition('where:\n  Project: "[[My Project]]"');
    expect(matchesClause(aliased, clause)).toBe(true);
    expect(matchesClause(headed, clause)).toBe(true);
  });

  it("still tells two different notes apart", () => {
    const n = note({ frontmatter: { Project: "[[Other Project]]" } });
    expect(matchesClause(n, condition('where:\n  Project: "[[My Project]]"'))).toBe(false);
  });

  it("looks inside a list of links", () => {
    const n = note({ frontmatter: { Project: ["[[Other]]", "[[My Project]]"] } });
    expect(matchesClause(n, condition("where:\n  Project: My Project"))).toBe(true);
  });

  it("reads a linked member of an any-of list", () => {
    const n = note({ frontmatter: { Project: "My Project" } });
    expect(matchesClause(n, condition('where:\n  Project: ["[[My Project]]", "[[Other]]"]'))).toBe(
      true,
    );
  });

  it("answers != the way it answers =", () => {
    const n = note({ frontmatter: { Project: "[[My Project]]" } });
    expect(matchesClause(n, condition('where:\n  Project: "!=My Project"'))).toBe(false);
    expect(matchesClause(n, condition('where:\n  Project: "!=Other Project"'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/filter-where.test.ts -t "link-valued"`
Expected: FAIL — six of the seven assertions return the opposite boolean
("still tells two different notes apart" already passes).

- [ ] **Step 3: Write the implementation**

In `src/engine/filter.ts`, add to the imports at the top of the file:

```ts
import { unwrapLink } from "./links";
```

Replace the last line of `scalarEquals`:

```ts
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
```

with:

```ts
  // Both sides, never one. Reducing only the query side would make equality
  // asymmetric — `a = b` true while `b = a` is false — and the same normalizing
  // on both sides can only merge two spellings of one note, never split one
  // note in two, so no stream that matches today stops matching.
  return unwrapLink(String(left)).toLowerCase() === unwrapLink(right).toLowerCase();
```

Replace the last line of `compareOrder`:

```ts
  return String(left).trim().toLowerCase().localeCompare(String(operand).trim().toLowerCase());
```

with:

```ts
  // The same reduction `scalarEquals` makes, so `!=` answers the question `=`
  // answers. Left as raw text, `!=` would call a note holding `My Project`
  // different from one holding `[[My Project]]` while `=` called them the
  // same — an inconsistency, not a second opinion. The number and date
  // branches above are untouched: a wikilink is neither.
  return unwrapLink(String(left)).toLowerCase().localeCompare(unwrapLink(operand).toLowerCase());
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/filter-where.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 5: Check nothing else moved**

Run: `npm test`
Expected: PASS, every file. This step is the proof that the change only adds
matches — if any pre-existing test fails here, stop and report it rather than
editing the test.

- [ ] **Step 6: Commit**

```bash
git add src/engine/filter.ts tests/engine/filter-where.test.ts
git commit -m "fix: compare property values as the notes they name"
```

---

### Task 3: Carry the spelling on the condition

`{ kind: "ref" }` gains a required `link` flag. Required, not optional, so every
construction site has to state which spelling it came from and the compiler
finds them all. This task is the type change plus the seven existing sites; the
parser learns to produce `link: true` in Task 4.

**Files:**
- Modify: `src/query/types.ts:26`
- Modify: `src/query/parse.ts:353`
- Modify: `tests/query/parse-where.test.ts:106,112,118,124`
- Modify: `tests/engine/refs.test.ts:76,88`
- Modify: `tests/engine/filter-where.test.ts:143`
- Modify: `tests/query/describe.test.ts:67`

- [ ] **Step 1: Change the type**

In `src/query/types.ts`, replace:

```ts
  /** A `this.X` value, until `resolveRefs` answers it from the host note. */
  | { kind: "ref"; field: string };
```

with:

```ts
  /**
   * A `this.X` value, until `resolveRefs` answers it from the host note.
   * `link` records which spelling it was written in — `this.X` or
   * `[[this.X]]` — so the resolved value can be written back as a link and an
   * unresolved one can be described in the words the reader used. Required
   * rather than optional: every site then states the answer, and the compiler
   * finds every site.
   */
  | { kind: "ref"; field: string; link: boolean };
```

- [ ] **Step 2: Run the type check to see the sites**

Run: `npx tsc --noEmit`
Expected: FAIL — eight errors, all `Property 'link' is missing`. `tsconfig.json`
includes `tests/**/*.ts`, so this one command enumerates every site the next two
steps fix. Use its output as the checklist.

- [ ] **Step 3: Fix the one production site**

In `src/query/parse.ts`, replace:

```ts
      return { kind: "ref", field: target };
```

with:

```ts
      return { kind: "ref", field: target, link: false };
```

- [ ] **Step 4: Fix the seven test sites**

Every existing literal is the plain spelling, so every one takes `link: false`.

In `tests/query/parse-where.test.ts`, lines 106, 112, 118 and 124:

```ts
      { field: "Project", condition: { kind: "ref", field: "Project", link: false } },
```

and for line 118, whose field differs:

```ts
      { field: "Parent", condition: { kind: "ref", field: "file.name", link: false } },
```

In `tests/engine/refs.test.ts`, lines 76 and 88:

```ts
    expect(resolved.query.where[0].condition).toEqual({
      kind: "ref",
      field: "Project",
      link: false,
    });
```

In `tests/engine/filter-where.test.ts`, line 143:

```ts
    const clause: WhereClause = {
      field: "Project",
      condition: { kind: "ref", field: "Project", link: false },
    };
```

In `tests/query/describe.test.ts`, line 67:

```ts
      where: [
        { field: "Project", condition: { kind: "ref" as const, field: "Project", link: false } },
      ],
```

- [ ] **Step 5: Run everything**

Run: `npm run build && npm test`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/query/types.ts src/query/parse.ts tests/
git commit -m "refactor: record which spelling a this. reference was written in"
```

---

### Task 4: Parse `[[this.<field>]]`

**Files:**
- Modify: `src/query/parse.ts` — `THIS_REF` block (~line 294), `parseCondition` (~line 342), `asAnyOfValue` (~line 386)
- Test: `tests/query/parse-where.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("parseQuery — where", ...)` block in
`tests/query/parse-where.test.ts`:

```ts
  it("reads a link-wrapped reference", () => {
    expect(whereOf('where:\n  Project: "[[this.Project]]"')).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project", link: true } },
    ]);
  });

  it("reads a link-wrapped reference case-insensitively, keeping the field's case", () => {
    expect(whereOf('where:\n  Project: "[[This.Project]]"')).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project", link: true } },
    ]);
  });

  it("tolerates spaces inside the brackets", () => {
    expect(whereOf('where:\n  Project: "[[ this.Project ]]"')).toEqual([
      { field: "Project", condition: { kind: "ref", field: "Project", link: true } },
    ]);
  });

  it("reads a link-wrapped file property", () => {
    expect(whereOf('where:\n  Parent: "[[this.file.name]]"')).toEqual([
      { field: "Parent", condition: { kind: "ref", field: "file.name", link: true } },
    ]);
  });

  it("rejects a link-wrapped reference with no property name", () => {
    expect(() => whereOf('where:\n  Project: "[[this.]]"')).toThrow(/needs a property name/);
  });

  it("rejects an alias or a heading, which cannot mean anything in a match", () => {
    expect(() => whereOf('where:\n  Project: "[[this.Project|MP]]"')).toThrow(
      /alias or heading has no meaning/,
    );
    expect(() => whereOf('where:\n  Project: "[[this.Project#Goals]]"')).toThrow(
      /alias or heading has no meaning/,
    );
  });

  it("rejects a link-wrapped reference inside a list", () => {
    expect(() => whereOf('where:\n  Project: ["[[this.Project]]", Beta]')).toThrow(
      /inside a list/,
    );
  });

  it("rejects a link-wrapped reference as a comparison operand", () => {
    expect(() => whereOf('where:\n  date: ">[[this.start]]"')).toThrow(/cannot compare against/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/query/parse-where.test.ts -t "link-wrapped"`
Expected: FAIL — the reading tests produce `{ kind: "equals", value: "[[this.Project]]" }`,
and the three rejection tests throw nothing at all. That silence is the bug this
task closes.

- [ ] **Step 3: Add the second spelling and the shared gate**

In `src/query/parse.ts`, directly below the existing `const THIS_REF = /^this\.(.*)$/i;`:

```ts
/**
 * The same reference written as a link, for the vaults where a relationship
 * property holds one: `Project: "[[this.Project]]"`. Matched
 * case-insensitively, and with the inner whitespace trimmed, on exactly the
 * terms `THIS_REF` already is.
 */
const LINK_REF = /^\[\[\s*this\.(.*?)\s*\]\]$/i;

/**
 * Either spelling. Every gate in this file asks through here rather than
 * testing a regex of its own, so a spelling added to the condition path cannot
 * be quietly missed by the list and comparison gates — which is the state
 * `[[this.Project]]` was in before this function existed: read as literal
 * text, matching nothing, saying nothing.
 */
function isThisRef(text: string): boolean {
  return THIS_REF.test(text) || LINK_REF.test(text);
}
```

- [ ] **Step 4: Read both spellings in `parseCondition`**

In `src/query/parse.ts`, replace this block:

```ts
    const ref = THIS_REF.exec(text);
    if (ref !== null) {
      // Trimmed as the operand and every list entry already are, so a stray
      // space after the dot is tolerated rather than treated as a typo — and
      // so `this. ` falls through to the "needs a property name" check below.
      const target = ref[1].trim();
      if (target === "") {
        throw new QueryError(
          `\`where.${field}\`: \`this.\` needs a property name, as in ${field}: this.${field}.`,
        );
      }
      return { kind: "ref", field: target, link: false };
    }
```

with:

```ts
    // The link spelling first. It cannot collide — `THIS_REF` is anchored at
    // `this.` and a link starts with a bracket — but asking in this order keeps
    // `linkRef` the single thing the rest of the block branches on.
    const linkRef = LINK_REF.exec(text);
    const ref = linkRef ?? THIS_REF.exec(text);
    if (ref !== null) {
      // Trimmed as the operand and every list entry already are, so a stray
      // space after the dot is tolerated rather than treated as a typo — and
      // so `this. ` falls through to the "needs a property name" check below.
      const target = ref[1].trim();
      if (target === "") {
        throw new QueryError(
          linkRef === null
            ? `\`where.${field}\`: \`this.\` needs a property name, as in ${field}: this.${field}.`
            : `\`where.${field}\`: \`[[this.]]\` needs a property name, as in ${field}: "[[this.${field}]]".`,
        );
      }
      // An alias or a heading has no meaning in a match, and the alternative to
      // saying so is looking up a frontmatter key literally named
      // `Project|MP` — reporting the host note missing a property nobody wrote.
      if (linkRef !== null && /[|#]/.test(target)) {
        throw new QueryError(
          `\`where.${field}\` cannot use \`${text}\`. A \`this.\` reference names a property, so an alias or heading has no meaning here.`,
        );
      }
      return { kind: "ref", field: target, link: linkRef !== null };
    }
```

- [ ] **Step 5: Close the two gates**

In `src/query/parse.ts`, inside `parseCondition`'s comparison branch, replace:

```ts
      if (THIS_REF.test(operand)) {
```

with:

```ts
      if (isThisRef(operand)) {
```

and in `asAnyOfValue`, replace:

```ts
    if (THIS_REF.test(text)) {
```

with:

```ts
    if (isThisRef(text)) {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 7: Commit**

```bash
git add src/query/parse.ts tests/query/parse-where.test.ts
git commit -m "feat: read [[this.X]] as a reference, and reject it where this.X is rejected"
```

---

### Task 5: Resolve a link reference to a link

**Files:**
- Modify: `src/engine/refs.ts` — `resolveRefs` call site (~line 41) and `resolveCondition` (~line 52)
- Test: `tests/engine/refs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/refs.test.ts`:

```ts
const LINK_REF = 'where:\n  Project: "[[this.Project]]"';

describe("resolveRefs — a link reference", () => {
  it("wraps a plain host value", () => {
    const host = note({ frontmatter: { Project: "My Project" } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[My Project]]" });
  });

  it("unwraps before it wraps, so a host link yields one link", () => {
    const host = note({ frontmatter: { Project: "[[My Project]]" } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[My Project]]" });
  });

  it("drops an alias the host wrote", () => {
    const host = note({ frontmatter: { Project: "[[My Project|MP]]" } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[My Project]]" });
  });

  it("wraps every member of a list", () => {
    const host = note({ frontmatter: { Project: ["Alpha", "[[Beta]]"] } });
    expect(conditionOf(LINK_REF, host)).toEqual({
      kind: "anyOf",
      values: ["[[Alpha]]", "[[Beta]]"],
    });
  });

  it("wraps a date after converting it, so daily-note links work", () => {
    const host = note({ frontmatter: { Project: new Date(2026, 8, 14) } });
    expect(conditionOf(LINK_REF, host)).toEqual({ kind: "equals", value: "[[2026-09-14]]" });
  });

  it("wraps the host note's own name", () => {
    const host = note({ path: "Projects/Orbit.md" });
    expect(conditionOf('where:\n  Parent: "[[this.file.name]]"', host)).toEqual({
      kind: "equals",
      value: "[[Orbit]]",
    });
  });

  it("leaves a blank host property unresolved rather than wrapping nothing", () => {
    const host = note({ frontmatter: { Project: "   " } });
    expect(conditionOf(LINK_REF, host)).toEqual({
      kind: "ref",
      field: "Project",
      link: true,
    });
  });

  it("leaves an absent host property unresolved", () => {
    const host = note({ frontmatter: {} });
    expect(conditionOf(LINK_REF, host)).toEqual({
      kind: "ref",
      field: "Project",
      link: true,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/refs.test.ts -t "a link reference"`
Expected: FAIL — the resolved values come back unwrapped (`"My Project"`, not
`"[[My Project]]"`). The two unresolved tests already pass.

- [ ] **Step 3: Write the implementation**

In `src/engine/refs.ts`, add to the imports at the top of the file:

```ts
import { asLink } from "./links";
```

Replace the call to `resolveCondition` inside `resolveRefs`:

```ts
    const resolved = resolveCondition(clause.condition.field, host);
```

with:

```ts
    const resolved = resolveCondition(clause.condition.field, host, clause.condition.link);
```

Replace the whole of `resolveCondition` with:

```ts
/** The condition a host field yields, or null when it yields nothing usable. */
function resolveCondition(
  field: string,
  host: NoteMeta | null,
  link: boolean,
): WhereCondition | null {
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
    const values = raw.map(dateAware).filter(isUsable).map((value) => wrap(value, link));
    return values.length === 0 ? null : { kind: "anyOf", values };
  }
  const value = dateAware(raw);
  return isUsable(value) ? { kind: "equals", value: wrap(value, link) } : null;
}

/**
 * A value written back in the spelling the reader asked for. `asLink` unwraps
 * before it wraps, so a host property that already holds a link resolves to one
 * link rather than to `[[[[My Project]]]]` — the common case, since a vault
 * that stores relationships as links stores them that way on the host note too.
 *
 * Runs after `isUsable`, never before: a blank or absent property is
 * unresolved, and wrapping first would turn it into `[[]]`, a condition that
 * matches nothing while claiming to have been answered.
 */
function wrap(value: string | number | boolean, link: boolean): string | number | boolean {
  return link ? asLink(value) : value;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/refs.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 5: Commit**

```bash
git add src/engine/refs.ts tests/engine/refs.test.ts
git commit -m "feat: resolve a [[this.X]] reference to a link"
```

---

### Task 6: Describe an unresolved link reference in the reader's words

**Files:**
- Modify: `src/query/describe.ts` — the `"ref"` case of `describeCondition` (~line 62)
- Test: `tests/query/describe.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/query/describe.test.ts`, inside the existing
`describe("describeQuery — an unresolved reference", ...)` block that ends at
line 71, below its one test:

```ts
  it("prints a link reference in the spelling it was written in", () => {
    const query = {
      ...defaultQuery(),
      where: [
        { field: "Project", condition: { kind: "ref" as const, field: "Project", link: true } },
      ],
    };
    expect(describeQuery(query)).toContain("Project = [[this.Project]] (not set here)");
  });
```

No new imports: `describeQuery` and `defaultQuery` are already imported at the
top of the file, and the neighbouring test builds its query the same way, with
no type annotation and `as const` on the `kind`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/query/describe.test.ts -t "spelling it was written in"`
Expected: FAIL — the line reads `Project = this.Project (not set here)`.

- [ ] **Step 3: Write the implementation**

In `src/query/describe.ts`, replace:

```ts
    case "ref":
      // Only an *unresolved* reference reaches here: `runStream` hands the
      // view its resolved query, where an answered reference is already an
      // `equals` or an `anyOf` printing the host note's real value.
      return `= this.${condition.field} (not set here)`;
```

with:

```ts
    case "ref": {
      // Only an *unresolved* reference reaches here: `runStream` hands the
      // view its resolved query, where an answered reference is already an
      // `equals` or an `anyOf` printing the host note's real value.
      //
      // Echoed in the spelling the reader used. The line's whole job is
      // pointing at the block, and pointing at a `this.Project` that the block
      // spells `[[this.Project]]` makes the reader hunt for a second condition.
      const written = condition.link ? `[[this.${condition.field}]]` : `this.${condition.field}`;
      return `= ${written} (not set here)`;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/query/describe.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 5: Commit**

```bash
git add src/query/describe.ts tests/query/describe.test.ts
git commit -m "feat: describe an unresolved link reference as it was written"
```

---

### Task 7: End to end through the view

Tasks 1-6 each proved one layer. This proves a reader's actual vault works:
a template block, a host note holding a link, candidates holding plain text,
and the reverse.

**Files:**
- Test: `tests/view/this-refs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/view/this-refs.test.ts`, after the existing `describe` blocks:

Note the shape the file already uses, and keep to it: `mountPane()` returns
`{ container }`, `StreamChild`'s arguments are
`(container, app, source, sourcePath)` in that order, the entry point is
`load()` not `onload()`, tests are `test(...)` not `it(...)`, and each test
assigns the module-level `child` so `afterEach` can unload it. `FakeVault`,
`mountPane`, `drawnTitles` and `settle` are already imported at the top of the
file, and `SOURCE` — the plain `this.Project` block — is defined at line 10.

```ts
/** The same block as SOURCE, with the reference written as a link. */
const LINK_SOURCE =
  'folder: Notes\nsort: file.path asc\ndisplay: title\nwhere:\n  Project: "[[this.Project]]"\n';

describe("link-valued properties in the view", () => {
  test("reads a link reference against plain candidates", async () => {
    const vault = vaultWith({ Project: "Alpha" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, LINK_SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("reads a link reference when the host property is itself a link", async () => {
    const vault = vaultWith({ Project: "[[Alpha]]" });
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, LINK_SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
    expect(noticeText(container)).toBeNull();
  });

  test("matches linked candidates from a plain host, through the plain spelling", async () => {
    const vault = new FakeVault([
      { path: "Host.md", frontmatter: { Project: "Alpha" } },
      { path: "Notes/a.md", frontmatter: { Project: "[[Alpha]]" } },
      { path: "Notes/b.md", frontmatter: { Project: "[[Beta]]" } },
      { path: "Notes/c.md", frontmatter: { Project: "[[Alpha|A]]" } },
    ]);
    const { container } = mountPane();
    child = new StreamChild(container, vault.app, SOURCE, "Host.md");
    child.load();
    await settle();

    expect(drawnTitles(container)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/view/this-refs.test.ts -t "link-valued"`
Expected: if Tasks 1-6 are done, these may already PASS — that is the point of
an end-to-end check, and a pass here is a pass, not a reason to weaken the test.
If any fails, the layer it names is where to look.

- [ ] **Step 3: Run everything**

Run: `npm run build && npm test`
Expected: PASS both.

- [ ] **Step 4: Commit**

```bash
git add tests/view/this-refs.test.ts
git commit -m "test: cover link-valued properties end to end"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md` — the `where` rules, around lines 133-161
- Modify: `CHANGELOG.md` — a new Unreleased section above `## 1.1.0`
- Modify: `docs/manual-testing.md`

- [ ] **Step 1: README — how values compare**

In `README.md`, directly after the paragraph ending "Numbers compare as numbers
and booleans as booleans." (around line 135), add:

```markdown
Values are compared as the notes they name, so a property holding
`[[My Project]]` matches one holding `My Project`, and an alias or a heading in
the link — `[[My Project|MP]]`, `[[My Project#Goals]]` — matches the plain link
too. Write whichever your vault uses; a stream never depends on the two notes
having spelled the relationship the same way.
```

- [ ] **Step 2: README — the link spelling of a reference**

In `README.md`, in the `this.` paragraph, after the sentence ending "which will
not match anything meaningful." (around line 153), add:

```markdown
A reference can be written as a link — `Project: "[[this.Project]]"` — which is
what reads naturally in a vault whose properties hold links. It resolves to
exactly one link whether the host note's own property is `My Project` or
`[[My Project]]`. Because values already compare as the notes they name, this
spelling and the plain `this.Project` match the same notes; write whichever
looks right in the block.
```

- [ ] **Step 3: README — the rejections**

In `README.md`, in the sentence listing where a reference cannot go, replace:

```markdown
A `this.` reference has to be the whole
condition: it cannot sit inside a list or after a comparison operator.
```

with:

```markdown
A `this.` reference has to be the whole
condition, in either spelling: it cannot sit inside a list or after a
comparison operator. A link reference names a property, so it cannot carry an
alias or a heading either — `"[[this.Project|MP]]"` is an error, not a match.
```

- [ ] **Step 4: CHANGELOG**

In `CHANGELOG.md`, insert above `## 1.1.0`:

```markdown
## Unreleased

Streams now read properties that hold links. A `Project` of `[[My Project]]`
and a `Project` of `My Project` are the same project, and an alias or a heading
inside the link — `[[My Project|MP]]`, `[[My Project#Goals]]` — names the same
note as the plain link does. Nothing that matched before stops matching; this
only joins spellings that were being kept apart.

A `this.` reference can be written as a link too, as
`Project: "[[this.Project]]"`, which is what reads naturally in a vault that
stores relationships that way. It resolves to one link whether the host note
holds `My Project` or `[[My Project]]`.

```

- [ ] **Step 5: Manual testing notes**

Append to `docs/manual-testing.md`, matching the heading level and shape the
file already uses for its cases:

```markdown
## Link-valued properties

1. Make `Projects/Orbit.md` and two notes in `Notes/` whose `Project` property
   is the link `[[Orbit]]`, plus one whose `Project` is the plain text `Orbit`.
2. In `Projects/Orbit.md`, add a block with `where: { Project: this.Project }`.
   All three notes appear — the host's plain `Orbit` matches both spellings.
3. Change the host note's `Project` to the link `[[Orbit]]`. The same three
   notes appear.
4. Change the block to `where: { Project: "[[this.Project]]" }`. Again the same
   three, and the empty-stream summary is not shown.
5. Clear the host note's `Project` property. The stream empties and the notice
   names `Project`; the summary line reads `[[this.Project]] (not set here)`.
```

- [ ] **Step 6: Verify and commit**

Run: `npm test`
Expected: PASS — documentation only, so nothing should move.

```bash
git add README.md CHANGELOG.md docs/manual-testing.md
git commit -m "docs: document wikilink-aware matching and the [[this.X]] spelling"
```

---

## Done when

- [ ] `npm run build` passes (types and production bundle).
- [ ] `npm test` passes, including `tests/engine/perf.test.ts` — the budgets
      there are unchanged, and a failure means `unwrapLink` is costing more than
      the spec assumed.
- [ ] Every row of the spec's §1 and §3.4 tables has a test asserting it.
- [ ] `grep -rn 'THIS_REF.test' src/` returns nothing: every gate goes through
      `isThisRef`.
