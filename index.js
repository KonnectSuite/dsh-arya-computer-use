// Arya Computer Use — Host plugin entry.
//
// Registers:
//  - the arya-desktop workflow skill (provider, global + per-agent, rank 350;
//    pattern derived from @axyatech/dsh-plugin-rea (MIT));
//  - the settings store (settings.register('arya-computer-use', …, applies
//    'live'), derived from dsh-computer-use-win (MIT));
//  - the takeover helper (scripts/windows-takeover.ps1: edge glow, banner,
//    progress overlay, cursor indicator, global Esc kill) driven by
//    TakeoverControl from the host-side activity file;
//  - the driver lock (one conversation drives the desktop at a time —
//    enforced in mcp/activity.mjs via the global tools/execute hook);
//  - a loopback-only GET /plugins/arya/status for panels and diagnostics.
//
// The MCP adapter (mcp/adapter-server.mjs) runs as its own profile entry
// (mcp-arya-desktop); it polls control/settings.json for the behavior
// switches. See docs/PLAN.md §2 for the full design.

import z from '@deepseek-ai/schemastery';
import os from 'node:os';
import { readFile, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, normalizeSettings, STOP_SHORTCUT_PATTERN, repairStaleSettings } from './mcp/settings.mjs';
import { TakeoverControl, atomicJson } from './mcp/takeover.mjs';
import { installActivity } from './mcp/activity.mjs';

export const name = 'arya-computer-use';
export const inject = ['tools'];

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, 'skills', 'arya-desktop');
const SKILL_FILE = join(SKILL_DIR, 'SKILL.md');
const PROVIDER_NAME = 'arya-computer-use';
const RANK = 350;
const STATUS_PATH = '/plugins/arya/status';
const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version ?? '0.0.0'; }
  catch { return '0.0.0'; }
})();

// Control files shared with the MCP adapter: the adapter polls settings.json
// for the behavior switches; the host publishes activity.json and TakeoverControl
// reads it. Both sides compute this path the same way (plugin-owned directory;
// the engine's private-DACL check applies only to its own state root).
export function controlDir() {
  const local = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
  return join(local, 'dsh-plugin-arya-desktop', 'control');
}

/* ------------------------------------------------------------------ schema */

const fields = {
  progressOverlayEnabled: z.boolean().default(true).description('Progress overlay'),
  progressOverlayMode: z.const('source').default('source').description('Overlay content: source'),
  progressOverlayOpacity: z.number().min(20).max(100).default(60).description('Overlay opacity (%)'),
  progressOverlayWidth: z.number().min(240).max(1600).default(360).description('Overlay width'),
  progressOverlayHeight: z.number().min(160).max(1600).default(240).description('Overlay height'),
  progressOverlayPosition: z.union(['top-right', 'top-left', 'bottom-right', 'bottom-left', 'custom'].map(value => z.const(value))).default('top-right').description('Overlay position'),
  progressOverlayX: z.number().min(-32768).max(32767).default(80).description('Overlay X'),
  progressOverlayY: z.number().min(-32768).max(32767).default(80).description('Overlay Y'),
  progressOverlayLocked: z.boolean().default(true).description('Lock overlay and pass through input'),
  progressLockShortcut: z.string().pattern(STOP_SHORTCUT_PATTERN).default('').description('Overlay lock shortcut'),
  progressPreviewToken: z.number().min(0).default(0),
  indicatorEnabled: z.boolean().default(true).description('Frame the app window the agent drives'),
  cursorIndicatorEnabled: z.boolean().default(true).description('Show a ghost cursor where the agent acts'),
  remoteIndicatorVisible: z.boolean().default(true).description('Visible in remote sessions and recordings'),
  indicatorText: z.string().default(DEFAULT_SETTINGS.indicatorText).description('Banner text'),
  indicatorPosition: z.union([z.const('top'), z.const('bottom')]).default('top').description('Banner position'),
  indicatorIdleMs: z.number().min(200).max(3000).default(800).description('Hide delay after the turn (ms)'),
  stopShortcut: z.string().pattern(STOP_SHORTCUT_PATTERN).default('').description('Custom stop shortcut'),
  resumeToken: z.number().min(0).default(0),
  previewToken: z.number().min(0).default(0),
  headedDefault: z.boolean().default(true).description('Send input with the real keyboard and mouse by default'),
  overlayDefault: z.boolean().default(true).description('Start the cursor overlay with each desktop session'),
  driverLockEnabled: z.boolean().default(true).description('One conversation drives the desktop at a time'),
};
export const SettingsConfig = z.object(fields);

