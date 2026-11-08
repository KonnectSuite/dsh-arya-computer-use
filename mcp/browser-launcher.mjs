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
  const args = browserArgs(readSettings());
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
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.stdin.on('error', () => { /* child gone mid-write; the exit handler ends us */ });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { try { child.kill(signal); } catch { /* already gone */ } });
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
