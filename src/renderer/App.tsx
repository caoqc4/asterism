import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { getRouteFromHash, setRoute, type AppRoute } from './lib/router';
import { BriefPage } from './pages/BriefPage';
import { TasksPage } from './pages/TasksPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { ContextPage } from './pages/ContextPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { SkillsPage } from './pages/SkillsPage';
import { ModelPage } from './pages/ModelPage';
import { McpPage } from './pages/McpPage';
import { SettingsPage } from './pages/SettingsPage';
import { RightPanel } from './components/RightPanel';

const ROUTE_LABELS: Record<AppRoute, string> = {
  brief: 'Brief',
  tasks: 'Tasks',
  decisions: 'Decisions',
  context: 'Context',
  skills: 'Skills',
  mcp: 'MCP',
  model: 'Model',
  connections: 'Connections',
  settings: 'Settings',
};

export function App() {
  const [route, setRouteState] = useState<AppRoute>(getRouteFromHash);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [workbenchTaskId, setWorkbenchTaskId] = useState<string | null>(null);
  const [workbenchOrigin, setWorkbenchOrigin] = useState<AppRoute>('tasks');
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const navigate = useCallback((r: AppRoute) => {
    setRouteState(r);
    setRoute(r);
    setWorkbenchTaskId(null);
  }, []);

  const openWorkbench = useCallback((taskId: string) => {
    setWorkbenchTaskId(taskId);
    setWorkbenchOrigin(route);
  }, [route]);

  const closeWorkbench = useCallback(() => {
    setWorkbenchTaskId(null);
  }, []);

  const openPanelForTask = useCallback((taskId: string) => {
    setPanelTaskId(taskId);
    setPanelOpen(true);
  }, []);

  const openPanelGlobal = useCallback(() => {
    setPanelTaskId(null);
    setPanelOpen(true);
  }, []);

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
    window.api?.getAiConfigStatus().then((s) => setAiConfigured(s.configured)).catch(() => setAiConfigured(false));
  }, []);

  return (
    <div className={`app${panelOpen ? ' panel-open' : ''}`}>
      <Sidebar route={workbenchTaskId ? workbenchOrigin : route} onNavigate={navigate} />
      <div className="main">
        <Topbar
          route={workbenchTaskId ? workbenchOrigin : route}
          workbenchTaskId={workbenchTaskId}
          panelOpen={panelOpen}
          onBack={closeWorkbench}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onOpenGlobalPanel={openPanelGlobal}
        />
        <div className="content">
          {aiConfigured === false && (
            <SetupBanner onGoToModel={() => navigate('model')} />
          )}
          {workbenchTaskId ? (
            <WorkbenchPage
              taskId={workbenchTaskId}
              onBack={closeWorkbench}
              onOpenPanel={() => openPanelForTask(workbenchTaskId)}
            />
          ) : (
            <>
              {route === 'brief' && (
                <BriefPage
                  onOpenTask={() => navigate('tasks')}
                  onOpenDecision={() => navigate('decisions')}
                  onOpenPanel={openPanelForTask}
                />
              )}
              {route === 'tasks' && (
                <TasksPage
                  onOpenPanel={openPanelForTask}
                  onOpenWorkbench={openWorkbench}
                  onOpenDecision={() => navigate('decisions')}
                />
              )}
              {route === 'decisions' && (
                <DecisionsPage
                  onOpenPanel={openPanelForTask}
                  onOpenWorkbench={openWorkbench}
                />
              )}
              {route === 'context' && <ContextPage />}
              {route === 'connections' && <ConnectionsPage />}
              {route === 'skills' && <SkillsPage />}
              {route === 'mcp' && <McpPage />}
              {route === 'model' && <ModelPage />}
              {route === 'settings' && <SettingsPage />}
            </>
          )}
        </div>
      </div>
      {panelOpen && (
        <RightPanel
          taskId={panelTaskId}
          onClose={() => setPanelOpen(false)}
          onClearTask={() => setPanelTaskId(null)}
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
        AI 尚未配置，请先添加 API Key 以使用 AI 功能。
      </span>
      <button className="btn sm primary" onClick={onGoToModel}>
        前往配置 →
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
        <div className="brand-glyph" />
        <span className="brand-name">Taskplane</span>
      </div>

      <nav className="nav">
        <div className="nav-zone-label">Work</div>
        <NavItem icon={<IconBrief />} label="Brief" active={route === 'brief'} onClick={() => onNavigate('brief')} />
        <NavItem icon={<IconTasks />} label="Tasks" active={route === 'tasks'} onClick={() => onNavigate('tasks')} />
        <NavItem icon={<IconDecisions />} label="Decisions" active={route === 'decisions'} onClick={() => onNavigate('decisions')} />
        <NavItem icon={<IconContext />} label="Context" active={route === 'context'} onClick={() => onNavigate('context')} />

        <div className="nav-divider" />
        <div className="nav-zone-label">Capabilities</div>
        <NavItem icon={<IconConnections />} label="Connections" active={route === 'connections'} onClick={() => onNavigate('connections')} />
        <NavItem icon={<IconSkills />} label="Skills" active={route === 'skills'} onClick={() => onNavigate('skills')} />
        <NavItem icon={<IconMcp />} label="MCP" active={route === 'mcp'} onClick={() => onNavigate('mcp')} />
        <NavItem icon={<IconModel />} label="Model" active={route === 'model'} onClick={() => onNavigate('model')} />
        <NavItem icon={<IconSettings />} label="Settings" active={route === 'settings'} onClick={() => onNavigate('settings')} />
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">T</div>
        <div className="footer-meta">
          <strong>Taskplane</strong>
          alpha
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
  workbenchTaskId: string | null;
  panelOpen: boolean;
  onBack: () => void;
  onTogglePanel: () => void;
  onOpenGlobalPanel: () => void;
}

function Topbar({ route, workbenchTaskId, panelOpen, onBack, onTogglePanel, onOpenGlobalPanel }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        {workbenchTaskId ? (
          <>
            <button className="topbar-back" onClick={onBack}>
              <IconChevronLeft />
              <span className="topbar-back-label">{ROUTE_LABELS[route]}</span>
            </button>
            <span className="sep">/</span>
            <span className="current">工作台</span>
          </>
        ) : (
          <span className="current">{ROUTE_LABELS[route]}</span>
        )}
      </div>

      <div className="topbar-right">
        <button className="cmd-k-trigger" onClick={onOpenGlobalPanel}>
          <IconSearch />
          <span>Search or ask…</span>
          <span className="cmd-k-kbd">⌘K</span>
        </button>
        <button
          className={`icon-btn${panelOpen ? ' active' : ''}`}
          onClick={onTogglePanel}
          title="AI 对话（⌘K）"
        >
          <IconPanel />
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

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,2 5,7 9,12" />
    </svg>
  );
}
