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
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { runQuietPointer, windowHandle } from './quiet-input.mjs';
import { readJsonFile } from './settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CLI_BIN = require.resolve('agent-desktop/bin/agent-desktop');
const OCR_PS1 = join(HERE, '..', 'scripts', 'ocr.ps1');

// Windows console-window trap, the same one browser-launcher.mjs documents and
// avoids: bin/agent-desktop (the npm shim) spawns the native exe with
// stdio:'inherit' + windowsHide:false, so every tool call pops a console window
// on the user's desktop. Spawn the native binary directly instead; stdio stays
// piped and windowsHide holds. Null when the platform has no released binary,
// in which case the shim is the only way to run the CLI.
const NATIVE_BIN = (() => {
  try {
    const pkgDir = dirname(require.resolve('agent-desktop/package.json'));
    const { resolve } = require('agent-desktop/lib/platform');
    const entry = resolve(process.platform, process.arch);
    if (!entry || !entry.released || !entry.binaryName) return null;
    const bin = join(pkgDir, 'bin', entry.binaryName);
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
})();

// Engine state root: the engine's own default (~/.agent-desktop) — it creates
// that root with its protected DACL and passes its private-file checks.
// Do NOT point AGENT_DESKTOP_HOME at AppData\Local: inherited AppContainer ACEs
// there fail the engine's 'private file DACL grants an untrusted principal' check.
const ENGINE_STATE_ROOT =
  process.env.AGENT_DESKTOP_HOME || join(process.env.USERPROFILE || HERE, '.agent-desktop');
const LOCAL_APPDATA = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || HERE, 'AppData', 'Local');
const PLUGIN_DIR = join(LOCAL_APPDATA, 'dsh-plugin-arya-desktop');
const DEFAULT_SHOTS_DIR = join(PLUGIN_DIR, 'screenshots');
mkdirSync(DEFAULT_SHOTS_DIR, { recursive: true });
// The screenshotDir setting (1.0.13) relocates the engine's PNG drops; the
// default stays inside the plugin's own state folder, so a fresh install writes
// nothing outside it. Resolved per call — the setting is polled, not mounted.
// The screenshot folder is a debug surface the model re-reads, not an archive.
// An 11-hour session wrote hundreds of PNGs (one per screenshot and per ocr
// capture, which takes its own shot) and nothing rotated them, so the plugin's
// state folder grew without bound. Keep the newest SHOT_KEEP files and drop
// anything older than SHOT_MAX_AGE_MS; run at most once per process window, off
// the call path, so a screenshot never pays for the sweep.
const SHOT_KEEP = 300;
const SHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SHOT_PRUNE_INTERVAL_MS = 15 * 60 * 1000;
let lastShotPrune = 0;
function pruneShots(dir) {
  const names = readdirSync(dir).filter((name) => /\.(png|html)$/i.test(name));
  if (names.length === 0) return;
  const now = Date.now();
  const stale = new Set();
  if (names.length > SHOT_KEEP) {
    const ranked = names
      .map((name) => {
        try { return { name, mtime: statSync(join(dir, name)).mtimeMs }; } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of ranked.slice(SHOT_KEEP)) stale.add(entry.name);
  }
  for (const name of names) {
    try {
      if (now - statSync(join(dir, name)).mtimeMs > SHOT_MAX_AGE_MS) stale.add(name);
    } catch { /* vanished mid-sweep */ }
  }
  for (const name of stale) {
    // maxRetries because the user may have one of these open in a viewer.
    try { rmSync(join(dir, name), { force: true, maxRetries: 2, retryDelay: 100 }); } catch { /* leave it for the next sweep */ }
  }
}
function maybePruneShots(dir) {
  const now = Date.now();
  if (now - lastShotPrune < SHOT_PRUNE_INTERVAL_MS) return;
  lastShotPrune = now;
  // Never let a housekeeping sweep block or fail an action.
  setTimeout(() => { try { pruneShots(dir); } catch { /* not worth a tool error */ } }, 0).unref?.();
}
function shotsDir() {
  const dir = state.screenshotDir || DEFAULT_SHOTS_DIR;
  try { mkdirSync(dir, { recursive: true }); } catch { /* the write itself will report it */ }
  try { maybePruneShots(dir); } catch { /* housekeeping only */ }
  return dir;
}

// Behavior switches live in the host plugin's control file (settings.register
// 'arya-computer-use' → index.js writes it here). The adapter polls it so
// changes apply to the next call without restarting the MCP connection.
const SETTINGS_FILE = join(PLUGIN_DIR, 'control', 'settings.json');
// The overlay host reads this to frame the app window that is being driven and
// to place the ghost cursor where the harness acts — never the real pointer.
const TARGET_FILE = join(PLUGIN_DIR, 'control', 'target.json');
// The host takeover lane persists its paused/stopped series here. The adapter
// watches it so the user's Esc stop also drops the physical-input latch.
const TAKEOVER_STATE_FILE = join(PLUGIN_DIR, 'control', 'state.json');
// The host publishes the current turn's activity lease here. The adapter reads it
// to recompute the same series key the takeover lane blocks a stopped series on.
const ACTIVITY_FILE = join(PLUGIN_DIR, 'control', 'activity.json');

const VERSION = '0.1.0';
const MAX_BATCH = 20;

// The engine's own batch runs entries in one process, through the same policy
// checks and dispatch as the CLI. Entry keys are the command's own field names: a
// positional is named after itself, a flag drops `--` and writes `-` as `_`
// (skills/agent-desktop/references/commands-system.md:170). Unknown keys are
// rejected, so each action declares the keys it forwards.
const NATIVE_BATCH_COMMANDS = new Map([
  ['snapshot', 'snapshot'], ['find', 'find'], ['get', 'get'], ['is', 'is'],
  ['set_value', 'set-value'], ['press', 'press'],
  ['scroll', 'scroll'], ['scroll_to', 'scroll-to'], ['wait', 'wait'],
  ['select', 'select'], ['check', 'check'], ['uncheck', 'uncheck'], ['clear', 'clear'],
  ['expand', 'expand'], ['collapse', 'collapse'], ['toggle', 'toggle'],
]);
// A step whose delivery the adapter has to decide per call (a click that may need
// a semantic fallback or a posted click, a physical action that needs consent, a
// file the adapter owns) runs through callTool one at a time. The engine's
// --headed is global and applies to every native batch entry, so those steps can
// never share one native batch with semantic steps.
const LOOP_BATCH_ACTIONS = new Set(['click', 'type', 'screenshot', 'ocr', 'focus', 'double_click', 'right_click']);
const BATCH_ARG_KEYS = {
  snapshot: ['app', 'window_id', 'compact', 'skeleton', 'interactive_only', 'max_depth', 'root', 'timeout_ms', 'surface', 'wait_for', 'wait_for_gone', 'wait_timeout'],
  find: ['app', 'window_id', 'name', 'role', 'text', 'value', 'native_id', 'description', 'first', 'last', 'nth', 'limit', 'count', 'exact', 'root', 'timeout_ms', 'surface', 'wait_for', 'wait_for_gone', 'wait_timeout'],
  get: ['ref_id', 'property'],
  is: ['ref_id', 'property'],
  click: ['ref_id', 'timeout_ms', 'physical'],
  focus: ['ref_id', 'timeout_ms', 'physical'],
  double_click: ['ref_id', 'timeout_ms', 'physical'],
  right_click: ['ref_id', 'timeout_ms', 'physical'],
  type: ['ref_id', 'text', 'interval_ms', 'timeout_ms', 'physical'],
  expand: ['ref_id', 'timeout_ms'],
  collapse: ['ref_id', 'timeout_ms'],
  toggle: ['ref_id', 'timeout_ms'],
  select: ['ref_id', 'value', 'timeout_ms'],
  check: ['ref_id', 'timeout_ms'],
  uncheck: ['ref_id', 'timeout_ms'],
  clear: ['ref_id', 'timeout_ms'],
  scroll_to: ['ref_id', 'timeout_ms'],
  set_value: ['ref_id', 'value', 'timeout_ms'],
  press: ['combo', 'app', 'window_id', 'force'],
  scroll: ['ref_id', 'direction', 'amount', 'timeout_ms'],
  wait: ['ms', 'app', 'window', 'window_id', 'element', 'text', 'timeout', 'event', 'menu', 'menu_closed', 'notification', 'predicate', 'value', 'count', 'action'],
};

function batchEntryArgs(action, args) {
  const entry = {};
  for (const key of BATCH_ARG_KEYS[action] ?? []) {
    const value = action === 'wait' && key === 'timeout' ? (args.timeout ?? args.timeout_ms) : args[key];
    if (value === undefined || value === null) continue;
    entry[key] = value;
  }
  return entry;
}

// A batch entry keeps its payload — a find step must yield refs — but a snapshot
// tree is the largest thing the engine can return, and the batch cap allows 4 MB.
function trimBatchData(data) {
  if (!data || !Array.isArray(data.results)) return data;
  return {
    ...data,
    results: data.results.map((entry) => (
      entry?.command === 'snapshot' && entry.data?.tree
        ? { ...entry, data: { ...entry.data, tree: undefined, tree_omitted: true } }
        : entry
    )),
  };
}

const state = {
  sessionId: `arya-${randomBytes(4).toString('hex')}`,
  sessionStarted: false,
  headedOverride: null, // tools {operation:'headed'} per-conversation toggle
  headedExpiresAt: 0, // headedOverride self-releases: a latch left on is a mouse/keyboard takeover
  overlayOverride: null,
  headedDefault: false,
  overlayDefault: true,
  windowId: null,
  toolPreset: 'lite', // 'lite' = every tool in TOOLS, 'lazy' = the core to start, rest on demand
  extraTools: new Set(), // tools revealed by tools {operation:'load'} in the lazy preset
  // Desktop-lane limits that were compiled-in constants before 1.0.13. Polled
  // from the same control file as the behavior switches, so a change applies to
  // the next call rather than needing a lane restart.
  engineCallTimeoutMs: 150000,
  leaseRetryBaseMs: 800,
  screenshotDir: '',
};

// The lazy preset starts with the tools needed to look, read, act once, and
// find a dialog or menu that a window snapshot cannot show; everything else is
// revealed through `tools {operation:'load'}` and a tools/list_changed
// notification. The harness re-syncs on that notification
// (dsh-mcp-client wires listChanged.onChanged → refreshTools).
const LAZY_CORE = ['tools', 'snapshot', 'find', 'list_surfaces', 'click'];
const exposedTools = () => (state.toolPreset === 'lazy'
  ? TOOLS.filter((tool) => LAZY_CORE.includes(tool.name) || state.extraTools.has(tool.name))
  : TOOLS);

function notifyToolsChanged() {
  // Advertised through capabilities.tools.listChanged; the client re-lists and
  // swaps its registered tool generation.
  send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
}
// A headed latch left on makes EVERY later call physical (runCli appends
// --headed to all of them), so it releases on its own. Per-call --headed is the
// normal path; the latch is only an escape hatch for surfaces that need a
// sequence of physical actions.
const HEADED_LEASE_MS = 5 * 60 * 1000;
const effectiveHeaded = () => {
  if (state.headedOverride === true && Date.now() > state.headedExpiresAt) {
    state.headedOverride = null;
    state.headedExpiresAt = 0;
  }
  return state.headedOverride ?? state.headedDefault;
};
const effectiveOverlay = () => state.overlayOverride ?? state.overlayDefault;

// Facts are republished only when something the Status panel shows actually
// changed, not on every poll tick.
let factsDirty = true;
let lastFacts = { engineCallTimeoutMs: state.engineCallTimeoutMs, leaseRetryBaseMs: state.leaseRetryBaseMs, screenshotDir: state.screenshotDir };

setInterval(() => {
  try {
    const settings = readJsonFile(SETTINGS_FILE);
    // Strict: a settings file that omits the key must mean OFF. `!== false`
    // read a missing key as ON, which is a silent mouse/keyboard takeover.
    state.headedDefault = settings.headedDefault === true;
    state.overlayDefault = settings.overlayDefault !== false;
    const preset = settings.toolPreset === 'lazy' ? 'lazy' : 'lite';
    if (preset !== state.toolPreset) {
      state.toolPreset = preset;
      state.extraTools.clear();
      notifyToolsChanged();
      factsDirty = true;
    }
    // Range-checked here rather than trusted: this file is editable by hand, and
    // a nonsense timeout would either wedge the queue or kill every real call.
    const callTimeout = Number(settings.engineCallTimeoutMs);
    state.engineCallTimeoutMs = Number.isFinite(callTimeout) && callTimeout >= 10000 && callTimeout <= 300000
      ? Math.round(callTimeout) : 150000;
    const leaseBase = Number(settings.leaseRetryBaseMs);
    state.leaseRetryBaseMs = Number.isFinite(leaseBase) && leaseBase >= 100 && leaseBase <= 10000
      ? Math.round(leaseBase) : (leaseBase === 0 ? 0 : 800);
    const shots = typeof settings.screenshotDir === 'string' ? settings.screenshotDir.trim() : '';
    state.screenshotDir = /^(?:[A-Za-z]:[\\/]|\/)/.test(shots) ? shots : '';
    if (callTimeout !== lastFacts.engineCallTimeoutMs || leaseBase !== lastFacts.leaseRetryBaseMs || shots !== lastFacts.screenshotDir) {
      lastFacts = { engineCallTimeoutMs: callTimeout, leaseRetryBaseMs: leaseBase, screenshotDir: shots };
      factsDirty = true;
    }
    if (factsDirty) { factsDirty = false; publishDesktopFacts(); }
  } catch {
    // Settings file not written yet (plugin not loaded): keep the defaults.
  }
  try {
    // Esc / stop lives in the host lane. A stopped series means the user pushed
    // back: release the headed latch so the next series starts headless.
    const takeover = readJsonFile(TAKEOVER_STATE_FILE);
    if (takeover?.paused === true && state.headedOverride === true) {
      state.headedOverride = null;
      state.headedExpiresAt = 0;
    }
  } catch {
    // No takeover state yet.
  }
}, 1000).unref();

/* ---------------------------------------------------------- user stop */

// Esc lives in the host takeover lane: it blocks the series it was acting for,
// keyed by [sessionId, turn] from the activity lease (mcp/takeover.mjs:111,184).
// The adapter is a separate process, so it recomputes that key and refuses every
// input action for a blocked series. The banner says "Esc Stop"; until now the
// driver never honoured it. Reads stay available — the user asked to stop being
// driven, not to be observed. A new user turn is a new key, so the block releases
// exactly as it does in the host lane, with no settings change.
const STOPPED_BY_USER = 'COMPUTER_USE_STOPPED_BY_USER: The user stopped this operation series with Esc or their custom shortcut. Do not retry desktop input in this turn. A new user turn, including a request to continue, can use the desktop automatically; no settings change is required.';
const INPUT_TOOLS = new Set(['click', 'set_value', 'type', 'press', 'scroll', 'launch', 'focus', 'double_click', 'right_click', 'expand', 'collapse', 'toggle', 'batch']);
// Tools whose whole job is to act on one saved element. A missing ref_id is a
// bad argument, and every one of them must say so the same way: the engine
// paths answered INVALID_ARGS, but the posted-input paths had no engine to ask
// and fell through to a consent refusal ("a double-click needs physical
// input"), which reads as a policy problem and sends the model off adding
// physical:true to fix a typo. The guard also keeps a bad call from spawning a
// child process.
const REF_ARG_TOOLS = new Set(['click', 'double_click', 'right_click', 'focus', 'get', 'is', 'expand', 'collapse', 'toggle', 'check', 'uncheck', 'clear', 'scroll_to', 'set_value', 'type']);

function stoppedSeriesMessage() {
  try {
    const activity = readJsonFile(ACTIVITY_FILE);
    if (!(activity.active === true && Number.isFinite(activity.expiresAt) && activity.expiresAt > Date.now())) return null;
    const saved = readJsonFile(TAKEOVER_STATE_FILE);
    const key = JSON.stringify([activity.sessionId, activity.turn]);
    if (saved?.blockedSeries && Object.prototype.hasOwnProperty.call(saved.blockedSeries, key)) return saved.blockedSeries[key];
    return saved?.paused === true && saved?.stoppedSeriesKey === key ? (saved.pauseMessage || STOPPED_BY_USER) : null;
  } catch {
    return null; // no lease published yet: nothing has been stopped
  }
}

function stoppedResult(name, message) {
  return envelopeResult({
    version: '2.6',
    ok: false,
    command: name,
    error: {
      code: 'POLICY_DENIED',
      message,
      suggestion: 'Do not retry desktop input in this turn. Report that the user stopped the takeover; a new user turn can drive the desktop again.',
      details: { kind: 'stopped_by_user' },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  });
}

/* ------------------------------------------------------- overlay target */

// The overlay frames the app window that is being driven and puts the ghost
// cursor where the harness acts. Both come from what the engine reports, so the
// user's own pointer is never read, moved or highlighted.
const windowBounds = new Map(); // window id -> {left, top, width, height}
// The ref the in-flight tool call is aimed at. Sound as a module-level value
// because the queue is the only serializer (AGENTS rule 12): exactly one call of
// this conversation runs at a time, so the blocked-window helpers can ask which
// window an action targeted without threading ref_id through every stop site.
let currentRefId = null;
let windowBoundsAt = 0;

function rememberWindows(data, appFallback) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.windows) ? data.windows : data?.window ? [data.window] : [];
  for (const window of list) rememberWindow(window, appFallback);
}

// The engine's own window record is {id, app_name, title, bounds:{x,y,width,
// height}, minimized, visible, pid} — the app key is app_name, NOT app, and a
// snapshot's window record is only {id, title} with the app name sitting at the
// top level of the envelope, so the caller passes it as appFallback. Reading the
// wrong key is not cosmetic: windowIdForApp(), the app name in blocking_windows
// and the overlay's window label all read this map.
function rememberWindow(window, appFallback) {
  if (!window || !window.id) return null;
  const existing = windowBounds.get(window.id) ?? {};
  const next = { ...existing };
  const app = window.app_name ?? window.app ?? appFallback;
  if (typeof app === 'string' && app) next.app = app;
  if (typeof window.title === 'string' && window.title) next.title = window.title;
  const b = window.bounds;
  if (b) {
    const rect = { left: Number(b.x), top: Number(b.y), width: Number(b.width), height: Number(b.height) };
    if ([rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0) {
      Object.assign(next, rect);
    }
  }
  if (!next.app && !next.title && !next.width) return null;
  windowBounds.set(window.id, next);
  return next.width ? next : null;
}

// The engine's window list arrives as an array or as {windows:[…]} depending on
// the command, and a snapshot carries exactly one window record.
function windowList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.windows)) return data.windows;
  return data?.window ? [data.window] : [];
}

async function windowRectFor(id) {
  if (!id) return null;
  const cached = windowBounds.get(id);
  if (cached?.width) return cached;
  if (Date.now() - windowBoundsAt < 2000) return null;
  try {
    const envelope = parseEnvelope(await runCli(['list-windows']));
    if (envelope?.ok) {
      rememberWindows(envelope.data);
      windowBoundsAt = Date.now();
    }
  } catch { /* the hint is optional */ }
  return windowBounds.get(id)?.width ? windowBounds.get(id) : null;
}

