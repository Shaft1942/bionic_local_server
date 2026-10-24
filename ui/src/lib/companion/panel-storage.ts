type PanelStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type PanelKind = 'file'|'image-draft'|'image-tracking';
const aliases=['/prototype/','/prototype','/llama-ui/','/llama-ui/index.html'];
export const panelStorageKey=(instanceId:string,kind:PanelKind,scope:string,route='/')=>`companion-prototype:${instanceId}:${route}:${kind}:${scope}`;
const marker=(key:string)=>key+':route-migrated';

/** Copy a known route alias verbatim; an existing canonical value always wins. */
export function readPanelStorage(storage:PanelStorage,instanceId:string,kind:PanelKind,scope:string,currentRoute='/'):string|null{
  const key=panelStorageKey(instanceId,kind,scope),canonical=storage.getItem(key);
  if(canonical!==null)return canonical;
  if(storage.getItem(marker(key))==='1')return null;
  const routes=aliases.includes(currentRoute)?[currentRoute,...aliases.filter(route=>route!==currentRoute)]:aliases;
  for(const route of routes){
    const value=storage.getItem(panelStorageKey(instanceId,kind,scope,route));
    if(value===null)continue;
    try{storage.setItem(key,value);storage.setItem(marker(key),'1');}catch{/* The original alias remains readable even when migration cannot be persisted. */}
    return value;
  }
  return null;
}

/** A cleared draft must not reappear from its preserved historical alias. */
export function clearPanelStorage(storage:PanelStorage,instanceId:string,kind:PanelKind,scope:string):void{
  const key=panelStorageKey(instanceId,kind,scope);
  storage.setItem(marker(key),'1');storage.removeItem(key);
}
