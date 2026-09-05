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

- [ ] **Mobile.** `manifest.json` says `isDesktopOnly: false`, and that has
      never been run. Either verify it or change the manifest; claiming
      support that has not been tried is the one thing that is not acceptable
      to leave.

### Scale

- [ ] **A vault of a few thousand notes.** The engine is measured in
      `tests/engine/perf.test.ts`, but rendering, scrolling and the paging
      sentinel are not, and they are what a reader actually waits for.
