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

## Everything from the last 30 days, grouped by month

```stream
date-field: date
from: -30d
to: today
group: month
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
