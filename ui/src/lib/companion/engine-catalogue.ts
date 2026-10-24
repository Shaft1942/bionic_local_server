type RecordValue = Record<string, unknown>;
export type InferenceSnapshot = RecordValue & { provider:'bionic'|'llamacpp'; revision:string };
export type EngineCatalogue =
  | { kind:'ready'; inference:InferenceSnapshot; models:RecordValue[] }
  | { kind:'unconfirmed'; inference:InferenceSnapshot }
  | { kind:'unavailable'; inference:InferenceSnapshot; failure:unknown };
const record=(value:unknown):value is RecordValue=>!!value&&typeof value==='object'&&!Array.isArray(value);
function snapshot(value:unknown):InferenceSnapshot{
  if(!record(value)||!['bionic','llamacpp'].includes(String(value.provider))||typeof value.revision!=='string'||!value.revision)throw Error('Inference state unconfirmed');
  return value as InferenceSnapshot;
}
/** Bounded GET repair. A catalogue is usable only with matching engine provenance. */
export async function readEngineCatalogue(read:(route:string)=>Promise<unknown>,confirmed?:unknown):Promise<EngineCatalogue>{
  let inference=snapshot(confirmed??await read('/api/inference/settings'));
  for(let attempt=0;attempt<2;attempt++){
    let listed:unknown;
    try{listed=await read('/api/models');}
    catch(failure){
      // A local profile may have no running model yet. Keep its confirmed
      // connection and leave GGUF selection available, with no sendable model.
      inference=snapshot(await read('/api/inference/settings'));
      return{kind:'unavailable',inference,failure};
    }
    if(record(listed)&&listed.provider===inference.provider&&listed.inferenceRevision===inference.revision&&Array.isArray(listed.models)&&listed.models.every(model=>record(model)&&typeof model.id==='string'&&model.id.length>0)){
      return{kind:'ready',inference,models:listed.models as RecordValue[]};
    }
    inference=snapshot(await read('/api/inference/settings'));
  }
  return{kind:'unconfirmed',inference};
}
