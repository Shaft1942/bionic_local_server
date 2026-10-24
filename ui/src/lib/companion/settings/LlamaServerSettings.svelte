<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from '../preferences.svelte';
  import { post, message, type Request } from './types';
  import RangeField from './RangeField.svelte';
  let { request, onDirtyChange, onInferenceChange, active = true }: { request: Request; onDirtyChange?: (dirty: boolean) => void; onInferenceChange?: () => void; active?: boolean } = $props();
  let data = $state<any>(null), catalogue = $state<any>(null), directory = $state(''), binaryPath = $state(''), port = $state(1238), contextSize = $state(8192), gpuLayers = $state(0), selected = $state('');
  let busy = $state(false), loading = $state(false), failure = $state(''), notice = $state(''), consent = $state(false), mounted = $state(false), nonce = $state(''), wasActive = false;
  const localDirty = $derived(!!data && (directory !== data.profile.directory || binaryPath !== data.profile.binaryPath || Number(port) !== data.profile.port || Number(contextSize) !== data.profile.contextSize || Number(gpuLayers) !== data.profile.gpuLayers));
  const dirty = $derived(localDirty || !!data && selected !== data.profile.modelId);
  const owned = $derived(data?.process?.owned === true);
  const chosen = $derived(catalogue?.models?.find((item: any) => item.id === selected));
  const statusName = (value: string) => ({ configured: tr('Configuré', 'Configured'), 'detected-unowned': tr('Détecté, externe', 'Detected, external'), running: tr('En cours', 'Running'), starting: tr('Démarrage en cours', 'Starting'), stopping: tr('Arrêt en cours', 'Stopping'), stopped: tr('Arrêté', 'Stopped'), failed: tr('Échec', 'Failed'), unknown: tr('À vérifier', 'Needs review'), accepted: tr('Accepté', 'Accepted'), succeeded: tr('Terminé', 'Completed') } as Record<string, string>)[value] || value;
  const actionName = (value: string) => ({ start: tr('Démarrage', 'Start'), stop: tr('Arrêt', 'Stop'), replace: tr('Remplacement', 'Replacement') } as Record<string, string>)[value] || value;
  $effect(() => { onDirtyChange?.(dirty); });
  function adopt(value: any, keepDraft = false) {
    data = value;
    if (typeof value.csrfNonce === 'string') nonce = value.csrfNonce;
    if (!keepDraft) { directory = value.profile.directory; binaryPath = value.profile.binaryPath; port = value.profile.port; contextSize = value.profile.contextSize; gpuLayers = value.profile.gpuLayers; selected = value.profile.modelId || ''; }
  }
  async function refresh(keepDraft = false, withCatalogue = false) {
    loading = true;
    try { adopt(await request('/api/llama-server'), keepDraft); if (withCatalogue || !catalogue) catalogue = await request('/api/llama-server/models?' + new URLSearchParams({ directory })); }
    catch (error) { failure = message(error); } finally { loading = false; }
  }
  async function scan() {
    loading = true; failure = ''; notice = '';
    try { catalogue = await request('/api/llama-server/models?' + new URLSearchParams({ directory })); if (selected && !catalogue.models.some((item: any) => item.id === selected)) selected = ''; notice = tr('Catalogue relu sans chargement de modèle.', 'Catalogue refreshed without loading a model.'); }
    catch (error) { failure = message(error); } finally { loading = false; }
  }
  async function save() {
    busy = true; failure = ''; notice = '';
    try { const value = await post(request, '/api/llama-server/settings', { directory, binaryPath, port: Number(port), contextSize: Number(contextSize), gpuLayers: Number(gpuLayers), modelId: selected, expectedRevision: data.profile.revision }, { 'X-Local-Service-CSRF': nonce }); adopt(value); await refresh(false); notice = tr('Profil enregistré. Démarre-le explicitement quand les autres modèles sont déchargés.', 'Profile saved. Start it explicitly once other models are unloaded.'); }
    catch (error) { failure = message(error); await refresh(true); notice = tr('État relu. Aucun enregistrement renvoyé automatiquement.', 'State refreshed. The save was not automatically submitted again.'); } finally { busy = false; }
  }
  const newId = () => 'llama-' + [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16).padStart(8, '0')).join('');
  async function action(kind: 'start' | 'stop' | 'replace') {
    const question = kind === 'stop' ? tr('Arrêter uniquement le processus llama-server possédé par Canaé ?', 'Stop only the llama-server process owned by Canaé?') : kind === 'replace' ? tr('Arrêter le modèle possédé puis charger ce GGUF : ', 'Stop the owned model and load this GGUF: ') + chosen?.name : tr('Démarrer un nouveau processus possédé avec ce GGUF : ', 'Start a new owned process with this GGUF: ') + chosen?.name;
    if (!confirm(question)) return;
    busy = true; failure = ''; notice = '';
    const requestId = newId();
    try { await post(request, '/api/llama-server/action', { action: kind, requestId, expectedRevision: data.profile.revision, ...(kind !== 'stop' ? { modelId: selected } : {}), consent: true }, { 'X-Local-Service-CSRF': nonce }); await refresh(true); onInferenceChange?.(); notice = tr('Action confirmée. Vérifie la connexion du moteur dans Moteurs d’inférence.', 'Action confirmed. Check the engine connection under Inference engines.'); }
    catch (error) { failure = message(error); await refresh(true); notice = tr('État relu après l’action. Aucun démarrage, arrêt ou remplacement renvoyé automatiquement.', 'State refreshed after the action. No start, stop or replacement was automatically submitted again.'); } finally { busy = false; consent = false; }
  }
  $effect(() => { if (mounted && active && !wasActive) { wasActive = true; void refresh(true); } else if (!active) wasActive = false; });
  onMount(() => { mounted = true; wasActive = active; void refresh(false, true); return () => { mounted = false; }; });
