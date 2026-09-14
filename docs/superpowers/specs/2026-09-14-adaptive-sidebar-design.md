# Adaptive sidebar — Design

Date: 2026-09-14
Status: Approved
Extends: `docs/superpowers/specs/2026-09-13-this-references-design.md`

## 1. Overview

A native Simple Streams sidebar that follows the note you are looking at. Its
query is held in plugin settings and may name properties of the active note:

```yaml
where:
  Project: active.Project
sort: file.mtime desc
display: preview
```

Open the kitchen remodel note and the sidebar lists that project's notes; move
to a client note and it lists that client's. The result is a persistent related
notes feed beside the note being worked on, for projects, categories, people,
clients and other property-based workflows, with no per-note setup.

`this.` keeps its existing meaning — the note holding a stream block. `active.`
is its sibling for the one context that has no such note.

## 2. Goals and non-goals

**Goals**

- A sidebar view that renders a stream and re-points as the active note changes.
- An `active.<field>` reference resolved against the note the workspace is on.
- Refresh on active-note change and on the metadata changes already tracked.
- One query, held in settings, editable without touching a note.
- Identical rendering, paging and notices between the sidebar and a code block.

**Non-goals for this version**

- `active.` in `folder`, `tags`, `title`, `from` or `to`. Each runs its own
  normalization and would need its own answers for a resolved list, number and
  absence — the same reasoning that kept `this.` out of them.
- Named presets or a query picker in the sidebar. One query, one feed.
- More than one sidebar instance, or a per-note query override.
- A manual refresh button. Needing one would be a bug in section 8, not a
  feature.

## 3. Syntax and semantics

A `where` value beginning with `active.` is a reference to a property of the
currently active note. It mirrors `this.` in every respect:

| Aspect | Behavior |
|---|---|
| Prefix match | Case-insensitive (`active.`, `Active.`), as `this.`, `exists` and `missing` already are |
| Field name | Keeps its exact case; frontmatter lookup is case-sensitive |
| File properties | `active.file.name`, `active.file.path`, `active.file.ctime`, `active.file.mtime` resolve through the same `resolveField` every candidate note uses |
| Link spelling | `[[active.Project]]` resolves link-wrapped, through the existing `asLink`/`wrap` path |
| Host value rules | Scalar → `equals`; list → `anyOf`; `Date` → `YYYY-MM-DD`; blank, absent or nested → unresolved. Unchanged from `this.` |

Rejected with an error, on exactly the terms `this.` is:

- inside a list (`Project: [active.Project, Beta]`)
- as a comparison operand (`date: ">active.start"`)
- a near-miss link (`![[active.X]]`, `[[ active . X ]]` with text either side)
- an alias or heading (`[[active.Project|MP]]`, `[[active.Project#Log]]`)
- an empty field name (`active.`, `[[active.]]`)

The `NEAR_LINK_REF` guard widens to cover both prefixes, so neither spelling can
fall through to a literal equality and an empty stream.

## 4. Scope is part of the reference

`WhereCondition`'s `ref` variant gains a required `scope`:

```ts
export type RefScope = "this" | "active";

| { kind: "ref"; field: string; link: boolean; scope: RefScope }
```

Required rather than optional, for the reason `link` is: every construction site
states its answer, and the compiler finds every site.

## 5. Context gating stays out of the parser

`parseQuery` stays context-free and pure — it does not know whether it is
parsing a block or the sidebar setting. A new pure module `src/query/scopes.ts`
rejects the scope the caller cannot answer, throwing `QueryError` with the field
named, before the query is ever run:

- A code block holding an `active` ref:

  > `where.Project` cannot use `active.Project` here. `active.` names the note
  > you are looking at, which only the Simple Streams sidebar follows. Use
  > `this.Project`.

- The sidebar query holding a `this` ref:

  > `where.Project` cannot use `this.Project` here. The sidebar has no note
  > holding the block. Use `active.Project`.

A block's results must not depend on which pane has focus, which is what
allowing `active.` in blocks would mean: two panes showing the same note would
disagree. Gating at the use site rather than in the parser keeps `parseQuery`
one pure function with one meaning.

It is called at each use site immediately after `parseQuery`: in
`StreamChild`'s constructor for a block, and when the sidebar builds a child for
the setting. Because gating runs before resolution, a single run can only ever
hold refs of one scope.

## 6. Resolution

`resolveRefs(query, host)` becomes `resolveRefs(query, context)` where the
context is `{ host: NoteMeta | null; active: NoteMeta | null }`. Each ref
resolves against the note its scope names; every existing rule for what a host
value yields is unchanged.

`StreamOptions` gains `active?: NoteMeta | null` beside the existing `host?`.

`StreamNotice`'s `unresolvedRef` gains the same `scope`, so the view can choose
its words:

- `this` — "This note has no usable `Project`, so this stream matches nothing.
  Give it a value in the note's properties." (unchanged)
- `active` — "The note you are looking at has no usable `Project`, so this
  stream matches nothing. Give it a value in the note's properties."

`describeQuery` echoes an unresolved reference in the spelling the reader wrote:
`active.Project` or `[[active.Project]]`.

## 7. Self-exclusion

`StreamOptions` gains `excludePath?: string`. `runStream` drops that path from
the note pool **before** filtering, so `matched`, `shown` and the `truncated`
notice all describe the same population the reader sees.

The sidebar passes the followed note's path. A query like
`Project: active.Project` matches the active note itself, and a related-notes
feed whose top result is the note already on screen is noise. Code blocks pass
nothing; `renderItem`'s existing host-note guard already covers them.

## 8. The view

