// IndexedDB persistence: saved sessions, recorded audio, custom scenarios.
// Every call degrades gracefully when IndexedDB is unavailable (private mode).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SessionRecord } from '../domain/analytics/history';
import type { ScenarioTemplateInput } from '../domain/scenario/schema';

interface FirstFiveDB extends DBSchema {
  sessions: { key: string; value: SessionRecord; indexes: { byDate: number } };
  recordings: { key: string; value: { id: string; blob: Blob; mime: string; createdAt: number } };
  scenarios: { key: string; value: { id: string; template: ScenarioTemplateInput; updatedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<FirstFiveDB>> | null = null;

function db() {
  if (typeof indexedDB === 'undefined') return null;
  dbPromise ??= openDB<FirstFiveDB>('first-five', 1, {
    upgrade(d) {
      const s = d.createObjectStore('sessions', { keyPath: 'id' });
      s.createIndex('byDate', 'endedAt');
      d.createObjectStore('recordings', { keyPath: 'id' });
      d.createObjectStore('scenarios', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

async function safe<T>(fn: (d: IDBPDatabase<FirstFiveDB>) => Promise<T>, fallback: T): Promise<T> {
  try {
    const p = db();
    if (!p) return fallback;
    return await fn(await p);
  } catch (e) {
    console.warn('IndexedDB unavailable', e);
    return fallback;
  }
}

export const storage = {
  saveSession: (r: SessionRecord) => safe((d) => d.put('sessions', r).then(() => true), false),
  listSessions: () => safe((d) => d.getAllFromIndex('sessions', 'byDate').then((x) => x.reverse()), [] as SessionRecord[]),
  deleteSession: (id: string) => safe((d) => d.delete('sessions', id).then(() => true), false),
  clearSessions: () => safe((d) => d.clear('sessions').then(() => true), false),
  saveRecording: (id: string, blob: Blob) => safe((d) => d.put('recordings', { id, blob, mime: blob.type, createdAt: Date.now() }).then(() => true), false),
  getRecording: (id: string) => safe((d) => d.get('recordings', id).then((r) => r?.blob ?? null), null as Blob | null),
  saveScenario: (template: ScenarioTemplateInput) =>
    safe((d) => d.put('scenarios', { id: template.id, template, updatedAt: Date.now() }).then(() => true), false),
  listScenarios: () => safe((d) => d.getAll('scenarios').then((x) => x.map((r) => r.template)), [] as ScenarioTemplateInput[]),
  deleteScenario: (id: string) => safe((d) => d.delete('scenarios', id).then(() => true), false),
};

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`first-five:${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`first-five:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
