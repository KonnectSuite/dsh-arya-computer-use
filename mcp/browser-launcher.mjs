// MCP entry point for the web lane.
//
// DSH launches this file instead of agent-browser itself so the browser lane can
// follow the plugin's settings (tool surface, Chrome profile, session, CDP
// endpoint, headed window) without editing the Cordis patch by hand. The real
// server's stdio is piped through this process, a transparent relay: stdin and
// stdout carry the MCP protocol untouched, and settings changes are picked up on
// the next MCP restart.
//
// Two window traps on Windows, both avoided here:
//  - Node ignores windowsHide when stdio is 'inherit', so stdio is piped.
//  - bin/agent-browser.js (the npm CLI shim) spawns the native exe with
//    stdio:'inherit' + windowsHide:false, which pops a console window for the
//    grandchild on the user's desktop. We skip the shim and spawn the native
//    exe directly; it speaks MCP over stdio itself.
//
// Where the native lives changed with agent-browser 0.43.0, so the anchor rule
// changed with it (issue #2 was exactly this kind of drift):
//  - <=0.42: every native shipped beside bin/agent-browser.js, so dirname(SHIM)
//    was the only directory that tracked the package layout. 1.0.3-1.0.11 looked
//    at the package root, found nothing, and fell back to the shim every run;
//    the console-window watchdog hid the symptom for nine releases.
//  - 0.43.0: bin/ holds the shim only. The native arrives as an optional
//    dependency (@agent-browser/cli-<platform>), and under a strict installer it
//    is not even visible from the plugin's own node_modules — pnpm keeps it in
//    the virtual store. So the resolver asks the ENGINE where its native is:
//    scripts/native.js (nativeTarget + findNativeBinary) resolves the platform
//    package with an engine-anchored createRequire. Importing upstream's
//    resolver means the naming rules can never drift from the engine again.
//    The beside-the-shim scan stays as the legacy branch (a 0.42 install, or a
//    copy materialized into bin/ by a manual CLI run), and a shim fallback is
//    never silent.

import { spawn } from 'node:child_process';
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { readJsonFile } from './settings.mjs';

const require = createRequire(import.meta.url);

// Lazy on purpose: index.js imports nativeBin() to report engine readiness, and
// importing this module on a machine without agent-browser must not throw.
const shimPath = () => require.resolve('agent-browser/bin/agent-browser.js');
const packageRoot = () => dirname(require.resolve('agent-browser/package.json'));

// musl libc (Alpine) ships the linux-musl native. This is scripts/native.js's
// hostLibc() decision (process report, no subprocess) — used only by the legacy
// fallback below, since 0.43.0's own resolver answers the libc question.
function hostLibc() {
  if (platform() !== 'linux') return undefined;
  try {
    const header = process.report?.getReport?.()?.header;
    if (header?.glibcVersionRuntime) return 'glibc';
    const shared = Array.isArray(header?.sharedObjects) ? header.sharedObjects : [];
    if (shared.some((p) => /(?:^|\/)ld-musl-|libc\.musl-/.test(String(p)))) return 'musl';
  } catch { /* no report on this runtime */ }
  const so = arch() === 'arm64' ? 'aarch64' : 'x86_64';
  return existsSync(`/lib/ld-musl-${so}.so.1`) ? 'musl' : 'glibc';
}

// The <=0.42 layout: the native sits beside the shim. Same osKey (with the musl
// variant), same arch aliases, same win32-arm64 -> x64 fallback.
function legacyNativeBin() {
  const dir = dirname(shimPath());
  const os = platform();
  const osKey = os === 'linux'
    ? (hostLibc() === 'musl' ? 'linux-musl' : 'linux')
    : (os === 'darwin' || os === 'win32') ? os : null;
  let archKey = { x64: 'x64', x86_64: 'x64', arm64: 'arm64', aarch64: 'arm64' }[arch()];
  if (!osKey || !archKey) return null;
  if (osKey === 'win32' && archKey === 'arm64' && !existsSync(join(dir, 'agent-browser-win32-arm64.exe'))) {
    archKey = 'x64';
  }
  const bin = join(dir, `agent-browser-${osKey}-${archKey}${osKey === 'win32' ? '.exe' : ''}`);
  return existsSync(bin) ? bin : null;
}

