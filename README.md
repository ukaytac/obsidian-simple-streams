# Simple Streams

An Obsidian plugin that renders a filtered, sorted stream of notes wherever you
drop a `stream` code block.

Journal-shaped, but not journal-only: the filter decides what the stream is.

```stream
folder: Journal
tags: [book]
date-field: date
sort: date desc
group: day
display: preview
limit: 50
```

## Installing

Simple Streams is not in the community plugin list yet. To install it:

1. Download `main.js`, `manifest.json` and `styles.css` from a release, or
   build them yourself (see [Development](#development)).
2. Put all three in `<your vault>/.obsidian/plugins/simple-streams/`.
3. In Obsidian, open **Settings → Community plugins**, turn off Restricted
   Mode if it is on, then enable **Simple Streams**.
4. Add a `stream` block to any note.

Requires Obsidian 1.5.7 or newer. Works on desktop and mobile.

## Fields

| Field            | Type                     | Default           | Meaning |
| ---------------- | ------------------------ | ----------------- | ------- |
| `folder`         | text or list             | whole vault       | Path prefix, subfolders included |
| `tags`           | text or list             | —                 | All listed tags must be present |
| `tags-any`       | text or list             | —                 | At least one of the listed tags |
| `exclude-folder` | text or list             | —                 | Drop notes under these paths |
| `exclude-tags`   | text or list             | —                 | Drop notes carrying any of these tags |
| `title`          | text or `/regex/`        | —                 | Matches the note's file name |
| `where`          | map                      | —                 | Frontmatter conditions |
| `date-field`     | text                     | `file.ctime`      | Which field is "the date" |
| `from`, `to`     | date                     | —                 | Inclusive date bounds |
| `sort`           | text or list             | `file.ctime desc` | `"<field> <asc\|desc>"`, direction defaults to `asc` |
| `group`          | `day\|month\|year\|none` | `none`            | Date headers, using `date-field` |
| `display`        | `full\|preview\|title`   | `preview`         | How much of the body to show |
| `preview-length` | number                   | `200`             | Character budget for previews |
| `limit`          | number                   | `50`              | Maximum items |

Fields addressable in `sort` and `where`: any frontmatter key by name, plus
`file.ctime`, `file.mtime`, `file.name` and `file.path`.

Two things worth knowing about `date-field`, because they surprise people:

- **`group` reads `date-field`, not your `sort` field.** If you sort by a
  frontmatter `date` but leave `date-field` at its default, the headers say
  file-creation dates and the stream is reordered to match them — your declared
  sort survives only inside each group. Set `date-field` to the same field you
  sort by, as the example above does.
- **`from` and `to` also read `date-field`**, and so does the date shown beside
  each item.

## Matching rules

Tags match their descendants: `tags: project` also matches a note tagged
`project/streams`.

Folder paths, tag names, `title` text and `where` equality are all
case-insensitive. A `title` **regex** is not — write `/weekly/i` if you want it
to be.

A tag written with its hash must be quoted — `tags: ["#book"]` — because YAML
reads a bare `#` as a comment. Writing the tag without the hash needs no quotes.

`where` conditions: `field: value` (equality), `field: [a, b]` (any of),
`field: exists` / `field: missing`, and comparisons —
`field: ">3"`, `">=3"`, `"<3"`, `"<=3"`, `"!=done"`.

**Comparisons must be quoted.** Unquoted, YAML reads `>` and `!` as its own
syntax and your condition becomes something else entirely; Simple Streams
rejects the result with an error rather than showing you an empty stream. A
field with no value matches only `missing`.

Equality looks inside a frontmatter list too: `where: {tags: book}` matches a
note whose `tags` are `[Book, Read]`. Numbers compare as numbers and booleans
as booleans.

Dates accept `YYYY-MM-DD`, `today`, `yesterday`, and signed offsets like `-30d`,
`-2w`, `-6m`, `+1y`. The sign is required — a bare `30d` is an error rather than
a guess at which direction you meant. Month and year offsets clamp to the end of
the target month, so one month before 31 March is 28 February in a common
year and 29 February in a leap year.

## Development

```bash
npm install
npm test          # engine, parser and one budget test
npm run dev       # watch build
npm run build     # type-check and bundle
```

`main.js` is a build artifact and is not in the repository — `npm run build`
writes it at the root, next to the `manifest.json` and `styles.css` a user
installs alongside it.

`test-vault/` is a sample vault with a `Streams.md` page exercising every
display mode, grouping and error case. To try the plugin there:

```bash
npm run build
mkdir -p test-vault/.obsidian/plugins/simple-streams
cp main.js manifest.json styles.css test-vault/.obsidian/plugins/simple-streams/
```

Then open `test-vault` in Obsidian, enable **Simple Streams** under Settings →
Community plugins, and open `Streams.md`. `npm run dev` writes to the repo root,
so re-run that `cp` after each change.

Design: [docs/superpowers/specs/2026-09-04-simple-streams-design.md](docs/superpowers/specs/2026-09-04-simple-streams-design.md)
Plan: [docs/superpowers/plans/2026-09-04-simple-streams.md](docs/superpowers/plans/2026-09-04-simple-streams.md)

## License

MIT — see [LICENSE](LICENSE).
