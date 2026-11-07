# Third-party notices

This plugin drives the desktop through two Apache-2.0 engines by Vercel Labs,
consumed as pinned npm dependencies (not vendored):

- **agent-desktop** — https://github.com/vercel-labs/agent-desktop (Apache-2.0),
  npm `agent-desktop@1.2.0`. Native accessibility-tree computer use
  (Windows UIA / macOS AX / Linux AT-SPI). Mirror used for reference and
  upstream sync: https://github.com/KonnectSuite/dsh-arya-agent-desktop.
- **agent-browser** — https://github.com/vercel-labs/agent-browser (Apache-2.0),
  npm `agent-browser@0.41.2`. Web lane (CDP browser automation).

The takeover helper design is adapted from **dsh-computer-use-win**
(https://github.com/Yu-tao-Li/dsh-computer-use-win, MIT, derived from
cgissing/windows-computer-use).

All engine binaries remain under their original Apache-2.0 terms; this
plugin's MIT license covers only KonnectSuite's original code in this repo.
