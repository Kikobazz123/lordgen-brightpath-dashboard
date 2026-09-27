# BrightPath — status

**Both builds are complete.** The frontend and backend gaps this file used to
track are closed. What remains is one manual step that cannot be automated:
connecting GitHub to Vercel and entering secrets. See `DEPLOYMENT.md`.

The history of how the project got here is kept at the bottom, because the two
interruptions explain some of the shape of the repo.

---

## Where things stand

| | State |
|---|---|
| Backend | Complete. 12 API routes + health. 38 verification checks green. |
| Frontend | Complete. Capture, triage, lead detail, dashboard — all on real data. |
| Database | Neon `brightpath` (`weathered-haze-95690617`), schema pushed, 9 seeded leads. |
| GitHub | `Kikobazz123/brightpath-dashboard`, branch `master`, private, up to date. |
| Vercel | **Not deployed.** Blocked on the GitHub connection. |
| AI provider | **Stub.** Runs, extracts nothing. Needs a key — see below. |

### The two things still outstanding

Both need a human, and neither is a code change.

1. **Connect GitHub to Vercel, then import the repo.** The Vercel account has
   no Git integration at all, so it cannot see a private repo. Full steps and
   the environment-variable table are in `DEPLOYMENT.md`.

2. **Add a Gemini API key.** Free, no card, from
   <https://aistudio.google.com/apikey>. Set `AI_PROVIDER=gemini` and
   `GEMINI_API_KEY` in `.env.local` and in Vercel, then run
   `pnpm verify:provider` to confirm it actually works.

   Without it the app runs and the seeded leads look correct, but a **newly
   captured lead comes back `NEEDS_REVIEW` with no drafted message**. That is
   the honest behaviour — the stub claims nothing rather than inventing
   evidence — but it makes a live capture demo fall flat.

---

## The repository

Two repos exist. Only one is live work.

| Repo | Local path | Role |
|---|---|---|
| `brightpath-dashboard` | `AIOS/projects/admin-dashboard-ui` | **The project.** Backend + frontend. |
| `brightpath-backend` | `AIOS/projects/admin-dashboard` | Frozen snapshot of the first session. Do not develop here. |

`brightpath-dashboard` was branched from the other tree partway through, so it
contains the whole backend byte-identical plus everything since. The two
histories are unrelated — each was initialised separately from the same
pristine upstream (`shadcnstore/shadcn-dashboard-landing-template`,
nextjs-version, MIT).

---

## Running it

```bash
pnpm install
pnpm dev                 # serves on $BASE_URL (default in .env.example)

pnpm verify:scoring      # 18 checks — no database, no network, no key
pnpm verify:journey      # 20 checks against a real database, self-cleaning
pnpm verify:provider     # one real AI call; fails loudly if it hit the stub

pnpm db:status           # row counts by tenant
pnpm db:seed             # demo leads
pnpm db:push             # apply schema changes
```

`.env.local` holds the real values and is gitignored. `.env.example` documents
every variable with placeholders and is tracked.

---

## What the build actually is

A sales assistant for BrightPath Solutions — AI BuildFest 2026, Track 1, Case
Study 2. A lead arrives, is captured, analysed, scored against an explicit
rubric, given a drafted follow-up and one recommended next action, and tracked
through a status a human owns.

### The design decision everything rests on

**The model extracts evidence. Deterministic code computes the score.**

The analyst reports facts, each carrying the verbatim quote it came from. The
rubric in `src/lib/pipeline/rubric.ts` applies policy to those facts. The model
has never been told what a good lead looks like, because telling it would
invite it to flatter whichever lead it happens to be reading.

This is why the same evidence scores identically across 200 runs, why every
point traces to a named rubric line, and why the build is nearly free to run.

**Never move scoring into a prompt.** Policy changes belong in `rubric.ts` with
a version bump. Two gates live there because a plain weighted sum got them
wrong: an explicit "no budget" disqualifies outright, and HIGH priority
requires a *stated* problem.

### The other rule: no claim without proof

- A signal with no verbatim quote is reported absent, not guessed. Claims whose
  quote cannot be found in the source text are dropped.
- A score is withheld — `null`, rendered as an em dash — when required evidence
  is missing. Never zero, which is a judgement rather than the absence of one.
- `median_first_touch_minutes` is `null` until something is touched. "No data"
  and "instant response" must not share a glyph.
- **There is no send button.** The only route to `sent` is recording a provider
  message id. A button that flipped a column would be the most damaging lie
  this app could tell, given the whole product exists because leads go cold
  unnoticed.

---

## Verification

| Suite | Checks | Needs |
|---|---|---|
| `verify:scoring` | 18 | nothing |
| `verify:journey` | 20 | a database |
| `verify:provider` | live call | an API key |

`verify:journey` covers capture, the pipeline, truthfulness of follow-up state,
the SLA clock, the audit trail, and four cross-tenant access checks. It creates
a throwaway tenant and deletes it, so it is safe against the demo database.

Spec compliance: all ten API endpoints required by `CLAUDE.md` exist with the
specified verbs, plus `POST /webhooks/leads/{source}`, `/stats`,
`/leads/{id}/confirm-send` and `/health`. All three specified tables exist.

Remaining gaps are listed plainly at the end of
`brief/BACKEND_BUILD_CHECKLIST.md`.

---

## History

Two sessions were interrupted by API 529s on 2026-08-24. Nothing was lost.

- **Session 1** built the backend — persistence, contracts, the pipeline, 12
  API routes, the verification scripts. It finished writing its verification
  tooling and died before running any of it.
- **Session 2** rebranded the landing page, built the auth and dashboard
  chrome, and stopped mid-task on `src/lib/client/server-data.ts` — the read
  accessors existed but had no consumers, and there was no leads UI at all.
- **Session 3** wrote `actions.ts`, built the whole leads workspace, replaced
  the template's fabricated dashboard figures with real data, ran the
  verification for the first time, and closed the access-control and
  observability gaps.

The original plan had both sessions sharing one repo split by path. Session 2
copied the tree instead, which is why `brightpath-backend` exists as a frozen
snapshot rather than a parallel line of work.

The governing brief (`CLAUDE.md`, `brief/BACKEND_SCOPE.md`,
`brief/BACKEND_BUILD_CHECKLIST.md`) lived only in a Downloads folder until it
was committed — it was one deleted directory away from being lost. The
case-study PDF that `CLAUDE.md` calls authoritative is still not on this
machine; it is presumably in email or the competition portal, and belongs in
`brief/`.

A source-only archive taken before any of this was committed is at
`AIOS backup/brightpath-source-20260824-021844.tgz` (19 MB, both `.git`
directories, real `.env.local` files, no `node_modules`).
