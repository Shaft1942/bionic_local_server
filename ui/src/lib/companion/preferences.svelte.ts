export type Preferences = { theme: 'system' | 'light' | 'dark'; language: 'fr' | 'en'; draftHours: 0 | 1 | 24 | 168; revision: number };
export const preferences = $state<Preferences>({ theme: 'system', language: 'fr', draftHours: 24, revision: 0 });
let key = '';
export const tr = (fr: string, en: string) => preferences.language === 'en' ? en : fr;
function applyTheme() { if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', preferences.theme === 'dark' || preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); }
export function activatePreferences(instanceId: string) {
  key = 'bionic:llama-preferences:' + instanceId;
  try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); if (['light','dark','system'].includes(saved.theme)) preferences.theme = saved.theme; if (['fr','en'].includes(saved.language)) preferences.language = saved.language; if ([0,1,24,168].includes(saved.draftHours)) preferences.draftHours = saved.draftHours; } catch { /* Preferences stay usable in memory. */ }
  applyTheme(); document.documentElement.lang = preferences.language;
  return preferences;
}
export function setPreferences(next: Partial<Omit<Preferences,'revision'>>) {
  Object.assign(preferences, next); preferences.revision++; applyTheme(); document.documentElement.lang = preferences.language;
  if (key) localStorage.setItem(key, JSON.stringify(preferences));
  return { ...preferences };
}
