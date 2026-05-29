import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { getRouteFromHash, setRoute, type AppRoute } from './lib/router';
import { BriefPage } from './pages/BriefPage';
import { BusinessLinesPage } from './pages/BusinessLinesPage';
import { TasksPage, type TaskWorkspaceSelectionContext } from './pages/TasksPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { WorkHabitsPage } from './pages/WorkHabitsPage';
import { SkillsPage } from './pages/SkillsPage';
import { ModelPage } from './pages/ModelPage';
import { McpPage } from './pages/McpPage';
import { SettingsPage } from './pages/SettingsPage';
import { RightPanel } from './components/RightPanel';
import goalPilotLogo from './assets/brand/goalpilot-logo-ui.png';

const PRODUCT_BRAND_NAME = 'GoalPilot';

const ROUTE_LABELS: Record<AppRoute, string> = {
  brief: 'Today',
  business: 'Business',
  tasks: 'Tasks',
  decisions: 'Decisions',
  'work-habits': 'Work Habits',
  skills: 'Skills',
  mcp: 'MCP',
  model: 'AI Runtime',
  connections: 'External Access',
  settings: 'Settings',
};

export function App() {
  const [route, setRouteState] = useState<AppRoute>(getRouteFromHash);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSuspended, setPanelSuspended] = useState(false);
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [panelTaskTitle, setPanelTaskTitle] = useState<string | null>(null);
  const [panelBusinessLineId, setPanelBusinessLineId] = useState<string | null>(null);
  const [panelBusinessLineTitle, setPanelBusinessLineTitle] = useState<string | null>(null);
  const [panelDraftPrompt, setPanelDraftPrompt] = useState<string | null>(null);
  const [panelAutoSendDraftPrompt, setPanelAutoSendDraftPrompt] = useState(false);
  const [panelSessionKey, setPanelSessionKey] = useState(0);
  const [panelSelectedFile, setPanelSelectedFile] = useState<TaskWorkspaceSelectionContext['selectedFile']>(null);
  const [workspaceSelection, setWorkspaceSelection] = useState<TaskWorkspaceSelectionContext>({
    taskId: null,
    taskTitle: null,
    parentTaskId: null,
    childTaskIds: [],
    selectedFile: null,
  });
  const [taskFocusId, setTaskFocusId] = useState<string | null>(null);
  const [businessFocusId, setBusinessFocusId] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const refreshAiRuntimeAvailability = useCallback(() => {
    window.api?.getAiConfigStatus()
      .then((status) => {
        setAiConfigured(Boolean(
          status.configured
          || (status.agentCliRuntimeStatus?.readyManualRunCount ?? 0) > 0,
        ));
      })
      .catch(() => setAiConfigured(false));
  }, []);

  const navigate = useCallback((r: AppRoute) => {
    setRouteState(r);
    setRoute(r);
    setTaskFocusId(null);
    setBusinessFocusId(null);
    if (r !== 'tasks') {
      setWorkspaceSelection({ taskId: null, taskTitle: null, parentTaskId: null, childTaskIds: [], selectedFile: null });
    }
  }, []);

  const openTaskInTasks = useCallback((taskId: string) => {
    setRouteState('tasks');
    setRoute('tasks');
    setTaskFocusId(taskId);
  }, []);

  const openBusinessLine = useCallback((businessLineId: string) => {
    setRouteState('business');
    setRoute('business');
    setBusinessFocusId(businessLineId);
  }, []);

  const openPanelForTask = useCallback((taskId: string, draftPrompt?: string, taskTitle?: string, autoSendDraftPrompt = false, forceTaskBinding = false, prefillDraftPrompt = false) => {
    setPanelTaskId(taskId);
    setPanelTaskTitle(taskTitle ?? null);
    setPanelBusinessLineId(null);
    setPanelBusinessLineTitle(null);
    setPanelDraftPrompt(autoSendDraftPrompt || prefillDraftPrompt ? draftPrompt ?? null : null);
    setPanelAutoSendDraftPrompt(autoSendDraftPrompt);
    setPanelSelectedFile(workspaceSelection.taskId === taskId ? workspaceSelection.selectedFile : null);
    if (forceTaskBinding) setPanelSessionKey((current) => current + 1);
    setPanelOpen(true);
    setPanelSuspended(false);
  }, [workspaceSelection]);

  const openPanelForBusinessLine = useCallback((
    businessLineId: string,
    businessLineTitle: string,
    draftPrompt?: string,
    taskId?: string | null,
    taskTitle?: string | null,
    prefillDraftPrompt = true,
  ) => {
    setPanelBusinessLineId(businessLineId);
    setPanelBusinessLineTitle(businessLineTitle);
    setPanelTaskId(taskId ?? null);
    setPanelTaskTitle(taskTitle ?? null);
    setPanelDraftPrompt(prefillDraftPrompt ? draftPrompt ?? null : null);
    setPanelAutoSendDraftPrompt(false);
    setPanelSelectedFile(taskId && workspaceSelection.taskId === taskId ? workspaceSelection.selectedFile : null);
    setPanelSessionKey((current) => current + 1);
    setPanelOpen(true);
    setPanelSuspended(false);
  }, [workspaceSelection]);

  const openPanelGlobal = useCallback(() => {
    if (panelSuspended) {
      setPanelOpen(true);
      setPanelSuspended(false);
      return;
    }
    setPanelTaskId(workspaceSelection.taskId);
    setPanelTaskTitle(workspaceSelection.taskTitle);
    setPanelBusinessLineId(null);
    setPanelBusinessLineTitle(null);
    setPanelDraftPrompt(null);
    setPanelAutoSendDraftPrompt(false);
    setPanelSelectedFile(workspaceSelection.selectedFile);
    setPanelOpen(true);
  }, [panelSuspended, workspaceSelection]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openPanelGlobal();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPanelGlobal]);

  useEffect(() => {
    refreshAiRuntimeAvailability();
  }, [refreshAiRuntimeAvailability]);

  useEffect(() => {
    if (!window.api?.subscribeToEvents) return undefined;
    return window.api.subscribeToEvents((event) => {
      if (event.type === 'settings.changed' || event.type === 'run.changed') {
        refreshAiRuntimeAvailability();
      }
    });
  }, [refreshAiRuntimeAvailability]);

  useEffect(() => {
    if (route !== 'tasks' || !panelOpen || panelSuspended) return;
    setPanelSelectedFile(
      !panelTaskId || workspaceSelection.taskId === panelTaskId
        ? workspaceSelection.selectedFile
        : null,
    );
    if (!workspaceSelection.taskId || workspaceSelection.taskId === panelTaskId) return;
    if (panelTaskId && workspaceSelection.childTaskIds.includes(panelTaskId)) return;
    setPanelTaskId(workspaceSelection.taskId);
    setPanelTaskTitle(workspaceSelection.taskTitle);
    setPanelDraftPrompt(null);
    setPanelAutoSendDraftPrompt(false);
  }, [panelOpen, panelSuspended, panelTaskId, route, workspaceSelection]);

  return (
    <div className={`app${panelOpen ? ' panel-open' : ''}`}>
      <Sidebar route={route} onNavigate={navigate} />
      <div className="main">
        <Topbar
          route={route}
          panelOpen={panelOpen}
          panelSuspended={panelSuspended}
          onTogglePanel={() => {
            if (panelOpen) {
              setPanelOpen(false);
              setPanelSuspended(true);
              return;
            }
            setPanelOpen(true);
            setPanelSuspended(false);
          }}
          onOpenGlobalPanel={openPanelGlobal}
        />
        <div className="content">
          {aiConfigured === false && (
            <SetupBanner onGoToModel={() => navigate('model')} />
          )}
          {route === 'brief' && (
            <BriefPage
              onOpenTask={openTaskInTasks}
              onOpenBusinessLine={openBusinessLine}
              onOpenDecision={() => navigate('decisions')}
              onOpenPanel={openPanelForTask}
              onOpenBusinessLinePanel={openPanelForBusinessLine}
            />
          )}
          {route === 'business' && (
            <BusinessLinesPage
              onOpenBusinessLinePanel={openPanelForBusinessLine}
              onOpenTask={openTaskInTasks}
              focusBusinessLineId={businessFocusId}
            />
          )}
          {route === 'tasks' && (
            <TasksPage
              onOpenPanel={openPanelForTask}
              onOpenDecision={() => navigate('decisions')}
              onSelectionContextChange={setWorkspaceSelection}
              focusTaskId={taskFocusId}
            />
          )}
          {route === 'decisions' && (
            <DecisionsPage
              onOpenPanel={openPanelForTask}
              onOpenTask={openTaskInTasks}
            />
          )}
          {route === 'connections' && <ConnectionsPage />}
          {route === 'work-habits' && <WorkHabitsPage />}
          {route === 'skills' && <SkillsPage />}
          {route === 'mcp' && <McpPage />}
          {route === 'model' && <ModelPage />}
          {route === 'settings' && <SettingsPage />}
        </div>
      </div>
      {(panelOpen || panelSuspended) && (
        <RightPanel
          key={panelSessionKey}
          taskId={panelTaskId}
          taskTitleHint={panelTaskTitle}
          businessLineId={panelBusinessLineId}
          businessLineTitleHint={panelBusinessLineTitle}
          draftPrompt={panelDraftPrompt}
          autoSendDraftPrompt={panelAutoSendDraftPrompt}
          selectedFile={panelSelectedFile}
          hidden={!panelOpen}
          onTaskCaptured={(taskId) => setPanelTaskId(taskId)}
          onOpenTask={openTaskInTasks}
          onClose={(hasSession) => {
            setPanelOpen(false);
            setPanelSuspended(hasSession);
          }}
          onClearTask={() => {
            setPanelTaskId(null);
            setPanelTaskTitle(null);
            setPanelDraftPrompt(null);
            setPanelSelectedFile(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Setup banner ─── */

function SetupBanner({ onGoToModel }: { onGoToModel: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="setup-banner">
      <span className="setup-banner-icon">⚠</span>
      <span className="setup-banner-text">
        AI Runtime 尚未配置；可先连接 Agent CLI 或配置模型服务，任务管理仍可继续使用。
      </span>
      <button className="btn sm primary" onClick={onGoToModel}>
        前往 AI Runtime →
      </button>
      <button className="icon-btn" onClick={() => setDismissed(true)} title="关闭">
        <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
      </button>
    </div>
  );
}

/* ─── Sidebar ─── */

interface SidebarProps {
  route: AppRoute;
  onNavigate: (r: AppRoute) => void;
}

function Sidebar({ route, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-traffic">
        <div className="tl-dot" />
        <div className="tl-dot" />
        <div className="tl-dot" />
      </div>
      <div className="sidebar-brand">
        <img className="brand-logo" src={goalPilotLogo} alt="" aria-hidden="true" />
        <span className="brand-name">{PRODUCT_BRAND_NAME}</span>
      </div>

      <nav className="nav">
        <div className="nav-zone-label">Work</div>
        <NavItem icon={<IconBrief />} label="Today" active={route === 'brief'} onClick={() => onNavigate('brief')} />
        <NavItem icon={<IconBusiness />} label="Business" active={route === 'business'} onClick={() => onNavigate('business')} />
        <NavItem icon={<IconDecisions />} label="Decisions" active={route === 'decisions'} onClick={() => onNavigate('decisions')} />

        <div className="nav-divider" />
        <div className="nav-zone-label">Capabilities</div>
        <NavItem icon={<IconConnections />} label="External Access" active={route === 'connections'} onClick={() => onNavigate('connections')} />
        <NavItem icon={<IconSkills />} label="Skills" active={route === 'skills'} onClick={() => onNavigate('skills')} />
        <NavItem icon={<IconMcp />} label="MCP" active={route === 'mcp'} onClick={() => onNavigate('mcp')} />
        <NavItem icon={<IconModel />} label="AI Runtime" active={route === 'model'} onClick={() => onNavigate('model')} />
        <NavItem icon={<IconContext />} label="Work Habits" active={route === 'work-habits'} onClick={() => onNavigate('work-habits')} />
        <NavItem icon={<IconSettings />} label="Settings" active={route === 'settings'} onClick={() => onNavigate('settings')} />
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">G</div>
        <div className="footer-meta">
          <strong>{PRODUCT_BRAND_NAME}</strong>
          业务线 Agent · 学习闭环
        </div>
      </div>
    </aside>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number | string;
  hot?: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, badge, hot, onClick }: NavItemProps) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge != null && (
        <span className={`nav-badge${hot ? ' hot' : ''}`}>{badge}</span>
      )}
    </button>
  );
}

/* ─── Topbar ─── */

interface TopbarProps {
  route: AppRoute;
  panelOpen: boolean;
  panelSuspended: boolean;
  onTogglePanel: () => void;
  onOpenGlobalPanel: () => void;
}

function Topbar({ route, panelOpen, panelSuspended, onTogglePanel, onOpenGlobalPanel }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="current">{ROUTE_LABELS[route]}</span>
      </div>

      <div className="topbar-right">
        <button
          className="cmd-k-trigger"
          onClick={onOpenGlobalPanel}
          title="快捷入口：搜索、提问或捕获任务想法，用完即走"
        >
          <IconSearch />
          <span>Search or ask…</span>
          {panelSuspended && !panelOpen && <span className="cmd-k-suspended">挂起</span>}
          <span className="cmd-k-kbd">⌘K</span>
        </button>
        <button
          className={`icon-btn${panelOpen ? ' active' : ''}`}
          onClick={onTogglePanel}
          title="AI 对话（⌘K）"
        >
          <IconPanel />
          {panelSuspended && !panelOpen && <span className="badge" />}
        </button>
      </div>
    </div>
  );
}

/* ─── Icons ─── */

function IconBrief() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2" width="11" height="10" rx="1.5" />
      <line x1="4" y1="5.5" x2="10" y2="5.5" />
      <line x1="4" y1="8" x2="8" y2="8" />
    </svg>
  );
}

