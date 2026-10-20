import { mkdir, writeFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import path from 'node:path';
import { collectReleaseFiles, repositoryRoot } from './release-files.mjs';
const files = await collectReleaseFiles();
const pkg = JSON.parse(files.find(file => file.path === 'package.json').bytes.toString('utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) throw new Error('Version invalide.');
const prefix = `bionic-mobile-v${pkg.version}/`, local = [], central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(prefix + file.path, 'utf8'), checksum = crc32(file.bytes);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x0800,6); header.writeUInt16LE(33,12);
  header.writeUInt32LE(checksum,14); header.writeUInt32LE(file.bytes.length,18); header.writeUInt32LE(file.bytes.length,22); header.writeUInt16LE(name.length,26);
  local.push(header,name,file.bytes);
  const index = Buffer.alloc(46);
  index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20,4); index.writeUInt16LE(20,6); index.writeUInt16LE(0x0800,8); index.writeUInt16LE(33,14);
  index.writeUInt32LE(checksum,16); index.writeUInt32LE(file.bytes.length,20); index.writeUInt32LE(file.bytes.length,24); index.writeUInt16LE(name.length,28); index.writeUInt32LE(offset,42);
  central.push(index,name); offset += header.length + name.length + file.bytes.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
const archive = Buffer.concat([...local,directory,end]);
const dist = path.join(repositoryRoot, 'dist');
await mkdir(dist,{recursive:true});
if ((await lstat(dist)).isSymbolicLink() || path.relative(await realpath(repositoryRoot),await realpath(dist)) !== 'dist') throw new Error('Le dossier dist doit rester dans le dépôt.');
const name = `bionic-mobile-v${pkg.version}.zip`, destination = path.join(dist,name), sums = path.join(dist,'SHA256SUMS.txt');
for (const file of [destination,sums]) { const info = await lstat(file).catch(e => { if (e.code !== 'ENOENT') throw e; }); if (info?.isSymbolicLink()) throw new Error('Une sortie de distribution est un lien.'); }
await writeFile(destination,archive);
await writeFile(sums,createHash('sha256').update(archive).digest('hex')+'  '+name+'\n');
console.log(`Archive propre : dist/${name} (${files.length} fichiers). Empreinte : dist/SHA256SUMS.txt`);