// One list-windows call, used only by failure paths, to learn whether a window
// appeared that this adapter had never seen. A modal dialog that the model has
// not been told about is the single most common reason a click on the parent
// window stops working: the parent is disabled, so every pattern on it refuses.
async function listWindowsNow(app, timeoutMs) {
  const envelope = await engineAction(
    [
      ...(app ? ['list-windows', '--app', String(app)] : ['list-windows']),
      ...(timeoutMs ? ['--timeout-ms', String(timeoutMs)] : []),
    ],
    { retries: 1 },
  );
  if (envelope?.ok !== true) return [];
  const windows = windowList(envelope.data);
  rememberWindows(windows);
  return windows;
}

function appMatches(known, want) {
  const k = String(known).toLowerCase();
  const w = String(want).toLowerCase();
  return k === w || k.startsWith(w) || w.startsWith(k);
}

// Does this adapter already hold a window record for that app? Decides whether
// an observation has to pay for a window list to resolve a match's window.
function knowsApp(app) {
  if (!app) return false;
  for (const record of windowBounds.values()) if (record.app && appMatches(record.app, app)) return true;
  return false;
}

function unseenWindows(windows, known) {
  return windows
    .filter((w) => w?.id && !known.has(w.id))
    .map((w) => ({ window_id: w.id, title: w.title ?? null, app: w.app_name ?? w.app ?? null }));
}

// The other half of "what is on top of this app": a WinForms menu dropdown is a
// real top-level window that list-windows does NOT enumerate — run 6 measured an
// open context menu invisible to the window list while it disabled its owner app,
// and every later action in that session then answered 'targeted an element that
// is not enabled' — but list-surfaces does see it, as an entry with its own id.
// list-surfaces takes --app and the global flags only, so its internal deadline
// cannot be widened from here; when it fails, the caller simply gets no hint.
async function surfacesNow(app) {
  const envelope = await engineAction(app ? ['list-surfaces', '--app', String(app)] : ['list-surfaces'], { retries: 0 });
  if (envelope?.ok !== true) return [];
  const groups = Array.isArray(envelope.data) ? envelope.data : (envelope.data?.surfaces ?? envelope.data?.windows ?? []);
  if (!Array.isArray(groups)) return [];
  // Measured shapes, both of them: per-pid GROUPS [{ pid, surfaces: [{ id, type,
  // title? }] }] AND a bare flat array of surface rows. Flatten before anything
  // filters on s.id / s.type / s.title: a pid bucket has none of those, so an
  // unflattened list silently answers "nothing on top". Note the braces — the
  // dangling `else if` would otherwise bind to the innermost if and drop every
  // bare row, which is exactly how the surface half of the dialog hint died.
  const rows = [];
  for (const g of groups) {
    if (Array.isArray(g?.surfaces)) {
      for (const s of g.surfaces) if (s?.id) rows.push({ ...s, pid: g.pid ?? s.pid ?? null });
    } else if (g?.id) {
      rows.push(g);
    }
  }
  return rows;
}

function unseenSurfaces(rows, known) {
  return rows
    .filter((s) => s?.id && !known.has(String(s.id)))
    .map((s) => ({ window_id: String(s.id), title: s.title ?? null, app: null, surface: s.type ?? null }));
}

// Which window a named app means, when this conversation already drove one of
// its windows. Used only to disambiguate, never to retarget: with no app named,
// or an app this adapter has not touched, it answers nothing and the engine's
// own scoping rules apply.
function windowIdForApp(app) {
  if (!app || !state.windowId) return null;
  const have = windowBounds.get(state.windowId)?.app;
  if (!have) return null;
  return appMatches(have, app) ? state.windowId : null;
}

// Element bounds are read for the posted click and again for the overlay's ghost
// pointer within the same action, and every read is a separate engine call that
// must win the interaction lease. A ref is snapshot-qualified, so a fresh
// snapshot gives it a new id and a short memo can never serve a moved window to
// a different control. Bounds the engine flags as not live are never memoized:
// posting a click at a stale rectangle is exactly the inaccuracy this plugin is
// meant to remove.
const pointMemo = new Map();

