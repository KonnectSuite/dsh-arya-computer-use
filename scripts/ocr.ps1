# ocr.ps1 — Arya Computer Use OCR helper (skeleton).
#
# Phase 1: WinRT Windows.Media.Ocr over a screenshot PNG (agent-desktop has
# zero OCR — grep-confirmed). Same engine family as dsh-computer-use-win's
# scripts/windows-uia.ps1 (MIT). Returns text lines + word bounding boxes in
# SCREEN coordinates. Runs as a standalone powershell.exe process
# (FullLanguage) so WinRT projection is available.

param(
  [string]$ImagePath
)

Write-Host 'arya-computer-use ocr helper: skeleton (Phase 1 implements WinRT OCR)'
