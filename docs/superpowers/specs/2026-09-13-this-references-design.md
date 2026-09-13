# `this.` references — Design

Date: 2026-09-13
Status: Approved
Extends: `docs/superpowers/specs/2026-09-04-simple-streams-design.md`

## 1. Overview

A `where` value may name a property of the note that holds the stream block:

```stream
where:
  Project: this.Project
```

If the host note's frontmatter has `Project: My Project`, the stream matches
notes whose `Project` is `My Project`. The block stops being a hand-edited
constant and becomes reusable: dropped into a template, one block gives every
project, client or person note its own running history with no per-note edit.

## 2. Goals and non-goals

**Goals**

- Resolve `this.<field>` in `where` values against the host note.
- Re-resolve when the host note's frontmatter changes, with no extra wiring.
- Say so plainly when the host note does not carry the property.
- Keep the parser pure and app-free; keep resolution a pure function.

**Non-goals for this version**

- `this.` in `folder`, `tags`, `title`, `from` or `to`. Every one of those
  fields runs its own normalization (`normalizeFolder`, `normalizeTag`,
  `parseDateExpr`) and would need its own answers for a resolved list, a
  resolved number and a resolved absence — four code paths for a feature the
  request does not ask for.
- `this.` inside a comparison operand (`date: ">this.start"`). Rejected with an
  error rather than silently compared against the literal text `this.start`.
- An escape for a literal value beginning with `this.`. `file.` is already a
  reserved prefix on the same terms; a second escape syntax costs more than the
  case is worth.

## 3. Syntax and semantics

A `where` value whose text begins with `this.` is a reference. What follows is
a field name, resolved against the host note with the same `resolveField` used
for every candidate note — so frontmatter keys work by name, and `this.file.name`,
`this.file.path`, `this.file.ctime` and `this.file.mtime` come free.

Prefix detection is case-insensitive (`this.` or `This.`), matching how
`exists` and `missing` are already matched. The field name after the prefix
keeps its exact case: frontmatter lookup is case-sensitive, as it is for
`where` field names and `sort` fields.

| Host value | Result |
|---|---|
| Scalar (`Project: Alpha`) | `equals Alpha` — same case-insensitive, number-aware rules as a written value |
| Date (a `Date`-valued property) | `equals YYYY-MM-DD`, the same local-date text `from`/`to` converts a `Date` bound to |
| List (`Project: [Alpha, Beta]`) | `anyOf [Alpha, Beta]` — identical to writing `Project: [Alpha, Beta]` |
| List with non-scalar members | The scalars, as `anyOf`; non-scalars dropped, and **unresolved** if none remain |
| Absent, `null`, empty list, nested map, blank string (`""` or whitespace-only) | **Unresolved** |
| Host note not found (empty or unknown `sourcePath`) | **Unresolved** |

An unresolved reference matches no note. The stream is empty and a notice says
why. Dropping the condition instead would be the dangerous reading: a template
note whose property is not yet filled in would stream the whole vault.

**Rejected at parse time**, because each would otherwise match nothing in
silence:

- `Project: this.` — no field name.
- `Project: [this.Project, Alpha]` — a reference inside a list. A list means
  "any of these values"; the existing rule already bars comparisons and
  `exists`/`missing` there.
- `date: ">this.start"` — a reference in a comparison operand.

## 4. Architecture

The parser marks the reference; a separate pure step resolves it; the runner
owns the resulting notice. Resolution cannot happen at parse time — a block is
parsed once in the `StreamChild` constructor, so a reference resolved there
would freeze at the host note's value on open.

### 4.1 Parse layer

`src/query/types.ts` — `WhereCondition` gains `| { kind: "ref"; field: string }`.

`src/query/parse.ts` — `parseCondition` order becomes: empty value →
`exists`/`missing` → **reference** → comparison → equality. `asAnyOfValue` and
the comparison branch raise the two rejections above.

### 4.2 Resolution

`src/engine/context.ts` (new):

```ts
export function resolveRefs(
  query: StreamQuery,
  host: NoteMeta | null,
): { query: StreamQuery; unresolved: string[] };
```

Pure. Maps each `ref` clause through `resolveField(host, field)` per the table
in section 3; an unresolvable one stays a `ref` and its field name joins
`unresolved`. When the query holds no reference it is returned unchanged, with
no new object allocated.

`src/engine/filter.ts` — `matchesClause` gains `case "ref": return false;`. An
unresolved reference matching nothing is the behavior, not an oversight, and
the switch is exhaustive so the case cannot be forgotten.

### 4.3 Runner

`src/engine/run.ts` — `runStream` calls `resolveRefs` first and works from the
resolved query throughout, including the second `filterNotes` pass that judges
`dateFallback`. A non-empty `unresolved` pushes a new notice
`{ kind: "unresolvedRef"; fields: string[] }` **first** in the list: it is the
notice that explains the emptiness, so it reads before the others.

`StreamResult` gains `query: StreamQuery` — the resolved query — so the view's
empty-stream summary can print `Project = Alpha` rather than `this.Project`.

The signature changes from `runStream(notes, query, now, locale?)` to
`runStream(notes, query, now, options?: { locale?: string; host?: NoteMeta | null })`.
Two optional positional arguments is where a host gets passed as a locale; the
cost is a mechanical edit at roughly twenty test call sites.

