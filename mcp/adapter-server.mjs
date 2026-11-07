#!/usr/bin/env node
/**
 * Arya Computer Use adapter — Lite tool surface over the agent-desktop CLI.
 *
 * Why a proxy: agent-desktop's own MCP server fixes global flags (--session,
 * --headed) at server start. This adapter spawns the CLI per call so it can
 * inject per-conversation session ids, the headed toggle, and manage the
 * cursor overlay lifecycle. It also owns the tool surface (DSH's MCP client
 * registers every tool a server exposes, with no filtering), adds OCR
 * (agent-desktop has none) and screenshot-to-file, and surfaces the
 * elevation requirement as a readable diagnostic.
 *
 * Tool names register as mcp__arya_desktop__<name>.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CLI_BIN = require.resolve('agent-desktop/bin/agent-desktop');
const OCR_PS1 = join(HERE, '..', 'scripts', 'ocr.ps1');

// Engine state root: the engine's own default (~/.agent-desktop) — it creates
// that root with its protected DACL and passes its private-file checks.
// Do NOT point AGENT_DESKTOP_HOME at AppData\Local: inherited AppContainer ACEs
// there fail the engine's 'private file DACL grants an untrusted principal' check.
const ENGINE_STATE_ROOT =
  process.env.AGENT_DESKTOP_HOME || join(process.env.USERPROFILE || HERE, '.agent-desktop');
const LOCAL_APPDATA = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || HERE, 'AppData', 'Local');
const PLUGIN_DIR = join(LOCAL_APPDATA, 'dsh-plugin-arya-desktop');
const SHOTS_DIR = join(PLUGIN_DIR, 'screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

// Behavior switches live in the host plugin's control file (settings.register
// 'arya-computer-use' → index.js writes it here). The adapter polls it so
// changes apply to the next call without restarting the MCP connection.
const SETTINGS_FILE = join(PLUGIN_DIR, 'control', 'settings.json');

const VERSION = '0.1.0';
const MAX_BATCH = 20;

const state = {
  sessionId: `arya-${randomBytes(4).toString('hex')}`,
  sessionStarted: false,
  headedOverride: null, // tools {operation:'headed'} per-conversation toggle
  overlayOverride: null,
  headedDefault: false,
  overlayDefault: true,
};
const effectiveHeaded = () => state.headedOverride ?? state.headedDefault;
const effectiveOverlay = () => state.overlayOverride ?? state.overlayDefault;

setInterval(() => {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    state.headedDefault = settings.headedDefault !== false;
    state.overlayDefault = settings.overlayDefault !== false;
  } catch {
    // Settings file not written yet (plugin not loaded): keep the defaults.
  }
}, 1000).unref();

/* ------------------------------------------------------------------ CLI */

function runCli(args, { headed = effectiveHeaded() } = {}) {
  const argv = [];
  if (headed) argv.push('--headed');
  argv.push(...args);
  const env = { ...process.env };
  if (state.sessionStarted) env.AGENT_DESKTOP_SESSION = state.sessionId;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_BIN, ...argv], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ code: -1, stdout: '', stderr: String(error?.message || error) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// Serialize all CLI calls: the engine's interaction lease allows one driver
// at a time, and queueing here avoids contending on the kernel lock.
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

function parseEnvelope({ code, stdout, stderr }) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {}
  }
  return {
    version: '2.6',
    ok: false,
    error: {
      code: 'ADAPTER_CHILD_FAILURE',
      message: `agent-desktop exited with code ${code}${stderr ? `: ${stderr.trim().slice(0, 400)}` : ''}`,
      details: { kind: 'child_exit', exit_code: code },
    },
  };
}

const ELEVATION_HINT =
  ' The interaction lease requires the DSH host to run elevated (as Administrator) on this machine. ' +
  'Restart AryaCode as Administrator, then retry. (Lease root: C:\\ProgramData\\agent-desktop\\<user-SID>\\.)';

function elevationNote(envelope) {
  const kind = envelope?.error?.details?.kind;
  return kind === 'lease_directory_untrusted' ? ELEVATION_HINT : '';
}

