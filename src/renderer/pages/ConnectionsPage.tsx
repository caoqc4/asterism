import { useEffect, useState } from 'react';
import type { CapabilityRegistryEntry } from '@shared/capability-registry';
import { DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS } from '@shared/capability-product-surfaces';
import type { ConnectorSourceIngestionPlan } from '@shared/connector-source-ingestion';
import type { ConfigurationSafetySurface } from '@shared/configuration-safety-report';
import type { ExternalAccessConnectorRecord } from '@shared/external-access-status';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskListItemRecord } from '@shared/types/task';

type SourceStatus = 'connected' | 'error' | 'pending';

interface ConnectedSource {
  id: string;
  type: SourceType;
  label: string;
  account: string;
  status: SourceStatus;
  lastSync: string;
}

type SourceType = 'email' | 'calendar' | 'github' | 'notion' | 'slack' | 'linear' | 'jira' | 'other';

const SOURCE_BADGES: Record<SourceType, string> = {
  email: 'EMAIL',
  calendar: 'CAL',
  github: 'GIT',
  notion: 'NOTE',
  slack: 'CHAT',
  linear: 'ISSUE',
  jira: 'TICKET',
  other: 'SRC',
};

const DEFAULT_OPTIONAL_SOURCES: Array<{ id: string; type: SourceType; label: string; desc: string }> =
  DEFAULT_EXTERNAL_ACCESS_SOURCE_CATALOGUE_ITEMS.map((source) => ({
    id: source.id,
    type: source.kind,
    label: source.label,
    desc: source.desc,
  }));

const AVAILABLE_SOURCES: Array<{ type: SourceType; label: string; desc: string }> = [
  { type: 'calendar', label: 'Calendar', desc: '授权后识别会议、截止时间和日程变更' },
  { type: 'github', label: 'GitHub', desc: '授权后同步 PR、Issue 和代码协作信号' },
  { type: 'notion', label: 'Notion', desc: '授权后同步页面和数据库作为任务来源' },
  { type: 'slack', label: 'Slack', desc: '授权后提取频道里的任务信号' },
  { type: 'linear', label: 'Linear', desc: '授权后同步 Issue 和项目进度' },
  { type: 'jira', label: 'Jira', desc: '授权后同步 Ticket 状态' },
];

