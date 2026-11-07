// Arya Computer Use — Host plugin entry (skeleton).
//
// Phase 1: settings store (configEditor), driver lock (one conversation drives
// the desktop at a time), agent-desktop session lifecycle.
// Phase 2: takeover helper process management (scripts/takeover.ps1: edge glow,
// status bar, global Esc kill) + loopback GET /plugins/arya/status for the panel.
//
// See docs/PLAN.md §2 for the full design.

export function apply(ctx, config) {
  // TODO(Phase 1): register services inside ctx.effect / ctx.on and return cleanup.
  ctx.log?.('arya-computer-use: skeleton active (no services registered yet)');
  return () => {};
}
