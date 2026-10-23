export function createCompanionLifecycle() {
  const tasks = new Set(); let stopping = false, closed = false;
  function assertAdmission() { if (stopping) throw Object.assign(new Error('Le serveur est en cours d’arrêt. Reconnecte-toi après son redémarrage.'), { status: 503 }); }
  function track(task) { tasks.add(task); task.finally(() => tasks.delete(task)).catch(() => {}); return task; }
  async function settle() { while (tasks.size) await Promise.allSettled([...tasks]); }
  return { assertAdmission, track, settle, beginStop: () => { stopping = true; }, finish: () => { closed = true; }, status: () => ({ stopping, closed, tasks: tasks.size }) };
}

export async function withShutdownDeadline(task, timeoutMs) {
  let timer;
  try {
    return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Délai d’arrêt dépassé : la finalisation et les checkpoints ne sont pas confirmés.'), { code: 'SHUTDOWN_TIMEOUT', timeoutMs })), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}
