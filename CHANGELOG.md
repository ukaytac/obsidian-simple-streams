# Changelog

The text of each GitHub release is taken from here.

## [Unreleased]

## 1.3.1

A compatibility fix for 1.3.0, which this replaces.

`Workspace.revealLeaf` returns `void` through Obsidian 1.6.7 and a promise from 1.7.2 on. Opening the sidebar awaited it, which asked for a guarantee the manifest's 1.5.7 floor does not make. Nothing misbehaved on any version — awaiting a non-promise resolves a moment later, and nothing ran after the call — so there is nothing to watch out for on 1.3.0 and no hurry about this. What it was is a promise to users with nothing behind it, which is the thing `minAppVersion` exists to prevent, and that is reason enough to correct it.

**Installing or updating:** put `main.js`, `manifest.json` and `styles.css` from below into `<your vault>/.obsidian/plugins/simple-streams/`, replacing the files already there, and reload Obsidian. Requires Obsidian 1.5.7 or newer. Coming from 1.3.0, nothing else changes: the sidebar, its settings and its query syntax are identical.

## 1.3.0

A stream no longer has to live in a note. This release adds a sidebar that runs one query beside whatever you are reading and re-runs it as you move, so a related-notes feed no longer costs a block in every note that wants one.

The query is held in settings and may name properties of the note you are looking at: `where: {Project: active.Project}` beside a project note lists that project's notes, and beside a client note lists that client's. Nothing is added to the notes themselves, and the note being followed is left out of its own feed.

**Installing or updating:** put `main.js`, `manifest.json` and `styles.css` from below into `<your vault>/.obsidian/plugins/simple-streams/`, replacing the files already there, and reload Obsidian. Requires Obsidian 1.5.7 or newer. Every existing block keeps working unchanged: the sidebar is an addition, and `this.Property` in a block means exactly what it meant before.

This is also the first version that stores anything. The sidebar query lives in the plugin's own `data.json`, inside its folder in your vault. Nothing else is written, and nothing leaves your machine.

### Added

- A sidebar view that follows the active Markdown note, opened from the **Show sidebar** toggle in settings or the **Simple Streams: Open sidebar** command. Its query lives in settings, directly under that toggle.
- `active.Property` references, naming a property of the note you are looking at. They work in the sidebar; `this.Property` continues to name the note holding a stream block, and works in a block. Either one in the wrong place is an error naming the spelling to use instead.
- The sidebar leaves the note it is following out of its own results.

## 1.2.0

Vaults that keep relationships as links now work. Obsidian hands a plugin your frontmatter as raw text, so a property holding a link arrived as the characters `[[My Project]]` — brackets and all — and a stream only found a note if it happened to have spelled the relationship the same way the block did. It no longer matters which way either of them wrote it.

**Installing or updating:** put `main.js`, `manifest.json` and `styles.css` from below into `<your vault>/.obsidian/plugins/simple-streams/`, replacing the files already there, and reload Obsidian. Requires Obsidian 1.5.7 or newer. Every block that works today keeps working and keeps finding everything it finds today: this release only joins spellings that were being held apart.

### Added

- **Property values are compared as the notes they name.** `[[My Project]]`, `[[My Project|MP]]`, `[[My Project#Goals]]` and plain `My Project` all match one another, in `where` conditions and in `!=` and the ordering comparisons alike, so `=` and `!=` cannot disagree about whether two notes are the same.
- **A `this.` reference can be written as a link** — `Project: "[[this.Project]]"` — which is what reads naturally in a vault whose properties hold links. It resolves to exactly one link whether the host note's own property holds `My Project` or `[[My Project]]`, and a host property holding a list gives one link per value.

### Fixed

- **A reference typed not quite right now says so, instead of quietly matching nothing.** An alias or heading inside one (`"[[this.Project|MP]]"`), an embed marker in front of one (`"![[this.Project]]"`), stray text either side of the brackets, and a misplaced space are all errors naming the problem. Every one of them used to become a comparison against its own literal text — no results, no message, and nothing pointing at the block that was wrong.

### Worth knowing before you use it

