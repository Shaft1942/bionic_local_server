// The updater intentionally supports only our stable and numbered beta releases.
const releaseVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/;

export function parseUpdateVersion(value) {
  const match = typeof value === 'string' && releaseVersion.exec(value);
  if (!match || match[0] !== value) throw new Error('Version de mise à jour invalide.');
  const numbers = match.slice(1).map(part => part === undefined ? null : Number(part));
  if (numbers.some(number => number !== null && !Number.isSafeInteger(number))) throw new Error('Version de mise à jour invalide.');
  const [major, minor, patch, beta] = numbers;
  return { major, minor, patch, beta };
}

export function compareUpdateVersions(a, b) {
  const x = parseUpdateVersion(a), y = parseUpdateVersion(b);
  for (const part of ['major', 'minor', 'patch']) if (x[part] !== y[part]) return x[part] < y[part] ? -1 : 1;
  if (x.beta === y.beta) return 0;
  if (x.beta === null) return 1;
  if (y.beta === null) return -1;
  return x.beta < y.beta ? -1 : 1;
}

export function updateChannelForVersion(value) {
  return parseUpdateVersion(value).beta === null ? 'stable' : 'beta';
}