async function elementPoint(ref) {
  if (!ref) return null;
  const memo = pointMemo.get(ref);
  if (memo && Date.now() - memo.at < 1000) return memo.point;
  try {
    const envelope = parseEnvelope(await runCli(['get', ref, ...flagArgs([['--property', 'bounds']])]));
    const value = envelope?.data?.value;
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), width = Number(value.width), height = Number(value.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    // The engine says so itself: when data.live is false the rectangle came from
    // the saved ref entry and may be out of date. Handing it to a posted or a
    // physical click fires whatever control sits there NOW, which is the
    // inaccuracy this lane exists to remove — so it is refused, not used.
    if (envelope.data?.live === false) return null;
    const point = { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
    pointMemo.set(ref, { at: Date.now(), point });
    return point;
  } catch { return null; }
}

// An unscoped find or snapshot scans every window on the desktop: seconds of
// work, and in the exported session it matched the agent's own application
// window. When this conversation has already touched a window, scope the search
// to that window's app — every window of that app stays in scope, including a
// dialog that has just opened, which a window-level scope would have hidden.
function observeScope(args, { surface } = {}) {
  const lastApp = () => (state.windowId ? windowBounds.get(state.windowId)?.app ?? null : null);
  // A surface (menu, sheet, shell chrome) belongs to an app, never to one of
  // its window ids, so a surface request is app-scoped by construction.
  if (surface) {
    const app = args.app ?? lastApp();
    return { app: app ?? null, window_id: null, defaulted: !args.app && !!app };
  }
  if (args.window_id) return { app: null, window_id: args.window_id, defaulted: false };
  if (args.app) return { app: args.app, window_id: null, defaulted: false };
  const app = lastApp();
  return app ? { app, window_id: null, defaulted: true } : { app: null, window_id: null, defaulted: false };
}

// Two engine facts the model has to be told about, because both look like a
// broken tool until they are: a snapshot that ran out of its observation
// deadline cannot prove its refs unique (every later action on them then refuses
// with identity_not_unique), and an unscoped observation was narrowed for them.
function annotateObservation(envelope, scope) {
  const data = envelope?.data;
  if (!data || typeof data !== 'object') return;
  if (scope.defaulted && scope.app) {
    data.scoped_to = {
      app: scope.app,
      reason: 'neither app nor window_id was given and this conversation last touched a window of this app; pass app or window_id to search anywhere else',
    };
  }
  if (data.identity_unproven === true || data.complete === false) {
    data.observation_note = 'This tree is incomplete: the engine could not read the whole window inside its observation deadline, so refs from it may refuse with AMBIGUOUS_TARGET/identity_not_unique. Re-snapshot the same window with timeout_ms 10000-20000 (a busy app or a large tree needs it) before acting on a ref.';
  }
}

/* ------------------------------------------------------------ ref index */

// A click can be refused on a control that advertises the action but exposes
// neither InvokePattern nor a Legacy default action. What that ref advertised at
// snapshot time is the only evidence the adapter can retry under a different
// pattern (select/toggle/expand/collapse), so the last snapshot's tree is
// indexed here. Identity fields only: values and bounds are never cached, so a
// stale ref is never papered over — its alternative is tried and fails like the
// click did.
const refIndex = new Map(); // ref -> { role, name, actions: string[], windowId, actionsUnknown?, surfaceRead? }

// The engine reports a control's advertised actions as UIA pattern names in
// PascalCase ("SetValue", "ScrollTo", "Expand", "Toggle", "Select", "Click"),
// while every gate in this adapter compares against the kebab command names
// ("set-value", "scroll-to", "expand", ...). Without normalization the headless
// value-pattern rung of `type` and the semantic alternatives of the click ladder
// never match a real app's actions, so typing silently falls through to WM_CHAR
// and the pattern fallbacks never run. Canonicalize to kebab-lowercase here, once,
// where the actions are indexed; already-kebab names pass through unchanged.
function normalizeAction(action) {
  return String(action).trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function indexNode(node, windowId, surfaceRead) {
  if (!node || typeof node !== 'object') return;
  if (node.ref_id) {
    refIndex.set(String(node.ref_id), {
      role: String(node.role ?? ''),
      name: typeof node.name === 'string' ? node.name : '',
      actions: Array.isArray(node.available_actions) ? node.available_actions.map(normalizeAction) : [],
      windowId,
      ...(surfaceRead ? { surfaceRead: true } : {}),
    });
  }
  if (Array.isArray(node.children)) for (const child of node.children) indexNode(child, windowId, surfaceRead);
}

function indexSnapshot(data, fallbackWindowId, surface) {
  if (!data || !data.tree) return;
  indexNode(data.tree, data.window?.id ?? fallbackWindowId ?? null, Boolean(surface));
}

// A find result answers {match} or {matches, total_matches, truncated}, and each
// match is {ref_id, role, name, value, states, path} — it carries no
// available_actions and no window id. The path's first segment is
// `window:<title>`, which is how the match's own window is recovered from the
// window records this adapter already keeps. Indexing is not optional: without
// it a ref discovered by find — the model's most common discovery path — has no
// record, so postedPointer posts at that element's client coordinates into
// whatever window was touched last (silently the wrong HWND), and the click
// ladder's semantic rung never runs at all.
function indexFindResult(data, fallbackWindowId, surface) {
  if (!data) return null;
  const matches = Array.isArray(data.matches) ? data.matches : data.match ? [data.match] : [];
  let resolved = null;
  for (const match of matches) {
    if (!match?.ref_id) continue;
    const windowId = windowIdForPath(match.path) ?? fallbackWindowId ?? null;
    refIndex.set(String(match.ref_id), {
      role: String(match.role ?? ''),
      name: typeof match.name === 'string' ? match.name : '',
      actions: [],
      // The engine's find match does not report available_actions, so the
      // semantic rung falls back to gating on role alone (see
      // trySemanticAlternatives): a pattern the control lacks refuses fast, and
      // the ladder moves on.
      actionsUnknown: true,
      windowId,
      ...(surface ? { surfaceRead: true } : {}),
    });
    if (windowId && resolved && resolved !== windowId) resolved = null;
    else if (windowId) resolved = windowId;
  }
  return resolved;
}

// Which window a match path belongs to, by its title. Ambiguous titles answer
// nothing: guessing a window is how a background click lands on the wrong one.
function windowIdForPath(path) {
  const head = Array.isArray(path) ? path[0] : null;
  if (typeof head !== 'string' || !head.startsWith('window:')) return null;
  const title = head.slice('window:'.length);
  if (!title) return null;
  let found = null;
  for (const [id, record] of windowBounds) {
    if (record.title !== title) continue;
    if (found && found !== id) return null;
    found = id;
  }
  return found;
}

function refRecord(ref) {
  return refIndex.get(String(ref ?? '')) ?? null;
}

// A ref that came from a SURFACE read sits in a window whose UI thread is inside
// a modal loop, so re-identifying it for an action is far slower than the
// engine's 5000 ms default: measured 8.1 s to read a modal dialog's tree, then a
// click on that dialog's own button refused at 8000 ms with
// resolution_identity_unknown ('Strict resolution could not determine candidate
// identity from the live accessibility evidence') and delivered in 16.3 s at
// 20000 ms. --timeout-ms is a ceiling, not a sleep — a healthy window resolves
// in a few hundred ms either way — so raising it only for surface refs costs
// nothing until a dialog actually owns the thread.
const SURFACE_ACTION_BUDGET_MS = 20000;

function actionBudgetMs(args, ref) {
  const given = Number(args?.timeout_ms);
  if (Number.isFinite(given) && given > 0) return given;
  return refRecord(ref)?.surfaceRead === true ? SURFACE_ACTION_BUDGET_MS : undefined;
}

// Role groups for the semantic patterns that can stand in for a click. The
// action vocabulary is core's own (crates/core/src/actions/action.rs as_str).
const SELECT_AS_OPTION_ROLES = new Set(['tabitem', 'listitem', 'option', 'radiobutton', 'treeitem', 'menuitem', 'combobox', 'listbox']);
const TOGGLE_ROLES = new Set(['checkbox', 'switch', 'togglebutton']);
const EXPAND_ROLES = new Set(['treeitem', 'disclosure', 'combobox', 'button', 'group']);
// Commands whose intent a plain click reproduces exactly. check/uncheck are not
// here: a blind click flips whatever state the control happens to be in, which
// is the opposite of what "check" asks for.
const PATTERN_CLICK_FALLBACK = new Set(['expand', 'collapse', 'toggle']);

/* -------------------------------------------------------- physical input */

// Physical input is the one thing the user must opt into: it moves the real
// pointer and takes the desktop foreground. `physical: true` on one call is that
// opt-in; `tools {operation:"headed", on:true}` is the conversation-wide opt-in
// that expires on its own. Without either, nothing here runs.
function physicalAllowed(args) {
  return args?.physical === true || state.headedOverride === true;
}

function physicalRefusal(command, what) {
  return {
    version: '2.6',
    ok: false,
    command,
    error: {
      code: 'POLICY_DENIED',
      message: `${what} needs physical input, which moves the user's mouse and takes the desktop foreground. It does not run unless you ask for it.`,
      suggestion: 'Use the headless path first: set_value writes text through the UIA value pattern, a posted click/double-click/right-click reaches mouse-only controls without touching the pointer, and a posted key sends Enter/Escape/Tab to a dialog. Physical input is the user\u2019s opt-in to hand over the mouse, not a recovery step: fix the ref, the scope or the deadline instead.',
      details: { kind: 'physical_input_requires_consent', physical: false },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  };
}

function withMechanism(envelope, mechanism, attempted = [], note = '', extra = null) {
  if (envelope?.ok !== true) return envelope;
  envelope.data = {
    ...(envelope.data ?? {}),
    mechanism,
    ...(attempted.length ? { attempted } : {}),
    ...(extra ? { fallback_from: extra } : {}),
    ...(note ? { note } : {}),
  };
  return envelope;
}

// What the engine said when its semantic call was refused. Kept on the envelope
// that eventually succeeded, because "the click worked, but by another rung" is
// exactly the fact an operator or a later diagnosis needs.
function refusalSummary(envelope) {
  const error = envelope?.error;
  if (!error) return null;
  return { code: error.code ?? null, message: error.message ?? null, kind: error.details?.kind ?? null };
}

// The engine's own retry contract: "Retry or substitute an action only when
// disposition.retry is safe. Only not_delivered is safe." A failure that is NOT
// safe to retry means the mutation may already have landed. The classic Windows
// case is `Invoke` on a button whose handler runs a modal message loop: the
// dialog is open, the handler will not return until it is answered, and the
// engine answers TIMEOUT / "Invoke returned UIA_E_TIMEOUT; mutation outcome is
// uncertain". Every rung below such a failure fires the same handler a second
// time — a second Invoke, or a posted WM_LBUTTON*, which a modal loop still
// pumps to the owner's controls. What the user sees is a duplicate dialog or a
// double increment, plus another actionability budget burned on the window the
// first delivery just blocked. So an uncertain outcome ends the ladder: the
// answer to an uncertain delivery is to READ, never to repeat.
function deliveryUncertain(envelope) {
  const retry = envelope?.error?.disposition?.retry;
  return retry != null && retry !== 'safe';
}

function stopForUncertain(envelope, what) {
  envelope.hint = `The engine reports this ${what}'s outcome as uncertain, so the adapter stopped instead of climbing the ladder: a second pattern call or a posted message would fire the same handler again. Read the state first — list_windows or list_surfaces for a dialog this action may have opened, or a fresh snapshot — and act only on what the read shows.`;
  if (envelope.error) {
    envelope.error.suggestion = [
      envelope.error.suggestion,
      'Do not repeat this action: if it landed, repeating it duplicates the effect. Read the current state first (list_windows / list_surfaces for a new dialog, or a fresh snapshot of the window).',
    ].filter(Boolean).join(' ');
  }
  return envelope;
}

// The engine's physical commands require the target window to be foreground
// already ("Target window did not become foreground before headed delivery") and
// no background process can satisfy the Windows foreground lock. Under explicit
// consent only, the window is raised — through `focus-window`, which is the
// engine's own raise primitive. It used to be done with a real click at the
// element centre, which moved the pointer AND pressed a control nobody had asked
// to press: a `type` call could submit a form.
async function raiseForPhysical(refId) {
  const windowId = refRecord(refId)?.windowId ?? state.windowId;
  if (!windowId) {
    return {
      version: '2.6',
      ok: false,
      command: 'focus_window',
      error: {
        code: 'INVALID_ARGS',
        message: 'The adapter does not know which window this ref belongs to, so it will not raise anything.',
        suggestion: 'Snapshot the window (or pass window_id) so the ref carries its window identity.',
        disposition: { delivery: 'not_delivered', retry: 'safe' },
      },
    };
  }
  const envelope = parseEnvelope(await runCli(['focus-window', ...flagArgs([['--window-id', windowId]])], { headed: true }));
  return envelope.ok === true ? null : envelope;
}

// A refused engine call can mean two different things: the target does not
// support the action, or the exclusive desktop interaction lease is held by
// another engine action (`launch` holds it until its window appears). The
// second is contention, so it must not be reported as "this click failed".
const LEASE_BUSY_NOTE = 'The desktop interaction lease is held by another engine action right now (a launch holds it until its window appears), so no engine call can run. Nothing touched the mouse or the keyboard.';

function leaseBusy(envelope) {
  const summary = refusalSummary(envelope);
  return summary?.kind === 'lock_timeout' ? summary : null;
}

// Contention is transient by nature: a launch holds the exclusive lease until
// the window it started is observed. Retry a refused engine action a couple of
// times before reporting it, so a busy lease never reads as a broken action.
// The ladder is settings-driven since 1.0.13 (leaseRetryBaseMs): base, base*2,
// base*4. base 0 means answer contention immediately — some users want the busy
// result at once instead of waiting through several seconds of backoff.
function leaseRetryLadder() {
  const base = state.leaseRetryBaseMs;
  if (!base) return [];
  return [base, base * 2, base * 4];
}

async function engineAction(argv, { headed = false, retries = 2 } = {}) {
  const ladder = leaseRetryLadder();
  let envelope = parseEnvelope(await runCli(argv, { headed }));
  for (let attempt = 0; attempt < Math.min(retries, ladder.length); attempt += 1) {
    if (envelope.ok === true || leaseBusy(envelope) === null) break;
    await new Promise((resolve) => setTimeout(resolve, ladder[attempt]));
    envelope = parseEnvelope(await runCli(argv, { headed }));
  }
  return envelope;
}

// Physical pointer delivery at the element centre: one real OS click at raw
// screen coordinates. The engine is explicit that raw coordinates carry no
// window identity and never focus an app, so this rung moves the real cursor and
// clicks whatever window sits at that point — it does NOT promise the target is
// the window that gets the click. mouse-click has no --timeout-ms.
async function physicalPointer(command, refId) {
  const point = await elementPoint(refId);
  if (!point) return null;
  const shape = command === 'double_click' ? ['--count', '2'] : command === 'right_click' ? ['--button', 'right'] : [];
  const envelope = parseEnvelope(await runCli(['mouse-click', '--xy', `${point.x},${point.y}`, ...shape], { headed: true }));
  const reported = withMechanism(envelope, 'physical_synthetic', [], 'Physical input: the real cursor moved to the element centre and clicked there. The engine does not raise the window for a raw-coordinate click, so a window covering this one would have received it — read the state before acting again.');
  if (reported?.data) {
    // The cursor movement is what this rung is; the audit measures it. Whether
    // the OS activated the window under the click is not reported by the engine,
    // so it is declared unknown instead of claimed — an earlier note here
    // asserted the foreground changed and the audited runs never saw it do so.
    reported.data.pointer = { cursor_moved: true, foreground_changed: false, foreground_unverified: true };
  }
  return reported;
}

/* -------------------------------------------------------- posted input */

// Consent is permission, not preference: `physical: true` says the user may have
// their pointer moved, it does not say the quiet path should be skipped. So the
// ladder always runs its background rungs first, and a consented physical click
// happens only when those rungs failed — or when this same ref was already
// posted to moments ago and the caller came back asking again, which is the
// model saying "the app ignored the posted message". That retry is the one case
// where going straight to a real click is what the caller means.
const postedClicks = new Map(); // ref -> timestamp of a delivered posted click

function postedRecently(ref) {
  const at = postedClicks.get(String(ref));
  return typeof at === 'number' && Date.now() - at < 30000;
}

// Keys the plugin will post to a window's own focused control instead of
// synthesizing keystrokes. Only plain keys are here: a posted chord would need
// the modifier state of a real keyboard, and a combo that needs it is a signal
// to use the engine's own press rather than to invent one. A single printable
// character is not a chord — it is one key — so a bare letter or digit is
// posted as its own VK (OEM: the ASCII code, which is the VK for A-Z and 0-9).
// That is what makes the typed-into-a-dialog path headless: set_value puts the
// text in through the value pattern, and a posted Enter activates the default
// button, with no keystroke synthesized and no foreground taken.
const POSTED_KEYS = new Map([
  ['return', 0x0d], ['enter', 0x0d], ['escape', 0x1b], ['esc', 0x1b], ['tab', 0x09],
  ['space', 0x20], ['delete', 0x2e], ['backspace', 0x08], ['home', 0x24], ['end', 0x23],
  ['left', 0x25], ['up', 0x26], ['right', 0x27], ['down', 0x28],
]);

async function postedKey(combo, windowId) {
  const raw = String(combo ?? '').trim();
  const key = raw.toLowerCase();
  let vk = POSTED_KEYS.get(key);
  if (!vk && raw.length === 1) {
    // A bare letter or digit is one key, not a chord. It posts unshifted, so a
    // capital arrives as its lower-case form — enough to type a path into a
    // dialog edit, which is the whole point of keeping this path headless.
    const code = raw.toUpperCase().charCodeAt(0);
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39)) vk = code;
  }
  if (!vk) return { envelope: null, reason: 'this combo is not a plain key, so it cannot be posted' };
  const hwnd = windowHandle(windowId ?? state.windowId);
  if (!hwnd) return { envelope: null, reason: 'no window handle for this target: pass window_id, or snapshot the window first' };
  const report = await runQuietPointer({ mode: 'key', hwnd, vk });
  if (!report || report.ok !== true) return { envelope: null, reason: report?.error || 'posted key failed' };
  // Where the key actually landed: 'dialog_root' means the dialog box itself, which is
  // the only window whose message loop turns Escape/Enter into Cancel/OK (see
  // KeyTargetOf in scripts/quiet-input.ps1); 'thread_focus' is the focused control.
  const aim = report.focus_path ?? null;
  // A dialog dismissal is cheap to confirm — the window is either still in the window
  // list or it is not, which is one ~50-105 ms list read and no tree read. Confirming
  // it turns "delivered_unverified, retry unsafe" into a fact, and that is exactly what
  // stops the model from posting the same key eight times (the audited session did).
  let dismissed = null;
  if (windowId && aim === 'dialog_root' && (vk === 0x1b || vk === 0x0d)) {
    try {
      dismissed = !(await listWindowsNow(null)).some((w) => String(w?.id ?? '') === String(windowId));
    } catch { /* no confirmation either way */ }
  }
  const note = aim === 'dialog_root'
    ? (dismissed === true
      ? 'Background key: posted to the dialog window itself, because a standard dialog box translates Escape and Enter in its own message loop - its focused control is a button, and a button ignores a posted key. The dialog is gone from the window list, so the dismissal is confirmed.'
      : 'Background key: posted to the dialog window itself (a button child would have ignored it), and the window is still listed. Enter fires the default button; Escape only lands on a box that HAS a Cancel button - a YesNo/OK box ignores it exactly as it ignores a physical Escape (measured). If the box is still the answer, read its tree with surface "sheet" and timeout_ms 15000, then click the button ref that tree returns.')
    : `Background key: the key message was posted to the control that window already has focused, so no keystroke was synthesized, the pointer did not move and the foreground never changed. A posted key only proves the queue took it. Re-read the app to confirm the effect${DIALOG_NAV_KEYS.has(key) && !DIALOG_DISMISS_KEYS.has(key) ? ' — a movement key does not close a dialog, so check that the selection/focus actually moved; if it did not, click the item ref directly instead of posting the key again (a second post moves the selection twice)' : ''}. If nothing changed, pass physical:true so the engine brings the window forward and synthesizes a real keystroke.`;
  return {
    envelope: {
      version: '2.6',
      ok: true,
      command: 'press',
      data: {
        action: 'press',
        combo: key,
        mechanism: 'post_message',
        key_target: aim,
        steps: [{ label: 'PostMessage.WM_KEYDOWN+WM_KEYUP', mechanism: 'background_synthetic', outcome: 'succeeded', verified: dismissed === true }],
        disposition: dismissed === true ? { delivery: 'delivered_verified', retry: 'unsafe' } : { delivery: 'delivered_unverified', retry: 'unsafe' },
        pointer: { cursor_moved: report.cursor_moved === true, foreground_changed: report.foreground_changed === true },
        target: report.target ?? null,
        ...(dismissed === null ? {} : { dialog_window_gone: dismissed }),
        note,
      },
    },
    report,
  };
}

// What kind of window a window id actually is, asked of the quiet helper (its
// 'describe' mode posts nothing). The Win32 dialog-box class "#32770" is the one
// window class whose keyboard behaviour is knowable in advance: its own message loop
// routes Escape to Cancel and Enter to the default button, and the window vanishing
// is the proof that a key landed. The engine's window list carries no class, and a
// helper spawn costs about a second of PowerShell startup, so the answer is memoized
// per window id — a window's class never changes, and it is only asked when a key's
// effect needs confirming.
const windowClasses = new Map(); // window id -> class name
async function windowClassOf(windowId) {
  const id = String(windowId ?? '');
  if (!id) return null;
  const cached = windowClasses.get(id);
  if (cached !== undefined) return cached;
  const hwnd = windowHandle(id);
  if (!hwnd) return null;
  let cls = null;
  try {
    const report = await runQuietPointer({ mode: 'describe', hwnd });
    if (report && report.ok === true && typeof report.class === 'string') cls = report.class;
  } catch { /* unknown class: the caller must not assume one */ }
  // Only a known class is memoized: a failed read is usually a window that has
  // already closed, and the next call should be allowed to ask again.
  if (cls) windowClasses.set(id, cls);
  return cls;
}

// Keys whose effect on a dialog box is either to dismiss it or to move focus, both of
// which are observable without reading a tree.
const DIALOG_NAV_KEYS = new Set(['escape', 'esc', 'enter', 'return', 'tab', 'left', 'right', 'up', 'down']);
// The subset whose effect is to CLOSE the box. Only these may be re-delivered: a dialog
// that is still on screen after one of them did not take the key, so a second delivery
// cannot double a dismissal. The movement keys have no such tell — a dialog is supposed
// to stay open when an arrow moves its selection — so re-posting one would move the
// selection TWICE, which is how a recipe that aims at "No" lands on a different button.
const DIALOG_DISMISS_KEYS = new Set(['escape', 'esc', 'enter', 'return']);

// An engine "ok" for a key is not a key the app acted on. On a standard dialog box the
// effect of Escape or Enter is cheap to prove — that window is either still in the
// window list or it is not — and the measured failure (probe 9: Escape on a WinForms
// message box, engine ok in 262 ms, the box untouched and still focused, because a
// YesNo box has no Cancel button and Windows itself ignores Escape there) is exactly the
// case a caller would otherwise take as success and move on from.
//
// The window-list check comes FIRST, and that order is measured, not stylistic: probe 10
// sent Escape to a live #32770 box, the box closed, and the class read that followed
// reported nothing at all — a closed window has no class to read — so gating on the
// class hid the one outcome this confirmation exists to report (run 15's 'QA Cancel'
// press answered ok with no annotation while the box was verifiably gone, and the
// harness had to conclude the key did not land). A key that DID dismiss the dialog is
// confirmed without asking what class the window was; the class is only asked when the
// window is still on screen, because re-posting is safe only on a window whose own
// message loop routes Escape to Cancel and Enter to the default button.
async function confirmKeyOnDialog(envelope, args) {
  const windowId = args.window_id ?? state.windowId;
  const key = String(args.combo ?? '').trim().toLowerCase();
  if (!windowId || !DIALOG_NAV_KEYS.has(key)) return envelope;
  if (envelope.data?.mechanism === 'post_message') return envelope; // ours: already confirmed
  let gone = null;
  try {
    gone = !(await listWindowsNow(null)).some((w) => String(w?.id ?? '') === String(windowId));
  } catch { /* no confirmation either way */ }
  if (gone === true) {
    envelope.data = { ...(envelope.data ?? {}), dialog_window_gone: true };
    envelope.hint = 'The dialog window closed, so the key did land.';
    return envelope;
  }
  if (!DIALOG_DISMISS_KEYS.has(key)) {
    // An arrow or Tab is not meant to close anything, so the window being listed says
    // nothing about whether the key moved the selection. Say so instead of implying a
    // failure, and do not send the key a second time.
    envelope.data = { ...(envelope.data ?? {}), dialog_window_listed: gone };
    envelope.hint = 'The key was sent to that window; a movement key does not close a dialog, so the window list cannot confirm it. Confirm the effect on the app itself (its own status read, or the dialog tree), or click the button ref instead of moving the selection.';
    return envelope;
  }
  const cls = await windowClassOf(windowId);
  if (cls !== '#32770') {
    if (gone === false) {
      envelope.data = { ...(envelope.data ?? {}), dialog_window_gone: false };
      envelope.hint = 'The window is still on screen, so this key did not dismiss it. Enter fires the default button of a dialog box; Escape only lands on a box that HAS a Cancel button (probe 9: a YesNo box has none, and Windows itself ignores it there). Read the dialog by its own window_id or with surface "sheet", then click the button ref that tree returns.';
    }
    return envelope;
  }
  const posted = await postedKey(key, windowId);
  if (posted.envelope) {
    posted.envelope.data.fallback_from = 'the engine reported the key sent, but this dialog window was still on screen, so the key was posted to the dialog box itself';
    return posted.envelope;
  }
  envelope.hint = 'The engine reports the key was sent, but this window is a standard dialog box (#32770) and it is still on screen, so the key may not have taken effect, and a background post was not possible (' + (posted.reason ?? 'unknown') + '). Read the dialog with surface "sheet" and timeout_ms 15000, then click the button ref that tree returns.';
  return envelope;
}

// Background pointer delivery: post WM_* messages to the target control, so the
// click lands with the cursor and the foreground exactly as the user left them.
// Engine-reported window ids are `w-<hwnd>`; the ref's own window is preferred
// because state.windowId is only the last window the adapter touched.
async function postedPointer(command, refId, mode) {
  const point = await elementPoint(refId);
  // elementPoint refuses a rectangle the engine marks not-live, so this reason
  // names the fix rather than guessing: re-read the window, act on a fresh ref.
  if (!point) return { envelope: null, reason: 'no live element rectangle for this ref: re-read the window (snapshot or find) and act on the ref it returns' };
  const hwnd = windowHandle(refRecord(refId)?.windowId ?? state.windowId);
  if (!hwnd) return { envelope: null, reason: 'no window handle for this ref: take a fresh snapshot so the adapter knows its window' };
  const report = await runQuietPointer({ mode, hwnd, x: point.x, y: point.y });
  if (!report || report.ok !== true) return { envelope: null, reason: report?.error || 'posted click failed' };
  return {
    envelope: {
      version: '2.6',
      ok: true,
      command,
      data: {
        action: command,
        mechanism: 'post_message',
        steps: [{
          label: mode === 'right' ? 'PostMessage.WM_RBUTTON' : mode === 'double' ? 'PostMessage.WM_LBUTTONDBLCLK' : 'PostMessage.WM_LBUTTON',
          mechanism: 'background_synthetic',
          outcome: 'succeeded',
          verified: false,
        }],
        disposition: { delivery: 'delivered_unverified', retry: 'unsafe' },
        pointer: { cursor_moved: report.cursor_moved === true, foreground_changed: report.foreground_changed === true },
        target: report.target ?? null,
        note: 'Background click: posted to the control window, so the adapter never moved the pointer or raised the window. A posted message only proves the queue took it, not that the app acted on it. Re-read the control to confirm the effect; if nothing changed, call again with physical:true so the adapter uses the real pointer (the app can also take focus itself while it handles the message — read pointer.foreground_changed).',
      },
    },
    report,
  };
}

/* ---------------------------------------------- posted delivery verification */
// Vercel agent-desktop's interaction reference is explicit: "The app is observed
// to judge delivery, not the accessibility return code." A posted WM_* message
// proves only that the target thread's queue ACCEPTED it (PostMessage returned
// true). A XAML/WinUI/Electron surface, or a button that ignores posted keys, can
// swallow it with no effect at all — so reporting ok:true / delivered_unverified /
// retry:unsafe for a bare queue-accept masks failure as success and traps the
// caller (it may not repeat an unsafe delivery, yet nothing happened). Every posted
// rung is therefore followed by an observation of the app, classified:
//   verified     — the effect was observed; delivered_verified, retry unsafe.
//   no_effect    — the action's defining effect is provably absent; NOT a success.
//                  Under consent it escalates to the engine's own --headed physical
//                  path; without consent it is not_delivered, retry safe, naming the
//                  remedy. This is the honest failure the old ladder hid.
//   unobservable — no cheap probe exists (a generic click's effect is varied);
//                  delivered_unverified with a re-read + consent remedy, never a
//                  blind physical escalation.

function appOfWindow(windowId) {
  return windowBounds.get(String(windowId ?? ''))?.app ?? null;
}

// The defining effect of a right-click is a context menu. The engine lists a
// WinForms dropdown as a 'menu' surface; a WinUI/XAML context menu instead appears
// as a top-level "PopupHost" window whose surface type is plain 'window', so the
// title is matched too. Snapshot the menu ids before and after the post; a new one
// is the proof the right-click registered.
async function menuSurfaceIds(app) {
  const rows = await surfacesNow(app);
  return new Set(rows.filter((s) => /menu|popup|context/i.test(`${s?.type ?? ''} ${s?.title ?? ''}`)).map((s) => String(s.id)));
}

async function surfaceIds(app) {
  return new Set((await surfacesNow(app)).map((s) => String(s?.id ?? '')).filter(Boolean));
}

function newKeys(after, before) {
  const added = [];
  for (const k of after) if (!before.has(k)) added.push(k);
  return added;
}

// The engine's OWN right-click / double-click commands resolve the element's
// clickable point internally, so they deliver even when the adapter cannot read a
// live bounding rectangle for the ref (WinUI/XAML elements frequently expose none,
// which is exactly where a coordinate click at the element centre cannot run).
// right-click has a semantic path only where the control advertises one (a WinUI
// text field answers POLICY_DENIED headless); double-click is headed-only.
async function enginePointer(name, args, headed) {
  const command = name === 'right_click' ? 'right-click' : 'double-click';
  return engineAction([command, args.ref_id, ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])], { headed, retries: 1 });
}

// The physical rung under consent: prefer the engine's native headed command (it
// works without adapter-computed bounds and is the delivery Vercel's engine itself
// implements), then fall back to a coordinate click at the element centre. An
// uncertain delivery is returned as-is so the caller stops the ladder rather than
// blind-repeating a mutation that may already have landed.
async function physicalClick(name, args) {
  const native = await enginePointer(name, args, true);
  if (native.ok === true) {
    return withMechanism(native, 'physical_synthetic', [], `Physical input on your request: the engine's headed ${name === 'right_click' ? 'right-click' : 'double-click'} moved the real pointer and the target window took the foreground.`);
  }
  if (deliveryUncertain(native)) return native;
  return await physicalPointer(name, args.ref_id);
}

// Upgrade a posted envelope whose effect was observed to delivered_verified.
function markPostedVerified(envelope, note) {
  if (envelope?.ok !== true || !envelope.data) return envelope;
  envelope.data.disposition = { delivery: 'delivered_verified', retry: 'unsafe' };
  envelope.data.verified = true;
  if (Array.isArray(envelope.data.steps)) for (const s of envelope.data.steps) s.verified = true;
  if (note) envelope.data.note = note;
  return envelope;
}

