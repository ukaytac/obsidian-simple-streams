# Community Strategy

**Document version:** v4
**Last updated:** 2026-09-20
**Context:** reads [product-marketing.md](product-marketing.md). Goal, voice and positioning come from there; this document only decides where to show up and what to do there.

**Inputs from the author:** 3–5 hours per week. Comfortable posting publicly under his own name. Not on Discord, and not planning to be — so it is out of scope entirely.

---

## The verdict, first

**Do not build a community. Join the ones that exist, and keep one cheap owned surface.**

The numbers make this decision for us, and they are smaller than they first looked. As of 2026-09-20 the directory reports **35 installations** — not the 306 cumulative downloads, which count every user again on every update. Four stars, zero issues, zero identified users. The standard launch playbook says recruit 20–50 founding members by hand before opening the doors — there is nobody to recruit. Obsidian's directory does not tell you who installed your plugin, so the contactable user list is genuinely empty, not merely small.

A Discord or Slack opened now would be an empty room with the author talking to himself. That is worse than no community: it is a visible signal that nothing is happening here, sitting permanently on the README.

There is a second reason, and it is the stronger one. The goal is **recognition and reach** (product-marketing.md → Goals), not retention or support deflection. A community you own serves retention — it keeps people you already have. Communities you join serve reach — they put the work in front of people who have never heard of it. The scarce resource here is being seen at all, so effort belongs where the audience already is.

**What this means concretely:** no Discord, no Slack, no Circle, no forum of our own. Show up in the Obsidian forum; keep GitHub Discussions as the one owned surface, because it is already enabled and costs nothing to run.

Revisit this decision at roughly **2,000 downloads or 20 unsolicited GitHub Discussions threads**, whichever comes first. Below that there is no community to host.

---

## Identity

Every community strategy needs an answer to *what identity does this reinforce*. Ours:

> **People who care how their notes read.**

Not power users. Not database builders. Not automation tinkerers. The distinguishing trait is a craft sensibility about output — the person who is bothered that a listing is ugly, and who would rather have five notes presented well than fifty presented as table rows.

This is a real and underserved identity in the Obsidian world, which is heavily colonised by the *capability* identity: who can build the most elaborate query, the most complete dashboard. Simple Streams appeals to the opposite instinct, and the founding quote in product-marketing.md is exactly that instinct speaking.

**Why this matters tactically:** it tells us which threads to answer and which to skip. A thread asking "how do I compute a rollup across my project notes" is not ours, even though we could half-answer it. A thread asking "my daily notes list looks awful, how do people make this nicer" is ours entirely.

---

## The core loop

The unit that spreads is not the plugin. **It is the block.**

A `stream` block is five lines of YAML. It can be pasted into a forum reply, a Reddit comment or a blog post; it survives copy-paste intact; and the person receiving it can run it in ten seconds and then change one line to make it theirs. Nothing else about this product travels that well.

```
Someone asks how to list notes  →  you answer with a working block
        ↑                                      ↓
        ←  others copy, adapt and post their own blocks  ←
```

Everything below is designed to make that loop turn. Every appearance in public should carry a runnable block, not a description of the plugin, and not a link on its own.

Two consequences worth stating:

- **Never post a bare link.** A link asks for trust before it gives anything. A block gives first — it is useful even to someone who never installs the plugin, because it shows them the shape of the answer.
- **Build a stock of blocks.** Recipes are reusable ammunition. See *Stream recipes* under Phase 2.

---

## Where to show up

Verified against the live forum and GitHub on 2026-09-20.

| Venue | Size | Role | Effort |
|---|---|---|---|
| **Obsidian Forum → Help** | 24,168 topics / 93,440 posts | **The engine.** Biggest surface on the forum by a wide margin. People arrive with the exact problem the plugin solves. | Sustained, ~1–2h/wk |
| **Forum → Share & showcase → Workflows & Templates** | 1,886 topics | **The highest-leverage posts.** Busier than the Plugins board, and a workflow post is on-identity in a way a plugin announcement is not. | 1 post/month |
| **Forum → Share & showcase → Plugins** | 1,063 topics | Release announcements. Necessary, not where the reach is. | 1 post/release |
| **GitHub Discussions** | already enabled | The one owned surface. Indexed by search, attached to the repo, attribution built in. | ~30 min/wk |
| **Forum → Devs: Plugins & API** | 1,177 topics | Peer visibility among plugin authors. Not a promotion venue — a reputation one. | Occasional |
| **r/ObsidianMD** | large | **Gated.** Rules verified — promoting your project as your first post is an instant ban, and AI-written posts are removed. Requires earning a history first. See below. | Months 2–3, low |

**The single most important line in that table is the first one.** Help carries more posts than every other category combined. It is also the least self-promotional thing on the list: you are answering a stranger's actual question. For a goal of recognition, sustained visible helpfulness in the busiest room beats any announcement.

