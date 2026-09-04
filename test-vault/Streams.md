# Stream fixtures

## Journal, grouped by day, previews

```stream
folder: Journal
date-field: date
sort: date desc
group: day
display: preview
preview-length: 120
```

## Journal, full render

```stream
folder: Journal
date-field: date
sort: date desc
display: full
limit: 3
```

## Titles only, oldest first

```stream
folder: Journal
date-field: date
sort: date asc
display: title
```

## Books above a rating, drafts excluded

```stream
folder: Books
exclude-tags: draft
where:
  rating: ">3"
  status: done
sort: rating desc
```

## Everything in September 2026, grouped by month

Pinned to a fixed range rather than `from: -30d / to: today`. The fixture notes
are dated September 2026, so a relative range would have quietly emptied this
block once that month passed — directly above a block that is *meant* to be
empty, leaving a later reader unable to tell which of the two was the bug.

```stream
date-field: date
from: 2026-09-01
to: 2026-09-30
group: month
display: title
```

## Tagged `book`, whole vault

Named by the tag-shape check in Task 23: a note using a singular `tag: book`
key must show up here. The test mock reads only the plural `tags`, so a real
vault is the only place that difference is visible.

```stream
tags: book
display: title
```

## A sort field no note has — should say so

The `unresolvedSort` notice is otherwise the one notice nobody ever reads on
screen. `file.ctim` is a typo for `file.ctime`, and a missing sort key leaves
every note tied, so the order silently falls through to the path tie-break.

```stream
folder: Journal
sort: file.ctim desc
display: title
```

## Empty result — should show the query summary

```stream
tags: [nonexistent]
```

## Error — unknown field

```stream
tag: book
```

## Error — invalid YAML

```stream
folder: Journal
tags: [unclosed
```

## Error — bad value

```stream
display: everything
```