export function createLiveReference(value) {
  let current = Array.isArray(value) ? Object.freeze([...value]) : value;
  return Object.freeze({ get: () => current, [Symbol.for('cosmokit.volatile.write')]: next => { current = next; } });
}
// Some Desktop loaders resolve Schemastery without the volatile() convenience
// method. Never silently omit the metadata the host uses to expose the form.
export const Config = z.object({
  ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, typeof field.volatile === 'function' ? field.volatile() : field.extra('volatile', true)])),
});
// A saved choice this version no longer offers must not keep the plugin from
// loading: DSH refuses the whole entry when one value fails, and every tool
// then disappears with no visible error (#39). The validator repairs such
// values to defaults and reports what changed.
export const REPAIRED_SETTINGS = Symbol.for('dsh-plugin-arya-computer-use.repairedSettings');
const validation = Config['~standard'];
Object.defineProperty(Config, '~standard', { value: { ...validation, validate(input) {
  let result = validation.validate(input), repaired = [];
  if (result.issues) {
    const repair = repairStaleSettings(input);
    if (repair.repaired.length) { const retry = validation.validate(repair.value); if (!retry.issues) { result = retry; repaired = repair.repaired; } }
  }
  if (!result.issues) {
    try { normalizeSettings(result.value); } catch (error) { return { issues: [{ message: error.message }] }; }
    for (const key of Object.keys(fields)) {
      if (typeof result.value[key]?.get !== 'function') result.value[key] = createLiveReference(result.value[key]);
    }
    if (repaired.length) Object.defineProperty(result.value, REPAIRED_SETTINGS, { value: Object.freeze(repaired) });
  }
  return result;
} } });

/* -------------------------------------------------------------------- main */

