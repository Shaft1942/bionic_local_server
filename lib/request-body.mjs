// Deadline applies to receiving bytes, never to generation/streaming after acceptance.
export async function receiveBody(req, { limit = 262144, timeoutMs = 180000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer, expired = false;
  const timeout = new Promise((_, reject) => { timer = setTimer(() => { expired = true; reject(Object.assign(new Error('Envoi trop lent ou abandonné. Réessaie avec une connexion plus stable.'), { status: 408 })); }, timeoutMs); timer.unref?.(); });
  const read = (async () => { const chunks = []; let size = 0; for await (const chunk of req) { if(expired)throw Object.assign(new Error('Réception expirée.'),{status:408}); size += chunk.length; if (size > limit) throw Object.assign(new Error('Message trop volumineux.'), { status: 413 }); chunks.push(chunk); } return Buffer.concat(chunks); })();
  try { return await Promise.race([read, timeout]); }
  finally { clearTimer(timer); }
}
