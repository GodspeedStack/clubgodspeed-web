#!/usr/bin/env bash
set -euo pipefail

# Block gitlinks (submodule pointers)
if git ls-files -s | awk '$1 == "160000" { exit 1 }'; then
  :
else
  echo "BLOCKED: gitlink/submodule detected (mode 160000). Remove nested repo or gitlink before committing."
  git ls-files -s | awk '$1 == "160000" { print }'
  exit 1
fi

# Block nested .git directories (embedded repos)
# Limit depth to keep it fast
if find . -maxdepth 4 -type d -name ".git" ! -path "./.git" | grep -q .; then
  echo "BLOCKED: nested .git directory detected. Do not commit embedded repositories."
  find . -maxdepth 4 -type d -name ".git" ! -path "./.git"
  exit 1
fi

exit 0
