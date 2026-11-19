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
// The anchor rule for finding that native (issue #2): resolve it beside the
// shim, never at the package root. The package ships every native next to
// bin/agent-browser.js — the shim itself resolves join(__dirname, binaryName)
// — so dirname(SHIM) is the only directory that tracks the package layout.
// 1.0.3-1.0.11 looked at the package root, found nothing, and fell back to the
// shim every run; the console-window watchdog hid the symptom for nine releases.

import { execSync, spawn } from 'node:child_process';
import { accessSync, chmodSync, constants, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';

const require = createRequire(import.meta.url);
const SHIM = require.resolve('agent-browser/bin/agent-browser.js');

// musl libc (Alpine) ships agent-browser-linux-musl-<arch>, decided exactly as
// bin/agent-browser.js's isMusl() decides it.
function isMusl() {
  if (platform() !== 'linux') return false;
  try {
    return String(execSync('ldd --version 2>&1 || true', { encoding: 'utf8' }))
      .toLowerCase()
      .includes('musl');
  } catch {
    return existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1');
  }
}

// Resolve the platform native binary, mirroring bin/agent-browser.js's naming:
// the same osKey (with the musl variant), the same arch aliases, and the same
// win32-arm64 -> x64 fallback. Exported so the resolution is testable.
export function nativeBin() {
  const dir = dirname(SHIM);
  const os = platform();
  const osKey = os === 'linux'
    ? (isMusl() ? 'linux-musl' : 'linux')
    : (os === 'darwin' || os === 'win32') ? os : null;
  let archKey = { x64: 'x64', x86_64: 'x64', arm64: 'arm64', aarch64: 'arm64' }[arch()];
  if (!osKey || !archKey) return null;
  if (osKey === 'win32' && archKey === 'arm64' && !existsSync(join(dir, 'agent-browser-win32-arm64.exe'))) {
    archKey = 'x64';
  }
  const bin = join(dir, `agent-browser-${osKey}-${archKey}${osKey === 'win32' ? '.exe' : ''}`);
  return existsSync(bin) ? bin : null;
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
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
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

export function browserArgs(settings = {}) {
  const args = [SHIM, 'mcp'];
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
  if (settings.browserHeaded === true) args.push('--headed');
  return args;
}

function main() {
  const settings = readSettings();
  const args = browserArgs(settings);
  const flagKeys_ = flagKeys(text(settings.browserToolFlags));
  const native = nativeBin();
  // A silent shim fallback is how issue #2 survived nine releases: nothing ever
  // said the native spawn had not happened. stderr is piped to the host's MCP
  // log and never carries protocol bytes.
  if (!native) {
    process.stderr.write(`arya browser lane: no native agent-browser binary for ${platform()}-${arch()}; using the npm shim\n`);
  } else {
    ensureExecutable(native);
  }
  // The daemon takes the browser executable from the environment. Measured
  // 2026-11-17: `mcp` server mode ignores the --executable-path flag in both
  // positions (its own Chrome opened either way) and honors
  // AGENT_BROWSER_EXECUTABLE_PATH instead (msedge processes rose 5 to 21).
  const env = { ...process.env };
  const executablePath = text(settings.browserExecutablePath);
  if (executablePath) env.AGENT_BROWSER_EXECUTABLE_PATH = executablePath;
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

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
