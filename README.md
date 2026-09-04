# Simple Streams

An Obsidian plugin that renders a filtered, sorted stream of notes wherever you
drop a `stream` code block.

Journal-shaped, but not journal-only: the filter decides what the stream is.

```stream
folder: Journal
tags: [book]
sort: date desc
group: day
display: preview
limit: 50
```

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
| `sort`           | text or list             | `file.ctime desc` | `"<field> <asc\|desc>"` |
| `group`          | `day\|month\|year\|none` | `none`            | Date headers |
| `display`        | `full\|preview\|title`   | `preview`         | How much of the body to show |
| `preview-length` | number                   | `200`             | Character budget for previews |
| `limit`          | number                   | `50`              | Maximum items |

Fields addressable in `sort` and `where`: any frontmatter key by name, plus
`file.ctime`, `file.mtime`, `file.name` and `file.path`.

A tag written with its hash must be quoted — `tags: ["#book"]` — because YAML
reads a bare `#` as a comment. Writing the tag without the hash needs no quotes.

`where` conditions: `field: value` (equality), `field: [a, b]` (any of),
`field: exists` / `field: missing`, and quoted comparisons —
`field: ">3"`, `">=3"`, `"<3"`, `"<=3"`, `"!=done"`. The quotes are required
because `field: >3` is not valid YAML. A field with no value matches only
`missing`.

Dates accept `YYYY-MM-DD`, `today`, `yesterday`, and signed offsets like `-30d`,
`-2w`, `-6m`, `+1y`. The sign is required — a bare `30d` is an error rather than
a guess at which direction you meant. Month and year offsets clamp to the end of
the target month, so one month before 31 March is 28 February in a common
year and 29 February in a leap year.

## Development

```bash
npm install
npm test          # engine and parser tests
npm run dev       # watch build
npm run build     # type-check and bundle
```

`test-vault/` is a sample vault with a `Streams.md` page exercising every
display mode, grouping and error case. To try the plugin there:

```bash
npm run build
mkdir -p test-vault/.obsidian/plugins/simple-streams
cp main.js manifest.json styles.css test-vault/.obsidian/plugins/simple-streams/
```

Design: [docs/superpowers/specs/2026-09-04-simple-streams-design.md](docs/superpowers/specs/2026-09-04-simple-streams-design.md)
Plan: [docs/superpowers/plans/2026-09-04-simple-streams.md](docs/superpowers/plans/2026-09-04-simple-streams.md)
