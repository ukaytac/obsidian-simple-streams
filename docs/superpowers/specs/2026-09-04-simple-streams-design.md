# Simple Streams — Design

Date: 2026-09-04
Status: Approved
Plugin id: `simple-streams` · Plugin name: `Simple Streams`

## 1. Overview

An Obsidian plugin that renders a filtered, sorted stream of notes wherever a
`stream` code block appears. Journal-shaped by default, but not journal-only:
the filter decides what the stream is. A reading log, everything tagged
`#project/x` this month, or every note in `Journal/` newest-first are the same
feature with different filters.

The unit of the stream is a **whole note** (one `.md` file per item). Streams live
**inside notes** as code blocks, so a filter is versioned with the note that
holds it and can be embedded in MOCs and dashboards.

```stream
folder: Journal
tags: [book]
sort: date desc
group: day
display: preview
limit: 50
```

## 2. Goals and non-goals

**Goals**

- Filter notes by folder, tags, title and frontmatter conditions.
- Sort by any frontmatter field or file property, ascending or descending.
- Group into date headers (day / month / year).
- Three body display modes: full markdown, plain-text preview, title only.
- Refresh itself when the vault changes.
- Stay responsive with hundreds of matching notes.
- No dependency on any other plugin.

**Non-goals for this version** (revisit only if the need proves real)

- A separate side-panel / tab view. The code block is the only surface.
- Block-level items (listing headings or bullets inside a note).
- A "+ New entry" capture button.
- Editing note content inside the stream.
- A custom query DSL. The block is plain YAML.
- A maintained inverted index. `metadataCache` is already in memory.

## 3. Query schema

The code block body is YAML. Every field is optional; an empty block means
"every note in the vault, newest first, as previews".

| Field            | Type                    | Default          | Meaning |
| ---------------- | ----------------------- | ---------------- | ------- |
| `folder`         | string or string[]      | whole vault      | Path prefix, subfolders included |
| `tags`           | string or string[]      | —                | All listed tags must be present (AND) |
| `tags-any`       | string or string[]      | —                | At least one of the listed tags (OR) |
| `exclude-folder` | string or string[]      | —                | Drop notes under these paths |
| `exclude-tags`   | string or string[]      | —                | Drop notes carrying any of these tags |
| `title`          | string or `/regex/`     | —                | Matches the note's basename: case-insensitive substring, or regex when wrapped in slashes |
| `where`          | map                     | —                | Frontmatter conditions (§3.3) |
| `date-field`     | string                  | `file.ctime`     | Which field is "the date" for range filtering and grouping |
| `from`           | date expression         | —                | Inclusive lower bound on the resolved date |
| `to`             | date expression         | —                | Inclusive upper bound on the resolved date |
| `sort`           | string or string[]      | `file.ctime desc`| `"<field> <asc\|desc>"`, applied in order |
| `group`          | `day\|month\|year\|none`| `none`           | Date headers |
| `display`        | `full\|preview\|title`  | `preview`        | How much of the body to render |
| `preview-length` | number                  | `200`            | Character budget for `preview` |
| `limit`          | number                  | `50`             | Maximum items in the stream |

### 3.1 Field references

Both `sort` and `where` address the same namespace:

- Any frontmatter key by its own name — `date`, `rating`, `status`.
- `file.ctime`, `file.mtime`, `file.name` (basename, no extension), `file.path`.

A frontmatter key that collides with a `file.*` name is reachable as written in
the note; `file.` is a reserved prefix and is never read from frontmatter.

Only a note's **own** frontmatter keys are visible. A plain JavaScript object
inherits `toString`, `constructor`, `hasOwnProperty` and friends, so an
unguarded lookup would report those as present on every note — `where:
{ toString: exists }` would match the whole vault, and a sort on one would hand
a function to the comparator and order notes by its source text.

Note the one name used two ways: the top-level `title` **filter** always matches
the note's basename, while `title` as a **field reference** inside `sort` or
`where` reads frontmatter `title`. Use `file.name` when you mean the basename in
those positions.

### 3.2 Matching rules

**Folders** match on a path prefix at a `/` boundary, so `folder: Journal`
matches `Journal/2026-09-04.md` but never `Journal2/x.md`. Comparison is
case-insensitive.