// A posted action whose defining effect is provably absent is not a success. This
// is the honest failure the old ladder hid behind ok:true / retry:unsafe: nothing
// landed, so it is safe to retry, and the remedy is the engine's headed physical
// path (consent) or a different target. `what` names the action; `evidence` says
// what was observed. The caller escalates to physical when consent is present.
function postedNoEffect(command, what, evidence) {
  return {
    version: '2.6',
    ok: false,
    command,
    error: {
      code: 'ACTION_FAILED',
      message: `The background posted ${what} was accepted by the window's message queue but the app shows no effect: ${evidence}. A posted WM_* message only proves the queue took it, not that the app acted on it (a XAML/WinUI/Electron surface or a button can ignore it).`,
      suggestion: 'Nothing landed, so this is safe to retry. Pass physical:true on this call (or tools {operation:"headed",on:true}) to deliver it through the engine\'s headed physical path, which moves the real pointer/keyboard and takes the foreground; or re-read the window and act on a control that exposes a semantic action.',
      details: { kind: 'posted_no_effect', physical: false, evidence },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  };
}

async function trySemanticAlternatives(refId, timeoutMs) {
  const record = refRecord(refId);
  const attempted = [];
  if (!record) return { envelope: null, attempted, mechanism: null };
  const flags = flagArgs([['--timeout-ms', timeoutMs]]);
  const run = async (command, extra = []) => {
    const envelope = await engineAction([command, refId, ...extra, ...flags], { retries: 1 });
    attempted.push({ command, ok: envelope.ok === true, code: envelope.error?.code });
    return envelope.ok === true ? envelope : null;
  };
  // A snapshot records what each ref advertised, so the retry is evidence-based.
  // A find match records no actions at all, so for those refs the role is the
  // only evidence — a pattern the control genuinely lacks answers
  // ACTION_NOT_SUPPORTED fast and the ladder moves to the posted click.
  const mayTry = (action, roles) => roles.has(record.role)
    && (record.actionsUnknown === true || record.actions.includes(action));
  if (mayTry('select', SELECT_AS_OPTION_ROLES) && record.name) {
    const envelope = await run('select', [record.name]);
    if (envelope) return { envelope, attempted, mechanism: 'select' };
  }
  if (mayTry('toggle', TOGGLE_ROLES)) {
    const envelope = await run('toggle');
    if (envelope) return { envelope, attempted, mechanism: 'toggle' };
  }
  if (mayTry('expand', EXPAND_ROLES)) {
    const envelope = await run('expand');
    if (envelope) return { envelope, attempted, mechanism: 'expand' };
  }
  if (mayTry('collapse', EXPAND_ROLES)) {
    const envelope = await run('collapse');
    if (envelope) return { envelope, attempted, mechanism: 'collapse' };
  }
  return { envelope: null, attempted, mechanism: null };
}

function annotateRefusal(envelope, attempted, postedReason, physicalFailure, record) {
  if (envelope?.ok === true) return envelope;
  const parts = [];
  if (attempted.length) parts.push(`the ref's own patterns refused: ${attempted.map((a) => `${a.command}(${a.code ?? 'failed'})`).join(', ')}`);
  if (postedReason) parts.push(`a background posted click could not run: ${postedReason}`);
  if (physicalFailure) parts.push(`the physical click refused: ${physicalFailure.code ?? 'failed'}`);
  if (!record) parts.push("the adapter had no snapshot record for this ref, so it could not retry through the control's own patterns");
  const notUnique = envelope.error?.code === 'AMBIGUOUS_TARGET' || envelope.error?.details?.kind === 'identity_not_unique';
  envelope.hint = [
    'Nothing physical ran: the user’s mouse and foreground were not touched.',
    parts.length ? parts.join('; ') + '.' : '',
    notUnique ? 'This ref was not proven unique in the whole window (identical twins share role+name): a fresh full snapshot may reproduce the same ambiguity. NARROW the read so the next ref is unique — root:<container ref> on the part you need, find with exact:true, or a longer timeout_ms — then act on that ref.' : '',
    'Next: take a fresh snapshot of this window (timeout_ms 10000-20000 for a busy app) and act on the new ref; or drive the control with select/check/uncheck/toggle/expand/scroll_to/set_value; or if a dialog or menu is open, read it — surfaces for this app, snapshot {surface:"menu"} for a menu, list_windows + the dialog window_id for a modal (a find by that window_id does not answer while the modal owns the thread — use surface "sheet").',
    physicalFailure ? '' : 'Physical input was not requested and would not fix this: it needs the window to be foreground already, and it moves the user’s pointer.',
  ].filter(Boolean).join(' ');
  return envelope;
}

function writeTarget(window, pointer) {
  try {
    const payload = JSON.stringify({ window: window ?? null, pointer: pointer ?? null, at: Date.now() });
    if (payload === state.lastTarget) return;
    state.lastTarget = payload;
    mkdirSync(dirname(TARGET_FILE), { recursive: true });
    const temp = `${TARGET_FILE}.${process.pid}.tmp`;
    writeFileSync(temp, payload);
    renameSync(temp, TARGET_FILE);
  } catch { /* the overlay is optional */ }
}

async function noteTarget(name, args, result) {
  const envelope = result?.structuredContent ?? (result && typeof result === 'object' && 'ok' in result ? result : null);
  const data = envelope?.ok === true ? envelope.data : null;
  if (name === 'launch' && data?.window) {
    rememberWindow(data.window, data.app);
    if (data.window.id) state.windowId = data.window.id;
  }
  if (name === 'list_windows') rememberWindows(data);
  // A snapshot's window record is only {id, title}: the app name is a top-level
  // field of the envelope, so it has to be passed down or the window keeps no
  // app association and windowIdForApp() can never answer.
  if (name === 'snapshot') rememberWindows(data, data?.app);
  if (args?.window_id) state.windowId = args.window_id;
  // A REFUSAL gets no framing at all, and that is not only a style call: the tools/call
  // branch replies only after this function has run through the queue, so on a blocked
  // app the two reads below (a window rect, an element point) burned the engine's whole
  // wait budget BEFORE the refusal reached the caller. Run 15 measured it: the memo
  // answers a repeat click in ~0 ms, yet the round trip cost 6189 ms with
  // memo_age_ms 6210 — the refusal was waiting on its own overlay hint. There is nothing
  // to frame for an action that was never sent.
  if (envelope && envelope.ok !== true) return;
  // target.json feeds the rim and the ghost cursor only. With the overlay off,
  // skip the CLI calls they cost (element bounds, sometimes a window list):
  // ~85-140 ms per action spent on presentation nobody is looking at.
  if (!effectiveOverlay() || !state.windowId) return;
  const window = await windowRectFor(state.windowId);
  const ref = args?.ref_id ?? data?.match?.ref_id ?? null;
  let pointer = ref ? await elementPoint(ref) : null;
  if (!pointer && window) pointer = { x: Math.round(window.left + window.width / 2), y: Math.round(window.top + window.height / 2) };
  writeTarget(window, pointer);
}

// A modal dialog disables its owner window, so every pattern on that window
// starts refusing — the most common reason a click "does nothing" in the
// exported session, and the reason the model polled screenshots fifty-odd times
// instead. When an action fails, one window list and one surface inventory say
// whether a window or popup is on top of the target, and name it in the refusal.
// Two reads, because neither sees everything: an open menu or dropdown is a real
// top-level window that list-windows does not always enumerate (run 6 measured an
// invisible context menu disabling its owner app for the rest of a series) while
// list-surfaces does.
//
// The blocker is usually NOT a window this conversation had not seen: the click
// that failed is the one that opened the dialog, so "unseen" alone answered
// blocking_windows=null with the dialog up and focused (run 7 measured it). So a
// same-app window that currently holds focus while a DIFFERENT window is the
// action's target — that window owns the app's input, seen or not — and a surface
// typed sheet or menu is a modal or an open menu by definition, while an untitled
// surface entry is a dropdown or tooltip. All three are named whether or not they
// are new. currentRefId names the window the failing action was aimed at, which
// is the window to exclude, not to blame.
async function dialogHint(known) {
  try {
    const target = String(refRecord(currentRefId)?.windowId ?? state.windowId ?? '');
    const scope = windowBounds.get(target || state.windowId)?.app ?? null;
    const windows = await listWindowsNow(scope);
    const others = windows.filter((w) => w?.id && String(w.id) !== target);
    const targetRow = windows.find((w) => String(w?.id ?? '') === target);
    const focused = others
      .filter((w) => w.is_focused === true)
      .map((w) => ({ window_id: w.id, title: w.title ?? null, app: w.app_name ?? w.app ?? null }));
    // A modal reports is_focused false on itself AND leaves its owner focused false
    // as well (measured twice on a WinForms message box), so a focus filter alone
    // named nothing and the refusal came back with blocking_windows=null (run 11) —
    // which also left the blocked-window memo with no blocker to carry or self-heal.
    // When the target itself reports no focus while another same-app window exists,
    // that other window is the suspect, and this is a failure path: the action has
    // already been refused with a block-shaped error, so naming it is a claim the
    // evidence supports.
    const suspect = targetRow && targetRow.is_focused !== true
      ? others
        .filter((w) => w.is_focused !== true)
        .map((w) => ({ window_id: w.id, title: w.title ?? null, app: w.app_name ?? w.app ?? null }))
      : [];
    const surfaces = await surfacesNow(scope);
    const popups = surfaces
      .filter((s) => s?.id && (s.type === 'sheet' || s.type === 'menu' || !String(s.title ?? '').trim()))
      .map((s) => ({ window_id: String(s.id), title: s.title ?? null, app: null, surface: s.type ?? null }));
    const merged = [];
    const seen = new Set();
    for (const row of [...focused, ...suspect, ...popups, ...unseenWindows(windows, known), ...unseenSurfaces(surfaces, known)]) {
      const id = String(row.window_id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
    }
    return merged.length ? merged : null;
  } catch { return null; }
}

function attachDialogHint(envelope, added, remedy) {
  if (!envelope || envelope.ok === true) return envelope;
  if (added?.length) envelope.error.details = { ...(envelope.error.details ?? {}), blocking_windows: added };
  const named = added?.length
    ? added.map((w) => `"${w.title ?? w.window_id}" (${w.window_id}${w.surface ? `, surface ${w.surface}` : ''}${w.app ? `, ${w.app}` : ''})`).join('; ')
    : null;
  const body = [remedy, named ? `Another window or surface is on screen: ${named}.` : null].filter(Boolean).join(' ');
  if (!body) return envelope;
  envelope.hint = `${envelope.hint ? `${envelope.hint} ` : ''}${body} An entry with no title is usually an open menu, dropdown or tooltip — read it by that id (find or snapshot with that window_id) or with surface "menu". A modal dialog disables its owner window, so every read and action on the parent keeps failing while it is up — do not retry the parent, and do not post a click to it either (a posted message can still fire a disabled control and open a second dialog). Read the DIALOG instead: snapshot with surface "sheet" (or "focused") and timeout_ms 15000 — measured 8.1 s to a complete tree that names its buttons — then click one of those refs. If that read comes back tiny (ref_count near 1, complete:false) the dialog exposes no tree to this lane: stop reading it and drive it blind — press {combo:"escape"} or {combo:"enter"} with the dialog's own window_id. Measured: the key is posted to the dialog box itself, so {combo:"enter"} fires its default button and closes it; {combo:"escape"} lands only on a box that HAS a Cancel button (a YesNo or OK box ignores it, exactly as it ignores a physical Escape). A standard Win32 dialog such as a file picker takes either key.`;
  return envelope;
}

// The refusal a surface "sheet"/"focused" read answers when the app has no
// focused window at all — measured in run 8 against a modal that had lost focus
// (153 ms, so it is cheap to catch and cheap to answer).
const NO_FOCUS_READ = /no longer the focused window/i;
const NO_FOCUS_REMEDY = 'This application has no focused window, so a surface read has nothing to root on: the window is still there, it just is not focused. Read it by its own window_id instead (the ids are named in error.details.blocking_windows when one is found), or drive it blind with press {combo:"escape"} / {combo:"enter"} on that id. Do not retry the surface read.';

// An observation of a window a dialog owns comes back as a SUCCESS with nothing
// in it. Run 8 measured it: with a QA MessageBox up, find --name FileMenu on the
// owner answered no match at all — no error, no hint, just an empty answer. That
// is the worst failure shape this lane produces, because the caller's next move
// is to poll: the audited session paid 55 screenshot and 53 list_windows calls to
// work out what one named blocker would have said. So when a read comes back
// empty, spend the scoped window-list read and name what is on top.
async function blockerForBlindRead(scope) {
  try {
    const observed = String(scope?.window_id ?? state.windowId ?? '');
    const app = scope?.app ?? windowBounds.get(observed)?.app ?? null;
    if (!app && !observed) return null;
    const windows = await listWindowsNow(app);
    const observedRow = (windows ?? []).find((w) => w?.id && String(w.id) === observed) ?? null;
    const others = (windows ?? [])
      .filter((w) => w?.id && String(w.id) !== observed)
      .map((w) => ({ window_id: w.id, title: w.title ?? null, app: w.app_name ?? w.app ?? null, focused: w.is_focused === true }));
    // Say it only where the claim can be true: something else is holding this
    // app's input, or the window just read is not holding it. Reading a modal
    // that IS focused and coming back tiny is that dialog's own limitation, not
    // a blocker, and naming its owner would blame the wrong window.
    if (others.length && (others.some((w) => w.focused) || observedRow?.is_focused !== true)) {
      return others.sort((a, b) => Number(b.focused) - Number(a.focused));
    }
    // Nothing in the window inventory: the blocker may be a popup list-windows
    // does not enumerate, which is what the surface inventory is for. A sheet, a
    // menu or an untitled entry IS a popup by definition, so it is always named.
    const surfaces = await surfacesNow(app);
    const popups = (surfaces ?? [])
      .filter((s) => s?.id && String(s.id) !== observed && (s.type === 'sheet' || s.type === 'menu' || !String(s.title ?? '').trim()))
      .map((s) => ({ window_id: String(s.id), title: s.title ?? null, app: null, surface: s.type ?? null }));
    return popups.length ? popups : null;
  } catch { return null; }
}

function attachBlindReadNote(envelope, blockers) {
  if (envelope?.ok !== true || !blockers?.length) return envelope;
  envelope.data = envelope.data ?? {};
  envelope.data.blocking_windows = blockers;
  const named = blockers.map((w) => `"${w.title ?? w.window_id}" (${w.window_id}${w.surface ? `, surface ${w.surface}` : ''}${w.app ? `, ${w.app}` : ''}${w.focused ? ', focused' : ''})`).join('; ');
  envelope.data.observation_note = `${envelope.data.observation_note ? `${envelope.data.observation_note} ` : ''}This read came back with nothing usable in it, and ${named} is another window of the same app on screen. Two readings are possible and one step tells them apart: if that named window is a dialog or an open menu it owns this application's input and the window you read cannot be walked while it is up — read the NAMED window instead (snapshot or find with that window_id, or surface "sheet" / "menu") and act on that tree; if it is an ordinary window, the name or role you asked for is simply not in this one. Either way do not re-read this window at a bigger budget and do not fall back to screenshots: pixels cannot name a blocker.`;
  return envelope;
}

// A window a modal has disabled answers actionability_timeout after burning its
// whole --timeout-ms budget (measured 6186 ms at a 5000 ms budget with a QA
// MessageBox up). Nothing may be delivered to a disabled window: a posted WM_*
// click still reaches the child's window procedure, so posting to the blocked
// parent of a dialog can fire the same button again and open a second dialog.
// The answer is the dialog, never the parent.
function stopForBlocked(envelope, what) {
  if (envelope?.error) {
    envelope.error.suggestion = `${envelope.error.suggestion ? `${envelope.error.suggestion} ` : ''}The target's window is disabled by something on top of it, so ${what} was not delivered — and nothing was posted to it either, because a posted message can still fire a disabled control. Read the window that owns the application instead: snapshot with surface "sheet" (or "focused") and timeout_ms 15000, then click a ref from THAT tree. The blocking window is named in error.details.blocking_windows when one is found.`;
  }
  return envelope;
}

// The refusal a DISABLED control answers to every verb, measured in run 6 while a
// WinForms context menu that list-windows does not enumerate owned the app's
// thread: 'Invoke/Toggle/SetValue/Select targeted an element that is not enabled',
// platform_detail COM HRESULT 0x80040200 (UIA_E_ELEMENTNOTENABLED). It belongs to
// the same stop as actionability_timeout, for the same reason and one more: a
// posted message still reaches the window procedure of a control the application
// has disabled, and run 6 measured that posting there does NOTHING (the dialog
// never opened, the count label never moved) — the rung is pure cost.
function disabledTarget(env) {
  const error = env?.error;
  if (!error) return false;
  return /targeted an element that is not enabled/i.test(String(error.message ?? ''))
    || /UIA_E_ELEMENTNOTENABLED|0x80040200/i.test(String(error.platform_detail ?? ''));
}

// A blocked window answers every verb only after burning its whole actionability
// budget — measured 22.7 s at the default budget and 31-37 s in the audited
// session — and NO flag shortens that first answer (--wait-timeout, which bounds
// the engine's post-action observation, is refused on a bare ref action). The
// model's reflex on a refusal is to retry the same action, and the audited session
// paid 21 s and 42 s tails exactly that way. So the first refusal memoizes the
// block for a few seconds: while the memo is live, a ref action aimed at that
// window is refused outright — no engine call, no posted message, no read of its
// own. The memo is what makes the second attempt cheap; it cannot make the first
// one cheap. Self-heal does not read either: runs 11 and 12 measured a desktop-wide
// list-windows at 6247 ms while a modal owned its app's thread, which costs more
// than the refusal it was trying to avoid. The memo dies when the caller's own NEXT
// successful observation of that window proves the window answers again.
const blockedMemo = new Map();
const BLOCKED_MEMO_MS = 8000;
// The verbs whose engine rung burns that budget. double_click and right_click are
// posted-first, so they cost ~50 ms and gain nothing from the memo.
const REF_BUDGET_TOOLS = new Set(['click', 'select', 'expand', 'collapse', 'toggle', 'check', 'uncheck',
  'clear', 'scroll_to', 'set_value', 'scroll', 'focus', 'type', 'double_click', 'right_click']);

// A memo entry is { expiresAt, blocker }: the window the refusal actually blamed,
// not just an expiry stamp. Self-heal has to key on THAT window still existing,
// because a modal dialog reports is_focused false on itself AND leaves its owner
// focused false as well (run 8 measured both false on a WinForms message box) — so
// a focus flag cannot confirm or clear a block, and keying on it silently dropped
// the memo and let the repeat burn the full budget again (run 10: 22726 ms).
// SYNCHRONOUS on purpose, and the call site must not await it. It used to be an
// async function that performed a confirm read; the read was removed (run 12's
// measurement), but the `async` stayed and the call site never awaited it, so
// every field of the result arrived as undefined and the refusal rendered
// 'A refusal undefined ms ago' with an empty blocking_windows (run 14 measured
// exactly that). A function that reads nothing must not be async.
function blockedMemoHit() {
  const windowId = String(refRecord(currentRefId)?.windowId ?? state.windowId ?? '');
  if (!windowId) return null;
  const memo = blockedMemo.get(windowId);
  if (!memo) return null;
  if (memo.expiresAt < Date.now()) { blockedMemo.delete(windowId); return null; }
  const ageMs = BLOCKED_MEMO_MS - (memo.expiresAt - Date.now());
  // Answered from what the first refusal measured, with NO read here at any age.
  // Run 12 measured why: the bounded confirm read cost 6357 ms (the engine reads
  // every window's properties and one busy window stalls the whole pass), which is
  // more than the 22 s refusal was worth avoiding for a few seconds of memo life.
  // The blocker row is therefore labelled unconfirmed: it was true when the first
  // refusal read the window list, and nothing here re-read it.
  return memo.blocker
    ? { blocker: memo.blocker, ageMs, unconfirmed: true }
    : { blocker: null, ageMs };
}

// The verbs that observe without changing anything. They are listed here because a
// successful READ must not be mistaken for proof that an action would land, and a
// failed one must not look like a delivered action; both matters show up in the memo
// rule below and in the refusal wording.
const READ_ONLY_TOOLS = new Set(['snapshot', 'find', 'get', 'is', 'list_windows', 'list_surfaces', 'screenshot', 'ocr', 'wait', 'tools']);

// A read that comes back with something real to show is the evidence that the block
// is over, so the memo goes — paid for by the observation the caller already made,
// never by a read of the adapter's own. A snapshot answering with an EMPTY tree does
// not count: a blocked window answers exactly that way (run 3 measured a 10181 ms
// snapshot returning nothing), and clearing on that would put the caller back on the
// 22 s budget.
function clearBlockedMemoOnObservation(name, args, envelope) {
  if (envelope?.ok !== true) return;
  const windowId = String(
    (args?.ref_id ? refRecord(args.ref_id)?.windowId : null)
      ?? envelope?.data?.window?.id
      ?? args?.window_id
      ?? '',
  );
  if (!windowId || !blockedMemo.has(windowId)) return;
  let productive;
  if (name === 'snapshot') productive = Number(envelope?.data?.ref_count ?? 0) > 0;
  else if (name === 'find') productive = Boolean(envelope?.data?.match) || (envelope?.data?.matches?.length ?? 0) > 0;
  else productive = !READ_ONLY_TOOLS.has(name) && !REF_BUDGET_TOOLS.has(name);
  if (productive) blockedMemo.delete(windowId);
}

// The one stop the disabled-window classes share: name whatever is on top of the
// target, say honestly when nothing on top could be found, and leave the memo so
// a retry does not re-burn the budget. currentRefId is the ref the failing action
// was aimed at — sound to read here because the queue is the only serializer, so
// exactly one tool call of this conversation is in flight at a time.
async function stopForDisabled(envelope, what, known) {
  const windowId = String(refRecord(currentRefId)?.windowId ?? state.windowId ?? '');
  const hinted = attachDialogHint(stopForBlocked(envelope, what), await dialogHint(known));
  const namedRow = hinted.error?.details?.blocking_windows?.[0] ?? null;
  const named = namedRow?.window_id ?? null;
  if (windowId) {
    blockedMemo.set(windowId, {
      expiresAt: Date.now() + BLOCKED_MEMO_MS,
      blocker: namedRow
        ? { window_id: String(namedRow.window_id), title: namedRow.title ?? null, app: namedRow.app ?? null }
        : null,
    });
  }
  if (!named) {
    hinted.hint = `${hinted.hint ? `${hinted.hint} ` : ''}No new window or surface was found on top of it either, so the control may be disabled by a popup this lane cannot inventory (an in-window popup, or one that closed between the refusal and this read). Do not post to it again: re-read the window with a fresh snapshot and act on what the tree shows.`;
  }
  return hinted;
}

// A surface read is the slowest read the engine performs, and it is the only way
// to see a dialog: measured with a modal up, the engine's own 5000 ms deadline
// burned out, 8000 ms returned a truncated tree with identity_unproven, and a
// 15000-20000 ms budget returned complete=true naming the dialog's buttons, in
// ~8.1 s. So a surface read gets a raised default budget; the caller may still
// ask for a lower one.
function observationTimeout(args, surface) {
  if (args.timeout_ms !== undefined && args.timeout_ms !== null) return args.timeout_ms;
  return surface ? 15000 : undefined;
}

/* ------------------------------------------------------------------ CLI */

// Semantic delivery only: --headed is passed by the few call sites that already
// established the user's consent (physicalAllowed), so no ordinary call can
// silently move the pointer or take the foreground.
//
// A hard ceiling exists because every engine call runs under this one queue: an
// engine that stops answering (a stuck window probe, a lease it never gets)
// would otherwise wedge every later tool call for the rest of the conversation.
// Settings-driven since 1.0.13 (engineCallTimeoutMs, 10–300 s); the host's MCP
// tool-call ceiling is mounted above it so this adapter timeout is the one that
// answers and says why.
function hardTimeoutMs() {
  return state.engineCallTimeoutMs;
}

function hardTimeoutEnvelope(args) {
  return JSON.stringify({
    version: '2.6',
    ok: false,
    command: String(args[0] ?? ''),
    error: {
      code: 'TIMEOUT',
      message: `The engine did not answer within ${Math.round(hardTimeoutMs() / 1000)} s and was stopped.`,
      suggestion: 'The desktop may be showing a modal dialog or the interaction lease may be held by another app; retry once, and report it if it repeats.',
      details: { kind: 'adapter_hard_timeout' },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  });
}

function runCli(args, { headed = false } = {}) {
  const argv = [];
  if (headed) argv.push('--headed');
  argv.push(...args);
  const env = { ...process.env };
  if (state.sessionStarted) env.AGENT_DESKTOP_SESSION = state.sessionId;
  return new Promise((resolve) => {
    const child = NATIVE_BIN
      ? spawn(NATIVE_BIN, argv, {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env,
        })
      : spawn(process.execPath, [CLI_BIN, ...argv], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env,
        });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      settled = true;
      resolve({ code: -2, stdout: hardTimeoutEnvelope(args), stderr });
    }, hardTimeoutMs());
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code: -1, stdout: '', stderr: String(error?.message || error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    });
  });
}

