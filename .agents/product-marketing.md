# Product Marketing Context

**Document version:** v4
**Last updated:** 2026-09-20

> **Draft status:** auto-drafted from the repository (README, CHANGELOG, design specs, manifest), then corrected by the author. Remaining **[GAP]** markers are things neither the repo nor the author could supply yet.

## Product Overview

**One-liner:** An Obsidian plugin that renders a filtered, sorted stream of notes wherever you drop a `stream` code block.

**What it does:** You write a small YAML block — folder, tags, frontmatter conditions, sort, date grouping — and Simple Streams renders the matching notes as a readable stream: title, date, tags, and as much or as little of the body as you ask for. It re-runs itself when the vault changes. It can also run one query in a sidebar that follows whichever note you are looking at, so a related-notes feed costs nothing per note.

**Product category:** Obsidian community plugin — note querying / dynamic indexes / MOC and dashboard tooling. This is the shelf people search on: they are looking for "how do I list notes matching X inside a note."

**Product type:** Free, open-source (MIT) desktop and mobile plugin, distributed through the Obsidian Community Plugins directory and GitHub releases. No account, no server, no network calls.

**Business model:** Free and unmonetized, deliberately. The return is reputational, not financial — see **Goals**.

## Target Audience

**Target companies:** Not applicable — this is a prosumer/individual tool. Users are individual Obsidian vault owners, not organizations.

**Decision-makers:** The user is the buyer, the installer and the champion. The only gatekeeper is the Obsidian Community directory review.

**Primary use case:** Turning a folder of notes into something you can actually read down — a journal, a reading log, a project's running history — without leaving the note you are in and without learning a query language.

**Jobs to be done:**
- "Show me every note that matches this, here, inside the note I'm already writing in."
- "Give my project/MOC note a running history that maintains itself, so I stop hand-linking."
- "Let me compare the same field across many notes at a glance" (the `section:` job).

**Use cases:**
- Journal or daily-notes stream grouped by day/month/year.
- Reading log, trip log, workout log — anything dated and repeated.
- A project note whose stream is `where: {Project: this.Project}`, dropped in a template so every project note carries its own history with nothing edited per note.
- A sidebar related-notes feed driven by `active.Property`.
- A dashboard note holding several streams side by side, each with a different `where`.

## Personas

Single-persona product; the B2B stakeholder table does not apply.

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| The organized note-taker | Their vault staying readable as it grows | Hand-maintained index notes rot the moment they stop updating them | An index that maintains itself from a five-line block |
| The reluctant query-writer | Not learning a DSL to answer a simple question | The existing options are more machinery than the question needs | Plain YAML, no new language, no other plugin required |
| The privacy-minded user | Knowing exactly what a plugin touches | Most plugins never state what they read or send | An explicit, verifiable "what it reads, and what it never does" section, plus attested builds |

## Problems & Pain Points

**Origin — scratch your own itch.** The author is the first user. Simple Streams exists because the listings available in Obsidian were not nice enough to read, and the specific reference point was the listing a properties table gives you. Worth holding on to when weighing any feature: the founding complaint was about how a list *reads and looks*, not about what it can compute. Nobody said "I need more filters."

**Core problem:** A vault accumulates notes faster than anyone maintains indexes for them. The notes exist; finding and comparing them later does not happen by itself.

**Why alternatives fall short:**
- Obsidian's built-in search is a search surface, not something you can embed in a note and read as prose.
- The powerful query plugins ask you to learn a query language or JavaScript, and render tables by default — a table is not a reading experience.
- Hand-maintained MOCs are accurate the day you write them and wrong a month later.
- Most table/database tools optimize for structured data entry; this problem is about *reading whole notes*.

**What it costs them:** The notes are effectively write-only. Time is spent re-finding things, or re-linking things, or simply never revisiting what was written.

**Emotional tension:** The quiet suspicion that the vault is a pile, not a system — that you are filing things you will never read again.

## Competitive Landscape

> **Positioning rule — no named comparisons.** Public copy never names another plugin, never writes "alternative to X," and never builds vs-pages or comparison tables. State what Simple Streams is and let the reader place it themselves. The landscape below is **internal context only**: it exists so we understand what a user already has installed, not so we can attack it. This rule also keeps the copy consistent with the project's voice, which does not disparage anything.

**Direct:** **Dataview** — same problem, same surface (a code block in a note), far more power. Where it is heavier: DQL/DataviewJS is a language to learn, and the default output is tabular.

**Direct:** **Obsidian Bases** (core, 1.9+) — Obsidian's own database view. A different surface: a table/board over properties, in its own view, rather than prose inside the note you are writing. **This is the real reference point**, not the query plugins: it is the listing the author found wanting, and the one Simple Streams was built to be unlike. The difference is presentational, and that is not a weakness of the position — it is the position.

