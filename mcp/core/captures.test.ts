import { describe, expect, it } from 'vitest';
import {
  prepareCaptureOperation,
  answerCapture,
  keepCaptureAsLooseNote,
  dismissCapture,
  editCaptureProposal,
  captureMetadata,
  captureStatus,
  importCaptureMetadata
} from './captures.mjs';

const source = () => ({
  id: 'capture-1',
  projectId: 'inbox',
  parentId: null,
  title: 'Idea',
  content: '<p>Mijn originele tekst.</p>',
  plainText: 'Mijn originele tekst.',
  tags: ['capture', 'capture-unprocessed'],
  createdAt: 1,
  updatedAt: 1,
  isTrash: false
});

const state = () => ({
  projects: [{ id: 'inbox' }, { id: 'project' }],
  blocks: [source()],
  links: []
});

function claimed() {
  const initial = state();
  const claim = prepareCaptureOperation('claim_next_capture', { agentId: 'agent', requestId: 'claim' }, initial, 100);
  return {
    state: { ...initial, blocks: claim.blocks },
    params: {
      captureId: 'capture-1',
      agentId: 'agent',
      claimToken: claim.result.claimToken,
      requestId: 'finish',
      outcome: 'proposal',
      summary: 'Saved knowledge'
    }
  };
}

