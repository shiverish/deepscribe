import { describe, expect, it } from 'vitest';
import {
  agentBlockCreator,
  assignmentSlug,
  blockCreator,
  blockCreatorLabel,
  creatorLabel,
  creatorSlug,
  normalizeBlockCreator
} from './creators.mjs';

describe('recording who created a block', () => {
  it('keeps an agent an agent even when it declares no identity', () => {
    expect(agentBlockCreator()).toEqual({ type: 'agent' });
    expect(agentBlockCreator({ agentId: '  ', agentTarget: 'nonsense' })).toEqual({ type: 'agent' });
  });

  it('keeps the identity an agent does declare', () => {
    expect(agentBlockCreator({ agentId: ' claude-7f2a ', agentTarget: 'claude' }))
      .toEqual({ type: 'agent', agentTarget: 'claude', agentId: 'claude-7f2a' });
  });

  it('only carries a custom name for a custom agent', () => {
    expect(agentBlockCreator({ agentId: 'a', agentTarget: 'custom', customAgentName: 'SeeScribe' }))
      .toEqual({ type: 'agent', agentTarget: 'custom', agentId: 'a', customAgentName: 'SeeScribe' });
    expect(agentBlockCreator({ agentId: 'a', agentTarget: 'claude', customAgentName: 'SeeScribe' }))
      .toEqual({ type: 'agent', agentTarget: 'claude', agentId: 'a' });
  });

  it('rejects anything that is not a creator', () => {
    expect(normalizeBlockCreator(undefined)).toBeUndefined();
    expect(normalizeBlockCreator('user')).toBeUndefined();
    expect(normalizeBlockCreator({ type: 'robot' })).toBeUndefined();
    expect(normalizeBlockCreator({ type: 'user' })).toEqual({ type: 'user' });
  });
});

describe('resolving the creator of a block', () => {
  it('prefers the canonical field over the legacy task creator', () => {
    expect(blockCreator({
      creator: { type: 'user' },
      task: { creator: { type: 'agent', agentTarget: 'claude', agentId: 'c-1', requestId: 'r-1' } }
    })).toEqual({ type: 'user' });
  });

  it('falls back to the task creator for a row written before the canonical field', () => {
    expect(blockCreator({
      task: { creator: { type: 'agent', agentTarget: 'claude', agentId: 'c-1', requestId: 'r-1' } }
    })).toEqual({ type: 'agent', agentTarget: 'claude', agentId: 'c-1' });
  });

  it('attributes a row older than both fields to the user', () => {
    expect(blockCreator({})).toEqual({ type: 'user' });
    expect(blockCreator(undefined)).toEqual({ type: 'user' });
  });
});

describe('naming a creator outward', () => {
  it('reports the user as the user', () => {
    expect(creatorSlug({ type: 'user' })).toBe('user');
  });

  it('reports a provider agent by its stable slug, not by its UI label', () => {
    expect(creatorSlug({ type: 'agent', agentTarget: 'openai', agentId: 'x' })).toBe('openai');
    expect(creatorLabel({ type: 'agent', agentTarget: 'openai', agentId: 'x' })).toBe('Codex/ChatGPT');
  });

  it('reports a custom agent by its own name', () => {
    expect(creatorSlug({ type: 'agent', agentTarget: 'custom', customAgentName: 'SeeScribe' })).toBe('SeeScribe');
  });

  it('still names an agent that declared no identity', () => {
    expect(creatorSlug({ type: 'agent' })).toBe('agent');
    expect(creatorSlug({ type: 'agent', agentTarget: 'custom' })).toBe('custom');
  });

  it('has no label for the user, so the UI can hide the chip', () => {
    expect(creatorLabel({ type: 'user' })).toBeNull();
    expect(blockCreatorLabel({})).toBeNull();
  });
});

describe('naming an assignment outward', () => {
  it('treats the agent pool as a real assignment and none as no assignment', () => {
    expect(assignmentSlug('any')).toBe('any');
    expect(assignmentSlug('none')).toBeNull();
    expect(assignmentSlug(null)).toBeNull();
  });

  it('names a custom assignee by its own name', () => {
    expect(assignmentSlug('custom', ' SeeScribe ')).toBe('SeeScribe');
    expect(assignmentSlug('custom', '')).toBe('custom');
  });

  it('names a provider assignee by its slug', () => {
    expect(assignmentSlug('gemini')).toBe('gemini');
  });
});
