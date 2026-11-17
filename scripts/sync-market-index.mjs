#!/usr/bin/env node
// Regenerate index.json — the market listing this plugin self-registers.
//
// index.js points MARKET_INDEX_URL at this file (jsDelivr serves it from the
// repo), and the README tells users to add it as an install source, so it is a
// public listing of every published version. It is NOT in package.json "files":
// it is a repo artifact, never packed, which is exactly why it drifted — the
// release flow never touched it. Run it at every release.
//
// publishTimestamp comes from npm's own time map (unix seconds). The
// hand-recorded values drifted: 1.0.5 was written a full day early.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const indexFile = join(root, 'index.json');
const index = JSON.parse(readFileSync(indexFile, 'utf8'));

// npm is a .cmd shim on Windows: Node refuses to spawn it without a shell
// (EINVAL), and shell:true concatenates the args — the only argument here is
// the package name read from package.json, not user input.
let packument = JSON.parse(
  execFileSync('npm', ['view', pkg.name, '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
);
// npm view answers with the packument, wrapped in an array on some npm shells.
if (Array.isArray(packument)) packument = packument[0];
if (!packument?.time || !packument?.versions) {
  console.error('npm view returned no packument (time/versions) — registry unreachable?');
  process.exit(1);
}
const time = packument.time || {};
const stable = (packument.versions || [])
  .map((v) => (typeof v === 'string' ? v : v.version))
  .filter((v) => !v.includes('-'));

const plugin = index.plugins.find((p) => p.name === pkg.name);
if (!plugin) {
  console.error(`index.json has no entry for ${pkg.name}`);
  process.exit(1);
}

const engines = { dsh: pkg.engines.dsh };
plugin.versions = stable
  .map((version) => {
    const at = time[version];
    if (!at) {
      console.error(`npm has no publish time for ${pkg.name}@${version}`);
      process.exit(1);
    }
    return {
      version,
      publishTimestamp: Math.floor(Date.parse(at) / 1000),
      source: { type: 'npm' },
      engines,
    };
  })
  .sort((a, b) => a.publishTimestamp - b.publishTimestamp);

// No BOM: the file is read by hosts, and a BOM breaks a strict JSON parse.
writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
console.log(
  `${pkg.name}: ${plugin.versions.length} versions, newest ${plugin.versions.at(-1).version} (${plugin.versions.at(-1).publishTimestamp})`
);