describe('capture protocol', () => {
  it('proposes knowledge and task without modifying destination blocks, then applies atomically upon user approval', () => {
    const c = claimed();
    c.state.projects.push({ id: 'proj-system-task-inbox' });

    // Step 1: Agent proposes (no mutations to projects or other blocks)
    const proposed = prepareCaptureOperation('propose_capture', {
      ...c.params,
      rationale: 'Organize research into project',
      operations: [
        { type: 'knowledge', projectId: 'project', title: 'Idea', content: '## Concept\n\nMy idea.' },
        { type: 'task', title: 'Validate', goal: 'Validate concept', context: 'Read the idea', acceptanceCriteria: ['Record findings'] }
      ]
    }, c.state, 200);

    // Only the capture block itself is updated with the proposal
    expect(proposed.blocks).toHaveLength(1);
    const capture = proposed.blocks[0];
    expect(capture.id).toBe('capture-1');
    expect(capture.content).toBe(source().content);
    expect(capture.capture.status).toBe('proposal');
    expect(capture.capture.activeProposal).toBeDefined();
    expect(capture.capture.activeProposal.operations).toHaveLength(2);
    expect(capture.capture.activeProposal.rationale).toBe('Organize research into project');
    expect(proposed.links).toHaveLength(0);
    expect(proposed.revisions).toHaveLength(0);

    // Replay with identical requestId works idempotently
    const replay = prepareCaptureOperation('propose_capture', {
      ...c.params,
      rationale: 'Organize research into project',
      operations: [
        { type: 'knowledge', projectId: 'project', title: 'Idea', content: '## Concept\n\nMy idea.' },
        { type: 'task', title: 'Validate', goal: 'Validate concept', context: 'Read the idea', acceptanceCriteria: ['Record findings'] }
      ]
    }, { ...c.state, blocks: proposed.blocks }, 99999999);
    expect(replay.blocks).toEqual([]);
    expect(replay.result.capture.status).toBe('proposal');

    // Step 2: User approves -> apply_capture_proposal executes changes atomically
    const applied = prepareCaptureOperation('apply_capture_proposal', {
      captureId: 'capture-1'
    }, { ...c.state, blocks: proposed.blocks }, 300);

    expect(applied.blocks.find(b => b.id === 'capture-1').capture.status).toBe('processed');
    expect(applied.blocks.find(b => b.id === 'capture-1').capture.results).toHaveLength(2);
    expect(applied.blocks.find(b => b.kind === 'task').task.status).toBe('inbox');
    expect(applied.links).toHaveLength(2);
    expect(applied.revisions).toHaveLength(2);
  });

  it('makes an expired lease available without letting the former owner complete it', () => {
    const c = claimed();
    expect(captureStatus(c.state.blocks[0], 900101)).toBe('pending');
    expect(() => prepareCaptureOperation('propose_capture', c.params, c.state, 900101)).toThrow('current capture claim');
    const next = prepareCaptureOperation('claim_next_capture', { agentId: 'other', requestId: 'next' }, c.state, 900101);
    expect(next.result.capture.id).toBe('capture-1');
    expect(next.result.claimToken).not.toBe(c.params.claimToken);
    expect(next.result.capture.capture.claim.token).toBeUndefined();
  });

  it('renews an owned lease and rejects another agent', () => {
    const c = claimed();
    expect(prepareCaptureOperation('renew_capture_claim', c.params, c.state, 200).result.expiresAt).toBe(900200);
    expect(() => prepareCaptureOperation('renew_capture_claim', { ...c.params, agentId: 'other' }, c.state, 200)).toThrow('owned');
  });

  it('keeps questions and answers separate from the original and queues the answer', () => {
    const c = claimed();
    const asked = prepareCaptureOperation('propose_capture', { ...c.params, outcome: 'needs-input', question: 'Which project?' }, c.state, 200);
    const answered = answerCapture(asked.blocks[0], 'Use Project', 300);
    expect(answered.content).toBe(source().content);
    expect(answered.capture.status).toBe('pending');
    expect(answered.capture.questions[0].answer).toBe('Use Project');
    expect(() => answerCapture(answered, 'Again')).toThrow('not waiting');
  });

  it('rejects stale or missing destinations before committing any result', () => {
    const c = claimed();
    expect(() => prepareCaptureOperation('propose_capture', {
      ...c.params,
      operations: [
        { type: 'knowledge', projectId: 'project', title: 'OK', content: 'Valid' },
        { type: 'append', blockId: 'missing', expectedUpdatedAt: 1, content: 'Change' }
      ]
    }, c.state, 200)).toThrow('destination');
  });

  it('detects concurrency conflict when destination block changed after proposal', () => {
    const c = claimed();
    const dest = { ...source(), id: 'dest-1', tags: [], projectId: 'project', updatedAt: 10 };
    c.state.blocks.push(dest);

    // Agent proposes append based on dest.updatedAt = 10
    const proposed = prepareCaptureOperation('propose_capture', {
      ...c.params,
      operations: [{ type: 'append', blockId: 'dest-1', expectedUpdatedAt: 10, content: 'New detail' }]
    }, c.state, 200);

    const captureWithProposal = proposed.blocks[0];

    // Destination gets modified in the background (updatedAt becomes 20)
    dest.updatedAt = 20;

    // User attempts to approve
    const conflictResult = prepareCaptureOperation('apply_capture_proposal', {
      captureId: 'capture-1'
    }, { ...c.state, blocks: [captureWithProposal, dest] }, 300);

    expect(conflictResult.result.conflict).toBe(true);
    expect(conflictResult.blocks[0].capture.activeProposal.conflict).toBe(true);
    // Destination was NOT modified
    expect(dest.content).toBe(source().content);
  });

  it('supports editing a proposal creating a new version and preserving history', () => {
    const c = claimed();
    const proposed = prepareCaptureOperation('propose_capture', {
      ...c.params,
      summary: 'Initial proposal',
      operations: [{ type: 'knowledge', projectId: 'project', title: 'Initial Title', content: 'Body' }]
    }, c.state, 200);

    const block = proposed.blocks[0];
    const edited = editCaptureProposal(block, {
      summary: 'Edited proposal',
      operations: [{ type: 'knowledge', projectId: 'project', title: 'Updated Title', content: 'Updated Body' }]
    }, 250);

    expect(edited.capture.activeProposal.version).toBe(2);
    expect(edited.capture.activeProposal.summary).toBe('Edited proposal');
    expect(edited.capture.proposals).toHaveLength(2);
    expect(edited.capture.proposals[0].summary).toBe('Initial proposal');
  });

  it('supports keeping capture as loose note and dismissing without creating extra blocks', () => {
    const block = source();
    const kept = keepCaptureAsLooseNote(block, 100);
    expect(kept.capture.status).toBe('kept');
    expect(kept.tags).toContain('capture-processed');
    expect(kept.tags).not.toContain('capture-unprocessed');

    const dismissed = dismissCapture(block, 100);
    expect(dismissed.capture.status).toBe('dismissed');
    expect(dismissed.tags).toContain('capture-processed');
  });

  it('normalizes old captures and strips imported claim and replay credentials', () => {
    expect(captureMetadata(source()).status).toBe('pending');
    expect(captureMetadata({ ...source(), tags: ['capture', 'capture-processed'] }).status).toBe('processed');
    expect(captureMetadata({ ...source(), kind: 'task' })).toBeUndefined();
    const c = claimed();
    const metadata = importCaptureMetadata(c.state.blocks[0].capture);
    expect(metadata.status).toBe('pending');
    expect(metadata.claim).toBeUndefined();
  });

  it('records an empty processor check without manufacturing a task', () => {
    const prepared = prepareCaptureOperation('claim_next_capture', { agentId: 'agent', requestId: 'empty' }, { ...state(), blocks: [] }, 200);
    expect(prepared.result.capture).toBeNull();
    expect(prepared.blocks).toHaveLength(0);
    expect(prepared.processor.value.lastCheckedAt).toBe(200);
  });
});

it('does not reuse an old claim request for a different capture after completion', () => {
  const c = claimed();
  const done = prepareCaptureOperation('propose_capture', { ...c.params, outcome: 'needs-input', question: 'Where?' }, c.state, 200);
  expect(() => prepareCaptureOperation('claim_next_capture', { agentId: 'agent', requestId: 'claim' }, { ...c.state, blocks: done.blocks }, 300)).toThrow('already completed');
});

it('rejects completion when the user changed the captured source after claiming', () => {
  const c = claimed();
  c.state.blocks[0].updatedAt = 2;
  expect(() => prepareCaptureOperation('propose_capture', { ...c.params, outcome: 'needs-input', question: 'Where?' }, c.state, 200)).toThrow('Capture changed');
});

