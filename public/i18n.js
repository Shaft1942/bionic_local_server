/* Interface language only. Never receives prompts, chat messages or file contents. */
(function (host) {
  'use strict';
  const fallbackLanguage = 'fr', storageKey = 'bionic.interface-language.v1';
  const languages = Object.freeze([
    Object.freeze({ code: 'fr', label: 'Français', locale: 'fr-FR', dir: 'ltr' }),
    Object.freeze({ code: 'en', label: 'English', locale: 'en-GB', dir: 'ltr' })
  ]);
  const catalogs = new Map(), listeners = new Set(), appliedText = new WeakMap(), appliedAttributes = new WeakMap(), textParameters = new WeakMap();
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const normalize = value => typeof value === 'string' ? value.trim().replace(/_/g, '-').toLowerCase() : '';
  function resolveLanguage(preferences) {
    for (const requested of Array.isArray(preferences) ? preferences : [preferences]) {
      const candidate = normalize(requested);
      const exact = languages.find(item => normalize(item.code) === candidate || normalize(item.locale) === candidate);
      if (exact) return exact.code;
      const base = candidate.split('-')[0], match = languages.find(item => item.code === base);
      if (match) return match.code;
    }
    return fallbackLanguage;
  }
  let stored;
  try { stored = host.localStorage?.getItem(storageKey); } catch { /* Private browsing can deny storage. */ }
  let language = stored && languages.some(item => item.code === stored)
    ? stored : resolveLanguage(host.navigator?.languages || host.navigator?.language);
  const metadata = () => languages.find(item => item.code === language);
  function register(code, entries) {
    if (!languages.some(item => item.code === code)) throw new Error('Unknown interface language: ' + code);
    const catalog = catalogs.get(code) || Object.create(null);
    for (const [key, entry] of Object.entries(entries)) {
      if (has(catalog, key)) throw new Error('Duplicate translation: ' + code + ':' + key);
      if (typeof entry !== 'string' && (!entry || typeof entry !== 'object' || typeof entry.other !== 'string')) throw new Error('Invalid translation: ' + key);
      catalog[key] = entry;
    }
    catalogs.set(code, catalog);
  }
  function t(key, params = {}) {
    const local = catalogs.get(language), fallback = catalogs.get(fallbackLanguage);
    let entry = local && has(local, key) ? local[key] : fallback && has(fallback, key) ? fallback[key] : key;
    if (typeof entry === 'object') {
      const category = new Intl.PluralRules(metadata().locale).select(Number(params.count));
      entry = entry[category] ?? entry.other;
    }
    return entry.replace(/\{([A-Za-z][\w]*)\}/g, (match, name) => {
      if (!has(params, name)) return match;
      return name === 'count' && typeof params[name] === 'number' ? new Intl.NumberFormat(metadata().locale).format(params[name]) : String(params[name]);
    });
  }
  function translatePage(root = host.document) {
    if (!root?.querySelectorAll) return;
    if (host.document?.documentElement) {
      host.document.documentElement.lang = language;
      host.document.documentElement.dir = metadata().dir;
    }
    // Only explicitly marked interface elements. Content from users/models is never scanned.
    for (const element of root.querySelectorAll('[data-i18n-initial]')) {
      element.textContent = t(element.getAttribute('data-i18n-initial'));
      element.removeAttribute('data-i18n-initial');
    }
    for (const element of root.querySelectorAll('[data-i18n]')) {
      const key = element.dataset.i18n, previous = appliedText.get(element) ?? catalogs.get(fallbackLanguage)?.[key];
      // A controller may have replaced an initial placeholder with a chat name or live status.
      // Such content is owned by that controller, never by this static binding.
      if (element.textContent !== previous) continue;
      const value = t(key, textParameters.get(element)); element.textContent = value; appliedText.set(element, value);
    }
    for (const attribute of ['title', 'placeholder', 'alt', 'aria-label', 'aria-valuetext']) {
      for (const element of root.querySelectorAll('[data-i18n-' + attribute + ']')) {
        const key = element.getAttribute('data-i18n-' + attribute), values = appliedAttributes.get(element) || {};
        const previous = values[attribute] ?? catalogs.get(fallbackLanguage)?.[key];
        if (element.getAttribute(attribute) !== previous) continue;
        const value = t(key); element.setAttribute(attribute, value); values[attribute] = value; appliedAttributes.set(element, values);
      }
    }
  }
  function setLanguage(code) {
    if (!languages.some(item => item.code === code)) return { language, persisted: false, supported: false };
    let persisted = false;
    try { host.localStorage?.setItem(storageKey, code); persisted = !!host.localStorage; } catch { /* Keep working in this tab. */ }
    const changed = code !== language;
    language = code;
    translatePage();
    if (changed) for (const listener of listeners) listener(language);
    return { language, persisted, supported: true };
  }
  host.BionicI18n = Object.freeze({
    languages, storageKey, fallbackLanguage, register, t, translatePage, setLanguage,
    getLanguage: () => language,
    getLocale: () => metadata().locale,
    resolveLanguage,
    bindText(element, key, params) {
      element.setAttribute('data-i18n', key); element.textContent = t(key, params);
      appliedText.set(element, element.textContent); textParameters.set(element, params); return element;
    },
    bindAttribute(element, attribute, key) {
      if (!['title', 'placeholder', 'alt', 'aria-label', 'aria-valuetext'].includes(attribute)) throw new Error('Unsupported translated attribute');
      const value = t(key), values = appliedAttributes.get(element) || {};
      element.setAttribute('data-i18n-' + attribute, key); element.setAttribute(attribute, value);
      values[attribute] = value; appliedAttributes.set(element, values); return element;
    },
    number: (value, options) => new Intl.NumberFormat(metadata().locale, options).format(value),
    date: (value, options) => new Intl.DateTimeFormat(metadata().locale, options).format(value instanceof Date ? value : new Date(value)),
    onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); }
  });
  host.document?.addEventListener?.('DOMContentLoaded', () => translatePage(), { once: true });
})(globalThis);
