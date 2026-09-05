import { describe, expect, it, vi } from 'vitest';
import { createCaptureSaveBroker } from './capture-save.cjs';
describe('capture save acknowledgement', () => {
  it('waits for durable storage and coalesces duplicate clicks', async () => {
    const broker = createCaptureSaveBroker(); const send = vi.fn(); const payload = { requestId: 'save', text: 'Original' };
    const first = broker.save(payload, send); const second = broker.save(payload, send);
    expect(first).toBe(second); expect(send).toHaveBeenCalledTimes(1);
    let resolved = false; void first.then(() => { resolved = true; }); await Promise.resolve(); expect(resolved).toBe(false);
    broker.acknowledge({ requestId: 'save', ok: true }); await expect(first).resolves.toEqual({ ok: true });
  });
  it('reports a workspace failure and permits retry', async () => {
    const broker = createCaptureSaveBroker(); const payload = { requestId: 'save', text: 'Original' };
    const first = broker.save(payload, () => {}); broker.acknowledge({ requestId: 'save', ok: false, error: 'Disk full' });
    await expect(first).rejects.toThrow('Disk full');
    const retry = broker.save(payload, () => {}); broker.acknowledge({ requestId: 'save', ok: true }); await expect(retry).resolves.toEqual({ ok: true });
  });
  it('times out without falsely confirming a save', async () => {
    const broker = createCaptureSaveBroker(10);
    await expect(broker.save({ requestId: 'save', text: 'Original' }, () => {})).rejects.toThrow('draft is kept');
  });
});
