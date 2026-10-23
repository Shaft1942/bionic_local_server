// Stop feeding a slow phone, while the persisted job continues independently.
export function createNDJSONWriter(res, { maxBytes = 262144, drainTimeoutMs = 15000, onDetach = () => {} } = {}) {
  let detached = !!res.destroyed, blocked = false, timer;
  const queue = []; let bytes = 0;
  const detach = () => { if (detached) return; detached = true; clearTimeout(timer); queue.length = 0; bytes = 0; onDetach(); if (!res.writableEnded && !res.destroyed) { if (res.destroy) res.destroy(); else res.end(); } };
  res.on('close', () => { detached = true; clearTimeout(timer); queue.length = 0; bytes = 0; });
  res.on('error', detach);
  const write = line => { try { if (res.write(line) === false) { blocked = true; clearTimeout(timer); timer = setTimeout(detach, drainTimeoutMs); timer.unref?.(); } } catch { detach(); } };
  res.on('drain', () => { blocked = false; clearTimeout(timer); while (!blocked && !detached && queue.length) { const line = queue.shift(); bytes -= Buffer.byteLength(line); write(line); } });
  return {
    emit(value) {
      if (detached || res.destroyed || res.writableEnded) return;
      const line = JSON.stringify(value) + '\n', length = Buffer.byteLength(line);
      if (length + bytes + (res.writableLength || 0) > maxBytes) { detach(); return; }
      if (blocked) { queue.push(line); bytes += length; } else write(line);
    },
    close() { clearTimeout(timer); queue.length = 0; bytes = 0; detached = true; },
    finish() {
      // A successful HTTP end must not hide undelivered queued records. Recovery
      // uses the persisted request id when a slow client is detached here.
      if (blocked || queue.length) { detach(); return; }
      clearTimeout(timer); if (!detached && !res.destroyed && !res.writableEnded) res.end(); detached = true;
    },
    status: () => ({ detached, bufferedBytes: bytes + (res.writableLength || 0) })
  };
}
