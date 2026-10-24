<script lang="ts">
  import { untrack } from 'svelte';
  import { tr } from './preferences.svelte';
  import { collectMessageImages, mergeMessageImages, messageImagePending, messageImageReady, messageImageRoute, type MessageImage } from './message-images';

  let { request, projectId, chatId, message, active = true, onOpenGallery }: { request: (route: string, options?: RequestInit) => Promise<any>; projectId: string; chatId: string; message: any; active?: boolean; onOpenGallery?: () => void } = $props();
  let observed = $state<MessageImage[]>([]), trackingErrors = $state<Record<string, string>>({}), displayErrors = $state<Record<string, boolean>>({}), displayVersions = $state<Record<string, number>>({});
  let refreshing = $state(false), refreshAll: (() => Promise<void>) | undefined;
  const scope = $derived(projectId + '\0' + chatId + '\0' + (message?.id || ''));
  const declared = $derived(collectMessageImages(message));
  const images = $derived(mergeMessageImages(declared, observed));
  const owner = $derived({ projectId, chatId, messageId: message?.id || '' });
  const labels: Record<string, string> = $derived({ 'waiting-resource': tr('En attente de ressource', 'Waiting for resources'), submitting: tr('Envoi à ComfyUI', 'Submitting to ComfyUI'), queued: tr('Dans la file', 'Queued'), running: tr('Génération en cours', 'Generating'), succeeded: tr('Image prête', 'Image ready'), failed: tr('Échec de la génération', 'Generation failed'), error: tr('Échec de la génération', 'Generation failed'), unknown: tr('Résultat incertain', 'Uncertain result'), cancelled: tr('Annulée localement', 'Cancelled locally'), canceled: tr('Annulée localement', 'Cancelled locally'), stopped: tr('Arrêtée', 'Stopped') });
  const assetUrl = (image: MessageImage) => messageImageRoute(owner, image.id) + (displayVersions[image.id] ? '&display=' + displayVersions[image.id] : '');
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  const imageLabel = (image: MessageImage, index: number) => {
    const total = Number.isInteger(image.seriesTotal) && image.seriesTotal! > 1 ? image.seriesTotal! : images.length;
    const position = Number.isInteger(image.seriesIndex) && image.seriesIndex! > 0 && image.seriesIndex! <= total ? image.seriesIndex! : index + 1;
    return total > 1 ? tr(`Image ${position} sur ${total}`, `Image ${position} of ${total}`) : tr('Image', 'Image');
  };

  $effect(() => { scope; observed = []; trackingErrors = {}; displayErrors = {}; displayVersions = {}; });
  $effect(() => {
    const identity = scope, initial = declared, enabled = active, target = owner;
    if (!enabled || !initial.length || !target.projectId || !target.chatId || !target.messageId) return;
    const controller = new AbortController(), blocked = new Set<string>();
    let disposed = false, inFlight = false, timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(timer); if (!disposed && images.some(image => messageImagePending(image) && !blocked.has(image.id))) timer = setTimeout(() => void poll(), 1800); };
    async function poll(all = false) {
      if (disposed || inFlight || document.hidden) { if (!disposed) schedule(); return; }
      const selected = images.filter(image => all || messageImagePending(image) && !blocked.has(image.id));
      if (!selected.length) return;
      inFlight = true; refreshing = true;
      try {
        await Promise.all(selected.map(async image => {
          try {
            const value = await request(messageImageRoute(target, image.id, 'generation'), { signal: controller.signal });
            if (disposed || scope !== identity) return;
            if (value?.id !== image.id) throw new Error('Unexpected image tracking identity');
            observed = mergeMessageImages(observed, [value]);
            const next = { ...trackingErrors }; delete next[image.id]; trackingErrors = next; blocked.delete(image.id);
          } catch (error: any) {
            if (disposed || scope !== identity || controller.signal.aborted) return;
            if ([401, 403, 404].includes(error?.status)) blocked.add(image.id);
            trackingErrors = { ...trackingErrors, [image.id]: error?.status === 401 ? tr('La connexion a expiré. Reconnecte-toi pour retrouver cette image.', 'Your session expired. Sign in again to retrieve this image.') : [403, 404].includes(error?.status) ? tr('Le suivi de cette image est indisponible dans cette conversation.', 'Tracking for this image is unavailable in this conversation.') : tr('Le suivi est interrompu. Actualise-le pour vérifier cette image ; aucune génération n’est relancée.', 'Tracking was interrupted. Refresh to check this image; no generation is resubmitted.') };
          }
        }));
      } finally { inFlight = false; if (!disposed) { refreshing = false; schedule(); } }
    }
    const refresh = () => poll(true), resume = () => { if (!document.hidden) void poll(); };
    refreshAll = refresh; document.addEventListener('visibilitychange', resume);
    untrack(() => { void poll(); });
    return () => { disposed = true; controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', resume); if (refreshAll === refresh) refreshAll = undefined; refreshing = false; };
  });
