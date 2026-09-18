# Section field — Design

Date: 2026-09-18
Status: Approved

## 1. Overview

A stream's `preview` display shows the first `preview-length` characters of a
note's body. That is the right default when the stream is a journal feed, where
a note's opening words are what it is about. It is the wrong one when the stream
is a project's index: the notes there all answer the same question somewhere in
their body, and their first paragraph is whatever context they happened to open
with.

The request that prompted this came from a reader keeping a project's "central"
note, with a stream listing every note linking into that project. They wanted
the preview to carry each note's `Objective` section instead of its opening
words:

> What would be great though would be to define that say only the text under
> head 'Objective' comes in rather than a chunk of the full note. That way I
> could see that section from each linked note.

The feature is a narrowing, but its value is consistency. Twelve related notes
shown as twelve opening sentences are twelve unrelated fragments; the same
twelve shown as twelve `Objective` sections are a column you can read down and
compare. That distinction decides every other question in this design — most of
all what happens to a note that has no such heading.

A new `section` field narrows what a stream item's body is taken from: the
content under the named heading, or nothing at all.

```yaml
where:
  Project: this.Project
display: preview
section: Objective
```

## 2. Goals and non-goals

**Goals**

- Take each item's body from one named section rather than the note's opening.
- Keep the column consistent: a note without that heading shows no body, not a
  different note's worth of text.
- Work for `display: full` as well as `display: preview`, so a section can be
  rendered as real markdown — lists and links intact — and not only as clipped
  plain text.
- Leave every stream that renders today rendering identically.

**Non-goals for this version**

- Several sections at once (`section: [Objective, Status]`).
- `/regex/` or substring heading matching.
- Filtering the stream by whether a note has the section. `section` decides what
  is shown, never which notes match; `where` remains the only filter.
- A notice, count or marker for notes missing the section. See §6.

Each of these stays addable later without changing what this version does.

## 3. Query surface

One new field, `section`, holding a single string and absent by default.

| Field | Value | Default | Meaning |
|---|---|---|---|
| `section` | text | — | Take the body from under this heading |

- `QUERY_FIELDS` gains `section`, next to `display`, and `StreamQuery` gains
  `section: string | null` with `defaultQuery()` returning `null`.
- `applyField` gains a `case "section"` reading `toSingleString`, as
  `date-field` does. `section: ""` is rejected by that helper already, with the
  wording it uses for every scalar field.
- The switch in `applyField` ends in `assertNever`, so adding the field to
  `QUERY_FIELDS` without handling it fails to compile. Nothing here relies on
  remembering to update the parser.
- `section` is inert under `display: title`, which returns before the file is
  read. The README says so rather than the parser rejecting the combination: a
  reader switching `display` between modes should not have their block start
  erroring.

## 4. Slicing: `sliceSection`

`src/engine/preview.ts` gains one exported function, beside `stripFrontmatter`:

```ts
export function sliceSection(content: string, heading: string): string | null
```

It returns the text under the first matching heading, or `null` when the note
has no such heading.

Rules:

- Frontmatter is dropped first, by the existing `stripFrontmatter`.
- A heading is a line matching `#{1,6}` followed by whitespace and text, **and
  not inside a fenced code block**. The scan tracks ` ``` ` and `~~~` fences and
  ignores headings within them, so a `# Objective` line in a shell example is
  code, not a section.
- Matching is exact on the trimmed, lower-cased heading text: `section:
  objective` finds `## Objective` and `### objective`, and does not find
  `## Objectives`. This is the rule `normalizeTag` already applies to tags.
  Vaults spell headings inconsistently; they do not usually spell them
  *approximately*.
- Heading level is not part of the match. `## Objective` and `### Objective` are
  both found, because a reader asking for a section by name is not thinking
  about depth.
- The section ends at the next heading of the **same or a shallower** level, so
  its own sub-headings stay inside it.
- The matched heading line itself is not returned. The query already names the
  section; repeating it on every item is noise, and under `display: preview` it
  would be worse than noise — `stripMarkup` drops the `#`, so every preview
  would open with the word "Objective" spending the character budget.
