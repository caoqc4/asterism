import { useEffect, useRef, useState } from 'react';
import { evaluateRunSelfCheck, type RunSelfCheckResult } from '@shared/run-self-check';
import type { RunDetailRecord, RunRecord, RunVerificationRecord } from '@shared/types/run';
import type { TaskDetail } from '@shared/types/task';
import { recordCompletionOverrideLearningSignal } from '../lib/workHabits';

interface TaskCompletionCheckModalProps {
  taskId: string;
  taskTitle: string;
  onCancel: () => void;
  onCompleteAnyway: () => void | Promise<void>;
  onMarkWaiting: (reason: string) => void | Promise<void>;
}

function verificationToCheck(record: RunVerificationRecord): RunSelfCheckResult {
  return {
    tone: record.tone,
    label: record.label,
    detail: record.detail,
    source: 'lightweight_rule_engine',
  };
}

function buildRunCheck(run: RunRecord, detail: RunDetailRecord | null): RunSelfCheckResult {
  const persisted = detail?.verifications?.find((item) => (
    item.targetType === 'run' && item.targetId === run.id
  ));
  return persisted ? verificationToCheck(persisted) : evaluateRunSelfCheck(run, detail);
}

function buildWaitingReason(detail: TaskDetail | null, runCheck: RunSelfCheckResult | null): string {
  const openCount = detail?.completionCriteria.filter((item) => item.status === 'open').length ?? 0;
  if (openCount > 0) return `完成检查未通过：仍有 ${openCount} 条完成标准未满足`;
  if (runCheck?.tone === 'fail') return `完成检查未通过：最近 Run 验证失败：${runCheck.detail}`;
  if (runCheck?.tone === 'warn') return `完成检查提醒：最近 Run 需要补验证：${runCheck.detail}`;
  return '完成检查需要补充完成标准';
}

