# Section field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `section: <heading>` query field that takes each stream item's body from under a named heading instead of from the note's opening words.

**Architecture:** One pure function, `sliceSection`, is added to `src/engine/preview.ts` and called from `renderItem` in `src/view/itemEl.ts` after the file is read but before the `display` branch — so the same narrowing serves `display: preview` and `display: full`. A note whose body has no such heading renders no body element at all. Nothing in `src/engine/run.ts` changes: the engine never reads note bodies, so `section` cannot filter and produces no notice.

**Tech Stack:** TypeScript, Obsidian plugin API, vitest (+ jsdom for view tests), esbuild.

**Spec:** `docs/superpowers/specs/2026-09-18-section-field-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/query/types.ts` | Modify | `StreamQuery.section`, `defaultQuery()`, `QUERY_FIELDS` |
| `src/query/parse.ts` | Modify | `case "section"` in `applyField` |
| `src/engine/preview.ts` | Modify | New `sliceSection` beside `stripFrontmatter` |
| `src/view/itemEl.ts` | Modify | Narrow `content` before the `display` branch |
| `tests/query/parse-scalars.test.ts` | Modify | Field parses, empty value rejected |
| `tests/engine/preview.test.ts` | Modify | `sliceSection` rules |
| `tests/view/rows.test.ts` | Modify | Narrowing through a real render |
| `README.md` | Modify | Field table row + example |
| `CHANGELOG.md` | Modify | `[Unreleased]` entry |

**Deliberately not touched:**

- `src/query/describe.ts` — it lists only what can empty a stream, so `sort`, `group` and `limit` are already absent from it. `section` never excludes a note, so adding it there would pad the one line whose job is explaining an empty result.
- `src/engine/run.ts` — no new `StreamNotice`. See spec §6.
- `src/query/suggest.ts` — `nearestField` reads `QUERY_FIELDS`, so it picks the new field up with no edit.
- `manifest.json` / `package.json` — no version bump; that belongs to the release.

---

### Task 1: The `section` query field

