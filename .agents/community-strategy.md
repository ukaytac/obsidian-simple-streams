# Community Strategy

**Document version:** v1
**Last updated:** 2026-09-20
**Context:** reads [product-marketing.md](product-marketing.md). Goal, voice and positioning come from there; this document only decides where to show up and what to do there.

**Inputs from the author:** 3–5 hours per week. Comfortable posting publicly under his own name.

---

## The verdict, first

**Do not build a community. Join the ones that exist, and keep one cheap owned surface.**

The numbers make this decision for us. As of 2026-09-20 there are 306 directory downloads, 4 stars, zero issues and zero identified users. The standard launch playbook says recruit 20–50 founding members by hand before opening the doors — there is nobody to recruit. Obsidian's directory does not tell you who installed your plugin, so the contactable user list is genuinely empty, not merely small.

A Discord or Slack opened now would be an empty room with the author talking to himself. That is worse than no community: it is a visible signal that nothing is happening here, sitting permanently on the README.

There is a second reason, and it is the stronger one. The goal is **recognition and reach** (product-marketing.md → Goals), not retention or support deflection. A community you own serves retention — it keeps people you already have. Communities you join serve reach — they put the work in front of people who have never heard of it. The scarce resource here is being seen at all, so effort belongs where the audience already is.

**What this means concretely:** no Discord, no Slack, no Circle, no forum of our own. Show up in the Obsidian forum and Discord; keep GitHub Discussions as the one owned surface, because it is already enabled and costs nothing to run.

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

A `stream` block is five lines of YAML. It can be pasted into a forum reply, a Reddit comment, a Discord message or a blog post; it survives copy-paste intact; and the person receiving it can run it in ten seconds and then change one line to make it theirs. Nothing else about this product travels that well.

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
| **Obsidian Discord** | — | Real-time question answering. Higher velocity, zero durability — messages are not indexed and do not compound. | Opportunistic |
| **GitHub Discussions** | already enabled | The one owned surface. Indexed by search, attached to the repo, attribution built in. | ~30 min/wk |
| **Forum → Devs: Plugins & API** | 1,177 topics | Peer visibility among plugin authors. Not a promotion venue — a reputation one. | Occasional |
| **r/ObsidianMD** | not verified | Likely worthwhile, **but check the self-promotion rules yourself before posting.** I could not read them from here (Reddit blocked the request), and subreddit promo rules are exactly the thing that gets a first post removed and an account flagged. | Verify first |

**The single most important line in that table is the first one.** Help carries more posts than every other category combined. It is also the least self-promotional thing on the list: you are answering a stranger's actual question. For a goal of recognition, sustained visible helpfulness in the busiest room beats any announcement.

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

3. **Decide the attribution line.** Per Goals, the author's name travelling with the plugin is a first-class objective, not a nicety. Settle on one form — name plus uka.dev — and use it identically in the forum profile, the Discord profile, the GitHub profile and every post signature. Inconsistent attribution is how a widely used plugin ends up anonymous.

### Phase 2 — Presence (Weeks 3–8, ~3h/wk)

4. **The weekly ritual: two answered questions.** Twice a week, open Forum → Help, find a thread about listing, indexing, journals, MOCs, project notes or daily notes, and answer it properly — with a working block, tailored to what they asked. Mention the plugin once, plainly, at the end. If the question is better answered without Simple Streams, answer it without Simple Streams; that is what builds the reputation the goal is actually about.

   This is roughly 40 answers over the quarter. It is the whole engine.

5. **Build the stream recipes collection.** Every question you answer produces a block. Add it to the Stream recipes discussion with a one-line description of the problem it solves. By the end of the quarter this should be twenty-plus blocks — a genuine reference that earns links on its own, and the thing you paste instead of retyping.

6. **One workflow post per month**, in Share & showcase → **Workflows & Templates**, not the Plugins board. Write it as a workflow, because that is what it is:
   - Month 1: *Project notes that keep their own history* — the `this.Property` template pattern. This is the strongest single story the plugin has.
   - Month 2: *Reading one section across many notes* — the `section:` field, as a comparison column.
   - Month 3: *A sidebar that follows what you are reading* — `active.Property`.

   Each post should be useful to someone who never installs the plugin. Screenshots matter here more than anywhere else: the promise is partly presentational, so **show the output**. The README's existing light/dark captures are the right standard.

### Phase 3 — Compounding (Weeks 9–13, ~3h/wk)

7. **Keep the ritual running.** Steps 4–6 do not stop. Consistency is the only thing that turns presence into recognition.

8. **Notice and invest in the first real users.** The moment someone posts their own block, files a thoughtful issue, or answers a question about Simple Streams for you — that is your first community member, and there will be very few of them at this scale. Reply personally. Credit them by name in the CHANGELOG when their input changes something; the changelog is already written in prose, so this costs one sentence and is worth far more than it costs.

9. **Close the loop in public.** When a request from the forum or Discussions ships, say so in the release notes and link back to where it was raised. This is the single cheapest trust-builder available, and it is entirely consistent with how the CHANGELOG is already written.

10. **Re-evaluate at day 90** against the metrics below.

---

## What to measure

The standard community health metrics — DAU/MAU, thread reply rate, lurker ratio — assume a community you host. They do not apply here and tracking them would be theatre. These do:

**Baseline, 2026-09-20:** 306 downloads · 4 stars · 0 issues · 0 discussions.

| Signal | What it tells you | 90-day target |
|---|---|---|
| Directory downloads | Reach. The headline number. | 1,000 |
| GitHub stars | Deliberate approval — someone bothered. | 25 |
| Discussions started by someone else | The first real sign of a community | 3 |
| Blocks posted by other people | **The loop turning.** The truest signal on this list. | 5 |
| Forum questions answered | Your own input. The only one fully in your control. | 40 |
| Unprompted mentions by others | Recognition, which is the actual goal | 1 |

The fourth row is the one to watch. Downloads can rise from a directory placement; someone writing their own `stream` block in public means the thing spread on its own.

**Warning signs:** every Discussions thread is yours after eight weeks; answered questions produce no clicks through to the repo; the same forum post format stops getting replies. Any of these means the message is wrong, not that the effort is insufficient.

---

## What not to do

- **No Discord or Slack of our own.** Covered above. Empty rooms are negative signal.
- **No bare links.** Every appearance carries a runnable block.
- **No named comparisons.** product-marketing.md's positioning rule applies fully in public threads, and it is most tempting to break exactly where it matters most: someone asks "how is this different from X" and the honest-looking answer is a list of X's failings. Answer by describing what this does, and let them draw the comparison.
- **No answering questions that are not ours.** Capability questions belong to other tools. Answering them badly, or bending the plugin to fit, dilutes the identity that makes this findable.
- **No posting in r/ObsidianMD before reading its rules.** Unverified; see the venue table.

---

## Open questions

- **r/ObsidianMD's self-promotion rules** — could not be retrieved; must be checked manually before first post.
- **Obsidian Discord channel structure** — not verified from here. Worth ten minutes before the first message, to find where plugin questions actually live.
- **Directory review visibility** — unclear whether the community directory exposes reviews publicly. If it does, that is a proof-point source (product-marketing.md → Proof Points → Testimonials, currently a gap).

## Changelog

*Newest first.*
- v1 (2026-09-20) — Initial strategy. Verdict: participate rather than build, on the grounds that the goal is reach and there is no user base to convene. Venues verified against the live forum; GitHub description mismatch found and flagged.