function IconTasks() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
      <polyline points="4,7 6,9 10,5" />
    </svg>
  );
}

function IconBusiness() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 11.5V3.5L7 1.5L12 3.5V11.5" />
      <path d="M4 11.5V6.5H10V11.5" />
      <path d="M5.5 4.5H8.5" />
    </svg>
  );
}

function IconDecisions() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v4l2.5 1.5" />
      <circle cx="7" cy="7" r="5" />
    </svg>
  );
}

function IconContext() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h10M2 7h7M2 10h5" />
    </svg>
  );
}

function IconConnections() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="7" r="1.5" />
      <circle cx="11" cy="3.5" r="1.5" />
      <circle cx="11" cy="10.5" r="1.5" />
      <line x1="4.5" y1="6.5" x2="9.5" y2="4" />
      <line x1="4.5" y1="7.5" x2="9.5" y2="10" />
    </svg>
  );
}

function IconSkills() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7,1.5 9,5.5 13,6 10,9 10.5,13 7,11 3.5,13 4,9 1,6 5,5.5" />
    </svg>
  );
}

function IconMcp() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4.5" width="4" height="5" rx="1" />
      <rect x="8.5" y="4.5" width="4" height="5" rx="1" />
      <line x1="5.5" y1="7" x2="8.5" y2="7" />
      <line x1="7" y1="5.5" x2="7" y2="8.5" />
    </svg>
  );
}

function IconModel() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="2" />
      <circle cx="7" cy="7" r="5" strokeDasharray="2.5 2" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="1.8" />
      <path d="M7 1.5v1M7 11.5v1M1.5 7h1M11.5 7h1M3.2 3.2l.7.7M10.1 10.1l.7.7M10.8 3.2l-.7.7M3.9 10.1l-.7.7" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="5" cy="5" r="3.5" />
      <line x1="8" y1="8" x2="10.5" y2="10.5" />
    </svg>
  );
}

function IconPanel() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 1.5h9a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7l-2 2V8.5H2.5a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" />
      <circle cx="5" cy="5" r=".55" fill="currentColor" stroke="none" />
      <circle cx="7" cy="5" r=".55" fill="currentColor" stroke="none" />
      <circle cx="9" cy="5" r=".55" fill="currentColor" stroke="none" />
    </svg>
  );
}
