// MCP entry point for the web lane.
//
// DSH launches this file instead of agent-browser itself so the browser lane can
// follow the plugin's settings (tool surface, Chrome profile, session, CDP
// endpoint, headed window) without editing the Cordis patch by hand. The real
// server's stdio is inherited, so this process is a transparent pipe: stdin and
// stdout carry the MCP protocol untouched, and settings changes are picked up on
// the next MCP restart.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const BIN = require.resolve('agent-browser/bin/agent-browser.js');

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
  const args = [BIN, 'mcp'];
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
  const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  child.on('error', (error) => {
    process.stderr.write(`arya browser lane: could not start agent-browser: ${error.message}\n`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { try { child.kill(signal); } catch { /* already gone */ } });
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
