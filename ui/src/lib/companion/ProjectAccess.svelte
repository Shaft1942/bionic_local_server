<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import { tr } from './preferences.svelte';
  let { project, request, onChanged }: { project: any; request: (route:string, options?:RequestInit)=>Promise<any>; onChanged:()=>Promise<void> } = $props();
  let preview = $state<any>(null), roots = $state<Record<string,{include:boolean;write:boolean}>>({}), busy = $state(false), error = $state(''), uncertain = $state(false);
  async function inspect() {
    const id=project.id; busy=true; error='';
    try { const value=await request('/api/local-projects/adoption?'+new URLSearchParams({projectId:id})); if(project.id!==id)return; preview=value; roots=Object.fromEntries(value.roots.map((root:any)=>[root.id,{include:false,write:false}])); uncertain=false; }
    catch(failure:any){error=failure.message;} finally{busy=false;}
  }
  async function adopt(event:SubmitEvent){
    event.preventDefault(); if(busy||uncertain||!preview||preview.id!==project.id)return; busy=true;error='';
    try{await request('/api/local-projects/adopt',{method:'POST',body:JSON.stringify({projectId:preview.id,fingerprint:preview.fingerprint,roots:preview.roots.filter((root:any)=>roots[root.id]?.include).map((root:any)=>({id:root.id,writable:root.writable&&roots[root.id].write}))})});preview=null;await onChanged();}
    catch(failure:any){error=failure.message;uncertain=!failure.status||failure.status>=500; if(uncertain){await onChanged();error+=' '+tr('Résultat non confirmé. Relis les projets avant de réessayer.','Result unconfirmed. Refresh projects before trying again.');}}
    finally{busy=false;}
  }
</script>

{#if project && !project.isUnassigned && !project.locallyOwned && project.localOnly}
  <details class="project-access"><summary>{tr('Dossiers et droits du projet','Project folders and permissions')}</summary>
    <p>{tr('Choisis les dossiers accessibles au compagnon. Les historiques d’origine restent en lecture seule.','Choose folders available to the companion. Original histories remain read-only.')}</p>
    {#if error}<p role="alert" class="error">{error}</p>{/if}
    <Button variant="outline" size="sm" disabled={busy} onclick={inspect}>{tr('Examiner les dossiers','Review folders')}</Button>
    {#if preview}<form onsubmit={adopt}>{#each preview.roots as root}<fieldset><legend>{root.name}</legend><code>{root.path}</code><label><input type="checkbox" bind:checked={roots[root.id].include} disabled={busy} />{tr('Autoriser la lecture','Allow reading')}</label><label><input type="checkbox" bind:checked={roots[root.id].write} disabled={busy||!root.writable||!roots[root.id].include} />{tr('Autoriser l’écriture','Allow writing')}</label></fieldset>{/each}
      <Button type="submit" disabled={busy||uncertain}>{tr('Adopter avec ces droits','Adopt with these permissions')}</Button><Button variant="ghost" onclick={()=>preview=null}>{tr('Annuler','Cancel')}</Button>
    </form>{/if}
  </details>
{/if}