// Serialize all CLI calls: the engine's interaction lease allows one driver
// at a time, and queueing here avoids contending on the kernel lock.
//
// The queue is re-entrant on purpose. An engine action often needs a helper
// call (element bounds for a posted click, a window list for the overlay), and
// if that helper were appended behind the queue the action already holding the
// queue would wait on itself. So a call made while the queue is already held by
// this adapter runs inline, and every call made from outside it — including the
// overlay's target write, which used to run unqueued and then lose the lease
// race against the next action — goes through the queue.
let queue = Promise.resolve();
let engineTurn = false;
function enqueue(fn) {
  if (engineTurn) return Promise.resolve().then(fn);
  const held = async () => {
    engineTurn = true;
    try {
      return await fn();
    } finally {
      engineTurn = false;
    }
  };
  const run = queue.then(held, held);
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

// The surfaces this Windows engine can actually read. A modal dialog is a
// "sheet" and an open menu is a "menu": both are separate from the window tree,
// which is why a window snapshot of an app with a dialog open looks frozen.
const SURFACE_VALUES = ['window', 'focused', 'sheet', 'menu', 'start-menu', 'taskbar', 'system-tray', 'system-tray-overflow', 'action-center', 'notification-center'];
const surface = { type: 'string', enum: SURFACE_VALUES, description: 'Read that surface instead of the window: sheet = the app modal dialog, menu = an OPEN menu, plus the shell surfaces. An app-scoped read, never a window_id one. There is no "menubar" surface on Windows (the engine refuses it): a menu-bar command is part of the OWNER window tree — find it by name (role menuitem) and click that ref.' };
const waitFor = { type: 'string', description: 'role:text locator to wait for in the same call (e.g. "button:OK"), instead of snapshot-poll-snapshot. --root cannot combine with it.' };
const waitForGone = { type: 'string', description: 'role:text locator that must DISAPPEAR within the deadline — the headless way to confirm a dialog or busy overlay closed.' };
const waitTimeout = { type: 'integer', description: 'Deadline for wait_for/wait_for_gone in ms (engine default 30000).' };

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required },
  };
}

