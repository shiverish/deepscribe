import crypto from 'node:crypto';

/**
 * Provider-onafhankelijke referentie voor Auto Task Pickup.
 * De host levert zelf een execute-functie en een handler; deze module start
 * bewust geen Codex-, Claude- of Gemini-proces.
 */
export class AutoPickupHarness {
  constructor({ execute, agentId, agentTarget, customAgentName, projectId, pollIntervalMs = 60_000, leaseSeconds = 900, heartbeatMs = 300_000 }) {
    if (typeof execute !== 'function') throw new Error('execute is verplicht.');
    this.execute = execute;
    this.claimant = { agentId, agentTarget, ...(customAgentName ? { customAgentName } : {}), ...(projectId ? { projectId } : {}) };
    this.pollIntervalMs = pollIntervalMs;
    this.leaseSeconds = leaseSeconds;
    this.heartbeatMs = heartbeatMs;
    this.running = false;
    this.timer = null;
    this.handler = null;
  }

  async runOnce(handler = this.handler) {
    if (this.running || typeof handler !== 'function') return null;
    this.running = true;
    let heartbeat;
    let claim;
    try {
      claim = await this.execute('claim_next_work_item', {
        ...this.claimant,
        requestId: crypto.randomUUID(),
        leaseSeconds: this.leaseSeconds
      });
      if (!claim) return null;
      const renew = () => this.execute('renew_work_item_claim', {
        blockId: claim.block.id,
        agentId: this.claimant.agentId,
        claimToken: claim.claimToken,
        leaseSeconds: this.leaseSeconds
      });
      heartbeat = setInterval(() => void renew(), this.heartbeatMs);
      heartbeat.unref?.();
      const outcome = await handler({ block: claim.block, renew });
      const status = outcome?.status ?? 'review';
      return await this.execute('transition_work_item', {
        blockId: claim.block.id,
        agentId: this.claimant.agentId,
        claimToken: claim.claimToken,
        status,
        acceptanceChecksPassed: outcome?.acceptanceChecksPassed === true,
        summary: outcome?.summary
      });
    } catch (error) {
      if (claim) {
        try {
          await this.execute('transition_work_item', {
            blockId: claim.block.id,
            agentId: this.claimant.agentId,
            claimToken: claim.claimToken,
            status: 'blocked',
            summary: error instanceof Error ? error.message : String(error)
          });
        } catch {
          // De lease kan inmiddels verlopen zijn; de queue maakt de taak dan opnieuw claimbaar.
        }
      }
      throw error;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.running = false;
    }
  }

  start(handler) {
    this.handler = handler;
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.pollIntervalMs);
    this.timer.unref?.();
    void this.runOnce();
  }

  /** Aan te roepen na resources/updated; de interval blijft de veiligheidsfallback. */
  wake() {
    return this.runOnce();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.handler = null;
  }
}