// Headed delivery requires the target window frontmost. A background CLI
// process cannot SetForegroundWindow (Windows foreground lock), and the
// engine's focus/focus-window fail with ACTION_FAILED foreground. A physical
// click at the target's center promotes it to frontmost (OS click handling),
// then headed delivery succeeds. Returns the failing envelope, or null when
// the target is frontmost (or the click landed and we proceed optimistically).
async function ensureForeground(refId) {
  const focused = parseEnvelope(await runCli(['is', refId, '--property', 'focused']));
  if (focused.ok === true && focused.data?.value === true) return null;
  const bounds = parseEnvelope(await runCli(['get', refId, '--property', 'bounds']));
  if (bounds.ok !== true) return bounds;
  const b = bounds.data?.value ?? {};
  const x = Math.round((b.x ?? 0) + (b.width ?? 0) / 2);
  const y = Math.round((b.y ?? 0) + (b.height ?? 0) / 2);
  const click = parseEnvelope(await runCli(['mouse-click', '--xy', `${x},${y}`], { headed: true }));
  if (click.ok !== true) return click;
  return null;
}

async function ensureSession() {
  if (state.sessionStarted) return undefined;
  const args = ['session', 'start'];
  if (effectiveOverlay()) args.push('--cursor');
  const envelope = parseEnvelope(await runCli(args));
  if (envelope.ok === true && typeof envelope.data?.session_id === 'string') {
    state.sessionId = envelope.data.session_id;
    state.sessionStarted = true;
    return envelope;
  }
  return envelope;
}

/* -------------------------------------------------------------- results */

function envelopeResult(envelope, extraText = '') {
  const note = elevationNote(envelope);
  const text = JSON.stringify(envelope) + extraText + note;
  return {
    content: [{ type: 'text', text }],
    structuredContent: envelope,
    isError: envelope.ok !== true,
  };
}

/* -------------------------------------------------------------- tools */

const str = { type: 'string' };
const bool = { type: 'boolean' };
const int = { type: 'integer' };

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required },
  };
}

