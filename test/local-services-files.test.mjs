import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProjectFiles } from '../lib/project-files.mjs';

test('launcher profiles and process receipts are inaccessible even when the product is a project root', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bionic-launcher-files-')));
  const privateDirectory = path.join(root, 'runtime', 'local-services');
  await fs.mkdir(privateDirectory, { recursive: true });
  await fs.writeFile(path.join(root, 'config.launchers.local.json'), '{"private":"synthetic"}');
  await fs.writeFile(path.join(privateDirectory, 'operations.json'), '{"private":"synthetic"}');
  await fs.writeFile(path.join(root, 'readme.txt'), 'public');
  const registryPath = path.join(root, 'registry.json');
  await fs.writeFile(registryPath, JSON.stringify({ projects: [['p1', { projectWorkingDirectoryPath: root }], ['p2', { projectWorkingDirectoryPath: privateDirectory }]] }));
  let dynamicPaths = [privateDirectory];
  const files = createProjectFiles({ registryPath, backupDirectory: path.join(root, 'backup'), protectedPaths: () => dynamicPaths });
  t.after(async () => { assert.equal(path.dirname(root), await fs.realpath(os.tmpdir())); assert(path.basename(root).startsWith('bionic-launcher-files-')); await fs.rm(root, { recursive: true, force: true }); });
  for (const relative of ['config.launchers.local.json', 'CONFIG.LAUNCHERS.LOCAL.JSON', 'runtime/local-services/operations.json']) {
    await assert.rejects(files.read('p1', 'project', relative), { status: 403 });
    await assert.rejects(files.inspect('p1', 'project', relative), { status: 403 });
  }
  await assert.rejects(files.list('p2', 'project', ''), { status: 403 });
  const list = await files.list('p1', 'project', '');
  assert(!list.entries.some(entry => entry.name === 'config.launchers.local.json'));
  assert.equal((await files.read('p1', 'project', 'readme.txt')).text, 'public');
  dynamicPaths = [...dynamicPaths, path.join(root, 'readme.txt')];
  await assert.rejects(files.read('p1', 'project', 'readme.txt'), { status: 403 });
});
