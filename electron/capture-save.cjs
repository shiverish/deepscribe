/** Wait for the workspace owner to persist the capture before reporting success. */
function createCaptureSaveBroker(timeoutMs = 30000) {
  const pending = new Map();
  return {
    save(payload, send) {
      if (!payload || typeof payload.requestId !== 'string' || !payload.requestId.trim() || typeof payload.text !== 'string' || !payload.text.trim()) return Promise.reject(new Error('A capture request ID and text are required.'));
      if (pending.has(payload.requestId)) {
        const previous = pending.get(payload.requestId);
        return previous.fingerprint === JSON.stringify(payload) ? previous.promise : Promise.reject(new Error('This request ID is already in use.'));
      }
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = setTimeout(() => {
        pending.delete(payload.requestId);
        reject(new Error('Saving timed out. Your draft is kept; retry to confirm it was saved.'));
      }, timeoutMs);
      pending.set(payload.requestId, { promise, resolve, reject, timer, fingerprint: JSON.stringify(payload) });
      try { send(payload); } catch (error) { clearTimeout(timer); pending.delete(payload.requestId); reject(error); }
      return promise;
    },
    acknowledge(result) {
      const entry = pending.get(result?.requestId);
      if (!entry) return;
      clearTimeout(entry.timer); pending.delete(result.requestId);
      if (result.ok === true) entry.resolve({ ok: true });
      else entry.reject(new Error(result.error || 'Could not save capture.'));
    }
  };
}
module.exports = { createCaptureSaveBroker };