const TOOLS = [
  tool('snapshot',
    'Read a window as a semantic tree of refs (@sN:eN). Skeleton first for dense windows, then drill with root. Refs go stale after window changes — re-snapshot on STALE_REF. Chromium windows need timeout_ms 10000-25000 to settle.',
    { app: str, window_id: str, compact: bool, skeleton: bool, interactive_only: bool, max_depth: int, root: str, timeout_ms: int }),
  tool('find',
    'Search controls by name/role/text/value. Returns refs. Role must be as snapshot prints it (textfield, button, tabitem, listitem — not the native control type name). Use count for counts, first/limit to bound results.',
    { app: str, window_id: str, name: str, role: str, text: str, value: str, native_id: str, description: str, first: bool, last: bool, nth: int, limit: int, count: bool, exact: bool, root: str, timeout_ms: int }),
  tool('get', 'Read one control: property text|value|title|bounds|role|states.', { ref_id: str, property: str }),
  tool('is', 'Check one control: visible|enabled|checked|focused|expanded|selected.', { ref_id: str, property: str }),
  tool('click', 'Press a control via its semantic action (no pixels). Verify by re-snapshot.', { ref_id: str, timeout_ms: int }),
  tool('set_value', 'Set a control value via UIA SetValue (no keystrokes). Some edits reject this — use type.', { ref_id: str, value: str, timeout_ms: int }),
  tool('type', 'Type keystrokes into a text target. Background accessibility input by default; with headed on it briefly focuses the window and uses real keystrokes.', { ref_id: str, text: str, interval_ms: int, timeout_ms: int }),
  tool('press', 'Send a key chord (e.g. ctrl+s) to an app/window. Foreground queue: for non-frontmost apps expect delivered_unverified.', { combo: str, app: str, window_id: str, force: bool }),
  tool('scroll', 'Scroll a scrollable control: direction up|down|left|right, amount in lines.', { ref_id: str, direction: str, amount: int, timeout_ms: int }),
  tool('list_windows', 'List top-level windows (ids, titles, pids, responsiveness).', { app: str, timeout_ms: int }),
  tool('launch', 'Start an app. Bare names resolve only under System32; otherwise pass the absolute exe path. Ambiguous when many instances run — engine refuses to guess.', { app: str, args: { type: 'array', items: str }, cwd: str, activate: bool, timeout_ms: int }),
  tool('wait', 'Pause (ms) or wait for a condition: window/app/text/element before acting. Prevents acting on half-settled windows.', { ms: int, app: str, window: str, element: str, text: str, timeout_ms: int }),
  tool('screenshot', 'Capture a window/screen PNG to a file; returns the file path. Use for visual evidence only — trees are the primary signal.', { app: str, window_id: str, screen: int }),
  tool('ocr', 'Read text from a screenshot via Windows OCR (for canvas/games/no-a11y-tree UIs). Returns lines with SCREEN coordinates (not refs). query filters lines.', { app: str, window_id: str, screen: int, query: str }),
  tool('batch', `Run 1-${MAX_BATCH} planned actions on one target; stops on first error, then observes once. Each step: {action, arguments}. Actions: snapshot,find,get,is,click,set_value,type,press,scroll,wait.`, { commands_json: str, stop_on_error: bool, timeout_ms: int }, ['commands_json']),
  tool('tools',
    'Manage the adapter: operation list|describe (tool surface + state), headed {on} (per-conversation headed toggle — use when headless is not an option: cursor-moving input, notifications, shell surfaces), overlay {on} (presentation cursor overlay), session_end {operation} (end this conversation\'s driver session).',
    { operation: str, name: str, on: bool }),
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/* -------------------------------------------------------------- dispatch */

function flagArgs(pairs) {
  const argv = [];
  for (const [flag, value] of pairs) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      if (value) argv.push(flag);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) argv.push(flag, ...value.map(String));
      continue;
    }
    argv.push(flag, String(value));
  }
  return argv;
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'snapshot':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['snapshot', ...flagArgs([
          ['--app', args.app], ['--window-id', args.window_id], ['--compact', args.compact],
          ['--skeleton', args.skeleton], ['--interactive-only', args.interactive_only],
          ['--max-depth', args.max_depth], ['--root', args.root], ['--timeout-ms', args.timeout_ms],
        ])]));
      });
    case 'find':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['find', ...flagArgs([
          ['--app', args.app], ['--window-id', args.window_id], ['--name', args.name],
          ['--role', args.role], ['--text', args.text], ['--value', args.value],
          ['--native-id', args.native_id], ['--description', args.description],
          ['--first', args.first], ['--last', args.last], ['--nth', args.nth],
          ['--limit', args.limit], ['--count', args.count], ['--exact', args.exact],
          ['--root', args.root], ['--timeout-ms', args.timeout_ms],
        ])]));
      });
    case 'get':
      return enqueue(async () => parseEnvelope(await runCli(['get', args.ref_id, ...flagArgs([['--property', args.property]])])));
    case 'is':
      return enqueue(async () => parseEnvelope(await runCli(['is', args.ref_id, ...flagArgs([['--property', args.property]])])));
    case 'click':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['click', args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])]));
      });
    case 'set_value':
      return enqueue(async () => parseEnvelope(await runCli(['set-value', args.ref_id, ...flagArgs([['--value', args.value], ['--timeout-ms', args.timeout_ms]])])));
    case 'type':
      return enqueue(async () => {
        await ensureSession();
        const headed = effectiveHeaded();
        if (headed) {
          const promote = await ensureForeground(args.ref_id);
          if (promote) return envelopeResult(promote);
        }
        return parseEnvelope(await runCli(['type', args.ref_id, args.text ?? '', ...flagArgs([['--interval-ms', args.interval_ms], ['--timeout-ms', args.timeout_ms]])], { headed }));
      });
    case 'press':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['press', args.combo, ...flagArgs([['--app', args.app], ['--window-id', args.window_id], ['--force', args.force]])]));
      });
    case 'scroll':
      return enqueue(async () => parseEnvelope(await runCli(['scroll', args.ref_id, ...flagArgs([['--direction', args.direction], ['--amount', args.amount], ['--timeout-ms', args.timeout_ms]])])));
    case 'list_windows':
      return enqueue(async () => parseEnvelope(await runCli(['list-windows', ...flagArgs([['--app', args.app], ['--timeout-ms', args.timeout_ms]])])));
    case 'launch':
      return enqueue(async () => parseEnvelope(await runCli(['launch', args.app, ...flagArgs([['--args', args.args], ['--cwd', args.cwd], ['--activate', args.activate], ['--timeout-ms', args.timeout_ms]])])));
    case 'wait':
      return enqueue(async () => parseEnvelope(await runCli(['wait', ...(args.ms === undefined || args.ms === null ? [] : [String(args.ms)]), ...flagArgs([['--app', args.app], ['--window', args.window], ['--element', args.element], ['--text', args.text], ['--timeout', args.timeout_ms]])])));
    case 'screenshot':
      return enqueue(async () => {
        await ensureSession();
        const file = join(SHOTS_DIR, `shot-${Date.now()}.png`);
        const envelope = parseEnvelope(await runCli(['screenshot', file, ...flagArgs([['--app', args.app], ['--window-id', args.window_id], ['--screen', args.screen]])]));
        return envelopeResult(envelope, envelope.ok ? ` File: ${file}` : '');
      });
    case 'ocr':
      return enqueue(async () => runOcr(args));
    case 'batch': {
      let commands;
      try {
        commands = JSON.parse(args.commands_json);
      } catch {
        return { content: [{ type: 'text', text: 'commands_json is not valid JSON: expected an array of {action, arguments} steps.' }], isError: true };
      }
      if (!Array.isArray(commands) || commands.length < 1 || commands.length > MAX_BATCH) {
        return { content: [{ type: 'text', text: `batch needs 1-${MAX_BATCH} steps (got ${Array.isArray(commands) ? commands.length : 'non-array'}).` }], isError: true };
      }
      const results = [];
      for (const step of commands) {
        const action = String(step?.action || '');
        if (!TOOLS_BY_NAME.has(action) || action === 'batch' || action === 'tools') {
          results.push({ action, error: `unsupported step action: ${action}` });
          break;
        }
        const out = await callTool(action, step?.arguments || {});
        const envelope = out.structuredContent ?? out;
        results.push({ action, ok: envelope.ok === true, summary: summarizeEnvelope(envelope) });
        if (envelope.ok !== true && args.stop_on_error !== false) break;
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: results.every((r) => r.ok), results }) }], isError: !results.every((r) => r.ok) };
    }
    case 'tools':
      return enqueue(async () => {
        const op = args.operation || 'list';
        if (op === 'describe') {
          const t = TOOLS_BY_NAME.get(args.name);
          return { content: [{ type: 'text', text: t ? JSON.stringify(t) : `unknown tool: ${args.name}` }], isError: !t };
        }
        if (op === 'headed') {
          state.headedOverride = args.on === true;
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, headed: effectiveHeaded(), headedDefault: state.headedDefault }) }] };
        }
        if (op === 'overlay') {
          state.overlayOverride = args.on === true;
          if (state.sessionStarted) {
            const env = parseEnvelope(await runCli(['cursor-overlay', state.overlayOverride ? 'enable' : 'disable']));
            return { content: [{ type: 'text', text: JSON.stringify({ ok: env.ok === true, overlay: effectiveOverlay(), engine: env }) }] };
          }
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, overlay: effectiveOverlay(), note: 'applies at next session start' }) }] };
        }
        if (op === 'session_end') {
          const env = parseEnvelope(await runCli(['session', 'end']));
          await runCli(['session', 'gc']);
          state.sessionStarted = false;
          state.sessionId = `arya-${randomBytes(4).toString('hex')}`;
          return { content: [{ type: 'text', text: JSON.stringify({ ok: env.ok === true, note: 'new session starts on next action', engine: env }) }] };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tools: TOOLS.map((t) => t.name),
              state: { session: state.sessionId, sessionStarted: state.sessionStarted, headed: effectiveHeaded(), headedDefault: state.headedDefault, overlay: effectiveOverlay(), overlayDefault: state.overlayDefault },
              engine_state_root: ENGINE_STATE_ROOT,
            }),
          }],
        };
      });
    default:
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
  }
}