`src/view/StreamSidebarView.ts`, an `ItemView` with type
`simple-streams-sidebar`, titled "Simple Streams". Opened by a ribbon icon and a
command, revealed in the right leaf. Never auto-opened on load.

```
┌─ Simple Streams ─────────────┐
│ Following: Kitchen Remodel   │  .ss-sidebar-header
├──────────────────────────────┤
│ Tile quotes                  │  StreamChild, unchanged
│ Yesterday · Alpha            │
└──────────────────────────────┘
```

The header names the followed note. Without it, an empty feed gives the reader
no way to tell which note it is answering for — the one ambiguity a sidebar has
that a code block does not.

The view owns one `StreamChild` over a body element. **When the followed note
changes, the view unloads that child and builds a fresh one.** That resets
paging, scroll position and the render signature for free, through the unload
path the repo already tests, instead of adding a re-point API that would have to
reach into `pages`, `generation` and `pagingGeneration` from outside — the
fields whose invariants are the most carefully guarded in the codebase.

`StreamChild` stops calling `hostNote(app, sourcePath)` inside `compute()` and
takes an injected context instead: `{ host, active }` plus the `sourcePath` used
for link resolution. Call sites:

| Caller | host | active | sourcePath |
|---|---|---|---|
| Code block | `hostNote(app, ctx.sourcePath)` | `null` | the block's note |
| Sidebar | `null` | the followed note | the followed note's path |

The sidebar's `sourcePath` is the followed note's path so previews resolve
relative links the way that note would.

## 9. Following the active note

`src/obsidian/activeNote.ts` holds a tracker. On `workspace` events
`active-leaf-change` and `file-open`, and on vault `rename` and `delete`, it
resolves the followed note in three rules, in order:

1. An active `MarkdownView` with a file — follow it.
2. Otherwise, if the currently followed file is still open in some markdown leaf
   — keep it. Asked of `workspace.getLeavesOfType("markdown")`, comparing each
   leaf view's file path against the followed one.
3. Otherwise, if `workspace.getActiveFile()` is a markdown file — follow it.

Falling through all three follows nothing.

Rule 2 is the stickiness. Clicking into the sidebar, or opening a PDF or canvas,
makes rule 1 fail; without rule 2 the feed would blank the moment the reader
reached for it. Rule 3 covers startup, where a note is open but focus sits
elsewhere.

A rename of the followed file re-points to the new path. A delete falls back
through the same rules. The tracker emits only when the followed path actually
changes, so the view rebuilds only when the answer differs.

With nothing followed, the sidebar shows: "Open a note to see related notes."

## 10. Refresh

The sidebar's `StreamChild` registers in the existing `StreamRegistry`. Metadata
and vault changes therefore refresh it on the same 300 ms debounce and the same
signature short-circuit as any block — including edits to the followed note's
own properties, which is the case this feature exists to follow.

Active-note changes bypass the debounce and rebuild immediately: they are a
direct user action, and a third of a second of the previous note's feed reads as
lag.

The child unregisters through its own `register()` callback on unload, as code
block children already do, so a rebuild cannot leave a stale stream in the
registry.

## 11. Settings

`src/settings.ts`:

```ts
interface SimpleStreamsSettings {
  sidebarQuery: string;
}
```

defaulting to the query in section 1. A settings tab offers one multi-line text
area, validated live through the pure `parseQuery`. A parse error shows inline
under the field and in the sidebar, and **the setting still saves** — a
half-typed query must never lock the user out of the field they are typing in.

The value saves on every input event, as an Obsidian setting normally does, but
the sidebar rebuild is debounced on the same 300 ms the registry uses. Rebuilding
per keystroke would re-run the whole vault scan for each character of
`active.Project` and leave the reader watching an error box flicker through every
prefix of a word they are still typing.

## 12. Styles

`styles.css` gains `.ss-sidebar-header` and `.ss-sidebar-empty`. Everything
below the header is the existing `.simple-streams` tree, unchanged.

## 13. Error handling

| Case | Behavior |
|---|---|
| Sidebar query does not parse | The existing error box, in the sidebar body |
| Sidebar query holds `this.` | Section 5's `QueryError`, in the same box |
| Block holds `active.` | Section 5's `QueryError`, in the block |
| Active note lacks the property | `unresolvedRef` notice, active wording |
| No note followed | "Open a note to see related notes." |
| A refresh throws | `showError` on the child, as today |

No failure reaches the console alone.

## 14. Testing

| Area | Coverage |
|---|---|
| `query/parse` | `active.X`, `[[active.X]]`, every rejection in section 3, `scope` recorded |
| `query/scopes` | Both gating directions; a clean query passes through untouched |
| `query/describe` | `active.` and `[[active.]]` spellings echoed for unresolved refs |
| `engine/refs` | Active-scope resolution; host and active resolve independently; unresolved cases |
| `engine/run` | `excludePath` applied before filtering; `matched` and `truncated` honest |
| `obsidian/activeNote` | All three rules, stickiness, rename, delete, no emit on unchanged path |
| `view/sidebar` | Follows the active note, rebuilds on change, header text, empty state, unload leaves nothing registered |

`tests/mocks/obsidian.ts` gains `ItemView`, `MarkdownView` and workspace event
support. Test-driven throughout, as the rest of this codebase is.

## 15. Documentation

- `README.md` — a sidebar section: opening it, the setting, `active.` syntax
  and how it differs from `this.`
- `CHANGELOG.md` — an Unreleased entry
- `docs/manual-testing.md` — a sidebar pass: follow, stick, rename, delete,
  property edit, parse error
