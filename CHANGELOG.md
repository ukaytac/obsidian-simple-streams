# Changelog

The text of each GitHub release is taken from here.

## 1.0.0

First release.

### What it does

A `stream` code block renders a filtered, sorted list of notes wherever you put
it. The filter decides what the stream is — a journal, a reading log, a list of
trips, anything a folder plus some frontmatter can describe.

```stream
folder: Travels
date-field: start
sort: start desc
group: year
display: preview
limit: 50
```

- **Filtering** by folder, tags, title text or regex, frontmatter conditions,
  and a date range — with `exclude-folder` and `exclude-tags` for the notes you
  want left out.
- **`where` conditions**: equality, any-of, `exists` / `missing`, and quoted
  comparisons (`">3"`, `"<=2026-01-01"`, `"!=done"`). Numbers compare as
  numbers, dates as dates, everything else as text.
- **Sorting** on any frontmatter key or `file.ctime`, `file.mtime`, `file.name`,
  `file.path`, with multiple keys and a per-key direction.
- **Grouping** by day, month or year, with headers read from `date-field`.
- **Three display modes** — `full`, `preview` and `title` — with a character
  budget for previews.
- **Dates** accept `YYYY-MM-DD`, `today`, `yesterday`, and signed offsets like
  `-30d`, `-2w`, `-6m`, `+1y`. Month and year offsets clamp to the end of the
  target month.

### What it tells you when something is off

An invalid block renders the reason in place instead of an empty stream: an
unquoted comparison YAML has mangled, a sort field that resolves on nothing, a
`date-field` no note carries. A stream never renders the note it lives in.

### What it reads

Selecting notes from the vault means enumerating the vault, so this is stated
up front rather than left to a permissions list. Simple Streams lists every
Markdown note — `app.vault.getMarkdownFiles()`, not `getFiles()`, so
attachments are never touched — and takes only what Obsidian's metadata cache
already holds: path, name, tags, frontmatter, timestamps. Note bodies are read
only for the items a stream actually draws.

It writes nothing, stores no settings, and makes no network request of any
kind. Release assets carry a signed build provenance attestation.

### Known limitations

- **The stream is read-only.** It shows notes; it does not create or edit them.
- **A `title` regex is case-sensitive** unless you write the flag: `/weekly/i`.
  Folder paths, tag names, `title` text and `where` equality are all
  case-insensitive.
- **Everything is re-queried on a 300ms debounce** after a vault or metadata
  change. On a large vault with many blocks on screen this is work; the engine
  filters and sorts off the metadata cache and reads bodies only for the items
  it actually shows.
