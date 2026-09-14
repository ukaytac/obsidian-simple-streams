# Sidebar settings — Design

Date: 2026-09-14
Status: Approved
Extends: `docs/superpowers/specs/2026-09-14-adaptive-sidebar-design.md`

## 1. Overview

Two changes to how the sidebar is reached and configured.

The ribbon icon goes away. In its place the settings tab grows a **Show
sidebar** toggle, directly above the query it already holds, so the one screen
that decides *what* the sidebar shows also decides *whether* it is on screen.
The `Open sidebar` command is untouched.

The query field stops competing with its own description for the width of the
settings row. It moves below the name and description at full width, the layout
Obsidian's own multi-line settings use, so a four-line query reads as four
lines rather than eleven wrapped fragments.

## 2. Goals and non-goals

**Goals**

- No Simple Streams icon in the ribbon.
- A toggle in settings that opens and closes the sidebar.
- A query field wide enough to read a query in.

**Non-goals**

- Auto-opening the sidebar at startup. Obsidian already restores the leaves
  that were open when the app closed; a second mechanism competing with that
  restore is how a pane the reader closed comes back uninvited.
- A persisted `showSidebar` setting. See §3.
- Any change to what the sidebar renders, or to the query language.

## 3. The toggle holds no state

The toggle is not written to `data.json` and adds no field to
`SimpleStreamsSettings`. It reads the workspace each time the tab is drawn: on
when a leaf of `SIDEBAR_VIEW_TYPE` exists, off when none does.

The alternative — a stored boolean — has a failure this one cannot have. A
reader who closes the pane by its tab leaves the stored value saying `true`,
and the settings screen then reports a sidebar that is not there. Keeping the
answer in the workspace makes the two impossible to disagree.

Obsidian's settings screen is a modal. The workspace cannot change while it is
open, so a value read at `display()` time stays accurate for as long as it is
on screen.

## 4. Components

### `src/main.ts`

- Delete the `addRibbonIcon("layers", ...)` registration.
- `openSidebar()` loses `private`; its body is unchanged.
- `closeSidebar(): void` — detach every leaf of `SIDEBAR_VIEW_TYPE`.
- `hasSidebar(): boolean` — whether any such leaf exists.
- `sidebars()` stays private. The three public methods above are the whole
  surface the settings tab needs.

`StreamSidebarView.getIcon()` is not touched. That icon names the pane's own
tab, and has nothing to do with the ribbon.

### `src/view/SettingsTab.ts`

`display()` draws, in order:

1. A `Setting` named **Show sidebar**, described as opening the stream sidebar
   in the right split, with a toggle whose value is `plugin.hasSidebar()` and
   whose `onChange` calls `openSidebar()` or `closeSidebar()`.
2. The existing **Sidebar query** setting, now carrying the class
   `ss-settings-query-item`.
3. The existing error element.

The debounce, the save-on-every-keystroke behaviour and `hide()`'s flush are
unchanged. The toggle takes part in none of it: opening a pane is immediate
and has nothing to rebuild.

### `styles.css`

```css
.ss-settings-query-item { display: block; }
.ss-settings-query-item .setting-item-control { width: 100%; padding-top: ...; }
.ss-settings-query { width: 100%; resize: vertical; }
```

The setting row's flex layout drops to `block`, which puts the control under
the description instead of beside it, and the control and textarea then take
the full width. `min-height` and the monospace family already on
`.ss-settings-query` stay.

## 5. Testing

`tests/mocks/obsidian.ts` grows what the tab now calls:

- `MockToggleComponent` with `setValue`, `onChange` and a `fireChange`, built
  on the same shape as `MockTextAreaComponent`.
- `toggleComponents`, cleared by `resetObsidianMock`.
- `Setting.addToggle` and `Setting.setClass`.

`tests/view/settings.test.ts` grows three cases, with `FakePlugin` counting
`openSidebar`/`closeSidebar` calls and answering `hasSidebar`:

- The toggle is drawn on when a sidebar is open and off when none is.
- Switching it on opens the sidebar.
- Switching it off closes it.

The existing debounce tests read `textAreaComponents[length - 1]`, so a second
setting drawn before the query does not disturb them.

## 6. Documentation

`README.md`'s sidebar section names the ribbon icon as a way in. It becomes the
settings toggle and the command palette. Files under `docs/superpowers/` are
the record of what was decided when, and are not rewritten.
