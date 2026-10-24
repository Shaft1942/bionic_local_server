"""Prepare a ComfyUI /prompt body offline. No network and no GPU execution."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import secrets
import sys
import uuid

BASE = Path(__file__).resolve().parent

def prepare(workflow_id, prompt, *, image_format=None, seed=None,
            negative_prompt=None, krea_prompt=None, krea_seed=None,
            denoise=None, allow_experimental=False):
    manifest = json.loads((BASE/'manifest.json').read_text(encoding='utf-8'))
    profiles = manifest['profiles']
    if workflow_id not in profiles:
        raise ValueError('Profil inconnu : '+str(workflow_id))
    profile = profiles[workflow_id]
    if profile['experimental'] and not allow_experimental:
        raise ValueError('Ce profil exige --allow-experimental ; qualité img2img non testée.')
    raw = (BASE/profile['api_file']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != profile['sha256']:
        raise ValueError('Empreinte API différente du manifeste ; réviser le profil avant usage.')
    graph = json.loads(raw)
    params = copy.deepcopy(profile['default_parameters'])
    if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>6000:
        raise ValueError('Le prompt doit contenir entre 1 et 6000 caractères.')
    params['prompt']=prompt
    params['seed']=secrets.randbits(32) if seed is None else seed
    for name,value in [('negative_prompt',negative_prompt),('krea_prompt',krea_prompt),('krea_seed',krea_seed),('denoise',denoise)]:
        if value is not None:
            if name not in profile['bindings']:
                raise ValueError('Paramètre non exposé pour ce profil : '+name)
            params[name]=value
    if profile['experimental'] and not krea_prompt:
        raise ValueError('Fournir --krea-prompt pour décrire la transformation finale souhaitée.')
    if image_format is not None:
        if image_format not in profile['formats']:
            raise ValueError('Format inconnu.')
        params['width'],params['height']=profile['formats'][image_format]
    for name,value in params.items():
        if name in ('seed','krea_seed') and (type(value) is not int or not 0<=value<=4294967295):
            raise ValueError('Seed entière attendue entre 0 et 4294967295.')
        if name in ('prompt','negative_prompt','krea_prompt') and (not isinstance(value,str) or len(value)>6000):
            raise ValueError('Texte invalide : '+name)
        if name=='denoise' and (type(value) not in (int,float) or not 0.25<=value<=1):
            raise ValueError('Denoise expérimental attendu entre 0.25 et 1.0.')
        binding=profile['bindings'][name]
        graph[binding['node_id']]['inputs'][binding['input']]=value
    request_id=str(uuid.uuid4())
    # Kept separate from prompt body so an existing HTTP caller can submit it.
    return {'request_id':request_id,'workflow_id':workflow_id,'workflow_sha256':profile['sha256'],
            'parameters':params,'body':{'prompt':graph,'client_id':request_id}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workflow',required=True)
    parser.add_argument('--prompt',required=True)
    parser.add_argument('--format',choices=['square','portrait','landscape'])
    parser.add_argument('--seed',type=int)
    parser.add_argument('--negative-prompt')
    parser.add_argument('--krea-prompt')
    parser.add_argument('--krea-seed',type=int)
    parser.add_argument('--denoise',type=float)
    parser.add_argument('--allow-experimental',action='store_true')
    parser.add_argument('--output',type=Path,help='Écrit une enveloppe JSON ; sinon sortie standard.')
    args=parser.parse_args()
    try:
        result=prepare(args.workflow,args.prompt,image_format=args.format,seed=args.seed,
            negative_prompt=args.negative_prompt,krea_prompt=args.krea_prompt,krea_seed=args.krea_seed,
            denoise=args.denoise,allow_experimental=args.allow_experimental)
        data=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
        if args.output:
            # Avoid overwriting a previous prepared request unintentionally.
            with args.output.open('x',encoding='utf-8') as handle:handle.write(data)
        else:
            print(data,end='')
    except (ValueError,OSError) as exc:
        parser.exit(2,str(exc)+'\n')

if __name__=='__main__':main()