const TOOLS = [
  tool('snapshot',
    'Read a window as a semantic tree of refs (@sN:eN). Skeleton first for dense windows, then drill with root. Refs go stale after window changes — re-snapshot on STALE_REF. Chromium windows need timeout_ms 10000-25000 to settle. Omit app/window_id to read the window this conversation last touched. A modal dialog or open menu is a SEPARATE surface: use surface "sheet" or "menu", not a window snapshot. If the result reports identity_unproven or complete:false, re-snapshot the same window with timeout_ms 10000-20000 before acting on any ref from it.',
    { app: str, window_id: str, compact: bool, skeleton: bool, interactive_only: bool, max_depth: int, root: str, timeout_ms: int, surface, wait_for: waitFor, wait_for_gone: waitForGone, wait_timeout: waitTimeout }),
  tool('find',
    'Search controls by name/role/text/value. Returns refs. Role must be as snapshot prints it (textfield, button, tabitem, listitem — not the native control type name). Use count for counts; first/last/nth replace limit (the engine refuses them together). Omit app/window_id to search the app of the window this conversation last touched — that keeps a dialog or menu of that app in scope without scanning the whole desktop. Pass surface "menu"/"sheet" to search an open menu or modal dialog instead of the window tree. A menu-bar command is part of the OWNER window tree (role menuitem, its path names the menu it belongs to): find it by name on the window and click that ref, which activates the item without opening a dropdown this lane often cannot read.',
    { app: str, window_id: str, name: str, role: str, text: str, value: str, native_id: str, description: str, first: bool, last: bool, nth: int, limit: int, count: bool, exact: bool, root: str, timeout_ms: int, surface, wait_for: waitFor, wait_for_gone: waitForGone, wait_timeout: waitTimeout }),
  tool('get', 'Read one control: property text|value|title|bounds|role|states.', { ref_id: str, property: str }),
  tool('is', 'Check one control: visible|enabled|checked|focused|expanded|selected.', { ref_id: str, property: str }),
  tool('click', 'Press a control with no pixels: the engine tries InvokePattern, then LegacyIAccessible. When both are refused the adapter retries the ref\u2019s own patterns (select/toggle/expand/collapse) and then posts a background WM_* click to the control window, so the user\u2019s pointer and foreground are untouched. That ladder runs in order and a failure names the rung that failed: when the posted click is the rung that failed, the app ignores background input and only physical:true with the user\u2019s consent can drive it \u2014 the error says which. One exception stops the ladder outright: if the engine reports the outcome as UNCERTAIN (error.disposition.retry unsafe \u2014 the handler may already have run, the usual case being a button that opens a modal dialog) nothing is re-delivered, because repeating it would duplicate the effect; read the state instead. A posted click only proves the queue took it, not that the app acted: re-read the control, and if nothing changed call again with physical:true. Verify by re-snapshot.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('focus', 'Focus a control through UIA SetFocus. On Windows SetFocus takes the desktop foreground window, so it is physical by nature and runs only with physical:true. For text entry prefer set_value, which focuses the field itself; to press a control use click.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('double_click', 'Double-click a control. Default is a background posted double-click (WM_LBUTTONDBLCLK) at the element centre: no pointer movement, no foreground change. The adapter then checks whether a new window or surface appeared: if so the result is delivered_verified; if nothing is observable, re-read the control to confirm the effect. With physical:true a posted click that produced no observable effect (or could not be posted at all) escalates in the SAME call to the engine\u2019s own headed double-click, which resolves the element\u2019s clickable point internally \u2014 so it delivers even on WinUI/XAML controls that expose no live bounding rectangle \u2014 and brings the window forward; without consent it reports not_delivered. Verify by re-snapshot.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('right_click', 'Open a control\u2019s context menu. Default is a background posted right-click at the element centre: no pointer movement, no foreground change. The adapter then checks list_surfaces for a new menu: if one appeared the result is delivered_verified; if not, with physical:true it escalates in the SAME call to the engine\u2019s own headed right-click (which resolves the clickable point internally, so it works even on WinUI/XAML controls with no live bounding rectangle), and without consent it reports not_delivered. The menu is a separate surface: after this, look for it with list_surfaces or snapshot/find surface "menu" \u2014 a window snapshot will not show it (a WinUI context menu appears as a "PopupHost" window).', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('expand', 'Expand an expander, tree item, or dropdown via ExpandCollapsePattern (no pixels).', { ref_id: str, timeout_ms: int }),
  tool('collapse', 'Collapse an expander or tree item via ExpandCollapsePattern (no pixels).', { ref_id: str, timeout_ms: int }),
  tool('toggle', 'Flip a checkbox or toggle button via TogglePattern. Prefer it over click: it reports the resulting state, and click on a checked control can be refused.', { ref_id: str, timeout_ms: int }),
  tool('set_value', 'Set a control value via UIA SetValue (no keystrokes, no pointer movement). This is the headless text path — use it first for any text entry. Some edits reject it — only then use type.', { ref_id: str, value: str, timeout_ms: int }),
  tool('select', 'Choose an option in a list, dropdown, tab strip or radio group through SelectionItemPattern (no pixels): pass the option text as value. This is the headless way to pick a choice without clicking it.', { ref_id: str, value: str, timeout_ms: int }, ['ref_id', 'value']),
  tool('check', 'Set a checkbox or switch to checked through TogglePattern. Idempotent and no pixels; prefer it over click when the state is known.', { ref_id: str, timeout_ms: int }),
  tool('uncheck', 'Set a checkbox or switch to unchecked through TogglePattern. Idempotent and no pixels.', { ref_id: str, timeout_ms: int }),
  tool('clear', 'Clear a control value to an empty string through UIA ValuePattern (no keystrokes, no pointer movement).', { ref_id: str, timeout_ms: int }),
  tool('scroll_to', 'Scroll an element into view through ScrollItemPattern (no pixels). Use it before acting on a row that is out of view.', { ref_id: str, timeout_ms: int }),
  tool('focus_window', 'Bring a window to the front. Takes the desktop foreground, so it runs only with physical:true. Usually unnecessary: a window behind another window stays readable and clickable in the background.', { window_id: str, app: str, title: str, physical: bool }),
  tool('type', 'Type text into a text target. The adapter delivers it quietly first: the UIA value pattern on the ref (a value write - it REPLACES the value and fires no key events), then posted WM_CHAR characters to the control hit-tested from this ref\'s own live rectangle, confirmed by reading the value back. If the read-back shows the posted characters did NOT land (a XAML/WinUI/Electron control ignores WM_CHAR), with physical:true it escalates to real keystrokes in the SAME call; without consent it reports not_delivered — use set_value or pass physical:true. Keystroke synthesis is physical: it needs the window frontmost and moves the pointer, so it is the LAST rung and runs only with physical:true - consent unlocks it, it does not skip the quiet rungs. With consent the adapter raises the window with focus-window, it never clicks anything.', { ref_id: str, text: str, interval_ms: int, timeout_ms: int, physical: bool }),
  tool('press', 'Send a key chord (e.g. ctrl+s) or one key (e.g. enter, escape, a, 7) to an app/window. The window id is inferred from the window this conversation last touched when several instances share one app name. Headless first: the engine presses to the foreground queue, which fails closed for a non-frontmost app. With physical:true (or the conversation headed latch) the adapter then brings the window forward and synthesizes a real keystroke — the ONLY way a modifier chord reaches a background window. Without consent a plain key falls back to a background WM_KEYDOWN/WM_KEYUP post (mechanism post_message; a bare letter posts unshifted, so a capital arrives lower-case) and a modifier chord reports not_delivered. A posted key only proves the queue took it: re-read the app to confirm the effect; if nothing changed, pass physical:true. Never blind-repeat an unsafe delivery.', { combo: str, app: str, window_id: str, force: bool, physical: bool }),
  tool('scroll', 'Scroll a scrollable control: direction up|down|left|right, amount in lines.', { ref_id: str, direction: str, amount: int, timeout_ms: int }),
  tool('list_windows', 'List top-level windows (ids, titles, pids, responsiveness). A dialog that appeared since your last action shows up here: a modal dialog disables its owner window, so stop reading the parent — read the dialog itself with snapshot/find surface "sheet" and click a ref from that tree. The window_id is what press, restore_window and screenshot take; a find by that window_id does NOT answer while the modal owns the UI thread (measured: locator_transient_incomplete).', { app: str, timeout_ms: int }),
  tool('list_surfaces', 'Per-process surface inventory: which windows, focused windows, modal sheets and open menus each app has, with menu item counts. This is how you find a dialog or menu a window snapshot cannot show — then read it with snapshot/find using surface "sheet" or "menu". A surface that has already closed answers WINDOW_NOT_FOUND, which is confirmation, not a bug.', { app: str, timeout_ms: int }),
  tool('restore_window', 'Restore a minimized window so it has a tree to read. A background window is still readable and clickable, but a minimized one is not, so restore it first. No pointer movement and no foreground change.', { window_id: str, app: str }),
  tool('launch', 'Start an app. Bare names resolve only under System32; otherwise pass the absolute exe path. It attaches to a running instance by default; several instances of one name is AMBIGUOUS_TARGET with no pid flag, so drive the instance through its window_id instead of launching again.', { app: str, args: { type: 'array', items: str }, cwd: str, activate: bool, timeout_ms: int }),
  tool('wait', 'Pause (ms) or wait for a condition before acting: window/app/text/element. Prefer a condition over a blind pause — ms waits are the slowest way to look impatient. event window-opened|window-closed|app-launched|app-terminated|focus-changed|surface-appeared|surface-dismissed needs no id and catches dialogs and menus; menu/menu_closed wait for an open/closed menu; notification waits for a toast. A text wait can answer AMBIGUOUS_TARGET when several windows of the app qualify: narrow it with app, or use event instead. Measured: a text wait sees a CHANGED value only ~2s into the wait, so timeout_ms under 4000 usually misses a change that just happened — to confirm an action landed, read the control (find with its name, or get property value) instead of waiting for text.', { ms: int, app: str, window: str, window_id: str, element: str, text: str, timeout_ms: int, event: { type: 'string', enum: ['window-opened', 'window-closed', 'app-launched', 'app-terminated', 'focus-changed', 'surface-appeared', 'surface-dismissed'], description: 'Baseline-diff event: it detects a surface that appears or disappears during the wait without needing its id.' }, menu: str, menu_closed: str, notification: str, predicate: { type: 'string', enum: ['exists', 'enabled', 'visible', 'actionable', 'value'], description: 'Condition on element (a qualified ref), used with value/action.' }, value: str, count: int, action: str }),
  tool('screenshot', 'Capture a window/screen PNG to a file; returns the file path. Use for visual evidence only — trees are the primary signal. Pass exactly one target: screen wins over window_id, window_id wins over app.', { app: str, window_id: str, screen: int }),
  tool('ocr', 'Read text from a screenshot via Windows OCR (for canvas/games/no-a11y-tree UIs). Returns lines with SCREEN coordinates (not refs). query filters lines. Pass exactly one target: screen wins over window_id, window_id wins over app.', { app: str, window_id: str, screen: int, query: str }),
  tool('batch', `Run 1-${MAX_BATCH} planned actions on one target; stops on first error, then observes once. Each step: {action, arguments}. Native single-process actions (fast path): snapshot,find,get,is,set_value,press,scroll,scroll_to,select,check,uncheck,clear,expand,collapse,toggle,wait. click,type,focus,double_click,right_click,screenshot,ocr run step by step so each can pick its own delivery.`, { commands_json: str, stop_on_error: bool, timeout_ms: int }, ['commands_json']),
  tool('tools',
    'Manage the adapter: operation list|describe (tool surface + state), load {names} (reveal tools when the lazy preset is on), headed {on} (opts every physical path in this conversation in for five minutes; per-call physical:true is the narrower choice), overlay {on} (presentation cursor overlay), session_end {operation} (end this conversation\'s driver session).',
    { operation: str, name: str, names: { type: 'array', items: str }, on: bool }),
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/* ------------------------------------------------------- lane facts (B9) */

// What this lane really started with, published for the settings page's Status
// panel. The two lanes are separate MCP child processes, so each writes its own
// facts file into the control dir and the host's status route merges them. The
// point is the distinction between intent and fact: the settings say what should
// run, this file says what did — which native binary was found and by which rule,
// how many tools are actually exposed under the current preset, and the limits
// in force. A stale or missing file is itself the diagnostic.
const FACTS_FILE = join(PLUGIN_DIR, 'control', 'info-desktop.json');
function publishDesktopFacts() {
  try {
    let engineVersion = null;
    try { engineVersion = require('agent-desktop/package.json').version ?? null; } catch { /* engine unreadable */ }
    writeFileSync(FACTS_FILE, JSON.stringify({
      lane: 'desktop',
      engine: 'agent-desktop',
      engineVersion,
      native: NATIVE_BIN,
      // 'shim' means the npm shim is running the CLI, which is the console-window
      // shape issue #2 was about — so it must never be silent here either.
      nativeMode: NATIVE_BIN ? 'package-bin' : 'shim',
      toolPreset: state.toolPreset,
      toolsExposed: exposedTools().length,
      toolsTotal: TOOLS.length,
      engineCallTimeoutMs: state.engineCallTimeoutMs,
      leaseRetryBaseMs: state.leaseRetryBaseMs,
      screenshotDir: state.screenshotDir || DEFAULT_SHOTS_DIR,
      sessionId: state.sessionId,
      at: new Date().toISOString(),
    }, null, 2));
  } catch (error) {
    process.stderr.write(`arya desktop lane: could not publish status facts: ${error.message}\n`);
  }
}

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

// The wrapper exists so the blocked-window memo sees EVERY completed call, the steps
// of a batch included (they route back through callTool), and can retire on evidence
// the caller produced rather than on a read of its own.
async function callTool(name, args = {}) {
  const envelope = await dispatchTool(name, args);
  try { clearBlockedMemoOnObservation(name, args, envelope); } catch { /* memo hygiene only */ }
  return envelope;
}

async function dispatchTool(name, args = {}) {
  currentRefId = typeof args?.ref_id === 'string' && args.ref_id.trim() ? args.ref_id : null;
  if (INPUT_TOOLS.has(name)) {
    const stopped = stoppedSeriesMessage();
    if (stopped) return stoppedResult(name, stopped);
  }
  if (REF_ARG_TOOLS.has(name) && (typeof args.ref_id !== 'string' || !args.ref_id.trim())) {
    return {
      version: '2.6',
      ok: false,
      command: name,
      error: {
        code: 'INVALID_ARGS',
        message: `'${name}' needs a ref_id: expected @<snapshot_id>:e<N> from a snapshot or find`,
        suggestion: 'Read the window first (snapshot, or find with a name/role), then pass the ref_id it returns. Refs go stale when the window changes: re-read, then act on the fresh ref.',
        disposition: { delivery: 'not_delivered', retry: 'safe' },
      },
    };
  }
  // A retry of an action on a window the previous refusal proved blocked does not
  // get to re-burn the engine's actionability budget (22.7 s and up, and no flag
  // shortens it): it answers in ~150 ms with the blocker named, or the memo is
  // dropped because the popup is gone. See blockedMemoHit.
  if (REF_BUDGET_TOOLS.has(name) && currentRefId) {
    // Deliberately OUTSIDE enqueue(): this is a Map lookup with no engine call,
    // and the queue is the serializer for engine work. Queued, this refusal paid
    // 6239 ms in run 13 while an unrelated engine call held the queue — which is
    // the same cost the memo exists to remove. Reading nothing and queueing
    // behind a read amount to the same latency.
    const hit = blockedMemoHit();
    if (hit) {
      const blocker = hit.blocker;
      return {
        version: '2.6',
        ok: false,
        command: name,
        error: {
          code: 'TIMEOUT',
          message: blocker
            ? `The window that owns this application's input is "${blocker.title ?? blocker.window_id}" (${blocker.window_id}), so the target's own window is disabled and ${name} was not sent — and nothing was posted either, because a posted message can still fire a disabled control.`
            : `A refusal ${hit.ageMs} ms ago found this target's window disabled, so ${name} was not sent. No window on top could be named when that was measured and this call re-read nothing, so the refusal stands while it is fresh — if you believe the block is gone, re-read the window (snapshot, timeout_ms 15000) instead of repeating the action.`,
          suggestion: blocker
            ? 'Drive the thing on top instead: snapshot with surface "sheet" (or with that window_id) and timeout_ms 15000, then click a ref from that tree. A menu closes by clicking one of its items, or by Escape posted to the menu window itself.'
            : 'Do not retry the disabled window and do not post to it: re-read it with a fresh snapshot (timeout_ms 15000) and act on what the tree shows, or look for a popup this lane cannot inventory (list_surfaces).',
          details: {
            blocking_windows: blocker ? [blocker] : [],
            kind: 'owner_blocked',
            memo_age_ms: hit.ageMs,
            ...(blocker && !hit.unconfirmed ? {} : { blocker_unconfirmed: true }),
          },
          disposition: { delivery: 'not_delivered', retry: 'safe' },
        },
        hint: `This refusal repeats one from ${hit.ageMs} ms ago: the first refusal of a blocked window costs the engine's whole wait budget, this one is answered from that measurement${blocker ? ' with the blocker named' : ' without any read'}. Do not retry the disabled window.`,
      };
    }
  }
  switch (name) {
    case 'snapshot':
      return enqueue(async () => {
        await ensureSession();
        const surface = args.surface ?? null;
        const scope = observeScope(args, { surface });
        const envelope = parseEnvelope(await runCli(['snapshot', ...flagArgs([
          ['--app', scope.app], ['--window-id', scope.window_id], ['--compact', args.compact],
          ['--skeleton', args.skeleton], ['--interactive-only', args.interactive_only],
          ['--max-depth', args.max_depth], ['--root', args.root], ['--timeout-ms', observationTimeout(args, surface)],
          ['--surface', surface], ['-w', args.wait_for], ['--wait-for-gone', args.wait_for_gone],
          ['--wait-timeout', args.wait_timeout],
        ])]));
        // The refs' advertised patterns are what a refused click retries under,
        // so the tree is indexed here rather than re-read per action.
        if (envelope.ok === true) {
          indexSnapshot(envelope.data, scope.window_id, surface);
          if (envelope.data?.window?.id) state.windowId = envelope.data.window.id;
          annotateObservation(envelope, scope);
          // A read that came back cut short is the engine saying it could not
          // finish walking this window in its budget. Left as-is it reads like an
          // empty window — and an unproven ref then refuses every later action
          // with identity_not_unique (the audited session burned 16 s on exactly
          // that retry). Say what to raise instead.
          if (envelope.data?.identity_unproven === true || envelope.data?.truncated === true) {
            envelope.hint = `${envelope.hint ? `${envelope.hint} ` : ''}This tree is incomplete${envelope.data.identity_unproven === true ? ' and its refs are not proven unique' : ''}: the window could not be read within ${args.timeout_ms ?? (surface ? 15000 : 3000)} ms. Do not act on these refs yet — re-read with a larger timeout_ms (a dialog behind a modal app needs 15000-20000), or narrow the read with root/surface.${envelope.data.ref_count <= 2 ? ' If a second read is still this tiny, this window exposes no tree to this lane: stop reading it and drive it blind with press {combo:"escape"} or {combo:"enter"} on its own window_id (measured: the key lands on the dialog box itself, so enter fires its default button and closes it, and escape lands only where the box has a Cancel button).' : ''}`;
          }
        }
        // An empty or cut-short read of a window a dialog owns is a SILENT
        // failure: run 8 measured find --name FileMenu answering no match at all
        // with a QA MessageBox up. Name what is on top rather than let the caller
        // poll for pixels.
        if (envelope.ok === true && (envelope.data?.ref_count === 0
          || envelope.data?.truncated === true || envelope.data?.identity_unproven === true)) {
          attachBlindReadNote(envelope, await blockerForBlindRead(scope));
        } else if (envelope.ok !== true && surface && NO_FOCUS_READ.test(envelope.error?.message ?? '')) {
          return attachDialogHint(envelope, await blockerForBlindRead(scope), NO_FOCUS_REMEDY);
        }
        return envelope;
      });
    case 'find':
      return enqueue(async () => {
        await ensureSession();
        const surface = args.surface ?? null;
        const scope = observeScope(args, { surface });
        // --first/--last/--nth fight --limit (the engine answers INVALID_ARGS),
        // and it already caps at 50 on its own, so a cap is passed only when it
        // cannot collide with a positional selector.
        const positional = args.first === true || args.last === true
          || (args.nth !== undefined && args.nth !== null && args.nth !== '');
        const limit = positional || args.count === true ? undefined : args.limit;
        const envelope = parseEnvelope(await runCli(['find', ...flagArgs([
          ['--app', scope.app], ['--window-id', scope.window_id], ['--name', args.name],
          ['--role', args.role], ['--text', args.text], ['--value', args.value],
          ['--native-id', args.native_id], ['--description', args.description],
          ['--first', args.first], ['--last', args.last], ['--nth', args.nth],
          ['--limit', limit], ['--count', args.count], ['--exact', args.exact],
          ['--root', args.root], ['--timeout-ms', observationTimeout(args, surface)],
          ['--surface', surface], ['-w', args.wait_for], ['--wait-for-gone', args.wait_for_gone],
          ['--wait-timeout', args.wait_timeout],
        ])]));
        if (envelope.ok === true) {
          annotateObservation(envelope, scope);
          // A find match names its window only by title (path[0] = window:<title>),
          // and that title resolves against the window records this adapter keeps.
          // One app-scoped list-windows (~50 ms) is what lets a later background
          // click post to that element's real HWND instead of the last window this
          // call site happened to touch.
          if (scope.app && !knowsApp(scope.app)) await listWindowsNow(scope.app);
          const resolved = indexFindResult(envelope.data, scope.window_id, surface);
          if (scope.window_id) state.windowId = scope.window_id;
          else if (resolved) state.windowId = resolved;
          // A find answering NO MATCH on a window a dialog owns is the same silent
          // failure as the empty read above: run 8 measured FileMenu and
          // FileDialogBtn both returning null with a QA MessageBox up. A --count
          // request legitimately answers a number, so it is not an empty read.
          const empty = args.count !== true && !envelope.data?.match
            && !(Array.isArray(envelope.data?.matches) ? envelope.data.matches.length : 0);
          if (empty) attachBlindReadNote(envelope, await blockerForBlindRead(scope));
        } else if (envelope.ok !== true && surface && NO_FOCUS_READ.test(envelope.error?.message ?? '')) {
          return attachDialogHint(envelope, await blockerForBlindRead(scope), NO_FOCUS_REMEDY);
        }
        return envelope;
      });
    case 'get':
      return enqueue(async () => parseEnvelope(await runCli(['get', args.ref_id, ...flagArgs([['--property', args.property]])])));
    case 'is':
      return enqueue(async () => parseEnvelope(await runCli(['is', args.ref_id, ...flagArgs([['--property', args.property]])])));
    case 'click':
      return enqueue(async () => {
        await ensureSession();
        const known = new Set(windowBounds.keys());
        // Ladder: semantic click -> the ref's own patterns -> a posted
        // background click -> (consent only) a real pointer click. Physical is
        // the LAST rung even when it was asked for: `physical: true` permits
        // moving the user's pointer, it does not ask for it first. The one
        // exception is a repeat call on a ref this adapter already posted to,
        // which is the caller saying the posted message was ignored.
        const primary = parseEnvelope(await runCli(['click', args.ref_id, ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])]));
        if (primary.ok === true) return withMechanism(primary, 'semantic', [], 'Semantic delivery: the control ran its own pattern, so the pointer and the foreground were left alone.');
        // The click may have landed even though the engine could not verify it.
        // Nothing below this point may run: every rung would press the same
        // control again. See deliveryUncertain.
        if (deliveryUncertain(primary)) {
          return attachDialogHint(stopForUncertain(primary, 'click'), await dialogHint(known));
        }
        // The window itself is disabled — a dialog owns this app's UI thread, or
        // the control itself answers that it is not enabled. Stop here: the
        // semantic alternatives would each burn the actionability budget again on
        // the same blocked window (6186 ms measured at a 5000 ms budget), and a
        // posted click can still fire a disabled control, which is how one
        // modal-opener click ends up opening two dialogs.
        if (primary.error?.details?.kind === 'actionability_timeout' || disabledTarget(primary)) {
          return await stopForDisabled(primary, 'the click', known);
        }
        const consent = physicalAllowed(args);
        const fallbackFrom = refusalSummary(primary);
        if (consent && postedRecently(args.ref_id)) {
          const physical = await physicalPointer('click', args.ref_id);
          if (physical?.ok === true) {
            physical.data.fallback_from = fallbackFrom;
            physical.data.note = 'Physical input on your request: this control had already been posted to without effect, so the real pointer moved and the target window took the foreground.';
            return physical;
          }
        }
        // A busy desktop interaction lease refuses every engine call the same way
        // (lock_timeout, e.g. while another launch is waiting for its window), so
        // in that case the background click is tried before alternatives that
        // cannot run. Nothing is skipped on any other refusal — except a window
        // that answered actionability_timeout, which is disabled by a dialog on
        // top of it: every further engine rung would burn its whole budget again.
        const leaseHeld = fallbackFrom?.kind === 'lock_timeout';
        const blockedWindow = fallbackFrom?.kind === 'actionability_timeout';
        let alternative = { envelope: null, attempted: [], mechanism: null };
        if (!leaseHeld && !blockedWindow) {
          alternative = await trySemanticAlternatives(args.ref_id, actionBudgetMs(args, args.ref_id));
          if (alternative.envelope) {
            return withMechanism(alternative.envelope, alternative.mechanism, alternative.attempted, `The semantic click was refused (${primary.error?.code ?? 'failed'}); the same control answered ${alternative.mechanism} instead.`, fallbackFrom);
          }
        }
        const posted = await postedPointer('click', args.ref_id, 'click');
        if (posted.envelope) {
          postedClicks.set(String(args.ref_id), Date.now());
          if (fallbackFrom) posted.envelope.data.fallback_from = fallbackFrom;
          if (leaseHeld) {
            posted.envelope.data.note = 'The engine could not take the desktop interaction lease (another action holds it), so the click was posted to the control window instead: the adapter never moved the pointer or raised the window. The app can still take focus itself while it handles the message, so read data.pointer.foreground_changed.';
          }
          return posted.envelope;
        }
        if (leaseHeld) {
          alternative = await trySemanticAlternatives(args.ref_id, actionBudgetMs(args, args.ref_id));
          if (alternative.envelope) {
            return withMechanism(alternative.envelope, alternative.mechanism, alternative.attempted, `The semantic click was refused (${primary.error?.code ?? 'failed'}); the same control answered ${alternative.mechanism} instead.`, fallbackFrom);
          }
        }
        let physicalFailure = null;
        if (consent) {
          const physical = await physicalPointer('click', args.ref_id);
          if (physical?.ok === true) {
            physical.data.fallback_from = fallbackFrom;
            physical.data.note = 'Physical input on your request, after the semantic patterns and the background posted click both refused: the real pointer moved and the target window took the foreground.';
            return physical;
          }
          physicalFailure = physical?.error ?? { code: 'ACTION_FAILED', message: 'no live element rectangle for this ref, so no physical click was attempted: re-read the window and act on the ref it returns', details: {} };
        }
        return attachDialogHint(annotateRefusal(primary, alternative.attempted, posted.reason, physicalFailure, refRecord(args.ref_id)), await dialogHint(known));
      });
    case 'select':
      return enqueue(async () => {
        await ensureSession();
        const known = new Set(windowBounds.keys());
        const envelope = await engineAction(['select', args.ref_id, String(args.value ?? ''), ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])]);
        if (envelope.ok === true) return envelope;
        // The same two stops as the click ladder, before anything is re-delivered.
        if (deliveryUncertain(envelope)) {
          return attachDialogHint(stopForUncertain(envelope, 'select'), await dialogHint(known));
        }
        if (envelope.error?.details?.kind === 'actionability_timeout' || disabledTarget(envelope)) {
          return await stopForDisabled(envelope, 'select', known);
        }
        // A list item that exposes no SelectionItemPattern still selects on a
        // click: run 5 measured ACTION_NOT_SUPPORTED 'Select or Click is not
        // available' on a WinForms ListBox item and the model had no way around
        // it. The intent of `select` IS to select, so a background click on that
        // item is the same quiet rung the click ladder ends on — unlike
        // check/uncheck, which stay excluded because they would flip whatever
        // state already exists (AGENTS rule 7).
        if (envelope.error?.code === 'ACTION_NOT_SUPPORTED') {
          const posted = await postedPointer('click', args.ref_id, 'click');
          if (posted.envelope) {
            postedClicks.set(String(args.ref_id), Date.now());
            posted.envelope.data.fallback_from = refusalSummary(envelope);
            posted.envelope.data.note = "The engine's select was refused (no SelectionItem pattern on this control), so the item was clicked in the background instead: no pointer movement and no foreground change. Verify the selection by re-reading the item's states.";
            return posted.envelope;
          }
          envelope.hint = `select was refused and a background click could not run either: ${posted.reason}.`;
        }
        return attachDialogHint(envelope, await dialogHint(known));
      });
    case 'expand':
    case 'collapse':
    case 'toggle':
    case 'check':
    case 'uncheck':
    case 'clear':
    case 'scroll_to':
      return enqueue(async () => {
        await ensureSession();
        const known = new Set(windowBounds.keys());
        const envelope = await engineAction([NATIVE_BATCH_COMMANDS.get(name), args.ref_id, ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])]);
        if (envelope.ok === true) return envelope;
        // Same contract as the click ladder: an outcome the engine calls
        // uncertain may already have changed the control, and the posted click
        // below would change it a second time.
        if (deliveryUncertain(envelope)) {
          return attachDialogHint(stopForUncertain(envelope, name), await dialogHint(known));
        }
        // Same contract as the click ladder: a disabled window answers
        // actionability_timeout or the not-enabled refusal outright, and the
        // posted click below would fire (or silently no-op on) a control the
        // application has already disabled.
        if (envelope.error?.details?.kind === 'actionability_timeout' || disabledTarget(envelope)) {
          return await stopForDisabled(envelope, name, known);
        }
        // An expander or tree item that exposes no ExpandCollapsePattern still
        // opens on a click, so the background click is the same fallback the
        // click ladder uses ('Expand is not available' was ACTION_NOT_SUPPORTED
        // eight times in the exported session and the model had no way around
        // it).
        if (PATTERN_CLICK_FALLBACK.has(name)) {
          const posted = await postedPointer('click', args.ref_id, 'click');
          if (posted.envelope) {
            postedClicks.set(String(args.ref_id), Date.now());
            posted.envelope.data.fallback_from = refusalSummary(envelope);
            posted.envelope.data.note = `The engine's ${name} was refused (${envelope.error?.code ?? 'failed'}), so the control was clicked in the background instead: no pointer movement and no foreground change. Verify by re-reading.`;
            return posted.envelope;
          }
          envelope.hint = `${name} was refused and a background click could not run either: ${posted.reason}.`;
        }
        return attachDialogHint(envelope, await dialogHint(known));
      });
    case 'focus':
      return enqueue(async () => {
        // Refuse before the session start: a call that cannot run without the
        // user's consent must not pay for an engine session it will not use.
        if (!physicalAllowed(args)) return physicalRefusal('focus', 'UIA SetFocus on Windows');
        await ensureSession();
        const focused = withMechanism(
          parseEnvelope(await runCli(['focus', args.ref_id, ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])], { headed: true })),
          'physical_synthetic',
          [],
          'Physical input: the target window took the desktop foreground.',
        );
        if (focused.ok !== true && leaseBusy(focused)) focused.hint = `${LEASE_BUSY_NOTE} The foreground was not changed.`;
        return focused;
      });
    case 'double_click':
    case 'right_click':
      return enqueue(async () => {
        await ensureSession();
        const known = new Set(windowBounds.keys());
        const nature = name === 'right_click' ? 'A right-click' : 'A double-click';
        const mode = name === 'right_click' ? 'right' : 'double';
        const what = name === 'right_click' ? 'right-click' : 'double-click';
        const refWindow = refRecord(args.ref_id)?.windowId ?? state.windowId;
        const app = appOfWindow(refWindow);
        // Baselines for the post-posting observation: a right-click's defining
        // effect is a context-menu surface; a double-click often opens a window or
        // surface. Capture before, compare after — Vercel's contract is to observe
        // the app, not to trust the queue-accept return code.
        const beforeMenus = name === 'right_click' && app ? await menuSurfaceIds(app) : null;
        const beforeSurfaces = name === 'double_click' && app ? await surfaceIds(app) : null;
        // Windows has no headless double-click or right-click in the engine, so
        // the posted background message is the first delivery: the user's cursor and
        // foreground stay exactly where they left them. A real click runs only
        // with consent, and only after the posted path is shown not to work —
        // or immediately, when this same ref was posted to moments ago and the
        // caller came back, which is how a model says "the app ignored it".
        if (physicalAllowed(args) && postedRecently(args.ref_id)) {
          const physical = await physicalClick(name, args);
          if (physical?.ok === true) {
            physical.data.note = `Physical input on your request: this control had already been posted to without effect, so the real ${what} moved the pointer and took the foreground.`;
            return physical;
          }
          if (deliveryUncertain(physical)) return attachDialogHint(stopForUncertain(physical, name), await dialogHint(known));
        }
        const posted = await postedPointer(name, args.ref_id, mode);
        if (posted.envelope) {
          postedClicks.set(String(args.ref_id), Date.now());
          if (name === 'right_click' && beforeMenus) {
            const added = newKeys(await menuSurfaceIds(app), beforeMenus);
            if (added.length) {
              return markPostedVerified(posted.envelope, `Background right-click: WM_RBUTTON went to the control under the element and a context-menu surface appeared (${added.join(', ')}), so the right-click registered. The pointer never moved and the window was never raised. Read the menu with surface "menu" and act on its item refs.`);
            }
            // No menu appeared: the right-click's defining effect is absent. Under
            // consent the engine's headed physical click is the reliable recovery;
            // without it, an honest not_delivered the caller can act on.
            if (physicalAllowed(args)) {
              const physical = await physicalClick(name, args);
              if (physical?.ok === true) {
                physical.data.fallback_from = { code: 'posted_no_effect', message: 'the posted right-click opened no context-menu surface', kind: 'posted_no_effect' };
                physical.data.note = 'Physical right-click on your request: the posted right-click opened no menu, so the engine\'s headed right-click delivered a real right-click and the window took the foreground. Read the menu surface (surface "menu") to confirm and act on its items.';
                return physical;
              }
              if (deliveryUncertain(physical)) return attachDialogHint(stopForUncertain(physical, name), await dialogHint(known));
            }
            const noEffect = postedNoEffect(name, what, 'no context-menu surface appeared after the post');
            noEffect.hint = 'A right-click that opens no menu did not achieve its purpose. Re-read the window (the control may have no context menu), or pass physical:true to deliver a real right-click. If a menu IS open, read it with surface "menu".';
            return attachDialogHint(noEffect, await dialogHint(known));
          }
          if (name === 'double_click' && beforeSurfaces) {
            // A new window or surface means something opened — the double-click
            // registered. listWindowsNow remembers the new windows as it reads.
            const afterWindows = await listWindowsNow(app);
            const newWindows = afterWindows.filter((w) => w?.id && !known.has(String(w.id))).map((w) => `window ${w.id}`);
            const newSurfaces = newKeys(await surfaceIds(app), beforeSurfaces).map((s) => `surface ${s}`);
            const opened = [...newWindows, ...newSurfaces];
            if (opened.length) {
              return markPostedVerified(posted.envelope, `Background double-click: WM_LBUTTONDBLCLK went to the control under the element and something opened (${opened.join(', ')}), so the double-click registered. The pointer never moved. Read the new window/surface to continue.`);
            }
          }
          // The effect is varied (edit mode, selection, launch) or the app is unknown,
          // so it is not cheaply provable: report unverified honestly and name the
          // recovery, never a blind physical escalation. A repeat call on this ref
          // with consent (postedRecently) goes straight to the real pointer.
          posted.envelope.data.note = `Background ${what}: WM_* messages went to the control under the element, so the pointer never moved and the window was never raised. The effect was not observed (a ${what} can enter edit mode or change selection without opening anything). Re-read the control to confirm; if nothing changed, call again with physical:true so the adapter uses the real pointer, or act on a control that exposes a semantic action.`;
          return posted.envelope;
        }
        if (physicalAllowed(args)) {
          const physical = await physicalClick(name, args);
          if (physical?.ok === true) {
            physical.data.note = `Physical input on your request, after the posted ${what} could not be delivered: the real pointer moved and the target window took the foreground.`;
            return physical;
          }
          if (deliveryUncertain(physical)) return attachDialogHint(stopForUncertain(physical, name), await dialogHint(known));
          // Consent is already in hand, so answering POLICY_DENIED here would be
          // false: what stopped the real click is a missing rectangle or the
          // engine's own refusal, not the policy (AGENTS rule 6). The old code also
          // returned error OBJECTS where the caller reads an envelope, so the hint
          // landed on the wrong object. Report the real reason in envelope shape.
          const refusedPhysical = {
            version: '2.6',
            ok: false,
            command: name,
            error: {
              code: physical?.error?.code ?? 'ACTION_FAILED',
              message: `${nature} was not delivered: ${physical?.error?.message ?? 'no live element rectangle for this ref, so no physical click was attempted'}`,
              suggestion: 'Re-read the window (snapshot, or find with the name of the control) and act on the ref it returns. If the target is a surface this lane cannot read, report that instead of inventing coordinates.',
              details: {
                ...(physical?.error?.details ?? {}),
                kind: physical?.error?.details?.kind ?? 'no_live_element_bounds',
                physical_attempted: true,
              },
              disposition: { delivery: 'not_delivered', retry: 'safe' },
            },
          };
          refusedPhysical.hint = `Neither a background posted ${what} nor the physical one you asked for could run: ${posted.reason}.`;
          if (leaseBusy(physical)) refusedPhysical.hint = `${LEASE_BUSY_NOTE} Retry in a moment.`;
          return attachDialogHint(refusedPhysical, await dialogHint(known));
        }
        const refused = physicalRefusal(name, nature);
        refused.hint = `A background posted ${what} could not run either: ${posted.reason}.`;
        return attachDialogHint(refused, await dialogHint(known));
      });
    case 'focus_window':
      return enqueue(async () => {
        if (!physicalAllowed(args)) return physicalRefusal('focus_window', 'Bringing a window to the front');
        const raised = withMechanism(
          parseEnvelope(await runCli(['focus-window', ...flagArgs([['--window-id', args.window_id], ['--app', args.app], ['--title', args.title]])], { headed: true })),
          'physical_synthetic',
          [],
          'Physical input: the desktop foreground changed.',
        );
        if (raised.ok !== true && leaseBusy(raised)) raised.hint = `${LEASE_BUSY_NOTE} The foreground was not changed.`;
        return raised;
      });
    case 'set_value':
      return enqueue(async () => {
        const known = new Set(windowBounds.keys());
        const envelope = await engineAction(['set-value', args.ref_id, String(args.value ?? ''), ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])]);
        if (envelope.ok === true) return envelope;
        // A control its app has disabled (a popup on top of its window) answers
        // UIA_E_ELEMENTNOTENABLED; the refusal has to name what is on top or the
        // model re-reads and re-writes the same disabled control forever.
        if (disabledTarget(envelope)) return await stopForDisabled(envelope, 'the value write', known);
        return attachDialogHint(envelope, await dialogHint(known));
      });
    case 'type':
      return enqueue(async () => {
        await ensureSession();
        // Engine fact on Windows: headless `type` is POLICY_DENIED — keystroke
        // synthesis is headed-only and needs the window frontmost. That is NOT the
        // same claim as "text needs the user's keyboard": two quiet rungs deliver
        // text first, and the window is raised with the engine's own raise
        // primitive, never with a click (the old click-to-promote pressed a
        // control nobody had asked to press).
        const text = String(args.text ?? '');
        if (!text) {
          return { version: '2.6', ok: false, command: 'type', error: { code: 'INVALID_ARGS', message: 'type needs text', disposition: { delivery: 'not_delivered', retry: 'safe' } } };
        }
        const known = new Set(windowBounds.keys());
        const attempts = [];
        const record = refRecord(args.ref_id);
        const actions = record?.actions;
        // Rung 1: the UIA value pattern. It names the control this ref identifies,
        // which is more precise than whatever happens to hold the keyboard focus,
        // and it never moves the pointer or takes the foreground. A ref that came
        // from `find` carries no action list at all (actionsUnknown, the same
        // convention mayTry honours), so it is tried here too: refusing on an
        // empty list is how a rung that would have worked gets skipped.
        if (record?.actionsUnknown === true || actions == null || actions.includes('set-value')) {
          const written = await engineAction(['set-value', args.ref_id, text, ...flagArgs([['--timeout-ms', actionBudgetMs(args, args.ref_id)]])]);
          if (written.ok === true) {
            written.command = 'type';
            written.data = written.data ?? {};
            written.data.mechanism = 'value_pattern';
            written.data.requested = 'type';
            written.data.note = "Delivered through the UIA value pattern, not as keystrokes: this REPLACES the control's value and fires no key event, so no accelerator or autocomplete ran. If the app needs real key events for the text to take effect, say so to the user: keystroke synthesis is physical and needs their consent.";
            if (attempts.length) written.data.fallback_from = attempts;
            return written;
          }
          attempts.push(`set-value: ${written.error?.code ?? 'failed'}${written.error?.details?.kind ? '/' + written.error.details.kind : ''}`);
        }
        // Rung 2: post the string as WM_CHAR to the control hit-tested from this
        // ref's own live rectangle (the focused control only as a fallback), then
        // read the value back, because a surface with no Win32 message loop
        // ignores posted characters.
        const hwnd = windowHandle(record?.windowId ?? state.windowId);
        if (hwnd) {
          // Aim at the control this ref names, hit-tested from its own live
          // rectangle; the thread's focused control is the fallback when the
          // engine would not give a live rect, never the primary aim.
          const point = await elementPoint(args.ref_id);
          const report = await runQuietPointer({ mode: 'text', hwnd, text, x: point?.x, y: point?.y });
          if (report && report.ok === true) {
            const back = await engineAction(['get', args.ref_id, '--property', 'value']);
            const observed = typeof back.data?.value === 'string' ? back.data.value : null;
            const landed = observed != null && (observed === text || observed.includes(text));
            if (landed) {
              const envelope = {
                version: '2.6',
                ok: true,
                command: 'type',
                data: {
                  action: 'type',
                  mechanism: 'post_message',
                  chars_posted: report.chars_posted ?? text.length,
                  target_source: report.target_source ?? null,
                  verified: true,
                  steps: [{ label: 'PostMessage.WM_CHAR', mechanism: 'background_synthetic', outcome: 'succeeded', verified: true }],
                  disposition: { delivery: 'delivered_verified', retry: 'unsafe' },
                  pointer: { cursor_moved: report.cursor_moved === true, foreground_changed: report.foreground_changed === true },
                  target: report.target ?? null,
                  value_observed: observed,
                  note: 'Background typing: each character was posted as WM_CHAR to the control hit-tested from this ref, so no keystroke was synthesized, the pointer did not move and the foreground never changed. The value read-back confirms it landed.',
                },
              };
              if (attempts.length) envelope.data.fallback_from = attempts;
              return envelope;
            }
            // The queue accepted the characters but the value read-back does not
            // show them: the control ignores posted WM_CHAR (a XAML/WinUI/Electron
            // surface has no Win32 edit behind it). This is a provable no-effect,
            // NOT a success — the old ladder returned ok:true / retry:unsafe here
            // and trapped the caller. Under consent, fall through to the engine's
            // headed keystroke path; without it, report not_delivered honestly.
            attempts.push('posted text: value read-back does not show the characters (control ignores WM_CHAR)');
            if (!physicalAllowed(args)) {
              const noEffect = postedNoEffect('type', 'typing', 'the value read-back does not show the posted characters');
              noEffect.error.details.headless_attempts = attempts;
              if (observed != null) noEffect.error.details.value_observed = observed;
              const headless = (actions ?? []).filter((a) => a === 'set-value' || a === 'clear');
              if (headless.length) noEffect.error.details.headless_available = headless;
              noEffect.hint = 'The control did not take the posted characters. Use set_value (headless UIA write) if it exposes a value pattern, or pass physical:true to synthesize real keystrokes (the window is brought forward). Repeating type may duplicate text.';
              return attachDialogHint(noEffect, await dialogHint(known));
            }
            // Consent present: fall through to the headed keystroke path below.
          } else {
            attempts.push(`posted text: ${report?.error ?? 'failed'}`);
          }
        }
        if (!physicalAllowed(args)) {
          const refused = physicalRefusal('type', 'Keystroke synthesis');
          refused.error.details = refused.error.details ?? {};
          if (attempts.length) refused.error.details.headless_attempts = attempts;
          const headless = (actions ?? []).filter((a) => a === 'set-value' || a === 'clear');
          if (headless.length) refused.error.details.headless_available = headless;
          refused.error.suggestion = attempts.length
            ? `Both quiet rungs failed: ${attempts.join('; ')}. Keystroke synthesis is physical: it moves the pointer and takes the foreground. Pass physical:true on this one call only if the user agreed to hand over the keyboard, and otherwise report that the text could not be entered.`
            : 'This control advertises no value pattern, so text cannot be written headlessly. Pass physical:true on this one call only if the user agreed to hand over the keyboard, and otherwise report that the text could not be entered.';
          return attachDialogHint(refused, await dialogHint(known));
        }
        // Consent is in hand and both quiet rungs have already failed, so physical
        // is the last rung here and not the reflex (AGENTS.md rule 7).
        const promote = await raiseForPhysical(args.ref_id);
        if (promote) {
          promote.hint = leaseBusy(promote)
            ? `${LEASE_BUSY_NOTE} Nothing was typed. Retry in a moment, or use set_value (headless UIA write), which never needs the foreground path.`
            : 'The target window could not be brought to the foreground, so physical typing would land in whatever window the user has in front. Use set_value (headless UIA write) or clear instead.';
          return promote;
        }
        // The engine's own type budget is 5000 + 30 ms per character, and it
        // covers resolution as well as delivery, so a ref from a surface read
        // needs the wider resolution ceiling added on top of the per-character part.
        const typeBudget = args.timeout_ms ?? (refRecord(args.ref_id)?.surfaceRead === true
          ? SURFACE_ACTION_BUDGET_MS + 30 * text.length
          : undefined);
        const envelope = parseEnvelope(await runCli(['type', args.ref_id, text, ...flagArgs([['--interval-ms', args.interval_ms], ['--timeout-ms', typeBudget]])], { headed: true }));
        if (envelope.ok !== true) envelope.hint = 'Keystroke synthesis is physical: it moves the pointer and focuses the window. Prefer set_value, which writes through the UIA value pattern headless.';
        if (envelope.ok === true && attempts.length) {
          envelope.data = envelope.data ?? {};
          envelope.data.fallback_from = attempts;
        }
        return envelope;
      });
    case 'press':
      return enqueue(async () => {
        await ensureSession();
        const known = new Set(windowBounds.keys());
        // The engine sends keys to an app's process without focusing it, but two
        // running instances of one app name leave it no target to pick, and it
        // refuses (eight Enter presses lost to that in the exported session).
        // When this conversation already touched a window of that app, name it.
        const argv = ['press', args.combo, ...flagArgs([
          ['--app', args.app],
          ['--window-id', args.window_id ?? windowIdForApp(args.app)],
          ['--force', args.force],
        ])];
        // Headless first: the engine posts the key to the app's process without
        // taking the foreground, which works when that window already has focus.
        const envelope = await engineAction(argv, { retries: 1 });
        if (envelope.ok === true) return await confirmKeyOnDialog(envelope, args);
        // The engine could not confirm the key's effect but says the outcome is
        // uncertain: a posted Enter/Escape would then be a second key press —
        // in a dialog that means a second default-button activation.
        if (deliveryUncertain(envelope)) return stopForUncertain(envelope, 'key press');
        // A window a popup has disabled cannot act on a key either, and a posted
        // key into it is measured dead weight: stop and name the surface instead.
        if (disabledTarget(envelope)) return await stopForDisabled(envelope, 'the key press', known);
        // The engine refuses a key it cannot aim: a background window's focus is
        // unproven, or a modifier chord needs the real keyboard state. Under consent
        // the engine's OWN headed path is the reliable delivery — it brings the named
        // window forward and synthesizes the keystroke, which works for chords and
        // background windows alike. This is the rung the old adapter lacked entirely:
        // per-call physical:true was ignored for press (only the conversation headed
        // latch enabled --headed), so a Ctrl+A / Alt+letter to a background window
        // always dead-ended at "this combo is not a plain key". Physical stays the
        // LAST rung — the headless engine call above was tried first (AGENTS rule 7).
        if (physicalAllowed(args)) {
          const headed = await engineAction(argv, { headed: true, retries: 1 });
          if (headed.ok === true) {
            const confirmed = await confirmKeyOnDialog(headed, args);
            return withMechanism(confirmed, 'physical_synthetic', [refusalSummary(envelope)].filter(Boolean), 'Physical input on your request: the headless engine could not aim the key, so the engine brought the target window forward and synthesized the keystroke. Real keyboard state was used, so modifier chords work.');
          }
          if (deliveryUncertain(headed)) return stopForUncertain(headed, 'key press');
          if (disabledTarget(headed)) return await stopForDisabled(headed, 'the key press', known);
          // The headed delivery refused too: fall through to the posted plain-key
          // path and, failing that, an honest refusal naming what blocked it.
        }
        // Headless plain-key posting: a window's own dialog loop routes
        // Enter/Escape/Tab to its default button with no synthesized keystroke.
        const posted = await postedKey(args.combo, args.window_id ?? state.windowId);
        if (posted.envelope) {
          posted.envelope.data.fallback_from = refusalSummary(envelope);
          return posted.envelope;
        }
        // A modifier chord cannot be posted (it needs real modifier state) and the
        // headless engine refused: name the headed remedy instead of dead-ending.
        envelope.hint = physicalAllowed(args)
          ? `The engine refused the key and the headed delivery could not run either (${posted.reason}). Pass window_id so the adapter can target the window, or snapshot the dialog and click its buttons instead.`
          : `The engine refused the key (${envelope.error?.code ?? 'failed'}), and ${posted.reason}. A modifier chord or a background window needs the engine's headed path: pass physical:true on this call (or tools {operation:"headed",on:true}) so the window is brought forward and the keystroke is synthesized. For a plain Enter/Escape/Tab on a dialog, pass window_id so it can be posted headlessly.`;
        return attachDialogHint(envelope, await dialogHint(known));
      });
    case 'scroll':
      return enqueue(async () => {
        const known = new Set(windowBounds.keys());
        const envelope = await engineAction(['scroll', args.ref_id, ...flagArgs([['--direction', args.direction], ['--amount', args.amount], ['--timeout-ms', actionBudgetMs(args, args.ref_id)]])]);
        if (envelope.ok === true) return envelope;
        if (disabledTarget(envelope)) return await stopForDisabled(envelope, 'the scroll', known);
        return envelope;
      });
    case 'list_windows':
      return enqueue(async () => parseEnvelope(await runCli(['list-windows', ...flagArgs([['--app', args.app], ['--timeout-ms', args.timeout_ms]])])));
    case 'list_surfaces':
      // The dialog/menu inventory a window snapshot cannot give: per-process
      // window, focused and sheet entries, plus an open menu with item_count.
      // This command takes --app and the global flags ONLY: a measured
      // `--timeout-ms` here answers INVALID_ARGS 'unexpected argument' in 22 ms,
      // so its internal deadline cannot be widened from the adapter. While a
      // modal owns the app's UI thread it can therefore time out — the hint
      // below sends the caller to list_windows, which does answer.
      return enqueue(async () => {
        const envelope = parseEnvelope(await runCli(['list-surfaces', ...flagArgs([['--app', args.app]])]));
        if (envelope.ok !== true && envelope.error?.code === 'TIMEOUT') {
          envelope.hint = `${envelope.hint ? `${envelope.hint} ` : ''}This read has a fixed internal deadline and can time out while a modal dialog owns the application's UI thread. snapshot with surface "sheet" (or "focused") and timeout_ms 15000 does answer in that state and names the dialog's buttons — click one of those refs to drive the dialog. Where that read is too slow or returns no tree, press {combo:"enter"} on the dialog's own window_id: the key is posted to the dialog box itself, which fires its default button (measured). Escape only lands on a box that has a Cancel button.`;
        }
        return envelope;
      });
    case 'restore_window':
      // A minimized window reports every element offscreen and ref actions
      // fail on it, so restoring it is the only way to drive it — and it costs
      // no pointer movement and no foreground steal.
      return enqueue(async () => parseEnvelope(await runCli(['restore', ...flagArgs([['--window-id', args.window_id], ['--app', args.app]])])));
    case 'launch': {
      // Engine contract: `--arg <ARGS>` is repeatable and takes `--arg=<value>`
      // when the value starts with `-`; the timeout flag is `--timeout`. The old
      // `--args`/`--timeout-ms` pair was refused with INVALID_ARGS.
      const argv = ['launch', String(args.app ?? ''), ...flagArgs([['--cwd', args.cwd], ['--activate', args.activate], ['--timeout', args.timeout_ms]])];
      const extra = Array.isArray(args.args) ? args.args : args.args === undefined || args.args === null ? [] : [args.args];
      for (const value of extra) {
        const text = String(value);
        if (text.startsWith('-')) argv.push(`--arg=${text}`);
        else argv.push('--arg', text);
      }
      return enqueue(async () => parseEnvelope(await runCli(argv)));
    }
    case 'wait':
      return enqueue(async () => parseEnvelope(await runCli(['wait', ...(args.ms === undefined || args.ms === null ? [] : [String(args.ms)]), ...flagArgs([
        ['--app', args.app], ['--window', args.window], ['--window-id', args.window_id],
        ['--element', args.element], ['--text', args.text], ['--timeout', args.timeout_ms],
        ['--event', args.event], ['--menu', args.menu], ['--menu-closed', args.menu_closed],
        ['--notification', args.notification], ['--predicate', args.predicate], ['--value', args.value],
        ['--count', args.count], ['--action', args.action],
      ])])));
    case 'screenshot':
      return enqueue(async () => {
        await ensureSession();
        const scope = shotScope(args);
        const file = join(shotsDir(), `shot-${Date.now()}.png`);
        const envelope = parseEnvelope(await runCli(['screenshot', file, ...flagArgs([['--app', scope.app], ['--window-id', scope.window_id], ['--screen', scope.screen]])]));
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
      const actions = commands.map((step) => String(step?.action || ''));
      const unknown = actions.filter((action) => !NATIVE_BATCH_COMMANDS.has(action) && !LOOP_BATCH_ACTIONS.has(action));
      if (unknown.length > 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, unknown, supported: [...NATIVE_BATCH_COMMANDS.keys(), ...LOOP_BATCH_ACTIONS] }) }], isError: true };
      }
      if (!actions.some((action) => LOOP_BATCH_ACTIONS.has(action))) {
        // One engine process for the whole batch. Every CLI call costs ~85 ms of
        // spawn plus UIA cold start, and the engine runs the same policy checks and
        // dispatch per entry, so this is ~1.7x faster than the loop and keeps each
        // entry's payload — a find step yields refs instead of "ok".
        const entries = commands.map((step) => {
          const action = String(step?.action || '');
          return { command: NATIVE_BATCH_COMMANDS.get(action), args: batchEntryArgs(action, step?.arguments || {}) };
        });
        return enqueue(async () => {
          await ensureSession();
          const cli = ['batch', JSON.stringify(entries)];
          if (args.stop_on_error !== false) cli.push('--stop-on-error');
          if (args.timeout_ms !== undefined && args.timeout_ms !== null) cli.push('--timeout-ms', String(args.timeout_ms));
          const envelope = parseEnvelope(await runCli(cli));
          if (envelope.ok === true) envelope.data = trimBatchData(envelope.data);
          return envelopeResult(envelope);
        });
      }
      // click picks its own delivery rung per target, type needs consent, and
      // screenshot/ocr own an adapter-side file path, so a batch containing any of
      // them runs step by step.
      const results = [];
      for (const step of commands) {
        const action = String(step?.action || '');
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
          if (t) return { content: [{ type: 'text', text: JSON.stringify(t) }] };
          // `describe` with no name is the model asking what this lane can do, not
          // asking after a tool literally named "undefined" — answer the question
          // instead of throwing it back.
          if (args.name === undefined || args.name === null || args.name === '') {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  preset: state.toolPreset,
                  tools: exposedTools().map((tool) => ({ name: tool.name, description: tool.description })),
                  state: { session: state.sessionId, sessionStarted: state.sessionStarted, headed: effectiveHeaded(), headedDefault: state.headedDefault, overlay: effectiveOverlay(), overlayDefault: state.overlayDefault },
                  engine_state_root: ENGINE_STATE_ROOT,
                  hint: 'describe {name:"<tool>"} for one tool\'s full schema',
                }),
              }],
            };
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ ok: false, unknown: String(args.name), hint: 'describe takes name; tools {operation:"list"} lists the surface, tools {operation:"load",names:[…]} reveals hidden tools' }),
            }],
            isError: true,
          };
        }
        if (op === 'headed') {
          state.headedOverride = args.on === true;
          state.headedExpiresAt = args.on === true ? Date.now() + HEADED_LEASE_MS : 0;
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, headed: effectiveHeaded(), headedDefault: state.headedDefault, lease_ms: args.on === true ? HEADED_LEASE_MS : 0, note: 'Headed drives the real mouse and keyboard for every action in this conversation. It releases on session_end and expires on its own. Prefer set_value for text so headed is not needed at all.' }) }] };
        }
        if (op === 'overlay') {
          state.overlayOverride = args.on === true;
          if (state.sessionStarted) {
            const env = parseEnvelope(await runCli(['cursor-overlay', state.overlayOverride ? 'enable' : 'disable']));
            return { content: [{ type: 'text', text: JSON.stringify({ ok: env.ok === true, overlay: effectiveOverlay(), engine: env }) }] };
          }
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, overlay: effectiveOverlay(), note: 'applies at next session start' }) }] };
        }
        if (op === 'load') {
          // Lazy preset only: reveal tools on demand. `names` may name several
          // tools ('all' or no names reveals every remaining tool).
          const requested = Array.isArray(args.names)
            ? args.names
            : typeof args.names === 'string' && args.names.trim()
              ? args.names.split(/[,\s]+/).filter(Boolean)
              : [];
          const unknown = requested.filter((name) => !TOOLS_BY_NAME.has(name));
          if (unknown.length > 0) {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, unknown, hint: 'see tools {operation:"describe"} or the tool list' }) }], isError: true };
          }
          const before = exposedTools().length;
          const revealAll = requested.length === 0 || requested.includes('all');
          for (const tool of TOOLS) {
            if (revealAll || requested.includes(tool.name)) state.extraTools.add(tool.name);
          }
          const after = exposedTools().length;
          if (after !== before) notifyToolsChanged();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: true,
                preset: state.toolPreset,
                revealed: after - before,
                tools: exposedTools().map((tool) => tool.name),
              }),
            }],
          };
        }
        if (op === 'session_end') {
          const env = parseEnvelope(await runCli(['session', 'end']));
          await runCli(['session', 'gc']);
          state.sessionStarted = false;
          state.sessionId = `arya-${randomBytes(4).toString('hex')}`;
          // Ending the driver session also releases the physical-input latch.
          state.headedOverride = null;
          state.headedExpiresAt = 0;
          return { content: [{ type: 'text', text: JSON.stringify({ ok: env.ok === true, note: 'new session starts on next action', engine: env }) }] };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tools: exposedTools().map((t) => t.name),
              preset: state.toolPreset,
              hidden: state.toolPreset === 'lazy' ? TOOLS.length - exposedTools().length : 0,
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
    // Which rung delivered the step is the first thing to read when a batch of
    // actions did not do what was asked; without it a batched click reports only
    // a delivery word and the ladder's decision is invisible.
    if (d.mechanism) bits.push(`mechanism ${d.mechanism}`);
    if (d.fallback_from?.code) bits.push(`after ${d.fallback_from.code}${d.fallback_from.kind ? `/${d.fallback_from.kind}` : ''}`);
    if (d.ref_count !== undefined) bits.push(`refs ${d.ref_count}`);
    // A step that locates something is useless without the ref it found, and a
    // read step without its value is the same. Report the payload, not just "ok".
    if (d.match?.ref_id) bits.push(`ref ${d.match.ref_id}${d.match.name ? ` (${d.match.name})` : ''}`);
    if (Array.isArray(d.matches) && d.matches.length) bits.push(`refs ${d.matches.slice(0, 8).map((m) => m.ref_id).join(',')}`);
    if (d.snapshot_id) bits.push(`snapshot ${d.snapshot_id}`);
    if (d.value !== undefined) bits.push(`value ${JSON.stringify(d.value)}`);
    if (d.result !== undefined) bits.push(`result ${JSON.stringify(d.result)}`);
    if (d.window?.id) bits.push(`window ${d.window.id}`);
    if (d.target?.process?.pid) bits.push(`pid ${d.target.process.pid}`);
    if (d.disposition?.delivery) bits.push(`delivery ${d.disposition.delivery}`);
    return bits.join('; ') || 'ok';
  }
  return `${envelope?.error?.code || 'ERROR'}: ${String(envelope?.error?.message || '').slice(0, 200)}`;
}

