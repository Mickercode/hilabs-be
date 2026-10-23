# Contributing to HiLabs

## Branches

Two long-lived branches, and nothing is committed directly to either.

| Branch | What it is | Deploys to |
| --- | --- | --- |
| `production` | What learners are using. Only ever updated by a release PR from `staging`. | Production |
| `staging` | The next release. Everything lands here first. | Staging |

Everything else is a short-lived branch off `staging`:

```
staging ──┬── feat/discovery-challenges ──┐
          ├── fix/export-marker-parity ───┼──> PR into staging
          └── chore/bump-prisma ──────────┘

staging ───────────────────────────────────> release PR into production
```

### Naming

`<type>/<short-description>`, lower case, hyphens, no issue numbers in the branch name.

| Prefix | For |
| --- | --- |
| `feat/` | A new capability |
| `fix/` | A defect in something already shipped |
| `chore/` | Dependencies, tooling, CI, config |
| `docs/` | Documentation only |
| `refactor/` | Behaviour unchanged |

Good: `feat/rater-blind-export`, `fix/companion-event-missing-citation`
Avoid: `feature/stuff`, `patch-1`, `michael-wip`

### The loop

```sh
git checkout staging && git pull
git checkout -b feat/rater-blind-export
# work, commit
git push -u origin feat/rater-blind-export
gh pr create --base staging --fill
```

Squash-merge into `staging`. Delete the branch after merge. Never merge `staging` into a feature
branch — rebase onto it instead, so history stays readable.

### Releasing

```sh
gh pr create --base production --head staging --title "Release YYYY-MM-DD"
```

A release PR is reviewed as a whole. `production` is never force-pushed.

## Commits

One logical change per commit. Present tense, no full stop:

```
Add blind export batching for rater panel

Strips arm, dates and identity, interleaves arms, and records the
redaction marker count per item so parity can be checked (R18).
```

Reference the requirement ID (`R1`–`R21`) when a commit implements one. The IDs are in the
product requirements; the traceability table maps each to where it is satisfied.

## Before you open a PR

- [ ] CI is green.
- [ ] You have not weakened a research invariant. The database refuses observation updates,
      erasure-gated deletes, uncited companion explanations and a few other things **on purpose**.
      If a migration or a test change removes one, that is the PR's headline, not a footnote.
- [ ] No learner data, real email addresses, or credentials in the diff. Both repos are public.
- [ ] New user-facing copy matches the agreed wording rather than paraphrasing it.

## The invariants, in short

These come from the research design. Breaking one invalidates the pilot, so a PR that needs to
break one should say so explicitly and expect to be questioned.

1. No intelligence labels in anything a learner can see — no GIM type, DI score or ranking.
2. Observations are append-only. Corrections are new rows.
3. Interpretations are superseded, never overwritten.
4. Every companion intervention is logged in the same transaction that serves it.
5. Every work sample records its support level.
6. The companion never writes a learner's portfolio work.
7. A companion explanation always cites a real library resource.
8. Raters are blind to study arm.
9. A learner can export and delete everything.
10. No grades, school or credentials are collected, anywhere.
11. Evidence labels are never upgraded: the Lab is not described as validated.
12. Volition is recorded, not assumed.
