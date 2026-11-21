// Settings for dsh-arya-computer-use. Derived from dsh-computer-use-win (MIT),
// trimmed to the takeover/indicator fields this plugin uses, plus behavior
// switches for the adapter (headedDefault, overlayDefault, driverLockEnabled).

import { readFileSync } from 'node:fs';

// The one JSON reader for every control-file read in this package (settings,
// takeover state, activity, target, layout). The control files are documented as
// hand-editable, and Windows editors — Notepad included — write a UTF-8 BOM by
// default, which JSON.parse rejects ("Unexpected token '﻿'"). Every reader here
// used to swallow that in a catch and fall back to defaults, so a user could
// edit settings.json and see nothing happen, with no error anywhere. Measured
// 2026-11-20: a BOM'd control file made the browser lane start with zero flags
// and an empty env while the file plainly named them. Strip the BOM, keep the
// throw for genuinely broken JSON so callers still report it.
export function readJsonFile(file) {
  const raw = readFileSync(file, 'utf8');
  return JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
}

export const DEFAULT_SETTINGS = Object.freeze({
  // 'source' paints the assistant's raw text stream on the user's desktop. The
  // default is the condensed lane; 'source' stays available for anyone who wants
  // the verbatim panel.
  progressOverlayEnabled: true, progressOverlayMode: 'summary',
  progressOverlayOpacity: 60, progressOverlayWidth: 360, progressOverlayHeight: 240, progressOverlayPosition: 'top-right', progressOverlayX: 80, progressOverlayY: 80, progressOverlayLocked: true, progressLockShortcut: '', progressPreviewToken: 0,
  indicatorEnabled: true, cursorIndicatorEnabled: true, remoteIndicatorVisible: true, indicatorText: 'Arya is controlling your computer', pointerLabel: 'Arya',
  indicatorPosition: 'top', indicatorIdleMs: 800, stopShortcut: '',
  resumeToken: 0, previewToken: 0,
  headedDefault: false, overlayDefault: true, driverLockEnabled: true, toolPreset: 'lite',
  browserTools: 'core', browserProfile: '', browserSession: '', browserStateFile: '', browserCdp: '', browserHeaded: false,
  browserToolFlags: 'strip', browserExecutablePath: '',
  // Host-wide web-lane flags the launcher really passes (1.0.13): domains, idle
  // shutdown, daemon namespace, certificate trust, default call timeout, and the
  // consent list for upstream policy actions. Empty = the engine's own default.
  browserAllowedDomains: '', browserIdleTimeout: '', browserNamespace: '', browserCaCert: '',
  browserUseSystemCa: false, browserDefaultTimeoutMs: 0, browserConfirmActions: '',
  // Desktop-lane knobs that were adapter constants before 1.0.13.
  engineCallTimeoutMs: 150000, leaseRetryBaseMs: 800, screenshotDir: '',
});

export const STOP_SHORTCUT_PATTERN = /^(?:(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Win\+)?(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Pause|CapsLock|NumLock|ScrollLock))?$/;

export function normalizeStopShortcut(value) {
  if (typeof value !== 'string') throw new Error('stopShortcut must be a string');
  if (!value) return '';
  const parts = value.split('+'), key = parts.pop();
  const modifiers = ['Ctrl', 'Alt', 'Shift', 'Win'];
  if (parts.some(part => !modifiers.includes(part)) || new Set(parts).size !== parts.length ||
      !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Pause|CapsLock|NumLock|ScrollLock)$/.test(key)) {
    throw new Error('stopShortcut must be a supported key with optional Ctrl, Alt, Shift, Win modifiers; Esc is always reserved');
  }
  return [...modifiers.filter(part => parts.includes(part)), key].join('+');
}

