---
name: arya-desktop
tags: windows-automation, accessibility, uia, computer-use
requirements:
  - arya_desktop
description: >
  Observe-act loop for Arya Computer Use (Phase 1): refs from arya_snapshot,
  semantic UIA actions, delivery dispositions (delivered_verified /
  delivered_unverified / not_delivered + retry safety), Chromium settle
  (--timeout-ms + re-snapshot), headed toggle rules (type, right-click,
  double/triple-click, focus, cursor-moving, notifications, shell surfaces),
  destructive-action confirmation, OCR fallback for no-accessibility-tree UIs.
  Condensed from agent-desktop compiled skills (desktop + windows).
---

# Arya Desktop (skeleton)

TODO(Phase 1): write the loop guide condensed from
`dsh-arya-agent-desktop/skills/agent-desktop/SKILL.md` +
`skills/agent-desktop-windows/SKILL.md`:

- skeleton-first snapshot, `--root @ref` drill for dense apps
- ref identity rules (STALE_REF / AMBIGUOUS_TARGET — never retry unsafe)
- `delivered_verified` vs `delivered_unverified` semantics
- Chromium/Electron: cold trees read 13x thin — pass `--timeout-ms`, re-snapshot
- headed-only list + `arya_tools {operation: headed, on: true}` toggle
- destructive steps: ask the user before acting (jev-style gate)
- OCR fallback (WinUI3/MSIX menus, canvas UIs): `arya_ocr` + headed coordinate click
