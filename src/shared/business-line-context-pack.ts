import type { BusinessLineWorkspace } from './types/business-line.js';

function formatList(items: string[], empty = 'none'): string {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);
  if (cleanItems.length === 0) return empty;
  return cleanItems.map((item) => `- ${item}`).join('\n');
}

export function formatBusinessLineContextPackForPrompt(workspace: BusinessLineWorkspace): string {
  const pack = workspace.contextPack;
  const openNextActions = pack.openNextActions.length > 0
    ? pack.openNextActions.map((action) => {
        const nextStep = action.nextStep?.trim() ? ` :: ${action.nextStep.trim()}` : '';
        return `- ${action.title}${nextStep} [${action.state}]`;
      }).join('\n')
    : 'none';
  const latestRecords = pack.latestRecords.length > 0
    ? pack.latestRecords.map((record) => `- ${record.type}: ${record.summary}`).join('\n')
    : 'none';
  const acceptedSkills = pack.acceptedSkills.length > 0
    ? pack.acceptedSkills.map((skill) => `- ${skill.scopePath}: ${skill.nextContent}`).join('\n')
    : 'none';
  const activeDecisions = pack.activeDecisions.length > 0
    ? pack.activeDecisions.map((decision) => `- ${decision.title} [${decision.status}]`).join('\n')
    : 'none';

  return [
    'BusinessLineContextPack:',
    `Business line: ${workspace.businessLine.title} (${workspace.businessLine.id})`,
    `Summary: ${pack.businessSummary ?? workspace.businessLine.summary ?? 'none'}`,
    `Current goal/stage: ${pack.currentGoal ?? workspace.businessLine.goal ?? 'none'}`,
    'Open next actions:',
    openNextActions,
    'Latest records:',
    latestRecords,
    'Accepted SOPs / skills:',
    acceptedSkills,
    'Active decisions:',
    activeDecisions,
    'Recent changes:',
    formatList(pack.recentChanges),
    'Known constraints:',
    formatList(pack.knownConstraints),
    'Permission boundaries:',
    formatList(pack.permissionBoundaries),
    'Missing context:',
    formatList(pack.missingContext),
  ].join('\n');
}

export function appendBusinessLineContextPackToPrompt(
  instructions: string | undefined,
  workspace: BusinessLineWorkspace | null,
): string | undefined {
  if (!workspace) return instructions;
  const base = instructions?.trim() ?? '';
  const context = formatBusinessLineContextPackForPrompt(workspace);
  return base ? `${base}\n\n${context}` : context;
}
