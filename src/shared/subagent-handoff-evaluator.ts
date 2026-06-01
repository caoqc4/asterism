import type { HandoffV2Type } from './context-preservation.js';

export type SubagentActionKind =
  | 'analysis'
  | 'implementation'
  | 'verification'
  | 'documentation';

export type SubagentHandoffIssueSeverity = 'error' | 'warning';

export type SubagentHandoffIssueCode =
  | 'missing_principles'
  | 'missing_task_context'
  | 'missing_scope'
  | 'outside_action_scope'
  | 'outside_file_scope'
  | 'principles_modified'
  | 'confirmation_boundary_bypassed'
  | 'unapproved_subtask_creation'
  | 'high_risk_action'
  | 'missing_summary'
  | 'missing_recommended_next_action'
  | 'missing_evidence_for_changes'
  | 'risks_or_questions_unacknowledged';

export type SubagentHandoffIssue = {
  severity: SubagentHandoffIssueSeverity;
  code: SubagentHandoffIssueCode;
  message: string;
};

export type SubagentAssignment = {
  inheritsPrinciples: boolean;
  taskContextProvided: boolean;
  scope: string | null;
  allowedActions: readonly SubagentActionKind[];
  allowedFileScopes?: readonly string[];
};

export type SubagentHandoff = {
  summary?: string | null;
  filesChanged?: string[];
  filesProduced?: string[];
  evidence?: string[];
  risks?: string[];
  unresolvedQuestions?: string[];
  recommendedNextAction?: string | null;
  actionsPerformed?: SubagentActionKind[];
  createdSubtasks?: boolean;
  modifiedPrinciples?: boolean;
  bypassedConfirmationBoundary?: boolean;
  performedHighRiskAction?: boolean;
};

export type SubagentHandoffEvaluation = {
  allowed: boolean;
  handoffType: HandoffV2Type;
  tone: 'pass' | 'warn' | 'fail';
  summary: string;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: SubagentHandoffIssue[];
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function listHasText(values: string[] | null | undefined): boolean {
  return Boolean(values?.some((value) => value.trim()));
}

function isWithinFileScope(path: string, allowedScopes: readonly string[]): boolean {
  const normalizedPath = path.replace(/^\/+/, '');
  return allowedScopes.some((scope) => {
    const normalizedScope = scope.replace(/^\/+/, '').replace(/\/+$/, '');
    return normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);
  });
}

function issue(
  severity: SubagentHandoffIssueSeverity,
  code: SubagentHandoffIssueCode,
  message: string,
): SubagentHandoffIssue {
  return { severity, code, message };
}

export function evaluateSubagentHandoff(params: {
  assignment: SubagentAssignment;
  handoff: SubagentHandoff;
}): SubagentHandoffEvaluation {
  const { assignment, handoff } = params;
  const issues: SubagentHandoffIssue[] = [];

  if (!assignment.inheritsPrinciples) {
    issues.push(issue('error', 'missing_principles', '子代理没有继承产品级 Agent 执行规范。'));
  }

  if (!assignment.taskContextProvided) {
    issues.push(issue('error', 'missing_task_context', '子代理没有获得当前任务上下文。'));
  }

  if (!hasText(assignment.scope)) {
    issues.push(issue('error', 'missing_scope', '子代理缺少明确、有限的工作范围。'));
  }

  const performedActions = handoff.actionsPerformed ?? [];
  const allowedActions = new Set(assignment.allowedActions);
  for (const action of performedActions) {
    if (!allowedActions.has(action)) {
      issues.push(issue('error', 'outside_action_scope', `子代理执行了未授权动作：${action}。`));
    }
  }

  const touchedFiles = [...(handoff.filesChanged ?? []), ...(handoff.filesProduced ?? [])];
  const allowedFileScopes = assignment.allowedFileScopes ?? [];
  if (allowedFileScopes.length > 0) {
    for (const path of touchedFiles) {
      if (!isWithinFileScope(path, allowedFileScopes)) {
        issues.push(issue('error', 'outside_file_scope', `子代理触及了范围外文件：${path}。`));
      }
    }
  }

  if (handoff.modifiedPrinciples) {
    issues.push(issue('error', 'principles_modified', '子代理不能修改产品级 Agent 执行规范。'));
  }

  if (handoff.bypassedConfirmationBoundary) {
    issues.push(issue('error', 'confirmation_boundary_bypassed', '子代理不能绕过用户确认边界。'));
  }

  if (handoff.createdSubtasks) {
    issues.push(issue('error', 'unapproved_subtask_creation', '子代理不能直接创建真实子任务，应回交给主 Agent 统一确认。'));
  }

  if (handoff.performedHighRiskAction) {
    issues.push(issue('error', 'high_risk_action', '子代理执行了高风险动作，应由主 Agent 重新确认或升级为 Decision。'));
  }

  if (!hasText(handoff.summary)) {
    issues.push(issue('error', 'missing_summary', '子代理交接缺少结果摘要。'));
  }

  if (!hasText(handoff.recommendedNextAction)) {
    issues.push(issue('warning', 'missing_recommended_next_action', '子代理交接缺少建议下一步。'));
  }

  if (touchedFiles.length > 0 && !listHasText(handoff.evidence)) {
    issues.push(issue('warning', 'missing_evidence_for_changes', '子代理修改或产出文件后，应提供验证证据。'));
  }

  if (!listHasText(handoff.risks) && !listHasText(handoff.unresolvedQuestions)) {
    issues.push(issue('warning', 'risks_or_questions_unacknowledged', '子代理交接应明确说明风险或未决问题；若没有，也应显式说明。'));
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const allowed = errorCount === 0;
  return {
    allowed,
    handoffType: 'runtime_or_subagent_handoff',
    tone: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
    summary: errorCount > 0
      ? `子代理交接未通过：${issues.find((item) => item.severity === 'error')?.message ?? '存在阻断问题。'}`
      : warningCount > 0
        ? `子代理交接可接收，但有 ${warningCount} 条恢复性提醒。`
        : '子代理交接通过，主 Agent 可以继续集成结果。',
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues,
  };
}
