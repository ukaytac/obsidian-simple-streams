# Manual test checklist

Checks that need a real Obsidian, because they depend on windows, editor modes,
focus or timing that the unit tests cannot observe. `tests/view/` mounts the
view in jsdom and covers a great deal, but jsdom has one window, one rendering
mode and no user — so the list below is what is left over.

Run it against a scratch vault before a release.

## Record

| Date | Version | Obsidian | Platform | Result |
| ---- | ------- | -------- | -------- | ------ |
| 2026-09-05 | 1.0.1 | 1.8.9 | macOS 26.5.2 | Two defects found, both fixed for 1.0.2 |
| 2026-09-05 | 1.0.2 | — | iOS, iPhone | Runs. Blocks render, links open, long streams scroll |

## What the run found

**Group headers covered the note.** `.ss-group` was `position: sticky`, which
the design called for and which is right in a view that scrolls a list of its
own. A stream is drawn inline, so the scroll container is the note: the header
floated over the reader's own prose and hid a line of it until they scrolled
past. Only visible in a page of several blocks with text between them — which
is the ordinary case and was not the case any screenshot had captured. Fixed by
dropping the rule.

**Messages showed their backticks.** Every error and notice names the field it
is about and marks it with backticks. They were written as text, in a box set
entirely in monospace, so the marks read as punctuation and distinguished
nothing. Fixed with `setCodeText`, which renders the spans as `<code>`.

## The list

### Rendering

- [x] **Reading view.** Every block renders. Group headers appear once per
      group, above the first row.
- [x] **Live Preview.** Blocks render rather than showing raw YAML, and editing
      a block's source redraws it when the cursor leaves.
- [x] **An invalid block shows its message in place**, not an empty stream.
      Verified with an unquoted comparison (`nights: >7`), which YAML mangles.
- [ ] **Dark and light themes**, and a community theme that restyles code
      blocks.

### `this.` references

- [ ] **A `this.` reference resolves against the note on screen.** Give a note
      the property `Project: Orbit`, give two other notes the same property,
      and add a block with `where: {Project: this.Project}`. Both notes
      appear; notes with another project do not.
- [ ] **An unfilled property explains itself.** Make a note from a template
      holding that block, and leave `Project` empty. The stream is empty, and
      says "This note has no `Project`" with `Project` rendered as code, not
      as backticks.
- [ ] **Editing the property moves the stream.** With the stream on screen,
      change the host note's `Project` in the Properties panel. Within a
      moment the stream shows the other project's notes.

### Windows

- [x] **A stream in a popout window refreshes.** Drag a tab holding a stream
      out, edit a note in the main window, and the popout's stream updates
      within the debounce. This is the check that matters most here: each
      window has its own timer table, a handle from one cannot be cleared
      through another, and jsdom cannot model two windows at all — so the
      1.0.1 fix that schedules through `window` has no automated coverage.
- [x] **Closing the popout leaves nothing behind.** No error in the console,
      no timer firing after the window is gone.

### Links

- [x] **Clicking a row's title opens the note**; cmd-click opens it in a new
      tab.
- [n/a] **A click on a note that has since been deleted shows a notice.**
      Not reproducible by hand: deleting the file fires a vault event and the
      row is gone before the click lands. Covered instead by
      `tests/view/rows.test.ts`, which injects the rejection and asserts both
      the notice and that no `unhandledrejection` escapes — confirmed red
      against a `void`-only version of the handler.

### Platforms

- [x] **Mobile.** `manifest.json` says `isDesktopOnly: false`, and as of
      1.0.2 that has been tried: iPhone, iOS. Blocks render, tapping a row's
      title opens the note, and a long stream scrolls and pages. Checked by
      use rather than by working down this list, so it is evidence that the
      plugin runs on a phone, not that every path does — the entries below
      are the ones a closer pass would still owe.
- [ ] **Mobile, deliberately.** The paging sentinel against a touch scroll
      (momentum scrolling fires intersections differently from a wheel), an
      invalid block's error box at phone width, and `display: full`, where
      each item mounts a Markdown render.

### Scale

- [ ] **A vault of a few thousand notes.** The engine is measured in
      `tests/engine/perf.test.ts`, but rendering, scrolling and the paging
      sentinel are not, and they are what a reader actually waits for.

### Link-valued properties

- [ ] **A link-valued property matches the plain text spelling.** Make
      `Projects/Orbit.md` and two notes in `Notes/` whose `Project` property
      is the link `[[Orbit]]`, plus one whose `Project` is the plain text
      `Orbit`. In `Projects/Orbit.md`, add a block with
      `where: { Project: this.Project }`. All three notes appear — the
      host's plain `Orbit` matches both spellings.
- [ ] **The host note's own property can hold a link too.** Change the host
      note's `Project` to the link `[[Orbit]]`. The same three notes appear.
- [ ] **The link spelling of the reference resolves the same way.** Change
      the block to `where: { Project: "[[this.Project]]" }`. Again the same
      three notes appear, and the empty-stream summary is not shown.
- [ ] **An unfilled property still explains itself with the link
      spelling.** Clear the host note's `Project` property. The stream
      empties, the notice names `Project`, and the summary line includes
      `[[this.Project]] (not set here)`.
- [ ] **A near-miss reference errors rather than showing an empty
      stream.** Type the reference wrong on purpose —
      `where: { Project: "![[this.Project]]" }`. The block shows an error
      naming the problem, not an empty stream.