</script>

<h3>{tr('Bibliothèque et lancement de llama-server', 'llama-server library and startup')}</h3>
<p class="settings-description">{tr('Les GGUF de la bibliothèque restent partagés avec Bionic, sans copie. Un fichier présent ne garantit pas sa compatibilité avec ce binaire. Les projecteurs multimodaux sont exclus de ce profil texte.', 'Library GGUF files remain shared with Bionic, without copying. A file on disk does not guarantee compatibility with this binary. Multimodal projectors are excluded from this text profile.')}</p>
<p class="settings-description">{tr('Canaé contrôle uniquement les processus qu’elle démarre. Un serveur lancé ailleurs reste externe : son arrêt et son changement de GGUF s’effectuent dans son application. Un seul moteur de conversation doit être chargé à la fois.', 'Canaé controls only processes it starts. A server started elsewhere remains external: stop it or change its GGUF in its own application. Only one conversation engine should be loaded at a time.')}</p>
{#if loading && !data}<p role="status">{tr('Lecture du profil…', 'Reading profile…')}</p>{/if}
{#if data}
  <form onsubmit={event => { event.preventDefault(); void save(); }}>
    <label class="setting-field" for="llama-library-directory">{tr('Dossier GGUF partagé', 'Shared GGUF directory')}<input id="llama-library-directory" bind:value={directory} disabled={busy || owned || !data.canConfigureLocal} /></label>
    <label class="setting-field" for="llama-server-binary">{tr('Binaire llama-server sur le PC', 'llama-server binary on the PC')}<input id="llama-server-binary" bind:value={binaryPath} disabled={busy || owned || !data.canConfigureLocal} /></label>
    <label class="setting-field" for="llama-server-port">{tr('Port du processus possédé', 'Owned process port')}<input id="llama-server-port" type="number" min="1024" max="65535" step="1" bind:value={port} disabled={busy || owned || !data.canConfigureLocal} /></label>
    {#if !data.canConfigureLocal}<p class="settings-description">{tr('Le dossier, le binaire et le port se règlent depuis le navigateur du PC serveur. La sélection du modèle et ses paramètres restent disponibles ici.', 'Configure the directory, binary and port from the server PC browser. Model selection and its parameters remain available here.')}</p>{/if}
    <div class="settings-actions"><Button type="button" variant="outline" onclick={scan} disabled={busy || loading}>{tr('Actualiser les GGUF', 'Refresh GGUF files')}</Button></div>
    <label class="setting-field" for="llama-library-model">{tr('GGUF du profil', 'Profile GGUF')}<select id="llama-library-model" bind:value={selected} disabled={busy || !catalogue?.models?.length}><option value="">{tr('Choisir un fichier GGUF', 'Choose a GGUF file')}</option>{#each catalogue?.models || [] as item}<option value={item.id} disabled={!item.selectable}>{item.name}{item.selectable ? ' · ' + tr('compatibilité à vérifier', 'compatibility unverified') : ' · ' + tr('non pris en charge', 'unsupported')}</option>{/each}</select></label>
    {#if chosen}<p class="settings-description">{chosen.relativePath} · {(chosen.size / 1073741824).toFixed(2)} GiB{chosen.architecture ? ' · ' + chosen.architecture : ''}</p>{/if}
    {#if catalogue}<p class="settings-description">{catalogue.models.length} {tr('GGUF affichés', 'GGUF files shown')} · {catalogue.excludedProjectors} {tr('projecteurs exclus', 'projectors excluded')}{catalogue.truncated ? ' · ' + tr('inventaire borné, liste partielle', 'bounded inventory, partial list') : ''}</p>{/if}
    <RangeField id="llama-context-size" label={tr('Contexte demandé au lancement', 'Context requested at startup')} bind:value={contextSize} min={512} max={131072} step={1} scale="log" disabled={busy || owned} />
    <RangeField id="llama-gpu-layers" label={tr('Couches sur GPU (0 = CPU)', 'GPU layers (0 = CPU)')} bind:value={gpuLayers} min={0} max={256} step={1} disabled={busy || owned} />
    <p class="settings-description">{tr('Ces valeurs sont des demandes de lancement. Le contexte effectif, la mémoire nécessaire et la compatibilité restent à confirmer par le serveur.', 'These are startup requests. Actual context, required memory and compatibility must still be confirmed by the server.')}</p>
    <Button type="submit" disabled={busy || owned || !dirty || !selected}>{tr('Enregistrer le profil', 'Save profile')}</Button>
  </form>
  <div class="settings-divider"></div><h3>{tr('Processus possédé', 'Owned process')}</h3>
  <dl class="settings-dl"><dt>{tr('État', 'Status')}</dt><dd>{statusName(data.process.state)}</dd><dt>{tr('Adresse du profil', 'Profile address')}</dt><dd>{data.profile.endpoint}</dd>{#if data.process.model}<dt>{tr('Modèle du processus', 'Process model')}</dt><dd>{data.process.model.name}</dd>{/if}</dl>
  {#if data.process.state === 'detected-unowned'}<p class="settings-feedback">{tr('Un service existe déjà sur ce port. Il n’est pas possédé par cette session du compagnon ; l’arrêt et le remplacement sont refusés.', 'A service already exists on this port. It is not owned by this companion session; stopping and replacing it are refused.')}</p>{/if}
  {#if data.operation}<p class="settings-description" data-testid="llama-operation">{actionName(data.operation.action)} · {statusName(data.operation.state)}</p><details><summary>{tr('Détails du suivi', 'Tracking details')}</summary><p class="settings-description">{data.operation.requestId}</p></details>{/if}
  <p class="settings-description">{tr('Après une déconnexion du navigateur, Actualiser l’état retrouve l’action en cours. Après un redémarrage du compagnon, un processus existant reste externe et ne sera pas adopté automatiquement.', 'After a browser disconnect, Refresh status recovers the current action. After a companion restart, an existing process remains external and will not be automatically adopted.')}</p>
  <label class="setting-check"><input type="checkbox" bind:checked={consent} disabled={busy} />{tr('Les autres modèles sont déchargés ; j’autorise ce lancement ou ce remplacement.', 'Other models are unloaded; I authorize this start or replacement.')}</label>
  <div class="settings-actions"><Button variant="outline" onclick={() => refresh(true)} disabled={busy || loading}>{tr('Actualiser l’état', 'Refresh status')}</Button><Button onclick={() => action('start')} disabled={busy || !data.canControl || owned || data.process.state === 'detected-unowned' || localDirty || !chosen?.selectable || !consent}>{tr('Démarrer le profil', 'Start profile')}</Button><Button variant="outline" onclick={() => action('replace')} disabled={busy || !data.canControl || !owned || localDirty || !chosen?.selectable || !consent}>{tr('Remplacer le modèle possédé', 'Replace owned model')}</Button><Button variant="outline" onclick={() => action('stop')} disabled={busy || !data.canControl || !owned}>{tr('Arrêter le processus possédé', 'Stop owned process')}</Button></div>
{/if}
{#if failure}<p class="settings-error" role="alert">{failure}</p>{/if}
{#if notice}<p class="settings-feedback" role="status">{notice}</p>{/if}
