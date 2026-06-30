# Cowork Thread Health Policy v2.0
> Owner: Scott Jewell | Scope: all Cowork and Claude Desktop sessions
> Principle: **the transcript is disposable; the contracts and deliverables are the record.**

(Full policy text maintained by Scott. Key operational summary below; this file is the canonical in-repo copy.)

## Size bands (audit.jsonl)
| Band | Size | Action |
|------|------|--------|
| Green | < 50 MB | Normal |
| Watch | 50-200 MB | Externalize decisions; rotate within 1-2 sessions |
| Warn | 200-500 MB | Rotate now; no new work in thread |
| Danger | > 500 MB | Never reopen; archive first |

Behavioral overrides (treat as Warn regardless of size): slow launch >15s, CPU spikes, "context window exceeded"/"compaction_skipped"/"compaction failed" logs, crash on open, or a compaction summary at the top of a response.

## Prevention
1. One task, one thread. Close on completion.
2. Name threads by task (e.g. `godspeed-raise-build`), never "Untitled".
3. Cap thread lifespan at 3 deep sessions, then rotate.
4. Externalize decisions to `*_DECISIONS.md` contracts referenced from `CLAUDE.md`.
5. Deliverables on disk before closing a thread.
6. Never re-attach large corpora; reference files by path (agent has Read/Grep/Glob).
7. Images are expensive; do not re-attach the same screenshot across turns.
8. Summaries over transcripts when referencing prior conversations.

## Agent behavioral rules (binding on Claude)
1. Session start: if thread has substantial prior history/compaction summary, note it and suggest rotation.
2. Update the relevant `*_DECISIONS.md` before ending a significant session.
3. Never suggest reopening a crashed thread; use the recovery runbook.
4. Warn when user pastes >200-line files or full transcripts; suggest path references.
5. Proactively recommend rotation at 3+ continued sessions.

## Runbooks
- Rotation: update contract -> verify deliverables on disk -> quit app -> archive log (gzip, reversible) -> new thread in project folder (CLAUDE.md auto-loads contracts).
- Recovery (crashing thread): stop reopening -> quit app -> find audit.jsonl >500M -> stream-extract user/assistant turns -> distill to contract -> archive gzip -> fresh thread.
- Weekly: run `~/bin/cowork-thread-health.sh`; triage anything WATCH+.
- Purge archives clean for 30+ days.

*v2.0 — 2026-06-12. Supersedes v1.0. Full text with scripts lives with Scott; ask him for the scanner/extract/archive command blocks if needed.*