// Fallback for a 0.43-style install when upstream's own module cannot be
// imported (a future `exports` field, say): resolve the platform package the way
// scripts/native.js does, anchored at the ENGINE's package.json so a strict
// installer's layout still resolves. Names mirror native.js's nativeTarget().
function anchoredPlatformBin() {
  const libc = hostLibc();
  const archKey = arch() === 'arm64' ? 'arm64' : 'x64';
  let packageName;
  let file;
  if (platform() === 'win32') {
    // No cli-win32-arm64 package exists; upstream runs the x64 exe under
    // emulation, and that package declares cpu ["x64","arm64"].
    packageName = '@agent-browser/cli-win32-x64-msvc';
    file = 'agent-browser.exe';
  } else if (platform() === 'darwin') {
    packageName = `@agent-browser/cli-darwin-${archKey}`;
    file = 'agent-browser';
  } else if (platform() === 'linux') {
    packageName = `@agent-browser/cli-linux-${archKey}-${libc === 'musl' ? 'musl' : 'gnu'}`;
    file = 'agent-browser';
  } else {
    return null;
  }
  try {
    const engineRequire = createRequire(join(packageRoot(), 'package.json'));
    const pkg = engineRequire.resolve(`${packageName}/package.json`);
    const bin = join(dirname(pkg), 'bin', file);
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

// Resolve the platform native, and say HOW it was found — the status panel shows
// this, because "which rung answered" is the fact that made issue #2 hard to
// diagnose. Exported so the resolution is testable.
export async function nativeBin() {
  try {
    const root = packageRoot();
    const upstream = await import('agent-browser/scripts/native.js');
    const target = upstream.nativeTarget(platform(), arch(), upstream.hostLibc ? upstream.hostLibc() : undefined);
    const found = upstream.findNativeBinary(root, target);
    if (found && existsSync(found)) {
      return { bin: found, mode: dirname(found) === dirname(shimPath()) ? 'package-bin' : 'platform-package' };
    }
  } catch { /* <=0.42 engine, or an exports field: fall through to the ladder */ }
  const legacy = (() => { try { return legacyNativeBin(); } catch { return null; } })();
  if (legacy) return { bin: legacy, mode: 'package-bin' };
  const anchored = anchoredPlatformBin();
  if (anchored) return { bin: anchored, mode: 'platform-package' };
  return null;
}

// The shim repairs a missing exec bit before spawning (postinstall may not have
// run — bun blocks lifecycle scripts by default). Skipping the shim means doing
// it here, on the platforms where it can matter.
function ensureExecutable(bin) {
  if (platform() === 'win32') return;
  try {
    accessSync(bin, constants.X_OK);
  } catch {
    try {
      chmodSync(bin, 0o755);
    } catch (error) {
      process.stderr.write(`arya browser lane: cannot make ${bin} executable: ${error.message}\n`);
    }
  }
}

function controlDir() {
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return join(local, 'dsh-plugin-arya-desktop', 'control');
}

function readSettings() {
  const file = join(controlDir(), 'settings.json');
  if (!existsSync(file)) return {};
  try {
    const parsed = readJsonFile(file);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// Every agent-browser tool repeats the same host/launch flags in its schema, and
// the plugin already sets them on the server command line below. They are worth
// about 630 tokens per tool, so the relay rewrites tools/list responses to drop
// them. agent-browser rejects undeclared argument keys with an invalid-params
// error naming the key, so a caller that passes a dropped flag is told, not
// silently mis-ruled.
export const FLAG_KEYS_HOST = ['extraArgs', 'caCert', 'clearCaCert', 'useSystemCa', 'allowedDomains', 'namespace', 'idleTimeout'];
export const FLAG_KEYS_REST = ['restore', 'restoreSave', 'restoreCheckFn', 'restoreCheckText', 'restoreCheckUrl', 'session', 'timeoutMs'];

export function flagKeys(mode) {
  if (mode === 'lean') return FLAG_KEYS_HOST;
  if (mode === 'off') return [];
  return [...FLAG_KEYS_HOST, ...FLAG_KEYS_REST];
}

export function stripToolFlags(tools, keys) {
  const drop = new Set(keys);
  let removed = 0;
  for (const tool of Array.isArray(tools) ? tools : []) {
    const schema = tool?.inputSchema;
    if (schema?.properties) {
      for (const key of drop) if (key in schema.properties) { delete schema.properties[key]; removed++; }
    }
    if (Array.isArray(schema?.required)) {
      const kept = schema.required.filter((key) => !drop.has(key));
      removed += schema.required.length - kept.length;
      schema.required = kept;
    }
  }
  return removed;
}

// MCP stdio is one JSON message per line, so the relay transforms line by line.
// Anything that is not a tools/list response is forwarded byte-for-byte.
export function transformLine(line, drop) {
  if (!line.includes('"tools"')) return line;
  let message;
  try { message = JSON.parse(line); } catch { return line; }
  if (!Array.isArray(message?.result?.tools)) return line;
  return stripToolFlags(message.result.tools, drop) ? JSON.stringify(message) : line;
}

export function createFlagStripTransform(keys) {
  const drop = new Set(keys);
  let pending = '';
  return new Transform({
    transform(chunk, encoding, callback) {
      pending += chunk.toString('utf8');
      let cut = pending.indexOf('\n');
      while (cut >= 0) {
        this.push(`${transformLine(pending.slice(0, cut), drop)}\n`);
        pending = pending.slice(cut + 1);
        cut = pending.indexOf('\n');
      }
      callback();
    },
    flush(callback) {
      if (pending) this.push(transformLine(pending, drop));
      callback();
    },
  });
}

// The host-wide flags this launcher puts on the daemon command line. The web
// lane's tool schemas carry the matching typed keys (FLAG_KEYS_HOST/FLAG_KEYS_REST),
// and the default 'strip' mode drops them — which is only honest because every
// one of these settings really is applied here. 1.0.12 and earlier dropped the
// keys without ever setting the flags, so those agent-browser features were
// unreachable while the tooltip claimed otherwise.
// Flag spellings and value shapes are the pinned engine's own (verified against
// agent-browser@0.43.0 skill-data/core/references/commands.md:563-575 and a live
// probe): --idle-timeout <time>, --namespace <name>, --ca-cert <path>,
// --use-system-ca, --confirm-actions <id>. There is no flag for a default call
// timeout in mcp mode ("Unknown mcp option: --timeout") and no env var for those
// four, so the timeout goes through AGENT_BROWSER_DEFAULT_TIMEOUT.
// Domain allow-listing is the exception where the FLAG IS A NO-OP: measured
// 2026-11-20 on 0.43.0, a server started with `mcp --allowed-domains example.com`
// still opened https://www.wikipedia.org (isError:false), while the same daemon
// started with AGENT_BROWSER_ALLOWED_DOMAINS=example.com refuses it ("Domain
// 'www.wikipedia.org' is not in the allowed domains list"). So domains go
// through the env var in browserEnv(), never through a flag — passing the flag
// would be a control that looks configured and does nothing.
// Probe caveat for anyone re-deriving this: `mcp <a> <b> call <tool>` fails with
// "Unknown mcp option: call" once two options precede the one-shot `call`
// subcommand, while the same flags in server mode (no `call`) are fine — a
// parser quirk of the one-shot path, not a limit on the daemon command line.
export function browserArgs(settings = {}) {
  const args = [shimPath(), 'mcp'];
  const tools = text(settings.browserTools);
  if (tools) args.push('--tools', tools);
  const cdp = text(settings.browserCdp);
  const profile = text(settings.browserProfile);
  const session = text(settings.browserSession);
  const state = text(settings.browserStateFile);
  const executablePath = text(settings.browserExecutablePath);
  if (cdp) args.push('--cdp', cdp);
  if (profile) args.push('--profile', profile);
  if (session) args.push('--session', session);
  if (state) args.push('--state', state);
  // Edge-only machines: agent-browser's auto-launch finds its own cache and
  // system Chrome, not Edge (issue #1 report). Measured 2026-11-17: in CLI mode
  // the --executable-path flag works in either position, but in `mcp` server
  // mode the daemon IGNORES the flag (both positions opened its own Chrome)
  // and honors the AGENT_BROWSER_EXECUTABLE_PATH env instead — main() sets it.
  // The flag stays here for CLI-mode runs and as a visible marker; a daemon
  // command line carrying it is not proof the path took effect.
  if (executablePath) args.push('--executable-path', executablePath);
  // No --allowed-domains here on purpose: the flag does not enforce (see the
  // comment above). browserEnv() sets AGENT_BROWSER_ALLOWED_DOMAINS instead.
  const idle = text(settings.browserIdleTimeout);
  if (idle) args.push('--idle-timeout', idle);
  const namespace = text(settings.browserNamespace);
  if (namespace) args.push('--namespace', namespace);
  const caCert = text(settings.browserCaCert);
  if (caCert) args.push('--ca-cert', caCert);
  if (settings.browserUseSystemCa === true) args.push('--use-system-ca');
  // Consent gate for upstream policy actions (flow writes, credential reads).
  // --confirm-actions REQUIRES an approval for each listed action; it never
  // auto-approves. Empty leaves the engine's own default (flow writes already
  // ask as policy action flow_write:<id>).
  const confirm = domainList(settings.browserConfirmActions);
  for (const action of confirm) args.push('--confirm-actions', action);
  if (settings.browserHeaded === true) args.push('--headed');
  return args;
}

// Comma/space separated list -> trimmed entries, no empties. Reused for the
// domain list and the confirm-actions list.
export function domainList(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

// Environment for the daemon. Measured 2026-11-17: `mcp` server mode ignores the
// --executable-path flag in both positions (its own Chrome opened either way)
// and honors AGENT_BROWSER_EXECUTABLE_PATH instead (msedge processes rose 5 to
// 21). AGENT_BROWSER_DEFAULT_TIMEOUT is the only route for a default call
// timeout in mcp mode (commands.md:179). AGENT_BROWSER_ALLOWED_DOMAINS is the
// only route that actually enforces a domain allow-list (measured 2026-11-20);
// with it set, the engine also refuses a per-call allowedDomains argument as
// "already set in the MCP server's environment or config" — host-wide wins,
// which is the point of a host setting.
export function browserEnv(settings = {}, base = process.env) {
  const env = { ...base };
  const executablePath = text(settings.browserExecutablePath);
  if (executablePath) env.AGENT_BROWSER_EXECUTABLE_PATH = executablePath;
  const domains = domainList(settings.browserAllowedDomains);
  if (domains.length) env.AGENT_BROWSER_ALLOWED_DOMAINS = domains.join(',');
  const timeout = Number(settings.browserDefaultTimeoutMs);
  if (Number.isFinite(timeout) && timeout >= 1000) env.AGENT_BROWSER_DEFAULT_TIMEOUT = String(Math.round(timeout));
  return env;
}

// What the lane actually did, for the settings page's Status panel (the two
// lanes are separate MCP child processes, so each publishes its own facts file).
function publishFacts(file, facts) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...facts, at: new Date().toISOString() }, null, 2));
  } catch (error) {
    process.stderr.write(`arya browser lane: could not publish status facts: ${error.message}\n`);
  }
}

