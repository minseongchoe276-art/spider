import {cleanSettings} from './PlayerSettings.js';
const KEY = 'shadow-pulse-preferences-v1';
const LEGACY_KEY = 'spiderman-preferences-v1';

export class Preferences {
  constructor(storage = null, reducedMotion = false) {
    this.storage = storage;
    this.lastSaveSucceeded = false;
    this.values = { muted: false, reducedMotion, quality: 'balanced', settings:cleanSettings() };
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || storage?.getItem(LEGACY_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        this.values.settings=cleanSettings(saved.settings);
        for (const key of ['muted', 'reducedMotion']) {
          if (typeof saved[key] === 'boolean') this.values[key] = saved[key];
        }
        if (['low', 'balanced', 'high'].includes(saved.quality)) this.values.quality = saved.quality;
      }
    } catch { /* A corrupt or unavailable save must never prevent playing. */ }
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.values)); this.storage?.removeItem?.(LEGACY_KEY); this.lastSaveSucceeded = !!this.storage; }
    catch { this.lastSaveSucceeded = false; }
    return this.lastSaveSucceeded;
  }
}
