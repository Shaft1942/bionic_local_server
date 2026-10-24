<script lang="ts">
  import { onMount, untrack, tick } from 'svelte';
  import { X, RefreshCw } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr, preferences, setPreferences, type Preferences } from './preferences.svelte';
  import type { Request } from './settings/types';
  import LlamaServerSettings from './settings/LlamaServerSettings.svelte';
  import InferenceSettings from './settings/InferenceSettings.svelte';
  import ImageSettings from './settings/ImageSettings.svelte';
  import ServicesSettings from './settings/ServicesSettings.svelte';
  import SecuritySettings from './settings/SecuritySettings.svelte';
  import MaintenanceSettings from './settings/MaintenanceSettings.svelte';
  import HelpSettings from './settings/HelpSettings.svelte';
  import './settings/settings.css';
  type SettingsPage='conversation'|'servers'|'appearance'|'security'|'maintenance'|'help';
  type ServerSection='inference'|'images';
  let { request, projectId, chatId = '', modelId = '', onInferenceChange, onPreferencesChange, onClose, beforeMaintenance, active=true, onDirtyChange, navigationRequest }: { request: Request; projectId: string; chatId?: string; modelId?: string; onInferenceChange?: () => void; onPreferencesChange?: (value: Preferences & { clearDrafts?: boolean }) => void; onClose?: () => void; beforeMaintenance?: () => boolean | Promise<boolean>; active?:boolean; onDirtyChange?:(dirty:boolean)=>void; navigationRequest?:{page:SettingsPage;section?:ServerSection;revision:number} } = $props();
  let page = $state('conversation'), revision = $state(0), error = $state(''), cleared = $state(false);
  let visited=$state(['conversation']);
  let serverSection=$state<ServerSection>('inference'),visitedServerSections=$state<ServerSection[]>(['inference']);
  let dirtyGroups=$state<Record<string,boolean>>({});
  const dirty=$derived(Object.values(dirtyGroups).some(Boolean));
  function changed(group:string,value:boolean){if(dirtyGroups[group]!==value)dirtyGroups={...dirtyGroups,[group]:value};}
  $effect(()=>{onDirtyChange?.(dirty);});
  const pages = $derived([{ id:'conversation',label:tr('Conversation','Conversation') },{id:'servers',label:tr('Serveurs du PC','PC servers')},{id:'appearance',label:tr('Apparence et brouillons','Appearance and drafts')},{id:'security',label:tr('Connexion sécurisée','Secure connection')},{id:'maintenance',label:tr('Mises à jour et diagnostic','Updates and diagnostics')},{id:'help',label:tr('Aide et capacités','Help and capabilities')}]);
  function updatePreference(next: Partial<Preferences>) { try { const value = setPreferences(next); onPreferencesChange?.(value); error = ''; } catch { error = tr('Préférence appliquée à cet onglet ; stockage du navigateur indisponible.','Preference applied to this tab; browser storage unavailable.'); } }
  function clearDrafts() { onPreferencesChange?.({ ...preferences, clearDrafts: true }); cleared = true; }
  function selectPage(next:string){page=next;if(!visited.includes(next))visited=[...visited,next];error='';document.querySelector('.settings-content')?.scrollTo(0,0);}
  function selectServerSection(next:ServerSection){serverSection=next;if(!visitedServerSections.includes(next))visitedServerSections=[...visitedServerSections,next];error='';document.querySelector('.settings-content')?.scrollTo(0,0);}
  async function navigateFromHelp(next:SettingsPage,section?:ServerSection){selectPage(next);if(section)selectServerSection(section);await tick();const target=document.querySelector<HTMLElement>('.settings-page:not([hidden]) h2, .settings-page:not([hidden]) h3');if(target){target.tabIndex=-1;target.focus();}}
  $effect(()=>{const target=navigationRequest;if(target)untrack(()=>{selectPage(target.page);if(target.page==='servers'&&target.section)selectServerSection(target.section);});});
  function refresh(){if(confirm(tr('Relire les paramètres et abandonner les modifications non enregistrées ?','Reload settings and discard unsaved changes?'))){dirtyGroups={};revision++;}}
  onMount(() => { const close = (event: KeyboardEvent) => { if (active&&event.key === 'Escape') onClose?.(); };const leave=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};addEventListener('beforeunload',leave);addEventListener('keydown', close); return () => {removeEventListener('keydown', close);removeEventListener('beforeunload',leave);}; });
</script>