export function TaskCompletionCheckModal({
  taskId,
  taskTitle,
  onCancel,
  onCompleteAnyway,
  onMarkWaiting,
}: TaskCompletionCheckModalProps) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [recentRunCheck, setRecentRunCheck] = useState<RunSelfCheckResult | null>(null);
  const [selfLearnEnabled, setSelfLearnEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const autoCompleted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCheckContext() {
      try {
        const [status, taskDetail, runs] = await Promise.all([
          window.api?.getAiConfigStatus(),
          window.api?.getTaskDetail(taskId),
          window.api?.listRuns?.(),
        ]);

        if (cancelled) return;

        if (status && status.featureFlags.enableSelfCheck === false) {
          autoCompleted.current = true;
          await onCompleteAnyway();
          return;
        }

        setSelfLearnEnabled(status?.featureFlags.enableSelfLearn ?? true);
        setDetail(taskDetail ?? null);

        const recentRun = (runs ?? [])
          .filter((run) => run.taskId === taskId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
        if (recentRun && window.api?.getRunDetail) {
          const runDetail = await window.api.getRunDetail(recentRun.id).catch(() => null);
          if (!cancelled) setRecentRunCheck(buildRunCheck(recentRun, runDetail));
        } else {
          setRecentRunCheck(null);
        }
      } finally {
        if (!cancelled && !autoCompleted.current) setLoading(false);
      }
    }

    void loadCheckContext();
    return () => { cancelled = true; };
  }, [onCompleteAnyway, taskId]);

  const criteria = detail?.completionCriteria ?? [];
  const satisfied = criteria.filter((item) => item.status === 'satisfied');
  const open = criteria.filter((item) => item.status === 'open');
  const hasRunConcern = recentRunCheck?.tone === 'fail' || recentRunCheck?.tone === 'warn';
  const hasConcern = open.length > 0 || criteria.length === 0 || hasRunConcern;
  const traceParts = [
    hasConcern ? '覆盖完成' : '检查通过',
    `完成标准 ${satisfied.length}/${criteria.length}`,
    open.length > 0 ? `未满足 ${open.length} 条` : null,
    recentRunCheck ? `最近 Run：${recentRunCheck.label}` : '暂无近期 Run 验证',
  ].filter((part): part is string => Boolean(part));

  async function submit(action: 'waiting' | 'complete') {
    if (submitting) return;
    setSubmitting(true);
    try {
      const reason = buildWaitingReason(detail, recentRunCheck);
      await window.api?.recordTaskCompletionCheck({
        taskId,
        action: action === 'waiting'
          ? 'marked_waiting'
          : hasConcern
            ? 'override_completed'
            : 'passed',
        criteriaTotal: criteria.length,
        criteriaSatisfied: satisfied.length,
        criteriaOpen: open.length,
        reason: hasConcern ? reason : null,
        runVerificationTone: recentRunCheck?.tone ?? null,
        runVerificationLabel: recentRunCheck?.label ?? null,
        runVerificationDetail: recentRunCheck?.detail ?? null,
        source: 'task_completion_modal',
      });

      if (action === 'waiting') {
        await onMarkWaiting(reason);
      } else {
        if (selfLearnEnabled && hasConcern) {
          const learningSignal = {
            taskId,
            taskTitle: detail?.title ?? taskTitle,
            reason,
            runVerificationTone: recentRunCheck?.tone ?? null,
            runVerificationLabel: recentRunCheck?.label ?? null,
            runVerificationDetail: recentRunCheck?.detail ?? null,
          };
          if (window.api?.recordCompletionOverrideLearningSignal) {
            await window.api.recordCompletionOverrideLearningSignal(learningSignal);
          } else {
            recordCompletionOverrideLearningSignal(learningSignal);
          }
        }
        await onCompleteAnyway();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal completion-check-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>完成确认</h3>
        </div>
        <div className="modal-body">
          <div className="completion-check-target">
            <span className="completion-check-label">原始目标</span>
            <strong>{detail?.title ?? taskTitle}</strong>
            {detail?.summary && <p>{detail.summary}</p>}
          </div>

          {loading ? (
            <p className="muted" style={{ fontSize: 13 }}>正在检查完成标准…</p>
          ) : (
            <>
              <div className={`completion-check-summary${hasConcern ? ' warning' : ''}`}>
                {criteria.length === 0
                  ? '尚未定义完成标准。建议先补充完成标准，或由你确认这次可以直接完成。'
                  : hasConcern
                    ? `已满足 ${satisfied.length}/${criteria.length} 条完成标准，仍有 ${open.length} 条未满足。`
                    : `已满足 ${satisfied.length}/${criteria.length} 条完成标准，可以完成。`}
              </div>

              {criteria.length > 0 && (
                <div className="completion-check-list">
                  {criteria.map((item) => (
                    <div key={item.id} className="completion-check-item">
                      <span className={`completion-check-mark ${item.status}`}>
                        {item.status === 'satisfied' ? '✓' : '!'}
                      </span>
                      <span>{item.text}</span>
                      {item.verificationResponsibilityLabel && (
                        <span className="completion-check-owner">{item.verificationResponsibilityLabel}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="completion-run-evidence">
                <span className="completion-check-label">最近 Run 验证</span>
                {recentRunCheck ? (
                  <div className={`completion-run-evidence-line ${recentRunCheck.tone}`}>
                    <strong>{recentRunCheck.label}</strong>
                    <span>{recentRunCheck.detail}</span>
                  </div>
                ) : (
                  <p>暂无近期 Run 验证记录。可以完成，但更建议先留下可复核执行证据。</p>
                )}
              </div>

              {hasConcern && (
                <div className="completion-check-advice">
                  <p>建议先标记为等待中，等完成标准或 Run 验证结论补齐后再完成；你也可以覆盖检查结论，直接完成。</p>
                  <p className="completion-check-trace">将记录：{traceParts.join(' · ')}</p>
                  <p>
                    覆盖会写入任务活动记录
                    {selfLearnEnabled ? '，并作为后续工作习惯提议的学习信号。' : '；自学习已关闭，不会生成新的工作习惯提议。'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn sm ghost" onClick={onCancel} disabled={submitting}>取消</button>
          {hasConcern && !loading && (
            <button
              className="btn sm"
              onClick={() => void submit('waiting')}
              disabled={submitting}
            >
              标记等待中
            </button>
          )}
          <button
            className="btn sm primary"
            onClick={() => void submit('complete')}
            disabled={loading || submitting}
          >
            {hasConcern ? '仍然完成' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