- A heading appearing twice yields the first occurrence.
- A heading with nothing under it yields an empty string, which §5 treats as no
  body. The distinction from `null` is kept in the return type anyway, because
  the two are different facts and a later caller may need to tell them apart.

Setext headings (`Objective` underlined with `===`) are not recognised. They are
rare, Obsidian's own editor does not produce them, and recognising them is the
one thing the alternative in §8 would have bought.

## 5. Rendering

`renderItem` in `src/view/itemEl.ts` reads the file once and then branches on
`display`. The narrowing goes between those two: after `cachedRead`, before the
`ss-item-body` element exists.

```
read content
  → if query.section is set:
      slice it; if null or blank, return — no body element is created
  → display: preview → extractPreview(...)
  → display: full    → MarkdownRenderer.render(...)
```

Placing it before the branch is what makes `section` work in both display modes
for free, and keeps the two modes from growing separate ideas of what the body
is. `display: full` with a `section` renders that section's real markdown; the
same block with `display: preview` renders its first `preview-length`
characters as text.

The item's header — title link, date, tags — is already rendered by then, so an
item with no body still appears, is still clickable and still carries its date.

Two existing behaviours are unaffected and stay that way:

- The self-reference guard. A note holding the stream that appears in its own
  results still falls back to a preview with its warning, because rendering it
  in full would nest the stream inside itself. The slice happens first, so the
  fallback previews the section.
- The unreadable-file warning. A file that cannot be read is a fault and still
  says so; a missing heading is not a fault and does not.

## 6. A missing section is silent

No new `StreamNotice`, no per-item marker, no count.

The engine never reads note bodies — it works from `NoteMeta`, which carries
metadata only. A missing section can therefore only be discovered at render
time, per item, which is the wrong altitude for the notice machinery in
`runStream` and would mean giving the engine a reason to read every file.

More importantly it is the wrong behaviour. In the case this feature exists for,
several notes in a list *will* lack the heading, permanently — that is a fact
about the vault, not an error to report. A warning line repeating under five of
twelve items would add more noise than the opening paragraphs this feature
removed. An item with no body reads as "nothing written here yet", which is both
true and useful, and it keeps the column scannable: the eye runs down the
sections that exist.

This is the same judgement `extractPreview` already makes when a note is empty.

## 7. Testing

`tests/engine/preview.test.ts` — `sliceSection` directly:

- finds a section and returns the text under it, without the heading line
- matches case-insensitively, and across heading levels
- keeps sub-headings inside the section
- stops at the next same-level and at the next shallower heading
- ignores a `#` line inside a fenced code block, both ` ``` ` and `~~~`
- ignores headings in frontmatter
- returns the first of two identically named headings
- returns an empty string for a heading with nothing under it, including one at
  end of file
- returns `null` when no heading matches

`tests/view/rows.test.ts` — through the existing render harness:

- `section` narrows what `display: preview` shows
- `section` narrows what `display: full` renders
- a note without the heading renders no `.ss-item-body`, but keeps its header
- `section` with `display: title` changes nothing

`tests/query/parse-scalars.test.ts`:

- `section: Objective` parses
- `section:` with no value is rejected
- the unknown-field message now lists `section`

## 8. Alternative considered: Obsidian's heading cache

`metadataCache.getFileCache(file).headings` gives each heading's level and its
byte offsets, parsed by Obsidian itself — setext headings, fenced code and
escapes all handled correctly, and no parsing code in this repo.

Rejected on a failure mode. The offsets come from the metadata cache while the
text comes from `cachedRead`, and the two are separate caches updated
independently. Immediately after an edit they can disagree, and a stale offset
does not fail loudly: it slices the new text at the old position and shows a
section starting mid-word. Parsing the same string being sliced cannot
desynchronise from itself.

It also binds the slicing to the host app, while this engine keeps deliberately
to plain data, and it would mean mocking `headings` in tests that currently mock
nothing. What it would have bought — setext headings — is listed above as not
worth having.

## 9. Documentation

- README: a `section` row in the field table, and a short example showing the
  project-index case, which is the one that motivated the field. It states that
  notes without the heading show no body and that `display: title` ignores the
  field.
- CHANGELOG: an entry under `[Unreleased]`.

No version bump here; that belongs to the release, per `docs/publishing.md`.