**Secondary:** **Projects plugin, DB Folder, embedded search queries** — different solution shapes (boards, databases, search results) for the same "find my notes" problem. Each optimizes structure or search over readability.

**Indirect:** **Hand-maintained MOCs and index notes, and Templater-generated lists.** Conflicting approach: do the work yourself, once, and accept the drift.

## Differentiation

**Key differentiators:**
- **No query language.** The block is plain YAML. If you can write frontmatter, you can write a stream.
- **Whole notes, read as a stream** — title, date, tags, body — not rows in a table.
- **`this.` and `active.` references.** One block written once in a template works in every note made from it; the sidebar version follows whatever note you open. Nothing is added per note.
- **`section: <heading>`** turns a stream into a column of comparable answers instead of whatever words each note happens to open with.
- **No dependency on any other plugin.**
- **Stated and verifiable boundaries.** Markdown files only, bodies read only to draw them, never writes to your notes, never touches the network — with the one call site named in the README, tests and type checks in CI, and signed provenance attestations on release assets.

**How we do it differently:** The filter decides what the stream is. Journal-shaped by default, but journal is just one filter — so there is one concept to learn instead of a feature per use case.

**Why that's better:** Time-to-first-working-stream is minutes, not an evening with documentation. And the thing you get out is something you read, not something you query.

**Why customers choose us:** They wanted an answer inside a note, and wanted it without taking on a query language to get it.

## Objections

**None observed in the wild yet** — no issues, no directory complaints, no forum pushback as of 2026-09-20. The table below is *anticipated*, kept as ready answers if someone asks directly in an issue or thread. It is not copy, and per the positioning rule above, published material does not raise these comparisons unprompted.

| Anticipated objection | Response if asked directly |
|-----------|----------|
| "Another plugin already does this, and more." | It does, and if you want joins, inline fields and a full query language, use it. This is the subset you can write without learning anything, rendered as something you read rather than a table. |
| "Obsidian ships a database view now — isn't this obsolete?" | That is a table/board view over properties. This is prose inside the note you are writing. Different surface, different job. |
| "Another plugin reading my whole vault." | It enumerates Markdown files only, reads bodies only for what it draws, never writes to your notes, and makes no network calls — all stated plainly in the README with the call site named, and the builds carry signed attestations you can verify. |

**Anti-persona:** Someone who wants a database — structured entry, editable cells, joins, rollups, inline fields, or block-level items (headings and bullets rather than whole notes). Those are explicit non-goals. Also: anyone who wants to *create or edit* notes from the stream. It is read-only by design.

## Switching Dynamics

**Push:** Their index notes have gone stale, or they bounced off a query language's syntax, or they installed something heavy for one small list and resented the weight of it.

**Pull:** A five-line block that works on the first try, and a stream that reads like a page rather than a spreadsheet.

**Habit:** Manual linking. It works, it is invisible, and nobody schedules time to replace it.

**Anxiety:** "What is this plugin doing to my vault?" — which is exactly what the README's "What it reads, and what it never does" section is built to dissolve, and why it leads with the negative claims.

## Customer Language

**How they describe the problem:**

