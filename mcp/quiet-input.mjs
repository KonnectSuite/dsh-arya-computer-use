/*
 * Background ("quiet") pointer input without the user's mouse.
 *
 * Why this exists: on Windows a click that needs to land on a control which
 * advertises no semantic pattern (Invoke / LegacyIAccessible default action)
 * used to force the whole conversation into --headed physical input, which
 * moves the real pointer and steals the desktop foreground. This helper posts
 * WM_MOUSEMOVE / WM_LBUTTONDOWN / WM_LBUTTONUP straight to the target control
 * window instead, so the click lands with the cursor where the user left it.
 * The same path posts WM_KEYDOWN / WM_KEYUP when the engine refuses a key
 * because it could not confirm the window's focus — a key does not need the
 * foreground, it needs the window's own focused control to receive it.
 *
 * The target is resolved from the window handle the snapshot reported, never
 * from WindowFromPoint: a window behind another window must still receive the
 * click, and WindowFromPoint would return whatever is on top.
 *
 * It runs under the DSH host (elevated). User Interface Privilege Isolation
 * stops a lower-integrity process from posting to a higher-integrity window,
 * so the plugin must keep running elevated for this path.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUIET_PS1 = join(HERE, '..', 'scripts', 'quiet-input.ps1');

/** Window ids are `w-<hwnd decimal>`; the quiet helper needs the raw handle. */
export function windowHandle(windowId) {
  const match = /^w-(\d+)$/.exec(String(windowId ?? ''));
  return match ? Number(match[1]) : null;
}

/**
 * Post one background input action to a window handle.
 * mode: 'click' | 'right' | 'double' (needs x/y in screen pixels)
 *       'key' (needs vk: a Windows virtual-key code; it lands on the control
 *       that owns the keyboard focus inside that window)
 *       'text' (needs text: posted one WM_CHAR per character to that same
 *       focused control, so a string arrives with its case and punctuation
 *       intact and no keystroke is synthesized)
 * Returns the helper's report, or { ok: false, error } when it could not run.
 * The report always carries cursor/foreground before+after and cursor_moved /
 * foreground_changed, which is how the adapter proves nothing physical happened.
 */
export function runQuietPointer({ mode, hwnd, x, y, vk, text }, { timeoutMs = 15000 } = {}) {
  const payload = Buffer.from(JSON.stringify({ mode, hwnd, x, y, vk, text }), 'utf8').toString('base64');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', QUIET_PS1, '-Payload', payload,
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish({ ok: false, error: `quiet-input timed out after ${timeoutMs} ms` });
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (error) => finish({ ok: false, error: String(error?.message || error) }));
    child.on('close', () => {
      const start = out.indexOf('{');
      const end = out.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          finish(JSON.parse(out.slice(start, end + 1)));
          return;
        } catch { /* fall through to the error report */ }
      }
      finish({ ok: false, error: err.trim().slice(0, 400) || 'quiet-input produced no JSON report' });
    });
  });
}
