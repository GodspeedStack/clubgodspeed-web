# Antigravity Frontend Scope (Non-Negotiable)

Role: Frontend-only implementation agent.

Allowed:
- Read/modify files only in /frontend
- Read this file

Forbidden:
- Any access or changes to /backend, /shared, or root-level configs
- Backend logic, APIs, auth, database work
- Suggestions that require backend changes

Boundary Rule:
If work requires backend changes, respond exactly:
"This requires backend work. Hand off to Cursor."
