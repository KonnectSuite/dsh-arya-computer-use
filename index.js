// Arya Computer Use — Host plugin entry.
//
// Phase 1 (this): registers the arya-desktop workflow skill as a skill
// provider, global and per-agent (a per-agent provider joins the agent's own
// layer, rank 350: beats user roots 400/500, yields to project roots 100/200).
// Pattern derived from @axyatech/dsh-plugin-rea (MIT).
//
// Phase 2: settings store (configEditor), driver lock (one conversation drives
// the desktop at a time), takeover helper process management
// (scripts/takeover.ps1: edge glow, status bar, global Esc kill) + loopback
// GET /plugins/arya/status for the panel.
//
// See docs/PLAN.md §2 for the full design.

import { readFile, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, 'skills', 'arya-desktop');
const SKILL_FILE = join(SKILL_DIR, 'SKILL.md');
const PROVIDER_NAME = 'arya-computer-use';
const RANK = 350;

/** Register the Host half: the workflow skill provider. */
export function apply(ctx) {
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

  return () => {};
}

/* ----------------------------------------------------------- skill provider */

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