// A saved value this version does not offer (chosen in another version, or
// edited by hand) must not keep the plugin from loading: DSH refuses the whole
// entry when one value fails, and every tool then disappears with no visible
// error (#39). Such choices fall back to their defaults; each change is
// returned so it can be reported. Values typed on the settings page (shortcut,
// text, numbers) stay strict, so a mistyped one is still refused when saved.
const SETTING_CHOICES = { indicatorPosition: ['top', 'bottom'] };
const SETTING_SWITCHES = ['progressOverlayEnabled', 'indicatorEnabled', 'cursorIndicatorEnabled', 'remoteIndicatorVisible', 'progressOverlayLocked', 'headedDefault', 'overlayDefault', 'driverLockEnabled', 'browserHeaded', 'browserUseSystemCa'];
SETTING_CHOICES.progressOverlayPosition = ['top-right','top-left','bottom-right','bottom-left','custom'];
SETTING_CHOICES.progressOverlayMode = ['source','summary'];
SETTING_CHOICES.browserTools = ['core', 'network', 'state', 'debug', 'tabs', 'react', 'mobile', 'webmcp', 'all'];
SETTING_CHOICES.browserToolFlags = ['strip', 'lean', 'off'];
SETTING_CHOICES.toolPreset = ['lite', 'lazy'];
export function repairStaleSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value: input, repaired: [] };
  const value = { ...input }, repaired = [];
  const read = key => typeof value[key]?.get === 'function' ? value[key].get() : value[key];
  const reset = key => { repaired.push(`${key}: ${JSON.stringify(read(key))}`); delete value[key]; };
  for (const [key, allowed] of Object.entries(SETTING_CHOICES)) if (read(key) != null && !allowed.includes(read(key))) reset(key);
  for (const key of SETTING_SWITCHES) if (read(key) != null && typeof read(key) !== 'boolean') reset(key);
  return { value, repaired };
}