**Tags** are collected from both frontmatter `tags:` and inline `#tags`
(Obsidian's `getAllTags`). In the query the leading `#` is optional **but must
be quoted if written** — `tags: ["#book"]`, not `tags: [#book]` — because YAML
reads a bare `#` as the start of a comment. Comparison is case-insensitive.

That quoting rule is a trap rather than a detail: Obsidian users write tags with
a hash everywhere else, so it is the mistake they will actually make, and YAML
punishes the two spellings differently. `tags: [#book]` fails to parse with a
message about comment separation, while `tags: #book` parses *successfully* as
`tags: null` and would otherwise report only that the field expects text. Both
error messages therefore name the real cause and show the quoted form. A nested tag matches its ancestors at a `/`
boundary: `tags: [project]` matches a note tagged `#project/simple-streams`.

### 3.3 `where` conditions

Each key is a field reference; the value is one of:

| Value form            | Meaning |
| --------------------- | ------- |
| scalar (`status: done`) | Equality. Numeric when both sides are numeric, otherwise case-insensitive string compare |
| array (`type: [a, b]`)  | Matches any listed value |
| `exists` / `missing`    | Presence of the field |
| `">3"`, `">=3"`, `"<3"`, `"<=3"`, `"!=x"` | Comparison — numeric if the operand is numeric, chronological if it parses as a date, otherwise string compare |

If the note's own value is an array, the condition matches when **any** element
matches.

A field that is absent (or null) matches only `missing`. It fails equality,
any-of and every comparison, including `!=` — a field with no value is not a
value, so `status: "!=done"` does not pull in notes that have no `status` at
all.

Comparison operators must be quoted, because `rating: >3` is not valid YAML.
This is the accepted cost of a plain-YAML schema; the alternative
(`rating: {gt: 3}`) is cleaner to parse but noisier to write.

An operator with nothing after it is an error. `">="`, `">"`, `"> "` and the
rest have no operand, and every reading of them is a guess: left alone they
compare against the string `"="` or against nothing at all, and produce a
filter that quietly matches the wrong notes.

`exists` and `missing` are reserved words in this position, and so is any value
beginning with `<`, `>` or `!=`. Matching a frontmatter value that is literally
`exists`, or literally `>90% done`, is not supported. That is a real limitation
and the right size of fix is to say so: an escape spelling like `equals:` would
add a second way to write every condition for a corner case that is rare in a
vault.

**A list means any-of and nothing else.** A comparison or a reserved word inside
one is an error, not a value. `rating: [">3", "<10"]` is the obvious way to
reach for a range, and left alone it asks for notes whose rating is the literal
text `">3"` — matching nothing, silently. An **empty** list is an error too, and
here it differs from `tags: []` on purpose: an empty `tags` is an unambiguous
way to say "no tag constraint", whereas a `where` field named with no values can
only ever match nothing, so it is always a mistake.

### 3.4 Date expressions

`from` and `to` accept:

- ISO dates — `2026-01-01`
- `today`, `yesterday`
- Relative offsets — `-30d`, `-2w`, `-6m`, `+1y`

All are resolved in local time at day granularity: `from` snaps to 00:00:00.000
and `to` to 23:59:59.999, so both bounds are inclusive whole days.

**An offset's sign is required.** `-30d` is thirty days ago, `+30d` thirty days
ahead; a bare `30d` is an error, not a guess. Both directions are useful — a
past bound for journal entries, a future one for `due` dates — so there is no
safe default, and silently picking one would turn a typo into an empty stream
with no explanation.

**Month and year offsets clamp to the end of the target month.** One month
before 31 March is 28 February, and one year before 29 February 2028 is
28 February 2027. This has to be said because the obvious implementation gets
it wrong: JavaScript's `setMonth` overflows rather than clamping, so 31 March
minus one month computes 31 February and rolls forward to 3 March — and 31 May
minus one month lands back on 1 May, which would make `from: -1m` exclude
nearly everything. A year offset is twelve months, clamped the same way.

**An offset's magnitude is capped at 100000 units.** Past that, the resulting
date exceeds what a `Date` can represent and becomes `NaN`, and a `NaN` bound
fails both `<` and `>` — the bound would be silently dropped rather than
filtering anything, which is the worst kind of wrong. An out-of-range offset is
an error instead.

The date a note is filtered and grouped by is the value of `date-field`. If that
field is missing or unparseable, the note falls back to `file.ctime`.

That fallback is silent per note, deliberately: a stream mixing notes that
carry a `date:` and notes that do not should still read in one order, and
annotating individual items would be noise. But it hides one real mistake —
a typo in the field name itself, `date-field: dat`, leaves every note falling
back and the whole stream ordered by file creation time with nothing to say
so. So the view says it once, in aggregate: when a **non-default**
`date-field` yields no parseable value for any note the query reached, the
stream notes that it fell back. One line for the whole block, not one per item.

"Reached" means before the date range narrowed the result, not after, and that
distinction is the whole point. A typo'd `date-field` sends every note onto the
`file.ctime` fallback; a `from`/`to` range then filters on creation time and can
exclude everything; and an empty result would suppress the very notice meant to
explain the typo. Measured on two notes created in January with
`date-field: dat` and a June range: judged after the range the notice is
silent, judged before it the notice fires.

A `sort` field has the same failure and gets the same treatment. Because a
missing value sorts last, a sort key that resolves for *no* note leaves every
note tied and the order falls through to the `file.path` tie-break — so
`sort: file.ctim desc` silently becomes alphabetical-by-path, looking like a
working stream in the wrong order. Any sort field that resolved for nothing on
screen is named in the same notice.
An ISO-shaped triple that is not a real date — `2026-02-30`, `2026-13-40` —
counts as unparseable and falls back too, **with or without a time of day**.
It must not be accepted, because JavaScript rolls such a triple over into a
different real date: `2026-02-30` becomes 1 March, which would then sort and
group as 1 March with nothing on screen to say so. The time-of-day form needs
saying separately because `Date.parse` validates the hour but not the day, so
guarding only the bare `YYYY-MM-DD` form leaves `2026-02-30T08:30` rolling over
exactly as before.

### 3.5 Sorting and grouping

Sort keys apply in the order given. Missing values sort **last** in both
directions — a note with no `rating` should not lead a `rating desc` stream nor a
`rating asc` one. A value that is not finite — `NaN`, `Infinity` — counts as
missing too, since there is no position on a number line to give it.

Only a decimal numeral is read as a number. An ISO date stays text, because
ISO-8601 already sorts chronologically under numeric collation and converting
it to a timestamp put it on the same axis as ordinary numbers: a `year: 2026`
field landed about fifty-six years from a `year: "2026-01-01"` one, since 2026
as a timestamp is two seconds into 1970. Vaults accumulate exactly that kind of
drift as templates change. For the same reason `0x10` stays the text it looks
like rather than becoming 16. Ties break on `file.path` ascending so the order is stable
across renders. Numbers compare numerically, dates chronologically, strings via
`localeCompare` with numeric collation.

Grouping reads the resolved date and emits a header whenever the key differs
from the previous item. Headers are formatted with `Intl.DateTimeFormat` in the
app's locale: `4 September 2026` for `day`, `September 2026` for `month`, `2026`
for `year`.

**When grouping is on, the resolved date leads the sort** and the declared
`sort` keys order notes within each group. The direction comes from the declared
sort when its first key is the date field, and is newest-first otherwise. This
is not a nicety: headers come from item-to-item transitions, so without it
`group: day` with `sort: title asc` scatters the days and emits one header per
note. Measured on five notes across three days, that produced five headers with
two dates repeating non-adjacently — a grouping feature that looks broken
rather than faithful. A title-sorted journal is an ordinary thing to ask for,
so the two settings have to compose.

Text is compared with the host's collation, not a pinned locale, because a
Turkish or Swedish user sorting their own notes wants their own alphabet. The
consequence is that two machines with different system locales can order the
same ties differently — `ıyı` and `Iyi` swap between Turkish and English — and
that is accepted. The sort takes an explicit locale so a test can pin one.

## 4. Architecture

The one structural rule: **the engine never sees the Obsidian API.**

```
main.ts                 plugin entry; registerMarkdownCodeBlockProcessor("stream")
query/types.ts          StreamQuery, SortSpec, GroupSpec, WhereCondition
query/parse.ts          YAML text -> StreamQuery, with validation
engine/note.ts          NoteMeta: { path, basename, tags, frontmatter, ctime, mtime }
engine/fields.ts        field resolution and value coercion
engine/dates.ts         date expressions, day/month/year keys
engine/filter.ts        (NoteMeta[], StreamQuery) -> NoteMeta[]
engine/sort.ts          ordering rules
engine/group.ts         ordered list -> grouped list
engine/run.ts           filter -> sort -> limit -> group -> StreamResult
obsidian/adapter.ts     TFile + metadataCache -> NoteMeta[]        <- the only bridge
obsidian/registry.ts    mounted streams, debounced refresh
view/StreamChild.ts     MarkdownRenderChild: DOM, lazy loading, lifecycle
view/itemEl.ts          one item's DOM
view/errorEl.ts         the error box
styles.css
```

Data flow: code block -> `parse` -> `adapter` produces plain data -> `run`
(pure) -> `StreamChild` renders.

`engine/*` and `query/*` operate on plain objects, so they are testable without
a running Obsidian. `obsidian/*` is deliberately thin: translation, no logic.

Data source is `vault.getMarkdownFiles()` plus `metadataCache.getFileCache()` —
both already in memory. No index of our own; filtering a vault of a few thousand
notes costs single-digit milliseconds, and the real cost is rendering, which
lazy loading handles.

## 5. Rendering

Container `.simple-streams`, one `.ss-item` per note, `.ss-group` headers
between items where the group key changes, sticky within the block.

Each item has a header row: the title as an internal link
(`workspace.openLinkText`; cmd/ctrl-click opens a new tab), the resolved date,
and tag chips. Then the body:

- **`title`** — header only.
- **`preview`** — plain-text excerpt via `vault.cachedRead`: strip frontmatter,
  drop a leading H1 that duplicates the title, collapse whitespace, cut on a word
  boundary at `preview-length`, append an ellipsis. Deliberately not rendered as
  markdown: truncating markdown mid-structure yields half-open code fences and
  dangling list items.
- **`full`** — `MarkdownRenderer.render()` on the body minus frontmatter, into a
  per-item `MarkdownRenderChild` parented to the stream's own child. The
  parenting matters: without it, embeds and other plugins' render children inside
  items leak when the block is destroyed.

Lazy loading renders the first 20 items, then a sentinel element watched by an
`IntersectionObserver` (`rootMargin: 200px`) renders the next 20 as it
approaches. `limit` caps the total.

An empty result renders a muted "No notes match this stream." plus a one-line
summary of the resolved query, so the reader can see what was actually asked.

## 6. Live updates

`obsidian/registry.ts` holds the mounted streams and subscribes to
`metadataCache.on("changed")` and `vault.on("create" | "delete" | "rename")`. It
debounces 300 ms and coalesces all events into one pass.

Per stream it re-runs the query and computes a signature: the joined
`path:mtime` of the post-limit result. An unchanged signature does no DOM work at
all. A changed signature re-renders, preserving the number of loaded pages and
restoring `scrollTop` so the stream does not jump under the reader.

`metadataCache.changed` fires on save rather than per keystroke, so editing a
note that appears in the stream stays calm. Streams unregister in
`StreamChild.onunload()`.

## 7. Error handling

Every failure is visible in the block, never only in the console.

- **Invalid YAML** — the parser message and the offending line.
- **Unknown field** — names the field, the nearest valid one by edit distance,
  and the full list of valid fields. This is the `tag` vs `tags` case, and it is
  a hard error: silently rendering an unfiltered vault is the worst possible
  outcome. The full list is always shown, even alongside a confident guess,
  because no edit-distance rule over a list containing a two-letter field name
  (`to`) is free of false positives — and a wrong guess that hides the real
  list is worse than no guess at all. For the same reason nothing shorter than
  three characters gets a guess.
- **Invalid value** — `display: foo`, a bad date expression, a bad sort direction:
  names the field and lists the accepted values.
- **An empty value** — `tags: ""`, `tags: [book, ""]`, or `title: ""`. This is
  an error, not a value to drop. An empty `title` is the quieter half of the
  same mistake: it matches every note, so the field reads as a filter and
  behaves as if it were absent. Dropping it silently would turn the first into no tag filter
  at all and quietly delete one constraint from the second, which is the
  unfiltered-vault outcome again. An explicitly empty list, `tags: []`, is
  still an unambiguous way to say "no constraint" and stays legal.
- **A note that fails to read** — degrades to one muted warning row; the rest of
  the stream still renders.

## 8. Testing

Vitest. Because `engine/*` and `query/parse.ts` are pure, most of the suite is
fast and exercises real code paths. Table-driven coverage of:

- Filter combinations: AND tags, OR tags, exclusions, and folder-prefix
  boundaries (`Journal2` must not match `Journal`).
- Nested-tag ancestor matching.
- `where` conditions: equality, any-of, comparisons, `exists`/`missing`, and
  array-valued frontmatter.
- Sorting: missing values last in both directions, stable tie-breaking, and each
  value type.
- Date expressions: ISO, `today`, `yesterday`, relative offsets, inclusive
  bounds.
- Grouping: month and year boundaries, local-time correctness, repeated headers
  when the sort is not the date field.
- Field resolution: frontmatter, `file.*`, the reserved `file.` prefix, fallback
  to `file.ctime`.
- `parse`: a valid/invalid table asserting every error message.

`obsidian/adapter.ts` gets a minimal `obsidian` module mock. `view/*` is verified
manually against `test-vault/`, an in-repo vault with sample notes and a page of
`stream` blocks covering each display mode, grouping, and the error cases.

Implementation follows TDD: tests before implementation, engine before view.

## 9. Build and packaging

esbuild + TypeScript, the standard Obsidian plugin layout: `manifest.json`,
`versions.json`, `npm run dev` watch emitting `main.js`, `npm run build` for
release. `main.js` and `data.json` stay out of git.

## 10. Decisions on record

| Decision | Rationale |
| -------- | --------- |
| Whole notes as items, not blocks | Matches the journal-note model; block splitting needs rules that do not exist yet |
| Code block, not a panel view | Filters get versioned with the note and embed into dashboards |
| Plain YAML, not a DSL | A custom lexer/parser would consume most of the effort for a syntax nobody asked for |
| `metadataCache` directly, not Dataview | No hard dependency on another plugin's release cycle |
| No inverted index | Solves a problem that does not exist at this vault size; add it behind `run.ts` if measurement ever demands it |
| Unknown fields are errors | A typo'd filter that lists the whole vault is worse than a visible failure |