async function runOcr(args) {
  const scope = shotScope(args);
  const file = join(shotsDir(), `ocr-${Date.now()}.png`);
  const shot = parseEnvelope(await runCli(['screenshot', file, ...flagArgs([['--app', scope.app], ['--window-id', scope.window_id], ['--screen', scope.screen]])]));
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

// The engine takes exactly one capture target per call — a screen index, an app,
// or a window — and refuses two of them together (or answers an app-name
// ambiguity even when a precise window id was supplied). Narrowest wins.
function shotScope(args) {
  const screen = args.screen;
  if (screen !== null && screen !== undefined) return { app: null, window_id: null, screen };
  if (args.window_id) return { app: null, window_id: args.window_id, screen: null };
  return { app: args.app ?? null, window_id: null, screen: null };
}

/* -------------------------------------------------------------- protocol */

const INSTRUCTIONS = [
  'Arya Computer Use: drive Windows apps through semantic UIA refs, not pixels.',
  'Loop: snapshot (skeleton/compact first) -> act on @refs -> re-snapshot to verify.',
  'Refs go stale after window changes: on STALE_REF/AMBIGUOUS_TARGET, re-snapshot.',
  'A snapshot that reports identity_unproven or complete:false is a partial read: re-snapshot the same window with timeout_ms 10000-20000 before acting on any ref from it, and do not wait for a TIMEOUT on a tree that already reported complete:false.',
  'Observations are scoped: omit app/window_id to read the app of the window you last touched. Do not scan the whole desktop — it is slow and it matches other apps, including this agent\'s own windows.',
  'A modal dialog and an open menu are SEPARATE SURFACES: a window snapshot of the parent app will not show them and the parent stops responding while the dialog is up. Read them with snapshot/find surface "sheet" (app modal) or "menu", or inventory them with list_surfaces; a failed ref action names the blocking window in error.details.blocking_windows. Drive a dialog by reading it with surface "sheet" and clicking a ref from THAT tree — the adapter raises the read and action budget for a dialog ref automatically (measured: ~8 s to a complete tree naming its buttons, and the click on one lands). Never re-read or re-click the blocked parent: its window is disabled, and a posted message can still fire a disabled control. A menu-bar command does not need the dropdown: find the item by name on the OWNER window (role menuitem) and click that ref — measured to activate it even when the open dropdown itself stays unreadable.',
  'A read of a blocked window can also fail SILENTLY: snapshot/find answer ok with nothing in them. The adapter then names the other window in data.blocking_windows and says so in data.observation_note - an empty read there is not a missing control, it is a blinded one, and the fix is to read the NAMED window. If nothing is named, the name or role you searched for is genuinely absent: report that, do not re-read at a bigger budget and do not poll with screenshots.',
  'Some dialogs expose no tree at all (a snapshot comes back with ref_count near 1 and complete:false, and find times out as locator_transient_incomplete) — a common file picker is one. Do not burn more budget re-reading it: drive it blind with set_value on its edit by ref where one exists, or press {combo:"escape"} / {combo:"enter"} on the dialog\'s own window_id. Measured: the key is posted to the dialog box itself, so enter fires its default button and closes it, and escape lands only on a box that HAS a Cancel button (a YesNo box ignores it, as it ignores a physical Escape). Where the dialog does answer a read, the surface "sheet" tree names its buttons and a click is exact.',
  'Nothing you do moves the user\'s pointer or takes their foreground unless you pass physical:true or arm tools {operation:"headed"}. Read and act while they keep working.',
  'click never falls back to a physical click on its own: it tries the control\'s own patterns, then a posted background click (no cursor movement, no foreground change). The result names the mechanism in data.mechanism and pointer. A posted click only proves the queue took it, not that the app acted: re-read the control, and if nothing changed call again with physical:true (the user\'s explicit agreement on that one call). A refusal names the rung that failed.',
  'Never pass physical:true to recover from a refused pattern, a STALE_REF, an AMBIGUOUS_TARGET or a timeout — those are not delivery problems, and physical input cannot fix them. Fix the ref, the scope, or the deadline.',
  'Prefer the exact semantic tool when the control advertises it: select (options/tabs/list items), check/uncheck (checkboxes, switches), toggle, expand/collapse, clear, scroll_to. These are idempotent and never touch the pointer. When expand/collapse/toggle is refused, the adapter posts a background click for you.',
  'set_value is the headless text path (UIA value pattern, pointer stays put). type is delivered quietly too: the adapter first writes the value pattern on the ref, then posts the characters as WM_CHAR to the control hit-tested from the live rectangle of that ref and reads the value back. If the read-back shows the characters did NOT land (a XAML/WinUI/Electron control ignores WM_CHAR), with consent it synthesizes keystrokes in the same call; without consent it reports not_delivered — use set_value or pass physical:true. Never pass physical:true for text on the first try - the quiet rungs are tried for you and data.mechanism says which one landed.',
  'double_click and right_click arrive as posted background messages by default; the adapter then checks for the effect (a new menu surface for right_click, a new window/surface for double_click) and reports delivered_verified when it sees one. With physical:true a posted click with no observable effect escalates to a real click in the SAME call; without consent it reports not_delivered.',
  'press tries the engine headless first (foreground queue, which fails closed for a non-frontmost app). With physical:true it brings the window forward and synthesizes a real keystroke — the ONLY way a modifier chord reaches a background window. Without consent a plain key posts in the background (WM_KEYDOWN/WM_KEYUP) and a modifier chord reports not_delivered. A posted key only proves the queue took it: re-read to confirm the effect; if nothing changed, pass physical:true.',
  'focus and focus_window are physical by nature (they change the desktop foreground), so they need physical:true. Do not raise a window to click it: refs work on background windows. A minimized window has no readable tree — restore_window first.',
  'Wait for a condition, never for a wall clock: wait {event:"window-opened"|"surface-appeared"} catches a dialog or menu without knowing its id, wait {text}/{menu}/{menu_closed} waits for tree state, and snapshot/find take wait_for/wait_for_gone in the same call. Measured: a text wait sees a value that JUST changed only after ~2s, so give it timeout_ms >= 4000 or confirm the change by reading the control (find with its name, get property value) — a text wait under 2s is a coin flip that usually fails. Polling screenshot or list_windows is the symptom of a surface you have not read.',
  'tools {operation:"headed",on:true} arms every physical path in this conversation for five minutes; per-call physical:true is the narrower choice. session_end clears it.',
  'Chromium windows settle slowly: snapshot with timeout_ms 10000-25000.',
  'Verify stateful actions by re-read; delivered_verified = confirmed, delivered_unverified retry:unsafe = do not blind-repeat. A posted message (mechanism post_message) only proves the queue took it: judge delivery by observing the app, not the return code. not_delivered retry:safe with details.kind posted_no_effect means the posted input produced no observable effect — nothing happened, so you may retry or pass physical:true to escalate to real input.',
  'An engine failure with error.disposition.retry unsafe means the action may already have landed: the adapter then stops the click ladder instead of re-delivering, and neither should you — read the state (list_windows / list_surfaces / a fresh snapshot) and act on what the read shows.',
  'On ACTION_FAILED post_action_verification the action landed: read data.post_state, do NOT retry.',
  'This host must run elevated (Administrator); lease_directory_untrusted means restart AryaCode as Administrator.',
  'Esc (or the stop shortcut) stops the series: input tools then return COMPUTER_USE_STOPPED_BY_USER for this turn. Reads still work; do not retry input until a new user turn.',
  'Destructive actions (delete, send, pay, close unsaved) require user confirmation first.',
  'No accessibility tree (games/canvas): ocr reads the pixels for text; there is no coordinate click path, and physical input still needs the user\'s consent.',
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
// Publish what this lane started with before the first request can ask about it.
publishDesktopFacts();
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
      capabilities: { tools: { listChanged: true } },
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
    reply(id, { tools: exposedTools() });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    Promise.resolve()
      .then(() => callTool(name, args))
      .then(async (out) => {
        // The overlay hint runs through the same queue as the actions: its
        // window list and element bounds used to be spawned outside the queue,
        // where they lost the engine's exclusive interaction lease against the
        // NEXT queued action and turned that action into a lock_timeout backed
        // off for seconds. Presentation never gets to contend with input.
        try { await enqueue(() => noteTarget(name, args, out)); } catch { /* overlay hint only */ }
        return out;
      })
      .then((out) => reply(id, Array.isArray(out?.content) ? out : envelopeResult(out)))
      .catch((error) => reply(id, { content: [{ type: 'text', text: `adapter error: ${error?.message || error}` }], isError: true }));
    return;
  }
  if (id !== undefined) replyError(id, -32601, `method not supported: ${method}`);
});
process.stdin.on('end', () => process.exit(0));