async function main() {
  const settings = readSettings();
  const args = browserArgs(settings);
  const flagKeys_ = flagKeys(text(settings.browserToolFlags));
  const found = await nativeBin();
  const native = found?.bin ?? null;
  // A silent shim fallback is how issue #2 survived nine releases: nothing ever
  // said the native spawn had not happened. stderr is piped to the host's MCP
  // log and never carries protocol bytes.
  if (!native) {
    process.stderr.write(`arya browser lane: no native agent-browser binary for ${platform()}-${arch()}; using the npm shim\n`);
  } else {
    ensureExecutable(native);
  }
  const env = browserEnv(settings);
  publishFacts(join(controlDir(), 'info-browser.json'), {
    lane: 'browser',
    native,
    nativeMode: found?.mode ?? 'shim',
    toolsProfile: text(settings.browserTools) || 'core',
    stripMode: text(settings.browserToolFlags) || 'strip',
    strippedKeys: flagKeys_,
    flags: args.slice(args.indexOf('mcp') + 1),
    env: Object.keys(env).filter((k) => k.startsWith('AGENT_BROWSER_')),
    executablePath: text(settings.browserExecutablePath) || null,
  });
  const child = native
    ? spawn(native, args.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env })
    : spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
  child.on('error', (error) => {
    process.stderr.write(`arya browser lane: could not start agent-browser: ${error.message}\n`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  process.stdin.pipe(child.stdin);
  if (flagKeys_.length) child.stdout.pipe(createFlagStripTransform(flagKeys_)).pipe(process.stdout);
  else child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.stdin.on('error', () => { /* child gone mid-write; the exit handler ends us */ });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { try { child.kill(signal); } catch { /* already gone */ } });
  }
}

// Self-invocation guard: this module is imported by index.js (engine readiness)
// as well as run as the lane's entry point, so main() must not fire on import.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((error) => {
    process.stderr.write(`arya browser lane: ${error?.stack || error}\n`);
    process.exit(1);
  });
}