export function ConnectionsPage() {
  const [sources, setSources] = useState<ConnectedSource[]>([]);
  const [configStatus, setConfigStatus] = useState<AiConfigStatus | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [tasks, setTasks] = useState<TaskListItemRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [sourcePlans, setSourcePlans] = useState<ConnectorSourceIngestionPlan[]>([]);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [sourceReviewBusy, setSourceReviewBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    reloadConfigStatus();
    window.api?.listTasks().then((items) => {
      setTasks(items);
      setSelectedTaskId((current) => current || items[0]?.id || '');
    }).catch(() => {});
  }, []);

  function reloadConfigStatus() {
    window.api?.getAiConfigStatus().then(setConfigStatus).catch(() => {});
  }

  function disconnectSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function connectGmail() {
    if (gmailBusy || !window.api?.connectGmailOAuth) return;
    const confirmed = window.confirm('将打开浏览器授权 Gmail。授权后 Taskplane 只会在任务需要时读取邮件元数据，并在入库前要求确认。是否继续？');
    if (!confirmed) return;
    setGmailBusy(true);
    setActionMessage(null);
    try {
      const result = await window.api.connectGmailOAuth({ confirmed: true });
      setActionMessage(result.status === 'connected'
        ? 'Gmail 已连接。'
        : result.errorReason ?? 'Gmail 连接未完成。');
      reloadConfigStatus();
    } finally {
      setGmailBusy(false);
    }
  }

  async function disconnectGmail() {
    if (gmailBusy || !window.api?.disconnectGmailOAuth) return;
    const confirmed = window.confirm('断开 Gmail 后会清除本机授权凭据，并尝试撤销 Google OAuth token。是否继续？');
    if (!confirmed) return;
    setGmailBusy(true);
    setActionMessage(null);
    try {
      const result = await window.api.disconnectGmailOAuth({ confirmed: true });
      setActionMessage(result.status === 'disconnected'
        ? 'Gmail 已断开。'
        : result.errorReason ?? 'Gmail 断开未完成。');
      reloadConfigStatus();
    } finally {
      setGmailBusy(false);
    }
  }

  async function previewSourceIngestion() {
    if (sourceReviewBusy || !selectedTaskId || !window.api?.previewExternalAccessSourceIngestion) return;
    setSourceReviewBusy(true);
    setActionMessage(null);
    try {
      const result = await window.api.previewExternalAccessSourceIngestion({ taskId: selectedTaskId });
      setSourcePlans(result.plans);
      setSelectedPlanIds(result.plans
        .filter((plan) => plan.decision !== 'skip')
        .map((plan) => plan.planId));
      setActionMessage(result.plans.length > 0
        ? `找到 ${result.createCount} 条可写入、${result.reviewCount} 条需复核、${result.skipCount} 条跳过。`
        : '当前任务没有可入库的新外部来源。');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '外部来源预览失败。');
    } finally {
      setSourceReviewBusy(false);
    }
  }

  async function commitSourceIngestion() {
    if (
      sourceReviewBusy
      || !selectedTaskId
      || selectedPlanIds.length === 0
      || !window.api?.commitExternalAccessSourceIngestion
    ) return;
    const confirmed = window.confirm('将选中的外部来源写入当前任务记忆。写入后会作为任务上下文来源被后续 AI 读取。是否继续？');
    if (!confirmed) return;
    setSourceReviewBusy(true);
    setActionMessage(null);
    try {
      const result = await window.api.commitExternalAccessSourceIngestion({
        taskId: selectedTaskId,
        planIds: selectedPlanIds,
        confirmed: true,
      });
      setSourcePlans((plans) => plans.filter((plan) => !selectedPlanIds.includes(plan.planId)));
      setSelectedPlanIds([]);
      setActionMessage(`已写入 ${result.created.length} 条来源，跳过 ${result.skippedPlanIds.length} 条。`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '外部来源入库失败。');
    } finally {
      setSourceReviewBusy(false);
    }
  }

  function togglePlanSelection(planId: string) {
    setSelectedPlanIds((current) => current.includes(planId)
      ? current.filter((id) => id !== planId)
      : [...current, planId]);
  }

  const externalSafety = configStatus?.configurationSafetyReport?.surfaces
    .find((surface) => surface.id === 'external_access.connectors') ?? null;
  const externalCapability = configStatus?.capabilityRegistry
    ?.find((entry) => entry.id === 'external_access.connectors') ?? null;
  const externalStatusSources = (configStatus?.externalAccessStatus?.sources ?? []).map(connectorToConnectedSource);
  const statusSourceIds = new Set(externalStatusSources.map((source) => source.id));
  const connectedStatusSources = externalStatusSources.filter((source) => source.status === 'connected' || source.status === 'error');
  const displayedSources = connectedStatusSources.length > 0 ? connectedStatusSources : sources;
  const gmailStatus = externalStatusSources.find((source) => source.id === 'gmail')?.status ?? null;

  return (
    <div className="connections-page">
      <div className="connections-head">
        <h2 className="connections-title">External Access</h2>
        <p className="connections-subtitle">外部账号与数据源授权 — 授权后只处理相关新信号</p>
      </div>

      {/* Connected sources */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">已连接来源</div>
            <div className="ctx-section-desc">连接成功后，AI 只在任务上下文需要时引用相关信号</div>
          </div>
          <button className="btn sm primary" disabled title="请从下方系统默认可选功能授权">从下方授权</button>
        </div>

        <div className="ctx-list">
          {displayedSources.map((src) => (
            <div key={src.id} className="ctx-source-row">
              <span className="ctx-source-icon">{SOURCE_BADGES[src.type]}</span>
              <div className="ctx-source-info">
                <span className="ctx-source-label">{src.label}</span>
                <span className="ctx-source-account">{src.account}</span>
              </div>
              <div className="ctx-source-status">
                {src.status === 'connected' && (
                  <span className="status-pill connected">
                    <span className="dot running" style={{ width: 5, height: 5 }} />
                    已连接
                  </span>
                )}
                {src.status === 'error' && (
                  <span className="status-pill error">
                    <span className="dot risk" style={{ width: 5, height: 5 }} />
                    {src.lastSync}
                  </span>
                )}
                {src.status === 'pending' && (
                  <span className="status-pill">
                    <span className="dot waiting" style={{ width: 5, height: 5 }} />
                    待授权
                  </span>
                )}
              </div>
              <span className="ctx-source-sync muted">
                {src.status === 'connected' ? `同步于 ${src.lastSync}` : ''}
              </span>
              <div className="ctx-source-actions">
                {src.status === 'error' && (
                  <button
                    className="btn sm"
                    disabled={src.id !== 'gmail' || gmailBusy || !window.api?.connectGmailOAuth}
                    onClick={() => src.id === 'gmail' ? connectGmail() : undefined}
                    title={src.id === 'gmail' ? '重新授权 Gmail' : '该连接器暂未接入重新授权'}
                  >
                    {gmailBusy && src.id === 'gmail' ? '处理中' : '重新授权'}
                  </button>
                )}
                <button
                  className="btn sm ghost"
                  disabled={statusSourceIds.has(src.id) && (src.id !== 'gmail' || !window.api?.disconnectGmailOAuth || gmailBusy)}
                  onClick={() => src.id === 'gmail' ? disconnectGmail() : disconnectSource(src.id)}
                  title={statusSourceIds.has(src.id) && src.id !== 'gmail' ? '由连接器状态管理' : '断开'}
                >
                  {gmailBusy && src.id === 'gmail' ? '处理中' : '断开'}
                </button>
              </div>
            </div>
          ))}
          {displayedSources.length === 0 && (
            <div className="ctx-empty">
              <p>尚未连接任何来源。</p>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                连接后 AI 只会把相关新信号带入 Brief 和任务上下文，等待你确认。
              </p>
            </div>
          )}
        </div>
        {actionMessage && <div className="connections-boundary-note">{actionMessage}</div>}
        <div className="connections-boundary-note">
          未授权的来源不会进入 AI 上下文；只有连接成功且产生新信号时，外部信息才会出现在 Brief 和任务上下文里。
        </div>
        <ExternalAccessSafetyStrip safety={externalSafety} capability={externalCapability} />
      </section>

      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">来源入库复核</div>
            <div className="ctx-section-desc">先按任务预览外部信号，再确认写入任务记忆</div>
          </div>
          <button
            className="btn sm"
            disabled={sourceReviewBusy || !selectedTaskId || !window.api?.previewExternalAccessSourceIngestion}
            onClick={previewSourceIngestion}
          >
            {sourceReviewBusy ? '检查中' : '预览来源'}
          </button>
        </div>
        <div className="connections-review-controls">
          <label htmlFor="external-source-task">目标任务</label>
          <select
            id="external-source-task"
            className="source-kind-select"
            value={selectedTaskId}
            onChange={(event) => {
              setSelectedTaskId(event.target.value);
              setSourcePlans([]);
              setSelectedPlanIds([]);
            }}
          >
            {tasks.length === 0 && <option value="">没有可选任务</option>}
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </div>
        <div className="connections-review-list">
          {sourcePlans.length === 0 ? (
            <div className="ctx-empty">
              <p>尚未预览外部来源。</p>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                预览只读取候选信号，不会写入任务记忆。
              </p>
            </div>
          ) : sourcePlans.map((plan) => (
            <label key={plan.planId} className={`connections-review-row ${plan.decision}`}>
              <input
                type="checkbox"
                checked={selectedPlanIds.includes(plan.planId)}
                disabled={plan.decision === 'skip'}
                onChange={() => togglePlanSelection(plan.planId)}
              />
              <span className={`connections-review-decision ${plan.decision}`}>{sourceDecisionLabel(plan.decision)}</span>
              <span className="connections-review-body">
                <strong>{plan.sourceContext.title}</strong>
                <span>{plan.reviewReason ?? plan.quality.summary}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="connections-review-footer">
          <span>{selectedPlanIds.length} 条已选择</span>
          <button
            className="btn sm primary"
            disabled={sourceReviewBusy || selectedPlanIds.length === 0 || !window.api?.commitExternalAccessSourceIngestion}
            onClick={commitSourceIngestion}
          >
            确认写入
          </button>
        </div>
      </section>

      {/* Available to connect */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">系统默认可选功能</div>
            <div className="ctx-section-desc">默认展示，不会自动授权、探测或同步</div>
          </div>
        </div>
        <div className="conn-available-grid">
          {DEFAULT_OPTIONAL_SOURCES.map((s) => (
            <div key={s.id} className="conn-available-card">
              <span className="ctx-source-icon">{SOURCE_BADGES[s.type]}</span>
              <div className="conn-available-label">{s.label}</div>
              <div className="conn-available-desc muted">{s.desc}</div>
              {window.api?.connectGmailOAuth ? (
                <button className="btn sm ghost" disabled={gmailBusy || gmailStatus === 'connected'} onClick={connectGmail}>
                  {gmailBusy ? '处理中' : gmailStatus === 'connected' ? '已连接' : '授权'}
                </button>
              ) : (
                <button className="btn sm ghost" disabled>即将支持</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">更多可连接来源</div>
            <div className="ctx-section-desc">后续按同一授权与入库复核边界接入</div>
          </div>
        </div>
        <div className="conn-available-grid">
          {AVAILABLE_SOURCES.map((s) => (
            <div key={s.type} className="conn-available-card">
              <span className="ctx-source-icon">{SOURCE_BADGES[s.type]}</span>
              <div className="conn-available-label">{s.label}</div>
              <div className="conn-available-desc muted">{s.desc}</div>
              <button className="btn sm ghost" disabled>即将支持</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function sourceDecisionLabel(decision: ConnectorSourceIngestionPlan['decision']): string {
  if (decision === 'create') return '可写入';
  if (decision === 'review') return '需复核';
  return '跳过';
}

function connectorToConnectedSource(source: ExternalAccessConnectorRecord): ConnectedSource {
  return {
    id: source.id,
    type: sourceTypeFromConnectorKind(source.kind),
    label: source.label,
    account: source.accountLabel ?? '未指定账号',
    status: source.status,
    lastSync: source.errorReason ?? formatConnectorTime(source.lastSyncAt) ?? '待同步',
  };
}

function sourceTypeFromConnectorKind(kind: ExternalAccessConnectorRecord['kind']): SourceType {
  return kind;
}

function formatConnectorTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function ExternalAccessSafetyStrip({
  capability,
  safety,
}: {
  capability: CapabilityRegistryEntry | null;
  safety: ConfigurationSafetySurface | null;
}) {
  return (
    <div className="connections-safety-strip">
      <div className="connections-safety-item">
        <span>连接器状态</span>
        <strong>{capabilityStatusLabel(capability, safety)}</strong>
      </div>
      <div className="connections-safety-item">
        <span>探测策略</span>
        <strong>{probePolicyLabel(safety?.startupProbePolicy)}</strong>
      </div>
      <div className="connections-safety-item">
        <span>入库边界</span>
        <strong>先质检，再确认</strong>
      </div>
      <p>
        {safety?.reason
          ?? capability?.missingReason
          ?? 'External Access 还没有接入结构化连接器状态；不会自动读取外部数据。'}
      </p>
    </div>
  );
}

function capabilityStatusLabel(
  capability: CapabilityRegistryEntry | null,
  safety: ConfigurationSafetySurface | null,
): string {
  if (!capability) return '未接入';
  if (capability.status === 'available') return '可用';
  if (capability.status === 'unconfigured') return '未连接';
  if (capability.status === 'disabled' && safety?.state === 'disabled_by_policy') return '策略关闭';
  if (capability.status === 'disabled') return '已关闭';
  return '未知';
}

function probePolicyLabel(policy: ConfigurationSafetySurface['startupProbePolicy'] | undefined): string {
  if (policy === 'manual_only') return '仅手动';
  if (policy === 'safe_read_only') return '安全只读';
  if (policy === 'never') return '不自动';
  return '仅手动';
}