function summarizeEnvelope(envelope) {
  if (envelope?.ok === true) {
    const d = envelope.data ?? {};
    const bits = [];
    if (d.ref_count !== undefined) bits.push(`refs ${d.ref_count}`);
    if (d.window?.id) bits.push(`window ${d.window.id}`);
    if (d.target?.process?.pid) bits.push(`pid ${d.target.process.pid}`);
    if (d.disposition?.delivery) bits.push(`delivery ${d.disposition.delivery}`);
    return bits.join('; ') || 'ok';
  }
  return `${envelope?.error?.code || 'ERROR'}: ${String(envelope?.error?.message || '').slice(0, 200)}`;
}

async function runOcr(args) {
  const file = join(SHOTS_DIR, `ocr-${Date.now()}.png`);
  const shot = parseEnvelope(await runCli(['screenshot', file, ...flagArgs([['--app', args.app], ['--window-id', args.window_id], ['--screen', args.screen]])]));
  if (shot.ok !== true) return envelopeResult(shot);
  const ps = await new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', OCR_PS1, '-ImagePath', file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const start = ps.stdout.indexOf('{');
  const end = ps.stdout.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `ocr.ps1 exited ${ps.code}`, stderr: ps.stderr.slice(0, 400), screenshot: file }) }],
      isError: true,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(ps.stdout.slice(start, end + 1));
  } catch {
    return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'ocr.ps1 output not JSON', screenshot: file }) }], isError: true };
  }
  if (args.query && Array.isArray(parsed.lines)) {
    const needle = String(args.query).toLowerCase();
    parsed.lines = parsed.lines.filter((l) => String(l.text || '').toLowerCase().includes(needle));
    parsed.query = args.query;
  }
  parsed.screenshot = file;
  return { content: [{ type: 'text', text: JSON.stringify(parsed) }], isError: parsed.ok !== true };
}

