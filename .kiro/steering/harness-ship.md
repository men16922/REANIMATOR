---
inclusion: auto
name: harness-ship
description: One command for the end-of-work ritual — checkpoint the docs, tidy them if over budget, run the gate, then commit (never push). Use on "ship", "마무리", "체크포인트하고 커밋", or when a work bundle is verified and should land as a commit.
---


# /ship — checkpoint → budget → gate → commit

The ritual that otherwise takes three separate commands. It **commits locally and stops before any push**:
pushing, deploying and anything outward-facing stay the user's call.

## Config

Read `.claude/harness-config.json`. Keys used (all optional, with defaults):

- `gate` (default `make check`) — the deterministic check that must pass before a commit.
- `doc_budget_cmd` — a command that exits non-zero when an entry doc is over its budget (e.g. `make check-doc-budget`).
  Absent → compare `wc -l` of brief/status/plan/log with `budgets`.
- `ship.hold_back` — list of paths/globs that are **never staged** by this skill (a file the user is still
  deciding on, scratch notes, generated output). Example: `["FEEDBACK.md", "outputs/**"]`.
- docs/budgets/archive keys as in `/checkpoint` and `/tidy-docs`.

## Procedure

1. **Look first.** `git status -sb` and `git diff --stat`. List what is changed, and which of those paths match
   `ship.hold_back` (they will be left unstaged). Stop and ask if the tree holds changes that clearly are not this
   session's work (another agent's output, unrelated files) — never sweep them into the commit.
2. **Verify before recording.** Run `gate`. If it fails, stop and report the failing output; do not checkpoint or
   commit a red tree. If the user already ran it this session on the same tree, say so instead of re-running.
   Anything not run is written as "unverified" in the log entry, never implied.
3. **Checkpoint.** Follow `/checkpoint` (log entry on top, status/brief/plan only if they changed, lessons only
   if something non-obvious was learned).
4. **Budget.** Run `doc_budget_cmd` (or the `wc -l` fallback). If over, do the `/tidy-docs` plan **and show it
   before moving anything** (tidy-docs' own approval rule applies), then re-check. A budget failure is fixed
   here, not carried to the next session.
5. **Stage by name.** `git add` the session's files explicitly — no `git add -A`, nothing from `ship.hold_back`,
   no `.env`/keys/credentials/generated outputs. Re-run `git status -sb` and confirm the staged list.
6. **Commit.** One commit with a short imperative subject (match the repo's recent style from `git log --oneline -8`)
   and a body only when the why is not obvious. Add the attribution trailer the session instructs. A commit hook
   failure means fix and create a **new** commit; never `--amend` or `--no-verify`.
7. **Report in 3-5 lines:** what landed (hash + subject), what was left out (hold-back / unrelated), what is
   unverified, and what only the user can do next (push, deploy, accounts). If a remote or repo is missing, name
   the exact command and who runs it.

## Rules

- Never push, deploy, tag, or open a PR from this skill.
- Never skip the gate to make the ritual finish; a failing gate is the answer.
- Same-session repeat: if the docs already carry this work with current evidence, skip step 3's new entry.