export async function apply(ctx, config) {
  registerSkillProvider(ctx);

  const root = controlDir();
  const runtime = { configFile: join(root, 'settings.json'), stateFile: join(root, 'state.json'), activityFile: join(root, 'activity.json'), layoutFile: join(root, 'overlay-layout.json'), targetFile: join(root, 'target.json') };

  let desired = normalizeSettings(config), stopped = false;
  if (config?.[REPAIRED_SETTINGS]?.length) {
    ctx.logger.warn('dsh-arya-computer-use: saved settings this version does not offer were reset to their defaults: %s', config[REPAIRED_SETTINGS].join('; '));
  }
  atomicJson(runtime.configFile, desired);

  // The takeover helper owns the overlay windows, the banner, the cursor
  // indicator, the global Esc kill, and the paused/stopped series state.
  const takeover = new TakeoverControl({
    configFile: runtime.configFile, stateFile: runtime.stateFile, activityFile: runtime.activityFile, targetFile: runtime.targetFile,
    config: desired,
    onStop: error => ctx.logger.warn('dsh-arya-computer-use: %s', error?.message ?? error),
  });
  ctx.effect(() => () => { stopped = true; takeover.close().catch(() => {}); });

  // Host-side activity lease: publishes activity.json (drives begin/end/
  // progress on the takeover helper) and enforces the driver lock.
  installActivity(ctx, runtime.activityFile, { getSettings: () => desired });

  const applySettings = next => {
    // Windows readers can briefly deny replacement. Keep desired unchanged on
    // a failed write so the next poll retries the pending settings.
    const nextSettings = normalizeSettings(next);
    atomicJson(runtime.configFile, nextSettings);
    desired = nextSettings;
    return Promise.resolve();
  };

  let saveOverlayPatch, layoutId, layoutSaving = false, layoutRetry = { id: undefined, at: 0, delay: 0 };
  ctx.effect(() => {
    const timer = setInterval(() => {
      if (saveOverlayPatch && !layoutSaving) {
        try {
          const layout = JSON.parse(readFileSync(runtime.layoutFile, 'utf8'));
          // A failed save is retried with backoff (0.5 s, doubling up to 60 s)
          // and a newer layout at once. A patch that cannot apply is dropped.
          if (layout.id !== layoutId && !(layout.id === layoutRetry.id && Date.now() < layoutRetry.at)) {
            const allowed = ['progressOverlayWidth', 'progressOverlayHeight', 'progressOverlayPosition', 'progressOverlayX', 'progressOverlayY', 'progressOverlayLocked', 'progressOverlayEnabled'];
            let usable = false;
            try {
              if (!layout.patch || typeof layout.patch !== 'object' || Object.keys(layout.patch).some(key => !allowed.includes(key))) throw Error('Invalid overlay layout patch');
              normalizeSettings({ ...desired, ...layout.patch });
              usable = !(layout.base && Object.entries(layout.base).some(([key, value]) => !allowed.includes(key) || desired[key] !== value));
            } finally { if (!usable) layoutId = layout.id; }
            if (usable) {
              layoutSaving = true;
              Promise.resolve().then(() => saveOverlayPatch(layout.patch)).then(() => {
                layoutId = layout.id;
                layoutRetry = { id: undefined, at: 0, delay: 0 };
              }, error => {
                const delay = layoutRetry.id === layout.id ? Math.min(layoutRetry.delay * 2, 60000) : 500;
                layoutRetry = { id: layout.id, at: Date.now() + delay, delay };
                ctx.logger.error(error);
              }).finally(() => { layoutSaving = false; });
            }
          }
        } catch (error) { if (error.code !== 'ENOENT') ctx.logger.error(error); }
      }
      // Older validators keep plain values rather than volatile references.
      // The raw entry still holds any value the validator reset; reset it here too.
      try {
        const next = normalizeSettings({ ...config, ...repairStaleSettings(ctx.fiber.entry?.options?.config).value });
        if (JSON.stringify(next) !== JSON.stringify(desired)) applySettings(next);
      } catch (error) { ctx.logger.error(error); }
    }, 250);
    timer.unref();
    return () => clearInterval(timer);
  });

  ctx.inject(['settings'], settingsContext => {
    if (typeof settingsContext.settings.register !== 'function') {
      if (typeof settingsContext.settings.update === 'function') settingsContext.inject(['configEditor'], owner => {
        // DSH 0.2.2's Loader (cordis 4.1) keeps a wrapper of the plugin's fiber
        // on its entry where 0.2.1 kept the fiber itself; the fiber knows its
        // entry either way (#72).
        saveOverlayPatch = patch => {
          const entries = owner.configEditor.entries();
          const entry = entries.find(entry => entry === ctx.fiber.entry) ?? entries.find(entry => entry.fiber === ctx.fiber || entry.fiber?.ctx?.fiber === ctx.fiber);
          if (!entry) throw Error('DSH lists no editable profile entry for this plugin (is it listed twice, or inside another entry?), so overlay moves and resizes are not saved.');
          return owner.settings.update(entry.options.id, patch);
        };
        return () => { saveOverlayPatch = undefined; };
      });
      // DSH 0.2 uses volatile Config fields keyed by the profile entry id.
      if (settingsContext.settings.configure) settingsContext.effect(() => settingsContext.settings.configure({ auto: false }, ctx.fiber));
      return;
    }
    const scope = settingsContext.settings.register('arya-computer-use', SettingsConfig, {
      base: normalizeSettings(config), applies: 'live', validate: normalizeSettings,
    });
    saveOverlayPatch = patch => scope.update(patch);
    desired = normalizeSettings(scope.get());
    atomicJson(runtime.configFile, desired);
    settingsContext.effect(() => scope.watch(applySettings));
  });

  // Loopback-only status endpoint (pattern derived from @axyatech/dsh-plugin-rea).
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: statusHandler }), 'arya-computer-use: status route');
  });
  function statusHandler(req, res) {
    if (!isLoopbackAddress(req?.socket?.remoteAddress)) return sendJson(res, 403, { error: 'loopback_only' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
    const maskHome = text => String(text).split(os.homedir()).join('~');
    const activity = readJson(runtime.activityFile);
    sendJson(res, 200, {
      plugin: '@konnectsuite/dsh-plugin-arya-computer-use',
      version: PLUGIN_VERSION,
      controlDir: maskHome(root),
      settings: desired,
      takeover: { running: !!takeover.child, paused: takeover.paused, seriesActive: takeover.seriesHeld, stoppedSeriesKey: takeover.stoppedSeriesKey },
      driver: activity?.active ? { sessionId: activity.sessionId, turn: activity.turn } : null,
      state: readJson(runtime.stateFile),
    });
  }
  return () => {};
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false;
  return address === '::1' || address === '::ffff:7f00:1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}
function sendJson(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(body));
}

/* ----------------------------------------------------------- skill provider */

/** Register the workflow skill as a provider, global and per-agent. */
function registerSkillProvider(ctx) {
  ctx.inject(['skills'], (scoped) => {
    scoped.effect(
      () => scoped.skills.registerProvider(() => createSkillProvider()),
      'arya-computer-use: workflow skill provider',
    );
  });

  // A global provider cannot outrank a skill the agent's own composition
  // contributes from a nearer layer. A provider registered through the
  // agent's own context joins that layer.
  const agentProviders = new Map();
  ctx.effect(
    () => () => {
      for (const fiber of agentProviders.values()) fiber.dispose?.();
      agentProviders.clear();
    },
    'arya-computer-use: agent skill providers',
  );

  ctx.on('agent/created', async ({ agent }) => {
    if (agentProviders.has(agent.id)) return;
    try {
      if (agent.ctx.get('skills') === undefined) return;
      const fiber = agent.ctx.inject(['skills'], (scoped) => {
        scoped.effect(
          () => scoped.skills.registerProvider(() => createSkillProvider()),
          'arya-computer-use: agent workflow skill provider',
        );
      });
      await fiber;
      agentProviders.set(agent.id, fiber);
    } catch {
      // A skill registration must never fail agent creation.
    }
  });

  ctx.on('agent/disposed', ({ agent }) => {
    const fiber = agentProviders.get(agent.id);
    if (fiber === undefined) return;
    fiber.dispose?.();
    agentProviders.delete(agent.id);
  });
}

function createSkillProvider() {
  return {
    name: PROVIDER_NAME,
    async list(options) {
      const parsed = await readSkill(SKILL_FILE, options?.signal);
      if (parsed === undefined) return { candidates: [], complete: true };
      return {
        candidates: [
          {
            ...summaryOf(parsed),
            provider: PROVIDER_NAME,
            source: 'runtime',
            rank: RANK,
            locator: { file: SKILL_FILE, directory: SKILL_DIR },
            resourceBase: { kind: 'directory', path: SKILL_DIR },
            path: SKILL_FILE,
          },
        ],
        complete: true,
      };
    },
    async get(candidate, options) {
      const file = candidate?.locator?.file;
      if (typeof file !== 'string') return undefined;
      const parsed = await readSkill(file, options?.signal);
      if (parsed === undefined) return undefined;
      return {
        ...summaryOf(parsed),
        source: candidate.source,
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: SKILL_DIR },
        path: parsed.path,
        ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
        content: parsed.body,
      };
    },
  };
}