<section class="native-settings" aria-label={tr('Paramètres','Settings')}>
  <header class="settings-title"><div><h1>{tr('Paramètres','Settings')}</h1><p>{tr('Le compagnon, adapté à ta façon de travailler.','The companion, adapted to the way you work.')}</p></div><div class="settings-actions"><Button variant="ghost" size="icon" aria-label={tr('Actualiser les paramètres','Refresh settings')} onclick={refresh}><RefreshCw /></Button>{#if onClose}<Button variant="ghost" size="icon" aria-label={tr('Fermer les paramètres','Close settings')} onclick={onClose}><X /></Button>{/if}</div></header>
  <div class="settings-layout"><nav class="settings-navigation" aria-label={tr('Catégories des paramètres','Settings categories')}>{#each pages as item}<button aria-current={page === item.id ? 'page' : undefined} onclick={() => selectPage(item.id)}>{item.label}</button>{/each}<a href="/legacy/">{tr('Ancienne interface','Previous interface')}</a></nav>
  <div class="settings-content">
    {#key revision}
    {#if page==='servers'}
      <h2>{tr('Serveurs du PC','PC servers')}</h2><p class="settings-description">{tr('Configure les connexions et le lancement des moteurs de conversation et de génération d’images.','Configure connections and startup for conversation and image generation engines.')}</p>
      <nav class="server-navigation" aria-label={tr('Types de serveurs','Server types')}>
        <button aria-current={serverSection==='inference'?'page':undefined} onclick={()=>selectServerSection('inference')}>{tr('Moteurs d’inférence','Inference engines')}</button>
        <button aria-current={serverSection==='images'?'page':undefined} onclick={()=>selectServerSection('images')}>{tr('Génération d’images','Image generation')}</button>
      </nav>
    {/if}
    <div class="settings-page" hidden={page!=='conversation'&&!(page==='servers'&&serverSection==='inference')}><InferenceSettings {request} {projectId} {chatId} {modelId} {onInferenceChange} scope={page==='servers'?'engines':'conversation'} active={active&&(page==='conversation'||page==='servers'&&serverSection==='inference')} onDirtyChange={value=>changed('inference',value)} /></div>
    {#if visited.includes('servers')&&visitedServerSections.includes('images')}<div class="settings-page" hidden={page!=='servers'||serverSection!=='images'}><ImageSettings {request} onDirtyChange={value=>changed('images',value)} /></div>{/if}
    {#if visited.includes('servers')}<div class="settings-page" hidden={page!=='servers'}><div class="settings-divider"></div><ServicesSettings {request} scope={serverSection==='inference'?'bionic':'comfyui'} active={active&&page==='servers'} onDirtyChange={value=>changed('services',value)} /></div>{/if}
    {#if visited.includes('servers')&&visitedServerSections.includes('inference')}<div class="settings-page" hidden={page!=='servers'||serverSection!=='inference'}><div class="settings-divider"></div><LlamaServerSettings {request} {onInferenceChange} active={active&&page==='servers'&&serverSection==='inference'} onDirtyChange={value=>changed('llama',value)} /></div>{/if}
    {#if visited.includes('security')}<div class="settings-page" hidden={page!=='security'}><SecuritySettings {request} active={active&&page==='security'} /></div>{/if}
    {#if visited.includes('maintenance')}<div class="settings-page" hidden={page!=='maintenance'}><MaintenanceSettings {request} {beforeMaintenance} active={active&&page==='maintenance'} /></div>{/if}
    {#if visited.includes('help')}<div class="settings-page" hidden={page!=='help'}><HelpSettings {request} active={active&&page==='help'} navigate={navigateFromHelp} /></div>{/if}
    {#if page==='appearance'}<div class="settings-page">
      <h2>{tr('Apparence et brouillons','Appearance and drafts')}</h2><p class="settings-description">{tr('Ces choix concernent ce navigateur. Les conversations restent sur le PC.','These choices apply to this browser. Conversations stay on the PC.')}</p>
      <div class="setting-row"><label for="native-theme">{tr('Thème','Theme')}</label><select id="native-theme" value={preferences.theme} onchange={event => updatePreference({ theme: event.currentTarget.value as Preferences['theme'] })}><option value="system">{tr('Système','System')}</option><option value="light">{tr('Clair','Light')}</option><option value="dark">{tr('Sombre','Dark')}</option></select></div>
      <div class="setting-row"><label for="native-language">{tr('Langue de l’interface','Interface language')}</label><select id="native-language" value={preferences.language} onchange={event => updatePreference({ language: event.currentTarget.value as 'fr'|'en' })}><option value="fr">Français</option><option value="en">English</option></select></div>
      <div class="setting-row"><label for="native-draft-hours">{tr('Conserver les brouillons','Keep drafts for')}</label><select id="native-draft-hours" value={preferences.draftHours} onchange={event => updatePreference({ draftHours: Number(event.currentTarget.value) as 0|1|24|168 })}><option value="0">{tr('Cet onglet uniquement','This tab only')}</option><option value="1">{tr('1 heure','1 hour')}</option><option value="24">{tr('24 heures','24 hours')}</option><option value="168">{tr('7 jours','7 days')}</option></select></div>
      <div class="setting-row"><div><strong>{tr('Effacer les brouillons de ce navigateur','Clear this browser’s drafts')}</strong><p class="settings-description">{tr('Pour cette instance du compagnon. Les messages envoyés et les demandes en cours sont conservés.','For this companion instance. Sent messages and active requests are preserved.')}</p></div><Button variant="outline" onclick={clearDrafts}>{tr('Effacer les brouillons','Clear drafts')}</Button></div>
      {#if cleared}<p role="status" class="settings-feedback">{tr('Brouillons de ce navigateur effacés pour cette instance.','This browser’s drafts have been cleared for this instance.')}</p>{/if}
    </div>{/if}
    {/key}
    {#if error}<p role="alert" class="settings-error">{error}</p>{/if}
  </div></div>
</section>

<style>
  .settings-navigation button{min-height:44px;}
  .settings-navigation button:focus-visible{outline:2px solid var(--ring);outline-offset:2px;}
  @media(max-width:650px){.settings-navigation{flex-wrap:wrap;}.settings-navigation button{min-height:44px;white-space:normal;}.settings-navigation button:last-of-type{margin-right:auto;}}
  .server-navigation{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0 24px;padding-bottom:12px;border-bottom:1px solid var(--border);}
  .server-navigation button{padding:9px 13px;border-radius:8px;color:var(--muted-foreground);font-size:13px;line-height:1.4;text-align:left;}
  .server-navigation button:hover{background:var(--muted);color:var(--foreground);}
  .server-navigation button[aria-current=page]{background:var(--secondary);color:var(--foreground);font-weight:500;}
</style>
