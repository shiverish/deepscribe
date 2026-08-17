import { describe, expect, it } from 'vitest';
import { tagsWithAgentStatus } from './agentInbox';

describe('agent inbox tags', () => {
  it('keeps normal tags and replaces the workflow status', () => {
    expect(tagsWithAgentStatus(['concept', 'agent-ready'], 'agent-review')).toEqual(['concept', 'agent-review']);
    expect(tagsWithAgentStatus(['agent-done'], null)).toEqual([]);
  });
});
