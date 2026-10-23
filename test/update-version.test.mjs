import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdateVersion, compareUpdateVersions, updateChannelForVersion } from '../lib/update-version.mjs';
import { validateUpdateMetadata } from '../lib/update-installer.mjs';

const metadata = version => ({ schemaVersion: 1, version, channel: updateChannelForVersion(version), minInstalledVersion: '0.0.0', nodeMajorMin: 24, nodeMajorMax: null, platforms: ['win32'], archive: `bionic-mobile-v${version}.zip`, sha256: 'a'.repeat(64) });
const options = currentVersion => ({ currentVersion, platform: 'win32', nodeMajor: 24 });

test('release versions accept only canonical stable and positive numbered beta versions', () => {
  assert.deepEqual(parseUpdateVersion('2.2.0-beta.12'), { major: 2, minor: 2, patch: 0, beta: 12 });
  assert.deepEqual(parseUpdateVersion('0.0.0'), { major: 0, minor: 0, patch: 0, beta: null });
  assert.equal(updateChannelForVersion('2.2.0'), 'stable');
  assert.equal(updateChannelForVersion('2.2.0-beta.1'), 'beta');
  for (const invalid of [null, 2, '', 'v2.2.0', '02.2.0', '2.02.0', '2.2.00', '2.2', '2.2.0-beta', '2.2.0-beta.0', '2.2.0-beta.01', '2.2.0-beta.-1', '2.2.0-rc.1', '2.2.0-beta.1+build', '2.2.0 ', '2.2.0\n', '9007199254740992.0.0', '2.2.0-beta.9007199254740992']) {
    assert.throws(() => parseUpdateVersion(invalid), /Version/, String(invalid));
    assert.throws(() => validateUpdateMetadata({ ...metadata('2.2.0'), version: invalid, archive: `bionic-mobile-v${invalid}.zip` }, options('2.1.0')), /Version|Métadonnées/, String(invalid));
  }
});

test('stable/beta ordering agrees with the autonomous installer for every ordered pair', () => {
  const versions = ['0.0.0', '1.9.0', '2.1.0-beta.1', '2.1.0-beta.2', '2.1.0-beta.10', '2.1.0', '2.1.1-beta.1', '2.1.1', '2.2.0-beta.1', '2.2.0', '3.0.0-beta.1', '3.0.0', '9007199254740991.0.0'];
  for (const [a, current] of versions.entries()) for (const [b, next] of versions.entries()) {
    assert.equal(compareUpdateVersions(current, next), Math.sign(a - b), `${current} vs ${next}`);
    if (a < b) assert.doesNotThrow(() => validateUpdateMetadata(metadata(next), options(current)), `${current} -> ${next}`);
    else assert.throws(() => validateUpdateMetadata(metadata(next), options(current)), /version installée/, `${current} -> ${next}`);
  }
});

test('metadata preserves schema 1 stable compatibility and requires a matching beta channel', () => {
  const stable = metadata('2.2.0'); delete stable.channel;
  assert.doesNotThrow(() => validateUpdateMetadata(stable, options('2.1.0')));
  assert.doesNotThrow(() => validateUpdateMetadata(metadata('2.2.0-beta.1'), options('2.1.0')));
  for (const [version, channel] of [['2.2.0-beta.1', undefined], ['2.2.0-beta.1', 'stable'], ['2.2.0', 'beta'], ['2.2.0', 'preview'], ['2.2.0', null]]) {
    assert.throws(() => validateUpdateMetadata({ ...metadata(version), channel }, options('2.1.0')), /Canal/);
  }
  const compatible = { ...metadata('2.2.0'), minInstalledVersion: '2.1.0', maxInstalledVersion: '2.2.0' };
  assert.doesNotThrow(() => validateUpdateMetadata(compatible, options('2.2.0-beta.1')));
  assert.throws(() => validateUpdateMetadata(compatible, options('2.1.0-beta.1')), /version installée/);
  assert.throws(() => validateUpdateMetadata({ ...compatible, maxInstalledVersion: '2.0.0' }, options('2.1.0')), /Bornes/);
});