- `sort` still orders on the raw text. Filtering by a link-valued property is link-aware; *ordering* by one is not, so a vault with mixed spellings will interleave `[[Orbit]]` and `Orbit` in a `sort: Project asc`. Say so if that bites and it can be fixed.
- A property holding an embed (`![[My Project]]`) is not read as a link. An embed is a rendering instruction rather than a value, and treating it as one would make `![[x]]` and `[[x]]` the same note.

## 1.1.0

One new thing the filter can ask for: the note the block is sitting in. Until now a stream block was a constant — copy it into a second note and it still showed the first note's results. It can now read the host note's own properties, which is what makes a stream worth putting in a template.

**Installing or updating:** put `main.js`, `manifest.json` and `styles.css` from below into `<your vault>/.obsidian/plugins/simple-streams/`, replacing the files already there, and reload Obsidian. Requires Obsidian 1.5.7 or newer. Nothing about existing blocks changes — this release only adds a value they can use.

### Added

- **`where` values can reference the note holding the block.** `Project: this.Project` matches notes whose `Project` equals the host note's. A block dropped into a template then gives every note made from it its own running stream, with nothing to edit per note.
- **`this.file.name` and `this.file.path` name the host note itself**, so a trip note can gather every note tagged to that trip without repeating the trip's name inside the block.
- **A host property holding a list means "any of its values".** A note whose `country` is `[Portugal, Spain]` streams the notes from either.

### Worth knowing before you use it

- **A note without the property matches nothing, and says so.** That is the case a template creates: the note exists before anyone fills it in. Dropping the condition instead would stream the whole vault, which is the loudest possible wrong answer. An absent property, an empty one and a blank one are all read the same way.
- **A `this.` reference has to be the whole condition.** Inside a list, or after a comparison operator, it is rejected with an error — compared as plain text it would match nothing and tell you nothing, which is the failure this plugin spends most of its parser preventing.
- **A stream filtering on the host note's own property contains that note.** Its property equals its own by construction. Keeping the streamed notes in their own folder is how you leave it out.

## 1.0.2

Two things you would see in an ordinary note, both found by opening the plugin in a real vault rather than by any test. Both are visual; nothing about filtering, sorting or grouping has changed.

### Fixed

- **Group headers no longer cover the note they sit in.** The `2026` or `March 2026` header was pinned to the top of the viewport as you scrolled. That is right in a view that scrolls a list of its own, but a stream is drawn inline, so the header floated over your own paragraphs and hid a line of them until you scrolled past. Headers now sit in the flow, where the text can get past them.
- **Error and notice messages no longer show their backticks.** A message naming a field printed it as `` `where.nights` ``, marks and all, in a box already set entirely in monospace so the marks distinguished nothing. Field names are now set as code and the messages read as the sentences they are.

### Added