### 4.4 Obsidian layer

`src/obsidian/adapter.ts` — `hostNote(app, sourcePath): NoteMeta | null`, built
from `getFileByPath` plus `getFileCache` through the existing `toNoteMeta`.
`null` for an empty or unknown path.

`src/view/StreamChild.ts` — `compute()` passes `hostNote(this.app, this.sourcePath)`;
the empty branch calls `describeQuery(result.query)`.

### 4.5 Live updates

No change to `StreamRegistry`. It already debounces a refresh on every
`metadataCache` "changed" event, and that covers the host note, so editing
`Project` re-runs resolution on the next flush.

One addition to `signatureOf`: the resolved `where` clauses join the signature.
Without them, a reference moving from Alpha to Beta while both match zero notes
leaves groups and notices identical, no re-render fires, and the summary line on
screen keeps naming Alpha.

## 5. Words

The engine reports facts; `StreamChild.describeNotice` owns the sentence, and it
goes through `setCodeText` so the backticks render as code:

> This note has no usable `Project`, so this stream matches nothing. Give it
> a value in the note's properties.

"Usable" and "give it a value" hold whether the property is absent or present
and empty (`[]`, `{}`, `""`) — the previous wording asserted absence and told
the reader to add something that, for the present-but-empty cases, is already
there.

Several fields join with `or`, as `unresolvedSort` does. In the summary line an
unresolved reference prints as `Project = this.Project (not set here)`.

Parse errors follow the file's existing shape, each ending in an example:

- `` `where.Project`: `this.` needs a property name, as in `Project: this.Project`. ``
- `` `where.Project` cannot use `this.Project` inside a list. A list means "any of these values"; a `this.` reference has to be the whole condition. ``
- `` `where.date` cannot compare against `this.start`. A `this.` reference has to be the whole condition. ``

## 6. Testing

Test-driven: each behavior red first.

| File | Covers |
|---|---|
| `tests/query/parse-where.test.ts` | reference parsed, case-insensitive prefix, `this.file.name`, the three rejections |
| `tests/engine/context.test.ts` (new) | scalar → equals, list → anyOf, absent / null / nested map / empty list / null host → unresolved, non-scalars dropped from a mixed list, a reference-free query returned unchanged |
| `tests/engine/filter-where.test.ts` | an unresolved reference matches no note |
| `tests/engine/run.test.ts` | notice emitted and ordered first, `result.query` resolved, options-object migration |
| `tests/obsidian/adapter.test.ts` | `hostNote`: present, missing, empty path |
| `tests/view/` | empty stream shows the notice above a summary carrying resolved values; editing the host note's frontmatter redraws |

No new performance measurement. `resolveRefs` returns on its first line for a
query holding no reference, so the budgets in `perf.test.ts` still hold.

## 7. Documentation

- `README.md` — a `this.` paragraph in the `where` rules, a template example
  (a block inside a project-note template, giving each project its own running
  history), and a line in the field table.
- `CHANGELOG.md` — an Unreleased entry.
- `docs/manual-testing.md` — creating a note from a template carrying the block,
  and the unfilled-property case.

## 8. Decisions on record

- **Unresolved matches nothing, rather than dropping the condition.** A
  template note with an unfilled property would otherwise stream the vault.
- **A resolved list is `anyOf`, not `all`.** It matches what writing the list
  by hand already means; `all` has no condition kind and would read as the
  opposite of the existing syntax.
- **`where` values only.** Other filter fields each carry their own
  normalization and their own absence semantics; the request does not need them.
- **A comparison operand is an error, not a resolution.** Left alone it would
  compare against the literal text and match nothing, silently.
- **No literal escape for text beginning with `this.`.** `file.` is reserved on
  the same terms.
- **One sentence for every unresolved reference, tuned to the common case.** A
  `this.file.name` reference is unresolvable only when there is no host note at
  all — an empty or unknown `sourcePath` — never because a note lacks a name.
  The notice's closing advice, "Give it a value in the note's properties", is wrong for
  that case. It is kept anyway: the frontmatter reference is what people write,
  a second notice kind would exist for a case reached only when a block has no
  file behind it, and the first sentence — that nothing can match — is true
  either way.
- **A stream on the host note's own property contains that note, and that is
  left to the folder answer, not fixed in code.** `where: { Project:
  this.Project }` in a project-note template matches the host note itself —
  its `Project` equals its own `Project` by construction — so `display: full`
  puts a row for the note the reader is already on into its own stream (the
  existing self-reference guard degrades that row to a preview rather than
  recursing, but the row is still there). The natural exclusion,
  `file.path: "!= this.file.path"`, is barred by §2: a `this.` reference
  cannot be a comparison operand, and it stays barred here — a literal
  alternative (`!= Some/Known/Path.md`) defeats the zero-edit-per-note point of
  the feature, and a special case letting only *this one* operand through
  `this.` would be a second, narrower syntax carved out of a rule adopted for
  its simplicity. Keeping the streamed notes in their own folder, which the
  README's worked example already does, is offered instead: it is a modeling
  choice available today, with no new syntax, and it is what excludes the
  project note from its own stream in practice.
