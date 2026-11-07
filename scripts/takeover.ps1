# takeover.ps1 — Arya Computer Use takeover helper (skeleton).
#
# Phase 2: adapted from dsh-computer-use-win's windows-takeover.ps1 (MIT,
# Yu-tao-Li). Runs as a standalone powershell.exe process (FullLanguage, not
# affected by the DSH pwsh sandbox). Responsibilities:
#   - screen edge glow while physical (headed) input is active
#   - status bar ("Arya is controlling the desktop", session + headed state)
#   - global Esc listener -> notify Host plugin -> session end, overlay off,
#     driver lock release, "stopped" status
# Fed by the adapter/Host over a loopback channel; teardown on session end.

Write-Host 'arya-computer-use takeover helper: skeleton (Phase 2 implements glow/status/Esc-kill)'