function summaryOf(parsed) {
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
    invocation: parsed.invocation,
  };
}

async function readSkill(file, signal) {
  let raw;
  try {
    raw = await readFile(file, { encoding: 'utf8', signal });
  } catch {
    return undefined;
  }
  const parsed = parseFrontmatter(raw);
  if (parsed === undefined) return undefined;
  const name = stringField(parsed.data, 'name');
  const description = stringField(parsed.data, 'description');
  if (name === undefined || description === undefined) return undefined;
  const metadata = metadataOf(parsed.data);
  return {
    path: file,
    name,
    description,
    whenToUse: stringField(parsed.data, 'whenToUse'),
    invocation: invocationOf(parsed.data),
    ...(metadata === undefined ? {} : { metadata }),
    body: parsed.body,
  };
}

/** Minimal SKILL.md frontmatter reader: flat scalars plus one nested `metadata` map. */
function parseFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return undefined;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return undefined;
  const head = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, '');

  const data = Object.create(null);
  let nested;
  for (const line of head.split('\n')) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
    const match = /^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    const indented = match[1].length > 0;
    const key = match[2];
    const value = match[3].trim();
    if (indented && nested !== undefined) {
      if (data[nested] === undefined || typeof data[nested] !== 'object') data[nested] = Object.create(null);
      data[nested][key] = unquote(value);
      continue;
    }
    if (value.length === 0) {
      nested = key;
      data[key] = Object.create(null);
    } else {
      nested = undefined;
      data[key] = unquote(value);
    }
  }
  return { data, body: body.trim() };
}

function metadataOf(data) {
  const metadata = data?.metadata;
  if (metadata === undefined || typeof metadata !== 'object' || metadata === null) return undefined;
  const entries = Object.entries(metadata);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function invocationOf(data) {
  const disableModelInvocation = booleanField(data, 'disable-model-invocation');
  const userInvocable = booleanField(data, 'user-invocable');
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  };
}

function booleanField(data, key) {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return undefined;
}

function stringField(data, key) {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (first === '"' && last === '"') {
      try {
        return JSON.parse(value);
      } catch {
        return value.slice(1, -1);
      }
    }
    if (first === "'" && last === "'") return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}
