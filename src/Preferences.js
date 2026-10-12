const KEY = 'spiderman-preferences-v1';
const validCourse = course => /^(procedural|hong-kong)-(v2|v[34]-[0-9a-f]{8})$/.test(course);

export class Preferences {
  constructor(storage = null, reducedMotion = false) {
    this.storage = storage;
    this.lastSaveSucceeded = false;
    this.values = { muted: false, reducedMotion, quality: 'balanced', bestTimes: {} };
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const key of ['muted', 'reducedMotion']) {
          if (typeof saved[key] === 'boolean') this.values[key] = saved[key];
        }
        if (['low', 'balanced', 'high'].includes(saved.quality)) this.values.quality = saved.quality;
        for (const [course, time] of Object.entries(saved.bestTimes || {}).slice(-64)) {
          if (validCourse(course) &&
              Number.isFinite(time) && time > 0) this.values.bestTimes[course] = time;
        }
      }
    } catch { /* A corrupt or unavailable save must never prevent playing. */ }
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.values)); this.lastSaveSucceeded = !!this.storage; }
    catch { this.lastSaveSucceeded = false; }
    return this.lastSaveSucceeded;
  }

  recordTime(course, time) {
    if (!validCourse(course) || !Number.isFinite(time) || time <= 0) return false;
    const previous = this.values.bestTimes[course];
    if (previous === undefined || time < previous) {
      this.values.bestTimes[course] = time;
      while (Object.keys(this.values.bestTimes).length > 64) delete this.values.bestTimes[Object.keys(this.values.bestTimes)[0]];
      this.save();
      return true;
    }
    return false;
  }
}