**Files:**
- Modify: `src/query/types.ts:69-125` (interface, `defaultQuery`, `QUERY_FIELDS`)
- Modify: `src/query/parse.ts:113-119` (`applyField`)
- Test: `tests/query/parse-scalars.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of the outermost `describe` in `tests/query/parse-scalars.test.ts`, just before its closing `});`:

```ts
  it("parses a section", () => {
    expect(parseQuery("section: Objective").section).toBe("Objective");
  });

  it("trims a section and keeps its case", () => {
    // Case is kept because the value is echoed nowhere but matched
    // case-insensitively; storing it lower-cased would lose the reader's
    // spelling for no gain.
    expect(parseQuery("section: '  Objective  '").section).toBe("Objective");
  });

  it("defaults to no section", () => {
    expect(parseQuery("display: preview").section).toBeNull();
  });

  it("rejects an empty section", () => {
    expect(() => parseQuery("section: ''")).toThrow(/`section` is empty/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/query/parse-scalars.test.ts`

Expected: FAIL. TypeScript reports `Property 'section' does not exist on type 'StreamQuery'`, and the empty-value case throws the unknown-field error instead.

- [ ] **Step 3: Add the field to the query type**

In `src/query/types.ts`, inside `interface StreamQuery`, directly after the `display: DisplayMode;` line:

```ts
  /**
   * The heading whose content an item's body is taken from, or null for the
   * whole note. Matched case-insensitively at render time; a note without it
   * shows no body. Never a filter — `where` is the only one.
   */
  section: string | null;
```

In `defaultQuery()`, after `display: "preview",`:

```ts
    section: null,
```

In `QUERY_FIELDS`, after `"display",`:

```ts
  "section",
```

- [ ] **Step 4: Handle the field in the parser**

In `src/query/parse.ts`, in `applyField`'s switch, after the `case "display":` block:

```ts
    case "section":
      query.section = toSingleString(key, value);
      return;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/query/parse-scalars.test.ts`

Expected: PASS, all tests in the file.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`

Expected: PASS. The unknown-field tests in `tests/query/parse-lists.test.ts` assert on `/Valid fields: folder, tags/`, which the longer list still satisfies.

- [ ] **Step 7: Commit**

```bash
git add src/query/types.ts src/query/parse.ts tests/query/parse-scalars.test.ts
git commit -m "feat: accept a section field in a stream query

The field is parsed and defaulted but nothing reads it yet. Placed next
to display, since it narrows what display shows rather than filtering
what the stream matches."
```

---

### Task 2: `sliceSection` finds and bounds a section

**Files:**
- Modify: `src/engine/preview.ts` (new export after `stripFrontmatter`)
- Test: `tests/engine/preview.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine/preview.test.ts`. Extend the import on line 2 to `import { extractPreview, sliceSection, stripFrontmatter } from "../../src/engine/preview";`, then add a new `describe` block after the `stripFrontmatter` one:

```ts
describe("sliceSection", () => {
  const NOTE = [
    "---",
    "Project: Streams",
    "---",
    "# Weekly note",
    "",
    "Some opening context.",
    "",
    "## Objective",
    "",
    "Ship the section field.",
    "",
    "### Detail",
    "",
    "Including sub-headings.",
    "",
    "## Log",
    "",
    "Not part of the objective.",
  ].join("\n");

  it("returns the text under the heading, without the heading line", () => {
    expect(sliceSection("## Objective\n\nShip it.\n", "Objective")).toBe("Ship it.");
  });

  it("matches case-insensitively", () => {
    expect(sliceSection("## Objective\n\nShip it.\n", "objective")).toBe("Ship it.");
    expect(sliceSection("## objective\n\nShip it.\n", "Objective")).toBe("Ship it.");
  });

  it("matches a heading at any level", () => {
    expect(sliceSection("#### Objective\n\nShip it.\n", "Objective")).toBe("Ship it.");
  });

  it("does not match a heading that merely starts the same", () => {
    expect(sliceSection("## Objectives\n\nShip it.\n", "Objective")).toBeNull();
  });

  it("keeps sub-headings inside the section and stops at the next sibling", () => {
    expect(sliceSection(NOTE, "Objective")).toBe(
      "Ship the section field.\n\n### Detail\n\nIncluding sub-headings.",
    );
  });

  it("stops at a shallower heading", () => {
    const note = "## Objective\n\nShip it.\n\n# Elsewhere\n\nOther.\n";
    expect(sliceSection(note, "Objective")).toBe("Ship it.");
  });

  it("runs to the end of the note when nothing follows", () => {
    expect(sliceSection(NOTE, "Log")).toBe("Not part of the objective.");
  });

  it("ignores frontmatter", () => {
    const note = "---\nObjective: not this\n---\n\n## Objective\n\nThis one.\n";
    expect(sliceSection(note, "Objective")).toBe("This one.");
  });

  it("returns null when no heading matches", () => {
    expect(sliceSection(NOTE, "Retrospective")).toBeNull();
  });

  it("handles CRLF line endings", () => {
    expect(sliceSection("## Objective\r\n\r\nShip it.\r\n", "Objective")).toBe("Ship it.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/preview.test.ts`

Expected: FAIL with `sliceSection is not a function` (and a TypeScript error that it is not exported).

- [ ] **Step 3: Write the implementation**

In `src/engine/preview.ts`, directly after the `stripFrontmatter` function:

```ts
const SECTION_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;

/**
 * The text under the first heading named `heading`, or null when the note has
 * no such heading.
 *
 * Matching is exact on the trimmed, lower-cased heading text — the rule
 * `normalizeTag` already applies to tags. Vaults spell headings inconsistently;
 * they do not usually spell them approximately, so a substring rule would pull
 * `## Project Notes` into a stream asking for `Notes`. Heading level is not
 * part of the match, because someone asking for a section by name is not
 * thinking about its depth.
 *
 * The section ends at the next heading of the same or a shallower level, so its
 * own sub-headings stay inside it. The matched heading line itself is left out:
 * the query already names the section, and under `display: preview` repeating
 * it would spend the character budget on a word the reader supplied.
 *
 * A heading with nothing under it yields `""`, which is a different fact from
 * the `null` above even though `renderItem` treats both as "no body".
 */
export function sliceSection(content: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase();
  const lines = stripFrontmatter(content).split(/\r?\n/);

  let level = 0;
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const match = SECTION_HEADING.exec(lines[index]);
    if (match === null) {
      continue;
    }
    if (start === -1) {
      if (match[2].trim().toLowerCase() === wanted) {
        level = match[1].length;
        start = index + 1;
      }
      continue;
    }
    if (match[1].length <= level) {
      return lines.slice(start, index).join("\n").trim();
    }
  }

  return start === -1 ? null : lines.slice(start).join("\n").trim();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/preview.test.ts`

Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/engine/preview.ts tests/engine/preview.test.ts
git commit -m "feat: slice a named section out of a note

Case-insensitive on the heading text, level-insensitive on the match,
and bounded by the next heading of the same or a shallower level so
sub-headings stay inside. Nothing calls it yet."
```

---

### Task 3: `sliceSection` ignores fenced code, and picks the first of two

**Files:**
- Modify: `src/engine/preview.ts` (the `sliceSection` written in Task 2)
- Test: `tests/engine/preview.test.ts` (the `describe` block from Task 2)

- [ ] **Step 1: Write the failing tests**

Add inside the `describe("sliceSection", ...)` block from Task 2:

```ts
  it("does not treat a # line inside a backtick fence as a heading", () => {
    const note = [
      "## Objective",
      "",
      "```sh",
      "# Objective: not a heading",
      "grep -r x .",
      "```",
      "",
      "Still the objective.",
      "",
      "## Log",
      "",
      "Other.",
    ].join("\n");
    expect(sliceSection(note, "Objective")).toBe(
      "```sh\n# Objective: not a heading\ngrep -r x .\n```\n\nStill the objective.",
    );
  });

  it("does not treat a # line inside a tilde fence as a heading", () => {
    const note = "~~~\n## Objective\n~~~\n\n## Objective\n\nThe real one.\n";
    expect(sliceSection(note, "Objective")).toBe("The real one.");
  });

  it("does not let a tilde line close a backtick fence", () => {
    const note = "## Objective\n\n```\n~~~\n## Log\n```\n\nStill here.\n";
    expect(sliceSection(note, "Objective")).toBe("```\n~~~\n## Log\n```\n\nStill here.");
  });

  it("returns the first of two identically named headings", () => {
    const note = "## Objective\n\nFirst.\n\n## Objective\n\nSecond.\n";
    expect(sliceSection(note, "Objective")).toBe("First.");
  });

  it("returns an empty string for a heading with nothing under it", () => {
    expect(sliceSection("## Objective\n\n## Log\n\nOther.\n", "Objective")).toBe("");
  });

  it("returns an empty string for an empty heading at end of file", () => {
    expect(sliceSection("Opening.\n\n## Objective\n", "Objective")).toBe("");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/preview.test.ts`

Expected: FAIL on the three fence tests. The first reports the section cut short at the `# Objective: not a heading` line inside the code block; the other two follow from the same cause. The "first of two" and empty-section tests already pass — they are here to pin behaviour the Task 2 code gets right by construction and a later edit could break.

- [ ] **Step 3: Add fence tracking**

In `src/engine/preview.ts`, add the fence pattern beside `SECTION_HEADING`:

```ts
const SECTION_FENCE = /^[ \t]*(```+|~~~+)/;
```

Then, inside `sliceSection`, replace the loop body's opening — the `const match = ...` and its `if (match === null)` guard — with:

```ts
    const fenceMatch = SECTION_FENCE.exec(lines[index]);
    if (fenceMatch !== null) {
      // The marker is remembered rather than a boolean toggled, because a
      // `~~~` line inside a ``` block is code, not a closing fence, and a
      // toggle would end the block there and let the next `#` line split the
      // section.
      const marker = fenceMatch[1][0];
      if (fence === null) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      continue;
    }

    const match = SECTION_HEADING.exec(lines[index]);
    if (match === null) {
      continue;
    }
```

And declare the tracker with the other loop state, after `let start = -1;`:

```ts
  /** The fence marker currently open — "`" or "~" — or null outside a fence. */
  let fence: string | null = null;
```

- [ ] **Step 4: Fold in the Task 2 review findings**

The code-quality review of Task 2 raised three things that live in exactly these
two files. They are folded in here rather than given their own commit.

**a. The frontmatter test does not test frontmatter.** Its fixture line
`Objective: not this` has no `#`, so `SECTION_HEADING` could never match it —
delete the `stripFrontmatter` call inside `sliceSection` and the test still
passes. Replace the fixture with a decoy that would match if the frontmatter
were not stripped:

```ts
  it("ignores frontmatter", () => {
    const note = "---\n## Objective\nnot this\n---\n\n## Objective\n\nThis one.\n";
    expect(sliceSection(note, "Objective")).toBe("This one.");
  });
```

Without the strip, the first match is the heading inside the frontmatter and the
result is `"not this\n---"`, so the test now fails for the right reason.

**b. An ATX closing sequence is not part of the heading.** `## Objective ##` is
`Objective` in CommonMark, but `SECTION_HEADING` captures `Objective ##` and the
section is silently not found. Add the test:

```ts
  it("ignores an ATX closing sequence", () => {
    expect(sliceSection("## Objective ##\n\nShip it.\n", "Objective")).toBe("Ship it.");
  });

  it("keeps a hash that is part of the heading text", () => {
    expect(sliceSection("## Sprint #3\n\nShip it.\n", "Sprint #3")).toBe("Ship it.");
  });
```

and strip the sequence in `sliceSection`, where the heading text is compared:

```ts
      if (match[2].replace(/[ \t]+#+[ \t]*$/, "").trim().toLowerCase() === wanted) {
```

The pattern requires whitespace before the hashes and nothing after them, which
is CommonMark's rule and what keeps `## Sprint #3` intact — the second test
exists to pin that, since an unguarded `#+$` would turn it into `Sprint`.

**c. Two comment repairs.** On the `let start = -1;` declaration:

```ts
  /** -1 until the heading is found, then the index of the section's first line. */
```

And in the docblock, the `normalizeTag` analogy is imprecise — that function
lower-cases and strips a leading `#` but does not trim. Change

```
 * Matching is exact on the trimmed, lower-cased heading text — the rule
 * `normalizeTag` already applies to tags.
```

to

```
 * Matching is exact on the trimmed, lower-cased heading text, close to what
 * `normalizeTag` does for tags.
```

Deliberately still not handled, and both already reasoned about in the design:
setext headings, and headings indented or nested in a blockquote. The regex is
anchored at column zero, as `LEADING_HEADING` beside it already is.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/preview.test.ts`

Expected: PASS, all tests in the file.

- [ ] **Step 6: Commit**

```bash
git add src/engine/preview.ts tests/engine/preview.test.ts
git commit -m "fix: keep fenced code out of section boundaries

A shell example holding a # comment ended the section early. The scan
now tracks the open fence marker, so a ~~~ line inside a backtick block
stays code."
```

---

### Task 4: Narrow the rendered body

**Files:**
- Modify: `src/view/itemEl.ts:2` (import) and `src/view/itemEl.ts:46` (before the body element)
- Test: `tests/view/rows.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/view/rows.test.ts`, after the `display: preview shows an excerpt and renders no markdown` test:

```ts
  const SECTIONED = [
    "# Weekly note",
    "",
    "Opening context nobody wants in a column.",
    "",
    "## Objective",
    "",
    "Ship the **section** field.",
    "",
    "## Log",
    "",
    "Unrelated.",
  ].join("\n");

  test("section narrows what a preview shows", async () => {
    const container = open("display: preview\ngroup: none\nsection: Objective\n", [
      { path: "a.md", content: SECTIONED, ctime: JAN_10 },
    ]);
    await settle();

    expect(container.querySelector(".ss-item-body")?.textContent).toBe("Ship the section field.");
  });

  test("section narrows what display: full renders", async () => {
    const container = open("display: full\ngroup: none\nsection: Objective\n", [
      { path: "a.md", content: SECTIONED, ctime: JAN_10 },
    ]);
    await settle();

    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0].markdown).toBe("Ship the **section** field.");
    expect(renderCalls[0].el).toBe(container.querySelector(".ss-item-body"));
  });

  test("a note without the section keeps its header and shows no body", async () => {
    const container = open("display: preview\ngroup: none\nsection: Objective\n", [
      { path: "a.md", content: "Just an opening paragraph.\n", ctime: JAN_10 },
    ]);
    await settle();

    // The row is still there, still clickable, still dated.
    expect(container.querySelectorAll(".ss-item")).toHaveLength(1);
    expect(container.querySelector(".ss-item-title")?.textContent).toBe("a");
    // No body, and no warning either: a missing section is a fact about the
    // vault, not a fault.
    expect(container.querySelector(".ss-item-body")).toBeNull();
    expect(container.querySelector(".ss-item-warning")).toBeNull();
  });

  test("a section with nothing under it shows no body", async () => {
    const container = open("display: preview\ngroup: none\nsection: Objective\n", [
      { path: "a.md", content: "## Objective\n\n## Log\n\nOther.\n", ctime: JAN_10 },
    ]);
    await settle();

    expect(container.querySelector(".ss-item-body")).toBeNull();
  });

  test("display: title ignores section and still reads no files", async () => {
    const container = open("display: title\ngroup: none\nsection: Objective\n", [
      { path: "a.md", content: SECTIONED, ctime: JAN_10 },
    ]);
    await settle();

    expect(container.querySelectorAll(".ss-item")).toHaveLength(1);
    expect(container.querySelector(".ss-item-body")).toBeNull();
    expect(vault.reads).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/view/rows.test.ts`

Expected: FAIL. The first test gets the whole note's excerpt — `"Weekly note Opening context nobody wants in a column. Objective Ship the section field. Log Unrelated."` — instead of the section, and the missing-section test finds a body element that should not exist. The `display: title` test already passes.

- [ ] **Step 3: Narrow the content before the display branch**

In `src/view/itemEl.ts`, extend the import on line 2:

```ts
import { extractPreview, sliceSection, stripFrontmatter } from "../engine/preview";
```

Then, between the `cachedRead` try/catch block and `const body = item.createDiv({ cls: "ss-item-body" });`:

```ts
  if (ctx.query.section !== null) {
    const section = sliceSection(content, ctx.query.section);
    // A note without the section shows no body at all — not the note's opening
    // words. The field exists to make one column comparable across notes, and
    // a fallback would put back exactly what it was asked to remove. Silent,
    // and deliberately so: in the case this field is for, several notes in a
    // list lack the heading permanently, and a warning under each would be
    // noisier than the paragraphs it replaced. The header above is still
    // rendered, so the row keeps its title, date and tags.
    if (section === null || section.trim() === "") {
      return;
    }
    content = section;
  }

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/view/rows.test.ts`

Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npm test && npm run build`

Expected: PASS, and a clean `tsc --noEmit` followed by a written `main.js`. In particular `tests/view/self-reference.test.ts` must still pass: the host note appearing in its own stream still falls back to a preview with its warning, and with a `section` set it previews the section.

- [ ] **Step 6: Commit**

```bash
git add src/view/itemEl.ts tests/view/rows.test.ts
git commit -m "feat: take an item's body from the section a query names

The narrowing sits before the display branch, so one rule serves preview
and full alike. A note without the heading renders no body: the point of
the field is a column you can read down, and falling back to the note's
opening would undo it."
```

---

### Task 5: Document the field

**Files:**
- Modify: `README.md:50-75` (field table and the text under it)
- Modify: `CHANGELOG.md:5` (the `[Unreleased]` heading)

- [ ] **Step 1: Add the field to the README table**

In `README.md`, in the `## Fields` table, directly after the `display` row:

```markdown
| `section`        | text                     | —                 | Take the body from under this heading |
```

- [ ] **Step 2: Document what the field does, under the table**

Add after the field table, before `## Matching rules`:

````markdown
### `section`

A stream's body normally starts at the top of each note. In a project's index
that is rarely the useful part: the notes there all answer the same question
somewhere further down. `section` takes the body from under a named heading
instead, so the stream becomes a column you can read down and compare.

```stream
where:
  Project: this.Project
display: preview
section: Objective
```

- The heading is matched on its text, ignoring case and heading level, so
  `section: objective` finds both `## Objective` and `### objective`. It does
  not match `## Objectives`.
- The section runs to the next heading at the same or a shallower level, so its
  own sub-headings come with it. Its heading line is not shown.
- A note without that heading shows **no body** — just its title, date and tags.
  That is deliberate: falling back to the note's opening would put back the
  arbitrary text the field exists to remove.
- With `display: full`, the section is rendered as real markdown. With
  `display: title`, the field does nothing, since no body is shown at all.
````

- [ ] **Step 3: Add the CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]`:

```markdown
### Added

- `section: <heading>` takes each item's body from under a named heading rather
  than from the note's opening words — so a project's index can show every
  linked note's `Objective` as one comparable column. Matched ignoring case and
  heading level, bounded by the next heading at the same or a shallower level,
  and applied to `display: preview` and `display: full` alike. A note without
  that heading shows no body.
```

- [ ] **Step 4: Verify the docs describe what shipped**

Run: `npm test && npm run build`

Expected: PASS and a clean build. Then re-read the README section against `sliceSection` in `src/engine/preview.ts`: every rule stated there — case, level, boundary, dropped heading line, missing-heading silence — must be one the code actually implements.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document the section field"
```

---

## Manual verification

`docs/manual-testing.md` is the live-vault pass this repo does before a release. After Task 5, in a real vault:

1. In a project note, add a stream with `where: { Project: this.Project }`, `display: preview` and `section: Objective`. Confirm each row shows that note's Objective, not its opening line.
2. Delete the `## Objective` heading from one of those notes. Confirm its row keeps its title and date and shows nothing else, with no warning.
3. Switch the same block to `display: full`. Confirm the Objective renders as markdown — a list stays a list, a link stays clickable.
4. Put a fenced shell block containing a `# comment` line inside one note's Objective. Confirm the section is not cut short at it.
5. Switch to `display: title`. Confirm the block renders titles only and nothing errors.
