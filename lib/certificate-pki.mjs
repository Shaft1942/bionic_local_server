import { X509Certificate, randomBytes, webcrypto, createPrivateKey } from 'node:crypto';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { x509, pkijs, asn1js } from '../vendor/certificate-crypto.mjs';

// ASN.1/X509/PKCS12 are encoded by the vendored libraries; all key generation,
// signing, AES and PBKDF2 use Node's native WebCrypto implementation.
x509.cryptoProvider.set(webcrypto);
pkijs.setEngine('Node WebCrypto', webcrypto, new pkijs.CryptoEngine({ name: 'Node WebCrypto', crypto: webcrypto, subtle: webcrypto.subtle }));
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const SERVER_AUTH = '1.3.6.1.5.5.7.3.1';
const CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const DAY = 86400000;
const serial = () => '01' + randomBytes(19).toString('hex');
const arrayBuffer = bytes => Uint8Array.from(bytes).buffer;
const pem = (label, bytes) => `-----BEGIN ${label}-----\n${Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
function cleanName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/u.test(name)) throw new Error('Nom de certificat invalide (1 à 80 caractères).');
  return [{ CN: [name] }];
}
export function normalizeCertificateHosts(hosts) {
  if (!Array.isArray(hosts) || !hosts.length || hosts.length > 40) throw new Error('Indiquer entre 1 et 40 noms DNS ou adresses IP.');
  return [...new Set(hosts.map(input => {
    if (typeof input !== 'string') throw new Error('Adresse de certificat invalide.');
    const raw = String(input).trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (/[\x00-\x20\x7f]/u.test(raw)) throw new Error('Adresse de certificat invalide.');
    if (isIP(raw)) return raw;
    const host = domainToASCII(raw);
    if (!host || host.length > 253 || !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(part))) throw new Error('Adresse de certificat invalide.');
    return host;
  }))];
}
function dates(now, days, max) {
  const current = now === undefined ? new Date() : new Date(now);
  if (!Number.isFinite(current.getTime()) || !Number.isInteger(days) || days < 1 || days > max) throw new Error(`Durée invalide (1 à ${max} jours).`);
  return { notBefore: new Date(current.getTime() - 5 * 60000), notAfter: new Date(current.getTime() + days * DAY) };
}
async function result(keys, certificate) {
  const cert = certificate.toString('pem');
  const key = pem('PRIVATE KEY', await webcrypto.subtle.exportKey('pkcs8', keys.privateKey));
  const parsed = new X509Certificate(cert);
  if (!parsed.checkPrivateKey(createPrivateKey(key))) throw new Error('Clé de certificat incohérente.');
  return { key, cert, fingerprint: parsed.fingerprint256.replaceAll(':', '').toLowerCase(), notBefore: new Date(parsed.validFrom).toISOString(), expiresAt: new Date(parsed.validTo).toISOString(), serialNumber: parsed.serialNumber };
}
export async function createAuthority({ name = 'Bionic compagnon local', now } = {}) {
  const keys = await webcrypto.subtle.generateKey(RSA, true, ['sign', 'verify']);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(), name: cleanName(name), ...dates(now, 3650, 3650), keys, signingAlgorithm: RSA,
    extensions: [new x509.BasicConstraintsExtension(true, 0, true), new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true), await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)],
  });
  return result(keys, certificate);
}
async function issue({ authority, name, hosts, now, days, usage }) {
  const ca = new X509Certificate(authority.cert);
  if (!ca.ca || !ca.checkPrivateKey(createPrivateKey(authority.key))) throw new Error('Autorité de certification incohérente.');
  const validity = dates(now, days, 397);
  if (validity.notAfter.getTime() > new Date(ca.validTo).getTime() || validity.notBefore.getTime() < new Date(ca.validFrom).getTime()) throw new Error('Durée hors validité de l’autorité.');
  const keys = await webcrypto.subtle.generateKey(RSA, true, ['sign', 'verify']);
  const signingKey = await webcrypto.subtle.importKey('pkcs8', createPrivateKey(authority.key).export({type:'pkcs8',format:'der'}), RSA, false, ['sign']);
  const issuer = new x509.X509Certificate(authority.cert);
  const extensions = [new x509.BasicConstraintsExtension(false, undefined, true), new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true), new x509.ExtendedKeyUsageExtension([usage], true), await x509.SubjectKeyIdentifierExtension.create(keys.publicKey), await x509.AuthorityKeyIdentifierExtension.create(issuer.publicKey)];
  if (hosts) extensions.push(new x509.SubjectAlternativeNameExtension(hosts.map(host => ({type:isIP(host) ? 'ip' : 'dns',value:host}))));
  const certificate = await x509.X509CertificateGenerator.create({ serialNumber: serial(), subject: cleanName(name), issuer: issuer.subject, ...validity, publicKey: keys.publicKey, signingKey, signingAlgorithm: RSA, extensions });
  const output = await result(keys, certificate);
  if (!new X509Certificate(output.cert).verify(ca.publicKey)) throw new Error('Signature de certificat invalide.');
  return output;
}
export async function issueServer({ authority, hosts, now, days = 397 }) {
  hosts = normalizeCertificateHosts(hosts);
  return issue({authority,name: hosts[0],hosts,now,days,usage:SERVER_AUTH});
}
export async function issueClient({ authority, name, passphrase, now, days = 397 }) {
  cleanName(name);
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 200 || /[^\x20-\x7e]/u.test(passphrase)) throw new Error('Le mot de passe PKCS#12 doit contenir 12 à 200 caractères ASCII imprimables.');
  const output = await issue({authority,name,now,days,usage:CLIENT_AUTH});
  const password = arrayBuffer(Buffer.from(passphrase, 'utf8'));
  const key = pkijs.PrivateKeyInfo.fromBER(createPrivateKey(output.key).export({type:'pkcs8',format:'der'}));
  const bag = new pkijs.PKCS8ShroudedKeyBag({parsedValue:key});
  await bag.makeInternalValues({password,contentEncryptionAlgorithm:{name:'AES-CBC',length:256},hmacHashAlgorithm:'SHA-256',iterationCount:100000,contentType:'1.2.840.113549.1.7.1'});
  // PKI.js represents CMS encrypted content as BER constructed OCTET STRING.
  // Windows' PKCS8 loader requires its DER primitive representation instead.
  bag.encryptedData = new asn1js.OctetString({valueHex:bag.encryptedData.getValue()});
  const attributes = [new pkijs.Attribute({type:'1.2.840.113549.1.9.21',values:[new asn1js.OctetString({valueHex:arrayBuffer(Buffer.from(output.fingerprint,'hex'))})]}),new pkijs.Attribute({type:'1.2.840.113549.1.9.20',values:[new asn1js.BmpString({value:name})]})];
  const certBag = cert => new pkijs.SafeBag({bagId:'1.2.840.113549.1.12.10.1.3',bagValue:new pkijs.CertBag({certId:'1.2.840.113549.1.9.22.1',certValue:new asn1js.OctetString({valueHex:arrayBuffer(new X509Certificate(cert).raw)})}),bagAttributes:cert === output.cert ? attributes : undefined});
  const authenticatedSafe = new pkijs.AuthenticatedSafe({parsedValue:{safeContents:[
    {privacyMode:1,value:new pkijs.SafeContents({safeBags:[certBag(output.cert),certBag(authority.cert)]})},
    {privacyMode:0,value:new pkijs.SafeContents({safeBags:[new pkijs.SafeBag({bagId:'1.2.840.113549.1.12.10.1.2',bagValue:bag,bagAttributes:attributes})]})},
  ]}});
  await authenticatedSafe.makeInternalValues({safeContents:[{password,contentEncryptionAlgorithm:{name:'AES-CBC',length:256},hmacHashAlgorithm:'SHA-256',iterationCount:100000},{}]});
  const encryptedCerts = new pkijs.EncryptedData({schema:authenticatedSafe.safeContents[0].content});
  encryptedCerts.encryptedContentInfo.encryptedContent = new asn1js.OctetString({valueHex:encryptedCerts.encryptedContentInfo.encryptedContent.getValue()});
  authenticatedSafe.safeContents[0].content = encryptedCerts.toSchema();
  const pfx = new pkijs.PFX({parsedValue:{integrityMode:0,authenticatedSafe}});
  await pfx.makeInternalValues({password,iterations:100000,pbkdf2HashAlgorithm:'SHA-256',hmacHashAlgorithm:'SHA-256'});
  pfx.macData.mac.digestAlgorithm.algorithmParams = new asn1js.Null();
  return {...output,pfx:Buffer.from(pfx.toSchema().toBER(false))};
}
