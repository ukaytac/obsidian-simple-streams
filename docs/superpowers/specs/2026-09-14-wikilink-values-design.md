# Wikilink property values — Design

Date: 2026-09-14
Status: Approved
Extends: `docs/superpowers/specs/2026-09-13-this-references-design.md`

## 1. Overview

Vaults that model relationships store them as links, so a note's `Project`
property holds `[[My Project]]` rather than `My Project`. Obsidian's metadata
cache hands that over as the string `"[[My Project]]"` — the brackets are part
of the text — and `scalarEquals` compares text. So today a stream matches only
when both notes happen to have written the relationship the same way:

| Host value | Candidate value | `this.Project` today |
|---|---|---|
| `My Project` | `My Project` | matches |
| `[[My Project]]` | `[[My Project]]` | matches |
| `My Project` | `[[My Project]]` | **no match** |
| `[[My Project\|MP]]` | `[[My Project]]` | **no match** |

The last two are the same relationship written two ways, and the reader is told
nothing — the stream is simply empty. This design makes matching agree with what
Obsidian means: `[[My Project]]`, `[[My Project#Goals]]`, `[[My Project|MP]]`
and `My Project` all name one note, so all four match each other.

It also accepts `[[this.Project]]` as a `where` value, because that is what
people write in a template when the property holds a link.

## 2. Goals and non-goals

**Goals**

- Compare property values as the notes they name, not as raw text.
- Accept `[[this.<field>]]` wherever `this.<field>` is accepted, and reject it
  wherever `this.<field>` is rejected.
- Keep `=` and `!=` agreeing about what equal means.
- Leave every stream that matches today matching.

**Non-goals for this version**

- Link-aware `sort` and `group`. Both read raw text and would need their own
  answers for how a link orders against a plain string; nothing in the request
  turns on it.
- Link-aware `title`, `folder` or `tags`. None of those is a property value.
- Resolving a link to a file. Matching is by name, as everything in this plugin
  is; a stream never touches the vault to ask whether `[[My Project]]` exists.
- An escape for a literal value that is genuinely the text `[[x]]` and must not
  be read as a link. `this.` is already reserved on the same terms.

## 3. Semantics

### 3.1 What counts as a wikilink

Trimmed text of the exact shape `[[...]]`, with no `[` or `]` inside. The
target is what precedes the first `|`, then what precedes the first `#`:

| Text | Target |
|---|---|
| `[[My Project]]` | `My Project` |
| `[[My Project\|MP]]` | `My Project` |
| `[[My Project#Goals]]` | `My Project` |
| `[[My Project#Goals\|MP]]` | `My Project` |
| `[[#Goals]]` | — not a link value: no target, so the text stands as itself |
| `![[My Project]]` | — an embed, not a value: the text stands as itself |
| `see [[My Project]]` | — not a whole link: the text stands as itself |

The target is trimmed, so `[[ My Project ]]` and `[[My Project]]` name the same
note. Anything that is not a whole wikilink compares as its own text, exactly as
today.

### 3.2 Matching

`scalarEquals` reduces both sides to their targets before comparing, keeping
the trim-and-lower-case rule it already applies. Equality therefore holds
across every pair in the table in §1, in both directions. `anyOf` inherits
this: it is `scalarEquals` in a loop.

This can only *add* matches. Reducing both sides by the same function merges
equivalence classes and never splits one, so no stream that matches today stops
matching. The change a reader could notice is that `where: { Project: "[[My
Project]]" }` now also matches a note holding the plain text `My Project` —
which is the point.

### 3.3 Comparison operators

`compareOrder`'s final text branch reduces both sides the same way, so `!=`
answers the question `=` answers. Left alone, `Project: "!=[[My Project]]"`
would call a note holding `My Project` different from one holding
`[[My Project]]` while `=` called them the same — an inconsistency, not a
second opinion. The number and date branches are untouched: a wikilink is
neither.

### 3.4 `[[this.<field>]]`

A `where` value of the shape `[[this.<field>]]` is a reference, resolved from
the host note exactly as `this.<field>` is, then written back as a link.

The value is unwrapped before it is wrapped, so the result is always exactly
one link:

| Host `Project` | `[[this.Project]]` resolves to |
|---|---|
| `My Project` | `[[My Project]]` |
| `[[My Project]]` | `[[My Project]]` |
| `[[My Project\|MP]]` | `[[My Project]]` |

Without the unwrap, the second row yields `[[[[My Project]]]]`, which matches
nothing and says nothing — and it is the common row, since a vault that stores
relationships as links stores them that way on the host note too.

A list resolves to an `anyOf` of links, one per member, on the same terms the
plain reference already uses. A `Date`-valued property keeps its existing
conversion and is wrapped after it, so `[[this.Due]]` yields `[[2026-09-14]]`
and daily-note links work with no special case.

Given §3.2, `[[this.Project]]` and `this.Project` match the same notes. The
syntax exists because it is what a template author writes when the property
holds a link, and because the alternative to reading it is reading it as the
literal text `"[[this.Project]]"` — an empty stream, in silence.

## 4. Architecture

### 4.1 `src/engine/links.ts` (new)

Two pure functions and no imports:

```ts
/** Comparison form: a whole wikilink reduced to its target, anything else itself. */
export function unwrapLink(text: string): string

/** One wikilink around the value, unwrapping first so nesting cannot occur. */
export function asLink(value: string | number | boolean): string
```

