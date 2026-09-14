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

## The sidebar

Set the sidebar's query, in **Settings → Simple Streams → Sidebar query**, to:

```yaml
where:
  Project: active.Project
sort: file.mtime desc
display: preview
```

- [ ] **Follows.** Open a note with `Project: Alpha`. Open the sidebar. It
      lists the other Alpha notes, header reads `Following: <that note>`, and
      the note itself is not in the list.
- [ ] **Moves.** Open a note with `Project: Beta`. The list and the header both
      change.
- [ ] **Sticks on focus.** Click into the sidebar and scroll it. The list does
      not change or reset. Open a PDF. Still unchanged.
- [ ] **Sticks across panes.** Split the pane and click between two notes. The
      sidebar follows each click.
- [ ] **Two sidebars at once.** Open a second Simple Streams pane (drag one
      into a new split, or run the command again) so two are visible together.
      Click into a different note in each pane's area. Each sidebar's header
      and list follow only the note last active for that pane — editing a
      property that changes one sidebar's list does not redraw, flicker, or
      clear the other, and closing one sidebar leaves the other running.
- [ ] **Empties.** Close every note. The sidebar reads "Open a note to see
      related notes."
- [ ] **Follows an edit.** With a note followed, change its `Project` in the
      Properties panel. Within a moment the list changes to the new project.
- [ ] **Cross-note refresh.** With a note followed, open a *different*,
      unfollowed note that does not currently appear in the sidebar's list and
      change its `Project` to match the followed note's project. Within a
      moment it appears in the list — without ever touching the followed note
      itself. Change that other note's `Project` again so it no longer
      matches; within a moment it drops back out.
- [ ] **Renames.** Rename the followed note. The header shows the new title,
      the list is unchanged, and the renamed note itself does not appear in
      its own list.
- [ ] **Deletes.** Delete the followed note. The sidebar falls back to another
      open note, or to the empty state.
- [ ] **Says what is missing.** Open a note with no `Project`. The sidebar
      shows "The note you are looking at has no usable Project…".
- [ ] **Refuses the wrong scope.** Put `Project: this.Project` in the sidebar
      query — the pane shows an error naming `active.Project`. Put
      `Project: active.Project` in a `stream` block in a note — the block
      shows an error naming `this.Project`.
- [ ] **Settings do not flicker.** Type a query slowly in settings. The error
      line under the field updates as you type; the sidebar redraws only once
      you pause.
- [ ] **Pages.** Point it at a project with more than 20 notes and scroll the
      sidebar to the bottom. More load, and they load before you reach the
      end.

### Open questions this pass must settle

These three did not come from the plan. Each is a real unknown raised in code
review, not a formality expected to pass — settle them by hand and report the
actual answer, including the bad one.

- **Does closing the last note really empty the sidebar?** Check "Empties"
  above assumes it does. The sidebar's third fallback rule reads
  `workspace.getActiveFile()`, and Obsidian's own type docs describe that as
  returning "the most recently active file" when the current view is not a
  file view — which may mean it keeps naming a note that has just been closed.
  If the sidebar does not reach its empty state, that rule is resurrecting a
  closed note and needs narrowing.
- **What happens to an open sidebar when the plugin is disabled and
  re-enabled?** `onunload` deliberately does not detach the sidebar's leaves,
  because Obsidian's plugin guidelines advise against detaching on unload — it
  would destroy the reader's layout on every plugin update. The cost may be a
  stale pane surviving a disable. Report what actually happens: a clean
  recovery, a frozen pane, or an error.
- **Does the paging preload actually work in the sidebar?** "Pages" above
  covers the visible half. The specific thing to watch is whether the next
  page loads *before* you reach the bottom, which is what confirms the
  `IntersectionObserver` rooted on `.ss-sidebar-body` rather than falling back
  to the viewport.