### r/ObsidianMD, specifically

The subreddit's rules were checked on 2026-09-20 and two of them decide how we use it:

> **Rule 3 — Don't shill.** "If you are just here to advertise your product, don't."
>
> **Rule 4 — No slop.** "Don't post AI-generated content, it will be removed. […] If your first and only post is to promote your project (vibe-coded or otherwise), you will be immediately banned."

That second clause is a hard gate, and it is worth reading precisely: the ban is for a *first and only* post that promotes. The way through is not a cleverer post — it is a history. So:

1. **Do not mention Simple Streams on Reddit for the first two months.** Not once.
2. **Build a comment history instead.** Answer other people's questions in comments, about Obsidian generally, with no link and no mention. Comments are participation; this is the same thing you are already doing on the forum, in a room with stricter manners.
3. **Only then consider a post**, and make it a workflow post that stands on its own — the kind of thing that would be worth reading with the plugin removed. By then the account is visibly not a drive-by.
4. **Write every word yourself.** Rule 4's first clause removes AI-generated content on sight, and Reddit readers are unusually good at spotting it.

If that sounds like a lot of patience for one venue, it is — which is exactly why the forum is the engine and Reddit is a later, optional addition. Do not let it displace steps 5–7.

---

## The 90-day plan

### Phase 1 — Fix the front door (Weeks 1–2, ~3h total)

Do not drive anyone anywhere until what they land on is right.

1. **Fix the GitHub repository description.** It currently reads:

   > "Create custom streams of your Obsidian notes with flexible filtering, sorting, grouping, and display options."

   This is off-voice and off-position. It leads with the field list — the exact move product-marketing.md warns against ("leading on the field list makes it sound like the very thing it was built to be unlike") — and uses two words on the avoid list, *custom* and *flexible*. It also disagrees with the manifest, which is the better sentence. Make them match, or write one that carries all three parts of the promise.

2. **Seed GitHub Discussions.** It is enabled and empty. Open three threads yourself, in the voice of the README:
   - **Stream recipes** — a running thread of working blocks, one per use case. This is the asset everything else points at.
   - **What are you streaming?** — an invitation to post blocks. Low-stakes, and it is the loop in one thread.
   - **What should `stream` learn next?** — roadmap input, which also tells you which requests are real.

   Seed each with two or three of your own posts so the first visitor sees a room with something in it.

