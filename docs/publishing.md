# Cutting a release, and submitting to the community directory

## Releasing a version

`manifest.json`'s `version` is the source of truth. The tag must equal it
exactly — the workflow refuses to publish a mismatch, because a release whose
assets disagree with the tag installs the wrong thing.

```bash
# 1. bump manifest.json and package.json, and add the version to versions.json
#    mapped to the minimum Obsidian version it needs
# 2. npm run check:floor — type-checks src/ against the typings for the exact
#    minAppVersion the manifest promises. Needs network, so it is not part of
#    the build; run it before every release.
# 3. commit that bump on main
git tag 1.0.0
git push origin 1.0.0
```

Pushing the tag runs `.github/workflows/release.yml`, which type-checks, runs
the suite, builds, and opens a **draft** release carrying `main.js`,
`manifest.json` and `styles.css`. Draft on purpose: look at the three assets
before anyone can download them. Publish the draft from the GitHub releases page.

The workflow gives the draft a title and no body. Paste the body from
`CHANGELOG.md`'s section for that version — the changelog is where the notes are
written and reviewed, so the release page and the repository cannot disagree
about what shipped.

Those three files are what Obsidian installs. `main.js` is deliberately
gitignored and built in CI, so the release is the only place it exists.

## First submission to the directory

Submission is **not** a pull request against `obsidian-releases`. That was the
old flow, and following it wastes an afternoon: `community-plugins.json` is 1.9 MB,
past the size at which GitHub refuses to open its web editor, which is a good
early hint that hand-editing it is no longer the intended path.

The current flow: sign in to the Obsidian Community directory with an Obsidian
account, link the GitHub account that owns the repository to prove ownership,
and submit from there. `community-plugins.json` is then written by Obsidian's
own automation, not by the author.

What it validates, and where it looks:

- **`manifest.json` at the HEAD of the default branch** — not the release. Both
  have to be right, for different reasons: the directory reads the branch, and
  Obsidian installs the release assets.
- **A published release** whose tag equals the manifest version, carrying
  `main.js`, `manifest.json` and `styles.css` as individual assets.
- **An `id` that does not contain the word "obsidian"**, and is unique across the
  directory. `simple-streams` satisfies both. The repository name may contain it
  — only the id is constrained.
- **`README.md` and `LICENSE` at the repository root**, in a public repository.

Submission status lives on the author's community profile. A pending submission
does not appear in `community-plugins.json`: that file is the published output,
so absence there means "not listed yet", not "rejected".

Newly listed plugins carry `- This plugin has not been manually reviewed by
Obsidian staff.` appended to their description, so listing is self-service and
manual review is a later, separate thing. Do not write that sentence into the
manifest — the automation appends it, and the manifest must stay under the
description length limit without it.

## What review will ask about

Nothing internal. Simple Streams reads `app.vault.getMarkdownFiles()` and
`app.metadataCache.getFileCache()`, renders with `MarkdownRenderer.render()`, and
registers a code block processor — all public API, all present at the declared
`minAppVersion` floor, which `npm run check:floor` proves against the real
typings for that version rather than the latest ones.

The directory's scan flags **vault enumeration** — `getMarkdownFiles()` gives the
plugin every note path in the vault. It is a true statement about the plugin and
not something to argue away: a code block that selects notes by folder, tag,
frontmatter and date has to see the notes to select from. What makes it
answerable is the shape of the access, so lead with that:

- Markdown only. `getFiles()` is never called, so attachments and other files
  are not enumerated.
- Everything read per note — path, name, tags, frontmatter, timestamps — is
  already in the metadata cache; the plugin adds no scanning of its own.
- Bodies are read only for rendered items, through `vault.cachedRead`.
- No writes, no stored settings, no network. The claim is checkable in one
  command: `grep -rn "fetch\|requestUrl\|vault.modify\|saveData" src/` returns
  nothing.

The same four points are in the README under "What it reads, and what it never
does", so a user deciding whether to install sees them without reading the
source.

Two more things a reviewer is likely to raise:

- **Vault-wide reads on every change.** The registry debounces metadata and vault
  events by 300ms (`DEBOUNCE_MS` in `src/obsidian/registry.ts`) and filters and
  sorts entirely off the metadata cache. Note bodies are touched only for the
  items actually rendered — `vault.cachedRead`, bounded by the query's `limit`.
  `tests/engine/perf.test.ts` pins the filter and sort budget.
- **User-authored YAML.** Every field is parsed and validated before it reaches
  the engine, and an invalid block renders an error message in place rather than
  an empty stream or a thrown exception. That behaviour is covered by the parser
  tests and shown in the README.