</script>

{#if images.length}
  <section class="message-images" aria-label={tr('Images de cette réponse', 'Images in this reply')}>
    <header><h3>{tr(images.length === 1 ? 'Image générée' : 'Images générées', images.length === 1 ? 'Generated image' : 'Generated images')}</h3><div class="image-actions"><button type="button" disabled={!active || refreshing} onclick={() => void refreshAll?.()}>{refreshing ? tr('Actualisation…', 'Refreshing…') : tr('Actualiser le suivi', 'Refresh tracking')}</button>{#if onOpenGallery}<button type="button" onclick={onOpenGallery}>{tr('Ouvrir la galerie', 'Open gallery')}</button>{/if}</div></header>
    <div class="message-image-grid">
      {#each images as image, index (image.id)}
        <figure data-image-job={image.id}>
          <p class="image-status" role="status">{imageLabel(image, index)} · {labels[image.status || 'unknown'] || labels.unknown}{image.status === 'queued' && number(image.queuePosition) ? ' · ' + tr('position ', 'position ') + image.queuePosition : ''}</p>
          {#if messageImageReady(image)}
            <a class="image-preview" href={messageImageRoute(owner, image.id)} target="_blank" rel="noreferrer" aria-label={tr('Ouvrir : ', 'Open: ') + imageLabel(image, index)}><img src={assetUrl(image)} alt={image.prompt?.slice(0, 400) || imageLabel(image, index)} width={number(image.width || image.image?.width)} height={number(image.height || image.image?.height)} loading="lazy" onload={() => { if (displayErrors[image.id]) displayErrors = { ...displayErrors, [image.id]: false }; }} onerror={() => displayErrors = { ...displayErrors, [image.id]: true }} /></a>
            <div class="image-actions"><a href={messageImageRoute(owner, image.id)} target="_blank" rel="noreferrer">{tr('Ouvrir l’image', 'Open image')}</a><a href={messageImageRoute(owner, image.id, 'image', true)} download>{tr('Télécharger', 'Download')}</a></div>
          {/if}
          {#if displayErrors[image.id]}<p class="image-feedback" role="status">{tr('L’image ne se charge pas. Tu peux réessayer son affichage ou ouvrir la galerie.', 'The image could not load. Retry its display or open the gallery.')}</p><button type="button" class="display-retry" onclick={() => displayVersions = { ...displayVersions, [image.id]: (displayVersions[image.id] || 0) + 1 }}>{tr('Réessayer l’affichage', 'Retry display')}</button>{/if}
          {#if trackingErrors[image.id]}<p class="image-feedback" role="status">{trackingErrors[image.id]}</p>{/if}
          {#if typeof image.error === 'string' && image.error}<p class="image-feedback">{image.error}</p>{/if}
          <figcaption>{[image.workflowLabel || image.workflowId, number(image.width) && number(image.height) ? image.width + ' × ' + image.height : '', typeof image.seed === 'number' ? 'seed ' + image.seed : ''].filter(Boolean).join(' · ')}</figcaption>
        </figure>
      {/each}
    </div>
  </section>
{/if}

<style>
  .message-images{margin:18px 0 8px;min-width:0;}
  header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;}
  h3{font-size:13px;line-height:1.5;font-weight:600;margin:0;}
  .message-image-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:20px 16px;}
  figure{margin:0;min-width:0;max-width:560px;}
  .image-status{font-size:12px;line-height:1.6;color:var(--muted-foreground);margin:0 0 8px;}
  .image-preview{display:block;border-radius:8px;background:var(--muted);overflow:hidden;}
  img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain;}
  .image-actions{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;margin:7px 0;}
  button,a{font-size:12px;line-height:1.5;color:var(--foreground);text-underline-offset:3px;}
  button{background:transparent;border:0;padding:4px 0;text-align:start;cursor:pointer;}
  button:hover,a:hover{text-decoration:underline;}
  button:disabled{opacity:.5;cursor:default;}
  button:focus-visible,a:focus-visible{outline:2px solid var(--ring);outline-offset:3px;border-radius:3px;}
  figcaption,.image-feedback{font-size:11px;line-height:1.6;color:var(--muted-foreground);overflow-wrap:anywhere;margin:7px 0;}
  .image-feedback{color:var(--foreground);}
  .display-retry{font-size:11px;}
  @media(max-width:759px){.image-actions button,.image-actions a,.display-retry{min-height:44px;display:inline-flex;align-items:center;}img{max-height:480px;}}
</style>
