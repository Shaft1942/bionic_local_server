const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const seconds = value => Number.isFinite(value) && value >= 0 ? value : undefined;
const positive = value => Number.isFinite(value) && value > 0 ? value : undefined;

/** Format only measurements received with this reply. Never infer tokens from
 * text, recompute a missing rate, or turn an absent measurement into zero.
 * The same persisted message produces the same display after a reload.
 */
export function formatMessageStats(message = {}, { language = 'fr', running = false } = {}) {
  if (!record(message) || message.role !== 'assistant') return null;
  const metrics = record(message.metrics) ? message.metrics : {};
  const values = {
    input: count(metrics.inputTokens), output: count(metrics.outputTokens), reasoning: count(metrics.reasoningTokens),
    total: seconds(metrics.totalSeconds), response: seconds(metrics.responseSeconds), queue: seconds(metrics.queueSeconds),
    first: seconds(metrics.firstFragmentSeconds), rate: positive(metrics.tokensPerSecond), phases: positive(metrics.generationPhases)
  };
  if (!Number.isSafeInteger(values.phases)) values.phases = undefined;
  const hasMetrics = Object.values(values).some(value => value !== undefined);
  if (message.directImage === true && !hasMetrics) return null;
  const english = language === 'en', locale = english ? 'en-GB' : 'fr-FR';
  const tr = (fr, en) => english ? en : fr;
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const precise = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const unavailable = tr('Non transmis', 'Not reported');
  const duration = value => value === undefined ? unavailable : precise.format(value) + ' s';
  const tokens = value => value === undefined ? unavailable : integer.format(value);
  const approximate = metrics.rateSource === 'observed';
  const rate = values.rate === undefined ? unavailable : (approximate ? '≈ ' : '') + decimal.format(values.rate) + ' tok/s';
  const partial = metrics.partial === true || message.interrupted === true || ['stopped', 'error'].includes(message.outcome);
  const durationKey = values.total !== undefined ? 'total' : 'response';
  const durationLabel = durationKey === 'total' ? tr('Durée totale, attente incluse', 'Total time, including queue') : tr('Durée de la réponse, hors attente', 'Response time, excluding queue');
  const rateNote = values.rate === undefined ? tr('Le débit n’est pas disponible pour cette réponse.', 'Throughput is unavailable for this reply.')
    : approximate ? tr('Le débit est estimé à partir du flux reçu.', 'Throughput is estimated from the received stream.')
    : metrics.rateSource === 'bionic' ? tr('Le débit est communiqué par le moteur.', 'Throughput is reported by the engine.')
    : tr('Le débit est celui transmis avec cette réponse.', 'Throughput was reported with this reply.');
  const summary = hasMetrics ? [
    { key: 'output', label: tr('Tokens produits', 'Output tokens'), value: values.output === undefined ? '— tokens' : integer.format(values.output) + ' tokens' },
    { key: 'duration', label: durationLabel, value: values[durationKey] === undefined ? '— s' : decimal.format(values[durationKey]) + ' s' },
    { key: 'rate', label: tr('Débit de génération', 'Generation throughput'), value: values.rate === undefined ? '— tok/s' : rate }
  ] : [];
  if (values.queue !== undefined && values.queue > 0) summary.push({ key: 'queue', label: tr('Attente avant exécution', 'Queue before execution'), value: tr('Attente ', 'Queue ') + decimal.format(values.queue) + ' s' });
  const details = [
    { key: 'output', label: tr('Tokens produits', 'Output tokens'), value: tokens(values.output) },
    { key: 'input', label: values.phases > 1 ? tr('Tokens d’entrée cumulés', 'Combined input tokens') : tr('Tokens en entrée', 'Input tokens'), value: tokens(values.input) },
    { key: 'rate', label: tr('Débit de génération', 'Generation throughput'), value: rate },
    { key: 'total', label: tr('Durée totale, attente incluse', 'Total time, including queue'), value: duration(values.total) },
    { key: 'queue', label: tr('Attente avant exécution', 'Queue before execution'), value: duration(values.queue) },
    { key: 'response', label: tr('Durée de la réponse, hors attente', 'Response time, excluding queue'), value: duration(values.response) },
    { key: 'first', label: tr('Premier fragment de la réponse', 'First response fragment'), value: duration(values.first) }
  ];
  if (values.reasoning !== undefined) details.push({ key: 'reasoning', label: tr('Tokens de raisonnement', 'Reasoning tokens'), value: tokens(values.reasoning) });
  if (values.phases !== undefined) details.push({ key: 'phases', label: tr('Appels au modèle', 'Model calls'), value: integer.format(values.phases) });
  const state = running ? 'running' : partial ? 'partial' : hasMetrics ? 'complete' : 'unavailable';
  const stateDescription = running ? tr('Mesures définitives en fin de réponse.', 'Final measurements at the end of the reply.')
    : partial ? hasMetrics ? tr('Mesures partielles · réponse interrompue.', 'Partial measurements · reply interrupted.') : tr('Réponse interrompue · aucune mesure transmise.', 'Reply interrupted · no measurements reported.')
    : tr('Statistiques non transmises avec cette réponse.', 'Statistics were not reported with this reply.');
  return {
    hasMetrics, partial, state, summary, details, rateNote, stateDescription,
    title: tr('Statistiques', 'Statistics'),
    accessibleTitle: tr('Statistiques de cette réponse', 'Statistics for this reply'),
    partialLabel: tr('Partielles', 'Partial'),
    note: running ? stateDescription : partial ? tr('Seules les mesures reçues avant l’interruption sont affichées. Les valeurs absentes restent inconnues.', 'Only measurements received before interruption are shown. Missing values remain unknown.')
      : tr('Les valeurs absentes n’ont pas été communiquées par le moteur.', 'Missing values were not reported by the engine.')
  };
}
