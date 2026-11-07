// Settings for dsh-arya-computer-use. Derived from dsh-computer-use-win (MIT),
// trimmed to the takeover/indicator fields this plugin uses, plus behavior
// switches for the adapter (headedDefault, overlayDefault, driverLockEnabled).

export const DEFAULT_SETTINGS = Object.freeze({
  progressOverlayEnabled: true, progressOverlayMode: 'source',
  progressOverlayOpacity: 60, progressOverlayWidth: 360, progressOverlayHeight: 240, progressOverlayPosition: 'top-right', progressOverlayX: 80, progressOverlayY: 80, progressOverlayLocked: true, progressLockShortcut: '', progressPreviewToken: 0,
  indicatorEnabled: true, cursorIndicatorEnabled: true, remoteIndicatorVisible: true, indicatorText: 'Arya is controlling your computer', pointerLabel: 'Arya',
  indicatorPosition: 'top', indicatorIdleMs: 800, stopShortcut: '',
  resumeToken: 0, previewToken: 0,
  headedDefault: false, overlayDefault: true, driverLockEnabled: true, toolPreset: 'lite',
  browserTools: 'core', browserProfile: '', browserSession: '', browserStateFile: '', browserCdp: '', browserHeaded: false,
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
const SETTING_SWITCHES = ['progressOverlayEnabled', 'indicatorEnabled', 'cursorIndicatorEnabled', 'remoteIndicatorVisible', 'progressOverlayLocked', 'headedDefault', 'overlayDefault', 'driverLockEnabled', 'browserHeaded'];
SETTING_CHOICES.progressOverlayPosition = ['top-right','top-left','bottom-right','bottom-left','custom'];
SETTING_CHOICES.progressOverlayMode = ['source','summary'];
SETTING_CHOICES.browserTools = ['core', 'network', 'state', 'debug', 'tabs', 'react', 'mobile', 'all'];
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
  for (const key of ['browserProfile', 'browserSession', 'browserStateFile', 'browserCdp']) {
    if (typeof value[key] !== 'string') throw new Error(`${key} must be a string`);
    if (/[\r\n\x00-\x1f]/.test(value[key])) throw new Error(`${key} must be one line`);
    value[key] = value[key].trim();
  }
  if (value.browserSession && !/^[\p{L}\p{N}_-]+$/u.test(value.browserSession)) throw new Error('browserSession may contain letters, numbers, hyphens and underscores');
  if (value.browserCdp && !/^(?:\d{1,5}|https?:\/\/\S+|wss?:\/\/\S+)$/.test(value.browserCdp)) throw new Error('browserCdp must be a port, an http(s):// URL or a ws:// URL');
  if (value.browserStateFile && !/^(?:[A-Za-z]:[\\/]|\/)/.test(value.browserStateFile)) throw new Error('browserStateFile must be an absolute path');
  for (const key of ['resumeToken', 'previewToken', 'progressPreviewToken']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${key} must be a nonnegative integer`);
  }
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}
