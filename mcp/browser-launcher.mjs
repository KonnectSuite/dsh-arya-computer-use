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

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';

const require = createRequire(import.meta.url);
const SHIM = require.resolve('agent-browser/bin/agent-browser.js');

// Resolve the platform native binary shipped inside the agent-browser package,
// mirroring bin/agent-browser.js's naming (with the win32-arm64 → x64 fallback).
function nativeBin() {
  const dir = dirname(require.resolve('agent-browser/package.json'));
  const osKey = { darwin: 'darwin', linux: 'linux', win32: 'win32' }[platform()];
  const archKey = { x64: 'x64', arm64: 'arm64' }[arch()];
  if (!osKey || !archKey) return null;
  const ext = osKey === 'win32' ? '.exe' : '';
  let name = `agent-browser-${osKey}-${archKey}${ext}`;
  if (osKey === 'win32' && archKey === 'arm64' && !existsSync(join(dir, name))) {
    name = 'agent-browser-win32-x64.exe';
  }
  const bin = join(dir, name);
  return existsSync(bin) ? bin : null;
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
  if (cdp) args.push('--cdp', cdp);
  if (profile) args.push('--profile', profile);
  if (session) args.push('--session', session);
  if (state) args.push('--state', state);
  if (settings.browserHeaded === true) args.push('--headed');
  return args;
}

function main() {
  const settings = readSettings();
  const args = browserArgs(settings);
  const flagKeys_ = flagKeys(text(settings.browserToolFlags));
  const native = nativeBin();
  const child = native
    ? spawn(native, args.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    : spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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
