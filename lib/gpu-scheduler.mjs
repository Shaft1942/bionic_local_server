const failure = (status, message) => Object.assign(new Error(message), { status });
const stopped = () => failure(409, 'Demande arrêtée avant admission GPU.');
const unavailable = () => failure(503, 'La coordination GPU est fermée.');
const exclusive = policy => policy === 'unload' || policy === 'alternate';

/**
 * Coordinates this companion's model predictions and FIFO image groups.
 * Every acquired lease must be released in finally, including after cancellation.
 * Keep permits model work; unload and alternate hold exclusive access. Only
 * unload removes models. The image service chooses group or per-image leases.
 * Other applications and companion processes remain outside this coordinator.
 */
export function createGpuScheduler({ modelService } = {}) {
  let sequence = 0;
  let activeModels = 0;
  let activeImages = null;
  let closed = false;
  const models = [];
  const images = [];

  function detach(item) { item.signal?.removeEventListener('abort', item.abort); }
  function check(item) {
    if (closed) throw unavailable();
    if (item.signal?.aborted) throw stopped();
  }
  function lease(release) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();
      drain();
    };
  }

  async function prepareImages(item) {
    try {
      check(item);
      if (item.policy === 'unload') {
        if (typeof modelService?.list !== 'function' || typeof modelService?.unload !== 'function') {
          throw failure(503, 'Le déchargement des modèles est indisponible.');
        }
        const listed = await modelService.list();
        check(item);
        if (!Array.isArray(listed)) throw failure(502, 'La liste des modèles Bionic est illisible.');
        const instanceIds = new Set();
        for (const model of listed.filter(model => model.type === 'llm')) {
          const instances = model.loadedInstances;
          if ((model.loaded || instances?.length) && (!Array.isArray(instances) || !instances.length)) {
            throw failure(502, 'Les instances chargées du modèle ne sont pas confirmées.');
          }
          for (const instance of instances || []) {
            if (typeof instance?.id !== 'string' || !instance.id.trim()) {
              throw failure(502, 'Une instance de modèle chargée est illisible.');
            }
            instanceIds.add(instance.id);
          }
        }
        for (const instanceId of instanceIds) {
          check(item);
          // Do not race or retry this mutation: even an interrupted caller must
          // wait for its confirmation before another model can be admitted.
          const result = await modelService.unload(instanceId);
          if (result?.unloaded !== true) throw failure(502, 'Le déchargement du modèle n’a pas été confirmé. Aucun rendu n’a été lancé.');
          check(item);
        }
      }
      check(item);
      item.resolve(lease(() => { activeImages = null; }));
    } catch (error) {
      activeImages = null;
      item.reject(error);
      drain();
    }
  }

  function drain() {
    if (closed) return;
    if (!exclusive(activeImages?.policy)) {
      // Later models wait behind an exclusive image, while earlier models get
      // their turn before it. Neither a busy chat nor image batches starve it.
      const barrier = images.find(item => exclusive(item.policy))?.sequence ?? Infinity;
      while (models.length && models[0].sequence < barrier) {
        const item = models.shift();
        detach(item);
        if (item.signal?.aborted) { item.reject(stopped()); continue; }
        activeModels++;
        item.resolve(lease(() => { activeModels--; }));
      }
    }
    if (activeImages || !images.length) return;
    const next = images[0];
    if (exclusive(next.policy) && activeModels) return;
    images.shift();
    detach(next);
    activeImages = next;
    void prepareImages(next);
  }

  function enqueue(queue, properties) {
    if (closed) return Promise.reject(unavailable());
    if (properties.signal?.aborted) return Promise.reject(stopped());
    return new Promise((resolve, reject) => {
      const item = { ...properties, sequence: ++sequence, resolve, reject };
      item.abort = () => {
        const index = queue.indexOf(item);
        if (index < 0) return;
        queue.splice(index, 1);
        detach(item);
        reject(stopped());
        drain();
      };
      item.signal?.addEventListener('abort', item.abort, { once: true });
      queue.push(item);
      drain();
    });
  }

  function acquireModel({ signal } = {}) { return enqueue(models, { signal }); }
  function acquireImages({ policy = 'keep', signal } = {}) {
    if (!['keep', 'unload', 'alternate'].includes(policy)) return Promise.reject(failure(400, 'Politique mémoire image invalide.'));
    return enqueue(images, { policy, signal });
  }
  function close() {
    closed = true;
    for (const queue of [models, images]) {
      for (const item of queue.splice(0)) { detach(item); item.reject(unavailable()); }
    }
  }
  function snapshot() {
    return {
      activeModels,
      activeImages: activeImages ? 1 : 0,
      imagePolicy: activeImages?.policy || null,
      queuedModels: models.length,
      queuedImages: images.length,
      closed,
    };
  }
  return { acquireModel, acquireImages, snapshot, close };
}