*The author, as the first user — n=1 (translated from the author's Turkish):*
> "This was my own problem. I wanted nicer listings; I wanted something different from Bases' listing."

Two things in that sentence should survive into copy. The complaint is **aesthetic and experiential** — nicer, better to look at and read — not functional. And the thing being compared against is **a listing**, not a query engine. The promise is therefore about the result on the page, not about capability.

- **[GAP]** — still nothing from anyone but the author. Sources worth mining, in order of likely yield: r/ObsidianMD, the Obsidian forum's Plugins and Share & showcase boards, the Obsidian Discord, and this repo's own issues once they exist. Look for phrasings like "I just want to list my notes," "without learning a query language," "my MOC is out of date."

**How they describe us:**
- **[GAP]** — nothing captured. First likely sources: directory reviews and any social mention. Worth revisiting once installs grow past the current few hundred.

**Words to use:** stream, note, vault, block, filter, query, frontmatter, property, folder, tag, sidebar, journal, index, MOC, read down, compare.

**Words to avoid:** database, table, row, record, schema, dashboard-as-product, "powerful," "seamless," "effortless," "supercharge," "revolutionize." Anything that oversells or that implies structured data entry — the product is deliberately not a database, and the project's own writing never inflates. Also: the names of other plugins (see the positioning rule).

**Glossary:**
| Term | Meaning |
|------|---------|
| stream | The rendered list of notes a query produces; also the code block language (` ```stream `) |
| block | A `stream` code block inside a note |
| `this.` | Reference to a property of the note holding the block |
| `active.` | Reference to a property of the note you are currently looking at (sidebar only) |
| `section` | Field that takes each item's body from under a named heading |
| `date-field` | Which field counts as "the date" for grouping, bounds and display |
| MOC | Map of Content — an index note that links out to a topic's notes |
| vault | An Obsidian user's whole note collection |

## Brand Voice

**Tone:** Precise, plain, quietly confident. Never promotional. States limits as readily as capabilities, and explains *why* a design decision was made rather than asserting that it is good.

**Style:** Long-form declarative prose over bullet-point marketing. Concrete examples before abstractions. Addresses the reader directly. No exclamation marks, no hype adjectives, no emoji. Anticipates the surprising case and names it ("Two things worth knowing about `date-field`, because they surprise people").

**Personality:** Careful, honest, unhurried, technical, understated.

**Note:** the README and CHANGELOG are the voice reference. Any generated copy should be checked against them — they are unusually consistent, and most default marketing register will clash badly with them. Given that the goal is reputational (see **Goals**), voice is not decoration here: the writing *is* the demonstration.

## Proof Points

**Metrics** *(snapshot 2026-09-20)*:
- **306 downloads** through the Obsidian Community directory since listing on 2026-09-05 — roughly 15 days.
- Per-version curve: 1.0.0 (19), 1.0.1 (21), 1.0.2 (65), 1.1.0 (50), 1.2.0 (32), 1.3.0 (17), 1.3.1 (17), 1.4.0 (63), 1.5.0 (22, just out).
- **4 GitHub stars**, 0 forks, 0 open issues. Repository created 2026-09-04.
- **9 releases in 16 days**, 1.0.0 → 1.5.0.

**Customers:** None named. No user is publicly identified yet.

**Testimonials:** **[GAP]** — none captured. Directory reviews and issue threads are the place to start.

**Value themes:**
| Theme | Proof |
|-------|-------|
| No language to learn | The whole query schema is one table of 16 optional YAML fields; an empty block is a valid query |
| Reading, not querying | `display: full\|preview\|title`, `group: day\|month\|year`, previews with a character budget |
| Write once, works everywhere | `this.Property` in a template; `active.Property` in the sidebar |
| Trustworthy by construction | Named call sites, no network, no writes, CI type-check + tests, `gh attestation verify` on every release asset |
| Actively maintained | 9 releases in the first 16 days; every one documented in prose in the CHANGELOG |

## Goals

**Business goal: a reference project, and recognition for its author.** There is no revenue to optimize. Simple Streams is a portfolio-grade demonstration of how its author builds — the README, the changelog written as prose, the stated boundaries, the test and CI discipline, the provenance attestations are as much the artifact as the code is. Success looks like: the plugin is found and installed by people who need it, it is cited or recommended as good work, and the author's name travels with it.

Three implications that should shape every downstream decision:

1. **Craft is the marketing.** Nothing published should be lower-quality than the README. A sloppy landing page or a hype-laden social post actively damages the goal, in a way it would not for a revenue-driven product.
2. **Reach matters more than conversion.** The install is free and the friction is near zero; the scarce resource is being seen at all. Prioritize discovery — directory ranking, search, places Obsidian users already gather — over funnel optimization.
3. **Attribution is not optional.** Author name and link (uka.dev) belong wherever the plugin appears. A widely used plugin nobody can trace back to its author fails this goal while looking like a success.

**Conversion action:** Primary — install from **Settings → Community plugins → Browse → Simple Streams**. Secondary — star the GitHub repository. Tertiary, and the one that actually serves the goal — the reader ends up knowing who wrote it (uka.dev).

**Current metrics:** See **Proof Points**. Baseline for measuring anything from here: 306 directory downloads, 4 stars, as of 2026-09-20.

## Changelog

*Newest first. One line per revision: what changed and why.*
- v4 (2026-09-20) — Rendered the author's founding quote in English; the document is now English throughout.
- v3 (2026-09-20) — Recorded the origin: scratch-your-own-itch, with the author's verbatim as the first customer quote. Named Bases' listing as the real internal reference point and reframed the core promise as presentational rather than functional.
- v2 (2026-09-20) — Author corrections: goal set to reference project + recognition, with three implications spelled out; added a no-named-comparisons positioning rule and de-named the competitive copy throughout; objections relabelled as anticipated rather than observed; filled Proof Points with real directory and GitHub numbers.
- v1 (2026-09-20) — Initial context, auto-drafted from README, CHANGELOG, design specs and manifest; gaps flagged for the author.
