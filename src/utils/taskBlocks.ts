export {
  TASK_AGENT_TARGETS,
  TASK_STATUSES,
  TASK_INBOX_PROJECT_ID,
  TASK_AGENT_LABELS,
  TASK_STATUS_LABELS,
  DEFAULT_TASK_LEASE_SECONDS,
  MIN_TASK_LEASE_SECONDS,
  MAX_TASK_LEASE_SECONDS,
  formatTaskHumanId,
  parseTaskHumanId,
  formatTaskDeepLink,
  getNextTaskNumber,
  createTaskMetadata,
  normalizeTaskCreator,
  taskCreatorLabel,
  createTaskInboxProject,
  isTaskInboxProject,
  normalizeTaskMetadata,
  isTaskBlock,
  isTaskAutoPickupEligible,
  normalizeLeaseSeconds,
  taskTargetMatches,
  isTaskClaimCandidate,
  createTaskClaim,
  redactTaskClaim,
  taskWithoutActiveClaim,
  validateTaskMetadata,
  validateTaskReady,
  canTransitionTask,
  taskClaimWriteRefusal,
  taskProtectedFieldRefusal
} from '../../mcp/core/tasks.mjs';

export function taskContentFromParts(goal: string, context: string, acceptanceCriteria: string[]): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  return `<h2>Goal</h2><p>${escape(goal.trim())}</p><h2>Context</h2><p>${escape(context.trim())}</p><h2>Acceptance Criteria</h2><ul>${acceptanceCriteria.map(item => `<li><p>${escape(item.trim())}</p></li>`).join('')}</ul>`;
}

export function convertContentToTask(content: string): string {
  return content.trim() ? content : '<p></p>';
}