- **A manual test checklist**, in [`docs/manual-testing.md`](https://github.com/ukaytac/obsidian-simple-streams/blob/main/docs/manual-testing.md), covering what the automated tests structurally cannot see — popout windows, Live Preview, mobile — with the record of what each run found. Both fixes above came from its first run.
- **CI on every push and pull request.** The type check and the suite ran only when a version tag was pushed, which is the worst moment to learn a change is broken.

### Changed

- **The performance guard counts instead of timing.** Its wall-clock budget was calibrated on a laptop and failed on a CI runner five times slower, on code that was never slow. It now counts collator constructions across a 5000-note run, which is the actual defect it was written to catch and is the same number on every machine.
- **`test-vault/` is gone.** The screenshots in the README come from a vault that was never in the repository, so the sample it pointed at could not reproduce them. Development now describes symlinking a build into a vault of your own.

## 1.0.1

Two defects in 1.0.0, both found by the community directory's review, both reachable in ordinary use. If you installed 1.0.0, update.

### What Simple Streams does, for anyone arriving here first

A `stream` code block renders a filtered, sorted list of notes wherever you put it. The filter decides what the stream is — a journal, a reading log, a list of trips, anything a folder plus some frontmatter can describe.

```stream
folder: Travels
date-field: start
sort: start desc
group: year
display: preview
limit: 50
```

Filter by folder, tags, title text or regex, frontmatter conditions and a date range. Sort on any frontmatter key or `file.ctime`, `file.mtime`, `file.name`, `file.path`. Group by day, month or year. Show each note in full, as a preview, or as a title alone. An invalid block says what is wrong in place instead of rendering an empty stream. The full field list is in the [README](https://github.com/ukaytac/obsidian-simple-streams#fields).

**Installing or updating:** put `main.js`, `manifest.json` and `styles.css` from below into `<your vault>/.obsidian/plugins/simple-streams/`, replacing the files already there if you are coming from 1.0.0, and reload Obsidian. Requires Obsidian 1.5.7 or newer.

### Fixed

- **A debounce armed in a popout window could outlive its plugin.** The refresh timer was scheduled with the bare `setTimeout`, which resolves to whichever window the code runs against. Obsidian opens notes in popout windows, each with its own timer table, and a handle taken from one window cannot be cleared through another — so a timer armed in a popout survived the `stop()` meant to end it and fired after unload. It now schedules and clears through `window`, so the handle goes back where it came from.
- **A click on a note that had gone since the stream rendered did nothing.** `openLinkText` returns a promise, and the click handler dropped it. The note a row points at can be renamed or deleted after the block draws, so that rejection is reachable; unhandled, it left a console message and a link that silently failed. It is now caught and reported in a Notice naming the path.

### Changed

- **The README says what the plugin reads.** Selecting notes from the vault means enumerating the vault, so it is stated at install time rather than left to a permissions list: Markdown notes only — never `getFiles()`, so attachments are untouched — nothing beyond what the metadata cache already holds, bodies read only for the items a stream draws, no writes, no stored settings, and no network request of any kind.
- **One fewer dependency.** `builtin-modules` was a re-export of a list Node has exposed as `module.builtinModules` since 9.3. The production bundle is byte-identical without it.

## 1.0.0

First release.

### What it does

A `stream` code block renders a filtered, sorted list of notes wherever you put it. The filter decides what the stream is — a journal, a reading log, a list of trips, anything a folder plus some frontmatter can describe.

```stream
folder: Travels
date-field: start
sort: start desc
group: year
display: preview
limit: 50
```

- **Filtering** by folder, tags, title text or regex, frontmatter conditions, and a date range — with `exclude-folder` and `exclude-tags` for the notes you want left out.
- **`where` conditions**: equality, any-of, `exists` / `missing`, and quoted comparisons (`">3"`, `"<=2026-01-01"`, `"!=done"`). Numbers compare as numbers, dates as dates, everything else as text.
- **Sorting** on any frontmatter key or `file.ctime`, `file.mtime`, `file.name`, `file.path`, with multiple keys and a per-key direction.
- **Grouping** by day, month or year, with headers read from `date-field`.
- **Three display modes** — `full`, `preview` and `title` — with a character budget for previews.
- **Dates** accept `YYYY-MM-DD`, `today`, `yesterday`, and signed offsets like `-30d`, `-2w`, `-6m`, `+1y`. Month and year offsets clamp to the end of the target month.

### What it tells you when something is off

An invalid block renders the reason in place instead of an empty stream: an unquoted comparison YAML has mangled, a sort field that resolves on nothing, a `date-field` no note carries. A stream never renders the note it lives in.

### What it reads

Selecting notes from the vault means enumerating the vault, so this is stated up front rather than left to a permissions list. Simple Streams lists every Markdown note — `app.vault.getMarkdownFiles()`, not `getFiles()`, so attachments are never touched — and takes only what Obsidian's metadata cache already holds: path, name, tags, frontmatter, timestamps. Note bodies are read only for the items a stream actually draws.

It writes nothing, stores no settings, and makes no network request of any kind. Release assets carry a signed build provenance attestation.

### Known limitations

- **The stream is read-only.** It shows notes; it does not create or edit them.
- **A `title` regex is case-sensitive** unless you write the flag: `/weekly/i`. Folder paths, tag names, `title` text and `where` equality are all case-insensitive.
- **Everything is re-queried on a 300ms debounce** after a vault or metadata change. On a large vault with many blocks on screen this is work; the engine filters and sorts off the metadata cache and reads bodies only for the items it actually shows.