export function normalizeSettings(input = {}) {
  const value = { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(input).map(([key,value])=>[key,typeof value?.get === 'function' ? value.get() : value])) };
  for (const key of SETTING_SWITCHES) {
    if (typeof value[key] !== 'boolean') throw new Error(`${key} must be boolean`);
  }
  if (typeof value.indicatorText !== 'string' || !value.indicatorText.trim() || value.indicatorText.length > 120 || /[\r\n\x00-\x1f]/.test(value.indicatorText)) {
    throw new Error('indicatorText must be one line of 1–120 characters');
  }
  if (typeof value.pointerLabel !== 'string' || !value.pointerLabel.trim() || value.pointerLabel.trim().length > 16 || /[\r\n\x00-\x1f]/.test(value.pointerLabel)) {
    throw new Error('pointerLabel must be one line of 1–16 characters');
  }
  value.pointerLabel = value.pointerLabel.trim();
  if (!['top', 'bottom'].includes(value.indicatorPosition)) throw new Error('indicatorPosition must be top or bottom');
  if (!Number.isInteger(value.indicatorIdleMs) || value.indicatorIdleMs < 200 || value.indicatorIdleMs > 3000) throw new Error('indicatorIdleMs must be 200–3000');
  value.stopShortcut = normalizeStopShortcut(value.stopShortcut);
  value.progressLockShortcut = normalizeStopShortcut(value.progressLockShortcut);
  if (value.progressLockShortcut && value.progressLockShortcut === value.stopShortcut) throw new Error('progressLockShortcut must differ from the stop shortcut');
  for (const [key,min,max] of [['progressOverlayOpacity',20,100],['progressOverlayWidth',240,1600],['progressOverlayHeight',160,1600],['progressOverlayX',-32768,32767],['progressOverlayY',-32768,32767]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  if (!SETTING_CHOICES.progressOverlayPosition.includes(value.progressOverlayPosition)) throw new Error('Invalid progressOverlayPosition');
  if (!SETTING_CHOICES.progressOverlayMode.includes(value.progressOverlayMode)) throw new Error('Invalid progressOverlayMode');
  if (!SETTING_CHOICES.toolPreset.includes(value.toolPreset)) throw new Error('toolPreset must be one of ' + SETTING_CHOICES.toolPreset.join(', '));
  if (!SETTING_CHOICES.browserTools.includes(value.browserTools)) throw new Error('browserTools must be one of ' + SETTING_CHOICES.browserTools.join(', '));
  if (!SETTING_CHOICES.browserToolFlags.includes(value.browserToolFlags)) throw new Error('browserToolFlags must be one of ' + SETTING_CHOICES.browserToolFlags.join(', '));
  for (const key of ['browserProfile', 'browserSession', 'browserStateFile', 'browserCdp', 'browserExecutablePath']) {
    if (typeof value[key] !== 'string') throw new Error(`${key} must be a string`);
    if (/[\r\n\x00-\x1f]/.test(value[key])) throw new Error(`${key} must be one line`);
    value[key] = value[key].trim();
  }
  if (value.browserSession && !/^[\p{L}\p{N}_-]+$/u.test(value.browserSession)) throw new Error('browserSession may contain letters, numbers, hyphens and underscores');
  if (value.browserCdp && !/^(?:\d{1,5}|https?:\/\/\S+|wss?:\/\/\S+)$/.test(value.browserCdp)) throw new Error('browserCdp must be a port, an http(s):// URL or a ws:// URL');
  if (value.browserStateFile && !/^(?:[A-Za-z]:[\\/]|\/)/.test(value.browserStateFile)) throw new Error('browserStateFile must be an absolute path');
  if (value.browserExecutablePath && !/^(?:[A-Za-z]:[\\/]|\/)/.test(value.browserExecutablePath)) throw new Error('browserExecutablePath must be an absolute path');
  if (value.screenshotDir && !/^(?:[A-Za-z]:[\\/]|\/)/.test(value.screenshotDir)) throw new Error('screenshotDir must be an absolute path, or empty for the plugin folder');
  if (value.browserCaCert && !/^(?:[A-Za-z]:[\\/]|\/)/.test(value.browserCaCert)) throw new Error('browserCaCert must be an absolute path to a PEM file');
  // agent-browser takes these as a comma-joined list / a single value; keep them
  // one-line and shape-checked so a bad value fails at save, not at daemon start.
  for (const key of ['browserAllowedDomains', 'browserIdleTimeout', 'browserNamespace', 'browserCaCert', 'browserConfirmActions', 'screenshotDir']) {
    if (typeof value[key] !== 'string') throw new Error(`${key} must be a string`);
    if (/[\r\n\x00-\x1f]/.test(value[key])) throw new Error(`${key} must be one line`);
    value[key] = value[key].trim();
  }
  if (value.browserNamespace && !/^[\p{L}\p{N}_-]+$/u.test(value.browserNamespace)) throw new Error('browserNamespace may contain letters, numbers, hyphens and underscores');
  if (value.browserIdleTimeout && !/^(?:0|[0-9]+(?:\.[0-9]+)?(?:ms|s|m|h|d)?)$/i.test(value.browserIdleTimeout)) throw new Error('browserIdleTimeout must be a duration such as 45s, 30m, 1h, or 0 to disable');
  for (const entry of value.browserAllowedDomains.split(/[,\s]+/).filter(Boolean)) {
    if (!/^(?:\*\.)?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(entry)) throw new Error(`browserAllowedDomains: "${entry}" is not a domain pattern`);
  }
  for (const entry of value.browserConfirmActions.split(/[,\s]+/).filter(Boolean)) {
    if (!/^[A-Za-z0-9_:*.-]+$/.test(entry)) throw new Error(`browserConfirmActions: "${entry}" is not a policy action id`);
  }
  if (!Number.isInteger(value.browserDefaultTimeoutMs) || value.browserDefaultTimeoutMs < 0 || value.browserDefaultTimeoutMs > 600000) throw new Error('browserDefaultTimeoutMs must be 0 (engine default) or 1000–600000');
  if (value.browserDefaultTimeoutMs > 0 && value.browserDefaultTimeoutMs < 1000) throw new Error('browserDefaultTimeoutMs must be 0 (engine default) or at least 1000');
  if (!Number.isInteger(value.engineCallTimeoutMs) || value.engineCallTimeoutMs < 10000 || value.engineCallTimeoutMs > 300000) throw new Error('engineCallTimeoutMs must be 10000–300000');
  if (!Number.isInteger(value.leaseRetryBaseMs) || value.leaseRetryBaseMs < 0 || value.leaseRetryBaseMs > 10000) throw new Error('leaseRetryBaseMs must be 0 (no retry) or 100–10000');
  if (value.leaseRetryBaseMs > 0 && value.leaseRetryBaseMs < 100) throw new Error('leaseRetryBaseMs must be 0 (no retry) or at least 100');
  for (const key of ['resumeToken', 'previewToken', 'progressPreviewToken']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${key} must be a nonnegative integer`);
  }
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}