/* -------------------------------------------------------------- protocol */

const INSTRUCTIONS = [
  'Arya Computer Use: drive Windows apps through semantic UIA refs, not pixels.',
  'Loop: snapshot (skeleton/compact first) -> act on @refs -> re-snapshot to verify.',
  'Refs go stale after window changes: on STALE_REF/AMBIGUOUS_TARGET, re-snapshot.',
  'type uses background accessibility input by default and never moves the pointer; tools {operation:"headed",on:true} switches this conversation to real keyboard/mouse input when a surface needs it.',
  'Chromium windows settle slowly: snapshot with timeout_ms 10000-25000.',
  'Verify stateful actions by re-read; delivered_verified = confirmed, delivered_unverified retry:unsafe = do not blind-repeat.',
  'On ACTION_FAILED post_action_verification the action landed: read data.post_state, do NOT retry.',
  'This host must run elevated (Administrator); lease_directory_untrusted means restart AryaCode as Administrator.',
  'Destructive actions (delete, send, pay, close unsaved) require user confirmation first.',
  'No accessibility tree (games/canvas): use ocr for text and headed mouse coordinates for input.',
].join('\n');

const server = { name: 'arya_desktop', version: VERSION };

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: server,
      instructions: INSTRUCTIONS,
    });
    return;
  }
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
  if (method === 'ping') {
    reply(id, {});
    return;
  }
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    Promise.resolve()
      .then(() => callTool(name, args))
      .then((out) => reply(id, Array.isArray(out?.content) ? out : envelopeResult(out)))
      .catch((error) => reply(id, { content: [{ type: 'text', text: `adapter error: ${error?.message || error}` }], isError: true }));
    return;
  }
  if (id !== undefined) replyError(id, -32601, `method not supported: ${method}`);
});
process.stdin.on('end', () => process.exit(0));
