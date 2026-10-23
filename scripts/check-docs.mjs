import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectReleaseFiles, repositoryRoot } from './release-files.mjs';

const files=await collectReleaseFiles(),allowed=new Set(files.map(file=>file.path));
const markdown=files.filter(file=>file.path.endsWith('.md'));
const errors=[];let links=0;
function anchors(text){
  const seen=new Map(),ids=new Set();
  for(const match of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)){
    const slug=match[1].replace(/<[^>]+>/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`~]/g,'').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu,'').replace(/\s/g,'-');
    const count=seen.get(slug)||0;seen.set(slug,count+1);ids.add(slug+(count?'-'+count:''));
  }
  for(const match of text.matchAll(/\bid=["']([^"']+)["']/g))ids.add(match[1]);
  return ids;
}
for(const file of markdown){
  const text=file.bytes.toString('utf8').replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```\s*$/gm,'');
  for(const match of text.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+['"][^)]*)?\)/g)){
    const target=match[1].replace(/^<|>$/g,'');
    if(/^(?:https?:|mailto:)/i.test(target))continue;
    const line=text.slice(0,match.index).split('\n').length;
    if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('/')){errors.push(`${file.path}:${line}: lien local absolu ou schéma non public`);continue;}
    links++;
    const [raw,fragment]=target.split('#');let relative;
    try{relative=raw?path.posix.normalize(path.posix.join(path.posix.dirname(file.path),decodeURIComponent(raw.split('?')[0]))):file.path;}catch{errors.push(`${file.path}:${line}: lien mal encodé`);continue;}
    if(!allowed.has(relative)){errors.push(`${file.path}:${line}: cible absente de la distribution (${relative})`);continue;}
    if(fragment){
      const contents=await readFile(path.join(repositoryRoot,relative),'utf8');
      if(/^L\d+(?:-L?\d+)?$/.test(fragment)){const last=Number(fragment.split('-').at(-1).replace(/^L/,''));if(last>contents.split('\n').length)errors.push(`${file.path}:${line}: ligne cible absente (${relative})`);}
      else if(relative.endsWith('.md')&&!anchors(contents).has(decodeURIComponent(fragment)))errors.push(`${file.path}:${line}: ancre absente (${relative}#${fragment})`);
    }
  }
}
if(errors.length)throw new Error(errors.join('\n'));
console.log(`Documentation contrôlée : ${markdown.length} pages, ${links} liens locaux et leurs ancres ; cibles incluses dans la distribution.`);