`asLink` takes the scalars `isUsable` admits, not just strings: a host property
of `5` or `true` is a complete value, and a note may well be named `5`. It
stringifies, then wraps.

A separate file rather than a corner of `filter.ts`: both callers below need it,
and it is the kind of rule that earns its own tests.

### 4.2 `src/engine/filter.ts`

`scalarEquals`'s string branch and `compareOrder`'s text branch each pass both
sides through `unwrapLink`. Nothing else in the file changes.

### 4.3 `src/query/types.ts`

```ts
| { kind: "ref"; field: string; link: boolean }
```

Required, not optional. Every construction site then states which form it came
from, and the compiler finds them all.

### 4.4 `src/query/parse.ts`

`LINK_REF = /^\[\[\s*this\.(.*?)\s*\]\]$/i`, matched case-insensitively for the
reason `THIS_REF` already is.

A single predicate recognizes both forms:

```ts
function isThisRef(text: string): boolean
```

It replaces every current `THIS_REF.test(...)`, so all three gates — the
condition path, the list-member rejection in `asAnyOfValue`, and the
comparison-operand rejection — see both forms. This is the load-bearing part of
the change: today `[[this.Project]]` passes through all three as ordinary text.
One predicate also means a third form added later cannot miss a gate.

A captured field name containing `|` or `#` is an error. An alias has no meaning
in a match, and looking up a frontmatter key literally named `Project|MP` would
report the host note missing a property nobody wrote.

### 4.5 `src/engine/refs.ts`

`resolveCondition` takes the clause's `link` flag and wraps each usable value
with `asLink`. `isUsable` runs first and is unchanged: a blank or absent host
property is unresolved, not `[[]]`.

### 4.6 `src/query/describe.ts`

An unresolved reference prints the form the reader wrote:
`Project = [[this.Project]] (not set here)`.

## 5. Words

Two parse errors, following the file's shape, each ending in an example:

- `` `where.Project`: `[[this.]]` needs a property name, as in `Project: "[[this.Project]]"`. ``
- `` `where.Project` cannot use `[[this.Project|MP]]`. A `this.` reference names a property, so an alias or heading has no meaning here. ``

The existing list and comparison-operand errors are reused verbatim for the
link form; they already say "a `this.` reference has to be the whole
condition", which is true of both spellings.

The unresolved-reference notice is unchanged.

## 6. Testing

Test-driven: each behavior red first.

| File | Covers |
|---|---|
| `tests/engine/links.test.ts` (new) | every row of the §3.1 table, both directions of `asLink`, whitespace inside the brackets |
| `tests/engine/filter-where.test.ts` | the §1 table matching in both directions, `anyOf` with a link member, `!=` agreeing with `=` |
| `tests/query/parse-where.test.ts` | `[[this.X]]` parsed as a link ref, case-insensitive, `[[this.file.name]]`, rejection inside a list, rejection as a comparison operand, empty field name, alias and heading |
| `tests/engine/refs.test.ts` | the §3.4 table, list → `anyOf` of links, `Date` → `[[YYYY-MM-DD]]`, blank host property still unresolved |
| `tests/query/describe.test.ts` | unresolved link ref prints `[[this.X]]` |
| `tests/view/this-refs.test.ts` | end to end: a host note holding a link, candidates holding the plain name, and the reverse |

No new performance measurement. `unwrapLink` runs only on the string branch of a
comparison that already builds strings, and `resolveRefs` still returns on its
first line for a query holding no reference, so `perf.test.ts`'s budgets hold.
The suite is the check.

## 7. Documentation

- `README.md` — a paragraph in the `where` rules saying that property values are
  compared as the notes they name, with the four-way table condensed to a
  sentence; `[[this.X]]` beside the existing `this.X` example.
- `CHANGELOG.md` — an Unreleased entry.
- `docs/manual-testing.md` — a vault with link-valued properties: the template
  case, and a host note whose own property is a link.

## 8. Decisions on record

- **Matching is normalized, rather than a new syntax alone.** `[[this.X]]` fixes
  only the case where the host is plain and the candidates are linked. The
  reverse, and a host carrying an alias, stay broken — and a template would then
  depend on the storage convention at both ends, which is the opposite of what a
  template is for.
- **Both sides are reduced, not just the query side.** Reducing one side would
  make matching asymmetric, and asymmetric equality is a bug waiting to be filed.
- **`!=` follows `=`.** Two operators disagreeing about equality is not a
  trade-off worth having.
- **`[[this.X]]` is accepted rather than rejected.** It is what people write, it
  reads correctly in a template, and the alternative to reading it is reading it
  as literal text — an empty stream with no error, the failure this parser is
  built to prevent. Rejecting it with a clear message was the other honest
  option; accepting it serves the request and costs one regex.
- **The host value is unwrapped before it is wrapped.** Wrapping literally would
  produce `[[[[My Project]]]]` on any vault whose host notes also store links —
  the common case for the people asking.
- **An embed (`![[x]]`) is not a link value.** It is a rendering instruction, it
  does not appear in a relationship property, and treating it as one would make
  `![[x]]` and `[[x]]` match.
- **`sort` and `group` keep reading raw text.** Ordering a link against a plain
  string needs its own answer, and nothing in the request turns on it. Revisit
  when someone sorts by a link-valued property and says the order is wrong.