3. **Answer the directory's two flags where they are seen.** The plugin's directory page — the page every prospective installer lands on — says "2 issues found by automated scans." Both were traced and neither is a defect (product-marketing.md → Objections has the detail: one is the `yaml` dependency's `!!binary` handler, the other a deliberate choice documented in `src/view/SettingsTab.ts`). The problem is not the code. The problem is that a stranger reads the word *issues*, in security language, directly beneath the one claim no competing plugin makes.

   Fix it where the doubt lands, not where the answer already lives:
   - Add a short, unexcited paragraph to the README's existing "What it reads, and what it never does" section naming both flags and what they are. That section's whole method is stating the awkward thing before anyone has to find it; this belongs to it.
   - Open a GitHub Discussion titled for what someone would actually search — "Why the directory scan shows two issues" — so the answer is findable by someone who never reads the whole README.
   - Consider whether the `yaml` flag is worth engineering away, but treat that as a separate question with its own cost. It is a dependency's standard tag handler, not a problem to be panicked about.

   Do this before step 5. Driving traffic to a page that raises an unanswered doubt wastes the traffic.

4. **Decide the attribution line.** Per Goals, the author's name travelling with the plugin is a first-class objective, not a nicety. Settle on one form — name plus uka.dev — and use it identically in the forum profile, the GitHub profile and every post signature. Inconsistent attribution is how a widely used plugin ends up anonymous.

### Phase 2 — Presence (Weeks 3–8, ~3h/wk)

5. **The weekly ritual: two answered questions.** Twice a week, open Forum → Help, find a thread about listing, indexing, journals, MOCs, project notes or daily notes, and answer it properly — with a working block, tailored to what they asked. Mention the plugin once, plainly, at the end. If the question is better answered without Simple Streams, answer it without Simple Streams; that is what builds the reputation the goal is actually about.

   This is roughly 40 answers over the quarter. It is the whole engine.

6. **Build the stream recipes collection.** Every question you answer produces a block. Add it to the Stream recipes discussion with a one-line description of the problem it solves. By the end of the quarter this should be twenty-plus blocks — a genuine reference that earns links on its own, and the thing you paste instead of retyping.

7. **One workflow post per month**, in Share & showcase → **Workflows & Templates**, not the Plugins board. Write it as a workflow, because that is what it is:
   - Month 1: *Project notes that keep their own history* — the `this.Property` template pattern. This is the strongest single story the plugin has.
   - Month 2: *Reading one section across many notes* — the `section:` field, as a comparison column.
   - Month 3: *A sidebar that follows what you are reading* — `active.Property`.

   Each post should be useful to someone who never installs the plugin. Screenshots matter here more than anywhere else: the promise is partly presentational, so **show the output**. The README's existing light/dark captures are the right standard.

### Phase 3 — Compounding (Weeks 9–13, ~3h/wk)

8. **Keep the ritual running.** Steps 5–7 do not stop. Consistency is the only thing that turns presence into recognition.

9. **Notice and invest in the first real users.** The moment someone posts their own block, files a thoughtful issue, or answers a question about Simple Streams for you — that is your first community member, and there will be very few of them at this scale. Reply personally. Credit them by name in the CHANGELOG when their input changes something; the changelog is already written in prose, so this costs one sentence and is worth far more than it costs.

10. **Close the loop in public.** When a request from the forum or Discussions ships, say so in the release notes and link back to where it was raised. This is the single cheapest trust-builder available, and it is entirely consistent with how the CHANGELOG is already written.

11. **Re-evaluate at day 90** against the metrics below.

---

## What to measure

The standard community health metrics — DAU/MAU, thread reply rate, lurker ratio — assume a community you host. They do not apply here and tracking them would be theatre. These do:

**Baseline, 2026-09-20:** **35 installations** · 306 cumulative downloads · 4 stars · 0 issues · 0 discussions.

Track installations, not downloads. Downloads rise on their own every time you ship a release, because existing users are counted again — which makes them a flattering number that measures your own activity rather than anyone else's interest.

| Signal | What it tells you | 90-day target |
|---|---|---|
| Directory installations | Reach. The headline number. | 150 |
| GitHub stars | Deliberate approval — someone bothered. | 25 |
| Discussions started by someone else | The first real sign of a community | 3 |
| Blocks posted by other people | **The loop turning.** The truest signal on this list. | 5 |
| Forum questions answered | Your own input. The only one fully in your control. | 40 |
| Unprompted mentions by others | Recognition, which is the actual goal | 1 |

The fourth row is the one to watch. Installations can rise from a directory placement; someone writing their own `stream` block in public means the thing spread on its own.

**Warning signs:** every Discussions thread is yours after eight weeks; answered questions produce no clicks through to the repo; the same forum post format stops getting replies. Any of these means the message is wrong, not that the effort is insufficient.

---

## What not to do

- **No Discord or Slack — ours or anyone else's.** Ours would be an empty room; the official Obsidian one is off the table because the author does not use Discord. Nothing in this plan depends on it, and the forum covers the same questions with the advantage of being indexed and permanent.
- **No bare links.** Every appearance carries a runnable block.
- **No named comparisons.** product-marketing.md's positioning rule applies fully in public threads, and it is most tempting to break exactly where it matters most: someone asks "how is this different from X" and the honest-looking answer is a list of X's failings. Answer by describing what this does, and let them draw the comparison.
- **No answering questions that are not ours.** Capability questions belong to other tools. Answering them badly, or bending the plugin to fit, dilutes the identity that makes this findable.
- **No promoting on r/ObsidianMD without a history there.** Instant ban, per its Rule 4. See the section above.
- **No AI-written posts, anywhere — not just Reddit.** r/ObsidianMD removes them by rule, but the real reason is broader: product-marketing.md's first goal implication is that *craft is the marketing*. Publishing generated prose under your own name contradicts the entire thesis of this project, whose README is the proof of care. Use assistance to decide what to say; write the sentences yourself.

---

## Open questions

- **User testimonials** — the directory's "Review" turns out to be an automated code scan, not user reviews, so it is not a testimonial source after all. product-marketing.md → Proof Points → Testimonials stays a gap, and GitHub Discussions is now the likeliest first place a quotable sentence appears.

## Changelog

*Newest first.*
- v4 (2026-09-20) — Rebased every number on installations (35) rather than cumulative downloads (306), which double-count updates, and cut the 90-day target accordingly. Added a Phase 1 step to answer the directory page's two automated flags where they are seen.
- v3 (2026-09-20) — Dropped Discord entirely: the author does not use it. The forum absorbs the role, and loses nothing that mattered, since Discord messages were never going to compound anyway.
- v2 (2026-09-20) — r/ObsidianMD rules verified: promotion-as-first-post is an instant ban and AI-generated content is removed, so Reddit becomes a gated, history-first venue rather than an early one. Added a project-wide rule against publishing generated prose.
- v1 (2026-09-20) — Initial strategy. Verdict: participate rather than build, on the grounds that the goal is reach and there is no user base to convene. Venues verified against the live forum; GitHub description mismatch found and flagged.
