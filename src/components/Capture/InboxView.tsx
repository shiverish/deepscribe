import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Inbox,
  Plus,
  ArrowUpRight,
  HelpCircle,
  Clock,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  Sparkles,
  Edit3,
  MapPin,
  FileText,
  AlertTriangle,
  Play
} from 'lucide-react';
import type { Block, CaptureProposalOperation, CaptureQuestion, CaptureResult } from '../../types';
import { db } from '../../db/db';
import { CAPTURE_PROCESSOR_KEY, captureMetadata, captureStatus } from '../../../mcp/core/captures.mjs';
import { extractProjectHint } from '../../utils/quickCapture';
import {
  submitCaptureAnswer,
  applyCaptureProposal,
  keepCaptureAsLooseNote,
  dismissCapture,
  editCaptureProposal,
  requestImmediateAnalysis
} from '../../utils/captureProcessing';
import './Inbox.css';

export function InboxView({
  blocks,
  onOpenBlock,
  onDelete,
  selectedCaptureId
}: {
  selectedCaptureId?: string;
  blocks: Block[];
  onOpenBlock: (id: string) => void;
  onDelete: (block: Block) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedCaptureId);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editGoal, setEditGoal] = useState('');
  const [editCriteria, setEditCriteria] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [now, setNow] = useState(Date.now());

  const processorRecord = useLiveQuery(() => db.settings.get(CAPTURE_PROCESSOR_KEY));
  const userSettings = useLiveQuery(() => db.settings.get('userSettings'));
  const projects = useLiveQuery(() => db.projects.filter(p => !p.isTrash).toArray(), [], []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const captures = useMemo(
    () => blocks.filter(b => !b.isTrash && captureMetadata(b)),
    [blocks]
  );

  // Grouping
  const needsDecisionCaptures = useMemo(() => {
    return captures
      .filter(b => {
        const meta = captureMetadata(b);
        const status = captureStatus(b, now);
        return status === 'proposal' || status === 'needs-input' || Boolean(meta?.activeProposal && !['processed', 'kept', 'dismissed'].includes(status || ''));
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [captures, now]);

  const waitingCaptures = useMemo(() => {
    return captures
      .filter(b => {
        const status = captureStatus(b, now);
        const meta = captureMetadata(b);
        const hasProposal = Boolean(meta?.activeProposal);
        return (status === 'pending' || status === 'processing') && !hasProposal && status !== 'needs-input';
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [captures, now]);

  const historyCaptures = useMemo(() => {
    return captures
      .filter(b => {
        const status = captureStatus(b, now);
        return status === 'processed' || status === 'kept' || status === 'dismissed';
      })
      .sort((a, b) => (b.capture?.processedAt ?? b.updatedAt) - (a.capture?.processedAt ?? a.updatedAt));
  }, [captures, now]);

  // Selected capture fallback
  useEffect(() => {
    if (selectedCaptureId) {
      setSelectedId(selectedCaptureId);
    } else if (!selectedId && (needsDecisionCaptures.length || waitingCaptures.length || historyCaptures.length)) {
      setSelectedId(needsDecisionCaptures[0]?.id ?? waitingCaptures[0]?.id ?? historyCaptures[0]?.id);
    }
  }, [selectedCaptureId, selectedId, needsDecisionCaptures, waitingCaptures, historyCaptures]);

  const selected = captures.find(b => b.id === selectedId);
  const meta = selected ? captureMetadata(selected) : undefined;
  const raw = selected ? extractProjectHint(selected.plainText) : undefined;
  const activeProposal = meta?.activeProposal;

  // Reset form when changing selection
  useEffect(() => {
    setAnswer('');
    setError('');
    setIsEditing(false);
    if (activeProposal) {
      setEditSummary(activeProposal.summary);
      const op = activeProposal.operations?.[0];
      setEditTitle(op?.title || '');
      setEditContent(op?.content || '');
      setEditGoal(op?.goal || '');
      setEditCriteria(op?.acceptanceCriteria?.join('\n') || '');
      setSelectedProjectId(op?.projectId || '');
    }
  }, [selected?.id, activeProposal?.id]);

  // Agent responsibility details
  const processorSettings = userSettings?.value?.captureProcessor;
  const agentType = processorSettings?.agent ?? 'codex';
  const isNone = agentType === 'none';
  const agentName = isNone ? 'None' : (processorSettings?.customName || (agentType === 'gemini' ? 'Antigravity' : agentType === 'claude' ? 'Claude' : 'Codex'));
  const lastChecked = processorRecord?.value?.lastCheckedAt;
  const isAvailable = !isNone && (!lastChecked || (now - lastChecked < 45 * 60 * 1000));

  const handleApprove = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await applyCaptureProposal(selected.id) as any;
      if (result?.conflict) {
        setError(result.error || 'Destination changed. Please refresh the proposal.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve this proposal.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected || !activeProposal || busy) return;
    setBusy(true);
    setError('');
    try {
      const op = activeProposal.operations[0];
      const updatedOp = {
        ...op,
        title: editTitle || op.title,
        content: editContent || op.content,
        goal: editGoal || op.goal,
        projectId: selectedProjectId || op.projectId,
        acceptanceCriteria: editCriteria ? editCriteria.split('\n').map(s => s.trim()).filter(Boolean) : op.acceptanceCriteria
      };
      await editCaptureProposal(selected.id, {
        summary: editSummary || activeProposal.summary,
        operations: [updatedOp, ...activeProposal.operations.slice(1)]
      });
      setIsEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save suggestion edits.');
    } finally {
      setBusy(false);
    }
  };

  const handleKeepLoose = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await keepCaptureAsLooseNote(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not keep as loose note.');
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await dismissCapture(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not dismiss capture.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnswerQuestion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || busy || !answer.trim()) return;
    setBusy(true);
    setError('');
    try {
      await submitCaptureAnswer(selected.id, answer.trim());
      setAnswer('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit answer.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyzeNow = async (e: React.MouseEvent, captureId: string) => {
    e.stopPropagation();
    try {
      await requestImmediateAnalysis(captureId);
    } catch (cause) {
      console.error(cause);
    }
  };

  const targetProject = projects?.find(p => p.id === activeProposal?.operations?.[0]?.projectId);
  const targetBlock = blocks.find(b => b.id === activeProposal?.operations?.[0]?.blockId);

  return (
    <section className="capture-inbox" aria-label="Capture Inbox">
      {/* Header */}
      <header className="capture-inbox-header">
        <div>
          <h1><Inbox size={22} /> Inbox</h1>
          <p>Capture a thought. Review concrete proposals when ready.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => void window.electronAPI?.quickCapture?.open()}
        >
          <Plus size={16} /> Capture
        </button>
      </header>

      {/* Agent responsibility status */}
      <div className="capture-inbox-status">
        <span className={`capture-inbox-status-dot ${isAvailable ? '' : 'idle'}`} />
        <span className="capture-inbox-status-text">
          {isNone
            ? 'Captures are saved locally. No agent processor active.'
            : isAvailable
            ? `${agentName} prepares suggestions. Nothing changes without your approval.`
            : `${agentName} is currently unavailable. Your capture is saved.`}
        </span>
        <span className="capture-inbox-status-sub">
          {isNone ? 'Save captures only' : 'Checks every 15 minutes'}
        </span>
      </div>

      {/* Main two-column content */}
      <div className="capture-inbox-body">
        {/* Single Unified List */}
        <div className="capture-inbox-list" aria-label="Captures List">
          {/* Section 1: Needs your decision */}
          {needsDecisionCaptures.length > 0 && (
            <div className="capture-list-section">
              <div className="capture-section-header">
                <span>Needs your decision</span>
                <span className="capture-section-badge">{needsDecisionCaptures.length}</span>
              </div>
              {needsDecisionCaptures.map(block => {
                const bMeta = captureMetadata(block);
                const isQuestion = bMeta?.status === 'needs-input';
                const prop = bMeta?.activeProposal;
                const author = prop?.customAgentName || prop?.agentId || agentName;
                return (
                  <button
                    key={block.id}
                    type="button"
                    className={`capture-row decision-needed ${block.id === selected?.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(block.id)}
                  >
                    <div className="capture-row-header">
                      <span className={`capture-row-badge ${isQuestion ? 'question' : ''}`}>
                        {isQuestion ? `Question from ${author}` : `Proposal from ${author}`}
                      </span>
                      <span className="capture-row-time">
                        {new Date(block.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <strong>{prop?.summary || block.title}</strong>
                    <p>{block.capture?.rawText || extractProjectHint(block.plainText).rawText}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Section 2: Waiting captures */}
          <div className="capture-list-section">
            <div className="capture-section-header">
              <span>Waiting captures</span>
              {waitingCaptures.length > 0 && <span className="capture-section-badge">{waitingCaptures.length}</span>}
            </div>
            {waitingCaptures.length === 0 && needsDecisionCaptures.length === 0 && (
              <div className="capture-empty-state">
                <Inbox size={26} />
                <p>All caught up!</p>
                <small>Press Ctrl+Alt+C anytime to capture a thought.</small>
              </div>
            )}
            {waitingCaptures.map(block => {
              const bMeta = captureMetadata(block);
              const isClaimed = bMeta?.claim && bMeta.claim.expiresAt > now;
              const statusText = isClaimed
                ? `${bMeta?.claim?.customAgentName || agentName} is reviewing this…`
                : isAvailable
                ? `Waiting for ${agentName}`
                : `${agentName} is unavailable`;

              return (
                <button
                  key={block.id}
                  type="button"
                  className={`capture-row ${block.id === selected?.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(block.id)}
                >
                  <div className="capture-row-header">
                    <strong>{block.title}</strong>
                    <span className="capture-row-time">
                      {new Date(block.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p>{bMeta?.rawText || extractProjectHint(block.plainText).rawText}</p>
                  <div className="capture-row-footer">
                    <span>{statusText}</span>
                    <button
                      type="button"
                      className="capture-analyze-btn"
                      title="Request immediate review"
                      onClick={e => handleAnalyzeNow(e, block.id)}
                    >
                      <Play size={10} /> Analyze now
                    </button>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Section 3: History (Collapsible) */}
          {historyCaptures.length > 0 && (
            <div className="capture-list-section">
              <button
                type="button"
                className="capture-section-toggle"
                onClick={() => setIsHistoryOpen(prev => !prev)}
              >
                {isHistoryOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>History ({historyCaptures.length})</span>
              </button>
              {isHistoryOpen && (
                historyCaptures.map(block => {
                  const bMeta = captureMetadata(block);
                  const isKept = bMeta?.status === 'kept';
                  const isDismissed = bMeta?.status === 'dismissed';
                  const label = isKept ? 'Kept as note' : isDismissed ? 'Dismissed' : 'Approved';
                  const badgeClass = isKept ? 'loose' : isDismissed ? 'loose' : 'approved';
                  return (
                    <button
                      key={block.id}
                      type="button"
                      className={`capture-row ${block.id === selected?.id ? 'selected' : ''}`}
                      onClick={() => setSelectedId(block.id)}
                    >
                      <div className="capture-row-header">
                        <span className={`capture-row-badge ${badgeClass}`}>{label}</span>
                        <span className="capture-row-time">
                          {new Date(block.capture?.processedAt ?? block.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <strong>{bMeta?.summary || block.title}</strong>
                      <p>{bMeta?.rawText || extractProjectHint(block.plainText).rawText}</p>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Right Detail Pane */}
        {selected ? (
          <article className="capture-inbox-detail">
            <div className="capture-detail-header">
              <div>
                <h2>{selected.title}</h2>
                {(meta?.projectHintName || raw?.hintName) && (
                  <div className="capture-detail-hint">
                    Project hint: {meta?.projectHintName || raw?.hintName}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="icon-button"
                title="Move capture to trash"
                aria-label="Move capture to trash"
                onClick={() => onDelete(selected)}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Original Capture Text */}
            <div className="capture-card-original">
              <h3>Original capture</h3>
              <div className="capture-card-original-text">
                {meta?.rawText ?? raw?.rawText}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="capture-conflict-alert" role="alert">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Case 1: Agent Question Waiting for User */}
            {meta?.status === 'needs-input' && (
              <div className="capture-question-card">
                <div className="capture-question-header">
                  <HelpCircle size={15} />
                  <span>Question from your agent</span>
                </div>
                {meta.questions?.map((q: CaptureQuestion, idx: number) => (
                  <div key={idx} className="capture-question-text">
                    <p>{q.question}</p>
                    {q.answer && (
                      <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                        <strong>Your answer:</strong> {q.answer}
                      </p>
                    )}
                  </div>
                ))}
                <form className="capture-question-form" onSubmit={handleAnswerQuestion}>
                  <textarea
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    placeholder="Add the context your agent needs…"
                    disabled={busy}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={busy || !answer.trim()}
                    >
                      {busy ? 'Sending…' : 'Send answer'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Case 2: Concrete Proposal Ready for Approval */}
            {activeProposal && meta?.status !== 'processed' && meta?.status !== 'kept' && meta?.status !== 'dismissed' && (
              <div className="capture-proposal-card">
                <div className="capture-proposal-agent-tag">
                  <Sparkles size={13} />
                  <span>Proposed by {activeProposal.customAgentName || activeProposal.agentId}</span>
                </div>

                {!isEditing ? (
                  <>
                    <h3 className="capture-proposal-summary">{activeProposal.summary}</h3>

                    {activeProposal.rationale && (
                      <div className="capture-proposal-rationale">
                        {activeProposal.rationale}
                      </div>
                    )}

                    <div className="capture-proposal-target-info">
                      <MapPin size={13} />
                      <span>
                        Destination:{' '}
                        <strong>
                          {targetProject?.title || 'Inbox'}
                          {targetBlock ? ` → ${targetBlock.title}` : ''}
                        </strong>
                      </span>
                    </div>

                    {/* Diff or details based on operation */}
                    {activeProposal.operations?.map((op: CaptureProposalOperation, i: number) => {
                      if (op.type === 'append') {
                        return (
                          <div key={i} className="capture-diff-box">
                            <div className="capture-diff-header">
                              Add to “{targetBlock?.title || activeProposal.diffPreview?.targetBlockTitle || 'Target note'}”
                            </div>
                            <div className="capture-diff-addition">
                              +{op.content}
                            </div>
                          </div>
                        );
                      }
                      if (op.type === 'task') {
                        return (
                          <div key={i} className="capture-task-preview">
                            <div>
                              <span className="capture-preview-label">Task Title</span>
                              <div className="capture-preview-value"><strong>{op.title}</strong></div>
                            </div>
                            {op.goal && (
                              <div>
                                <span className="capture-preview-label">Goal</span>
                                <div className="capture-preview-value">{op.goal}</div>
                              </div>
                            )}
                            {op.acceptanceCriteria && op.acceptanceCriteria.length > 0 && (
                              <div>
                                <span className="capture-preview-label">Acceptance Criteria</span>
                                <ul className="capture-criteria-list">
                                  {op.acceptanceCriteria.map((c: string, idx: number) => (
                                    <li key={idx}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="capture-knowledge-preview">
                          <div>
                            <span className="capture-preview-label">Title</span>
                            <div className="capture-preview-value"><strong>{op.title}</strong></div>
                          </div>
                          <div>
                            <span className="capture-preview-label">Content</span>
                            <div className="capture-preview-value" style={{ whiteSpace: 'pre-wrap' }}>
                              {op.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {activeProposal.conflict && (
                      <div className="capture-conflict-alert">
                        <AlertTriangle size={15} />
                        <span>{activeProposal.conflictReason || 'Destination changed since this proposal was prepared. Ask Codex to refresh.'}</span>
                      </div>
                    )}

                    {/* Actions Toolbar */}
                    <div className="capture-actions-toolbar">
                      <button
                        type="button"
                        className="capture-btn-approve"
                        onClick={handleApprove}
                        disabled={busy || activeProposal.conflict}
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        className="capture-btn-secondary"
                        onClick={() => setIsEditing(true)}
                        disabled={busy}
                      >
                        <Edit3 size={13} /> Edit suggestion
                      </button>
                      <button
                        type="button"
                        className="capture-btn-secondary"
                        onClick={handleKeepLoose}
                        disabled={busy}
                      >
                        <FileText size={13} /> Keep as loose note
                      </button>
                      <button
                        type="button"
                        className="capture-btn-ghost"
                        onClick={handleDismiss}
                        disabled={busy}
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  /* Inline Edit Mode */
                  <div className="capture-edit-panel">
                    <label>
                      Proposal summary
                      <input
                        type="text"
                        value={editSummary}
                        onChange={e => setEditSummary(e.target.value)}
                      />
                    </label>

                    <label>
                      Destination Project
                      <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                      >
                        {projects?.map(p => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Item title
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                      />
                    </label>

                    {activeProposal.operations[0]?.type === 'task' ? (
                      <>
                        <label>
                          Goal
                          <textarea
                            rows={2}
                            value={editGoal}
                            onChange={e => setEditGoal(e.target.value)}
                          />
                        </label>
                        <label>
                          Acceptance Criteria (one per line)
                          <textarea
                            rows={3}
                            value={editCriteria}
                            onChange={e => setEditCriteria(e.target.value)}
                          />
                        </label>
                      </>
                    ) : (
                      <label>
                        Content
                        <textarea
                          rows={5}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                        />
                      </label>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleSaveEdit}
                        disabled={busy}
                      >
                        Save suggestion
                      </button>
                      <button
                        type="button"
                        className="capture-btn-secondary"
                        onClick={() => setIsEditing(false)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Case 3: Waiting status */}
            {(meta?.status === 'pending' || meta?.status === 'processing') && !activeProposal && (
              <div style={{ padding: '16px', borderRadius: 8, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <Clock size={16} />
                  <span>
                    {meta?.claim && meta.claim.expiresAt > now
                      ? `${meta.claim.customAgentName || agentName} is currently reviewing this capture…`
                      : `Saved. ${agentName} will prepare a suggestion.`}
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={e => handleAnalyzeNow(e, selected.id)}
                >
                  <Play size={13} /> Analyze now
                </button>
              </div>
            )}

            {/* Case 4: Processed / Handled Results */}
            {meta?.status === 'processed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#34D399', fontWeight: 600 }}>
                  <CheckCircle2 size={16} />
                  <span>Approved and applied</span>
                </div>
                {(meta.results ?? []).map((result: CaptureResult, idx: number) => {
                  const exists = blocks.some(b => b.id === result.blockId && !b.isTrash);
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="capture-inbox-result"
                      disabled={!exists}
                      onClick={() => onOpenBlock(result.blockId)}
                    >
                      <ArrowUpRight size={17} />
                      <span>
                        <strong>{result.title}</strong>
                        <small>{exists ? 'Open result in workspace' : 'Item unavailable'}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {meta?.status === 'kept' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                <FileText size={16} />
                <span>Kept as loose note in History.</span>
              </div>
            )}

            {meta?.status === 'dismissed' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                <span>Dismissed to History.</span>
              </div>
            )}
          </article>
        ) : (
          <div className="capture-empty-state" style={{ flex: 1 }}>
            <Inbox size={32} />
            <p>Select a capture to view suggestions</p>
          </div>
        )}
      </div>
    </section>
  );
}

