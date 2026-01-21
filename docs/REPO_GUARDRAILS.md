# Repo Guardrails

This repo blocks nested Git repos and gitlinks (submodule pointers) at both pre-commit and CI.

## Pre-commit (local)

Install once per machine:

```bash
bash scripts/install-git-hooks.sh
```

The hook runs `scripts/guardrails-check.sh` and prevents commits that contain:
- gitlinks (mode `160000`)
- nested `.git` directories within depth 4

## CI

CI always runs `scripts/guardrails-check.sh` and will fail any PR/branch with nested repos or gitlinks.
