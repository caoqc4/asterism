import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const envKeys = [
  'TASKPLANE_AI_PROVIDER',
  'TASKPLANE_AI_MODEL',
  'TASKPLANE_AI_BASE_URL',
  'TASKPLANE_AI_API_KEY',
  'TASKPLANE_CODE_AGENT_CONTEXT_FILES',
  'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER',
  'TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS',
  'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT',
  'TASKPLANE_ENABLE_SCHEDULER',
  'TASKPLANE_ENV_FILE',
  'TASKPLANE_AGENT_CLI_SMOKE_RUNTIME',
  'TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON',
  'TASKPLANE_AGENT_CLI_NATIVE_GOAL_OBJECTIVE',
  'TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME',
  'TASKPLANE_AGENT_CLI_NATIVE_GOAL_STDIN',
  'TASKPLANE_AGENT_CLI_NATIVE_GOAL_TIMEOUT_MS',
  'TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME',
  'TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE',
  'TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE',
  'TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE',
  'TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY',
  'TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE',
  'TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_PREFLIGHT',
  'TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_SMOKE',
  'TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK',
  'TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE',
  'TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS',
  'TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE',
  'TASKPLANE_WORKSPACE_ROOT',
];

function sanitizedEnv(envFilePath: string, overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };

  for (const key of envKeys) {
    delete env[key];
  }

  return {
    ...env,
    TASKPLANE_ENV_FILE: envFilePath,
    ...overrides,
  };
}

function runScript(scriptPath: string, envContents = '', overrides: NodeJS.ProcessEnv = {}, args: string[] = []) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-local-smoke-boundary-test-'));
  const envFilePath = path.join(tempRoot, '.env');
  fs.writeFileSync(envFilePath, envContents);

  try {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: sanitizedEnv(envFilePath, overrides),
    });

    return {
      output: `${result.stdout}${result.stderr}`,
      status: result.status ?? 0,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function readPackageScripts() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { engines?: Record<string, string>; scripts?: Record<string, string> };

  return packageJson.scripts ?? {};
}

function readPackageEngines() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { engines?: Record<string, string> };

  return packageJson.engines ?? {};
}

function collectFiles(rootPath: string, extensions: Set<string>) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const stat = fs.statSync(rootPath);

  if (stat.isFile()) {
    return extensions.has(path.extname(rootPath)) ? [rootPath] : [];
  }

  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(entryPath, extensions);
    }

    return extensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function collectRepoMarkdownFiles() {
  return [
    ...collectFiles(path.join(process.cwd(), '.github'), new Set(['.md'])),
    ...collectFiles(path.join(process.cwd(), 'docs'), new Set(['.md'])),
    path.join(process.cwd(), 'CONTRIBUTING.md'),
    path.join(process.cwd(), 'README.md'),
    path.join(process.cwd(), 'SECURITY.md'),
  ];
}

describe('local smoke script default boundaries', () => {
  it('keeps the nvm default inside the package Node engine policy', () => {
    const engines = readPackageEngines();
    const nvmVersion = fs.readFileSync(path.join(process.cwd(), '.nvmrc'), 'utf8').trim();
    const [major = '', minor = ''] = nvmVersion.split('.');

    expect(nvmVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(engines.node).toBe('^20.19.0 || >=22.12.0');
    expect(Number(major)).toBe(22);
    expect(Number(minor)).toBeGreaterThanOrEqual(12);
  });

  it('keeps package script references pointing to existing package scripts', () => {
    const scripts = readPackageScripts();
    const missingScripts = Object.entries(scripts).flatMap(([scriptName, command]) => {
      const referencedScripts = [...command.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);

      return referencedScripts
        .filter((referencedScript) => !scripts[referencedScript])
        .map((referencedScript) => `${scriptName} -> ${referencedScript}`);
    });

    expect(missingScripts).toEqual([]);
  });

  it('keeps package script file references pointing to existing files', () => {
    const scripts = readPackageScripts();
    const fileReferencePattern = /(?:^|\s)((?:\.\/)?(?:src|scripts|node_modules|tsconfig|vitest\.[\w.-]+)[^\s"'`|&;]*\.(?:tsx|ts|json|cjs|js|mjs))/g;
    const missingFiles = Object.entries(scripts).flatMap(([scriptName, command]) => {
      const referencedFiles = [...command.matchAll(fileReferencePattern)]
        .map((match) => match[1].replace(/^\.\//, ''));

      return referencedFiles
        .filter((referencedFile) => !fs.existsSync(path.join(process.cwd(), referencedFile)))
        .map((referencedFile) => `${scriptName} -> ${referencedFile}`);
    });

    expect(missingFiles).toEqual([]);
  });

  it('keeps documented npm scripts present in package.json', () => {
    const scripts = readPackageScripts();
    const documentedScriptReferences = new Map<string, Set<string>>();
    const files = [
      ...collectFiles(path.join(process.cwd(), '.github'), new Set(['.md', '.yml', '.yaml'])),
      ...collectRepoMarkdownFiles(),
    ];

    for (const filePath of files) {
      const relativePath = path.relative(process.cwd(), filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const scriptNames = [
        ...[...content.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]),
        ...[...content.matchAll(/npm test\b/g)].map(() => 'test'),
      ];

      for (const scriptName of scriptNames) {
        const references = documentedScriptReferences.get(scriptName) ?? new Set<string>();
        references.add(relativePath);
        documentedScriptReferences.set(scriptName, references);
      }
    }

    const missingScripts = [...documentedScriptReferences.entries()]
      .filter(([scriptName]) => !scripts[scriptName])
      .map(([scriptName, references]) => `${scriptName} (${[...references].sort().join(', ')})`);

    expect(missingScripts).toEqual([]);
  });

  it('documents why ordinary task-switch packaged smoke remains deferred', () => {
    const matrix = fs.readFileSync(
      path.join(process.cwd(), 'docs/plans/2026-05-17-acceptance-coverage-matrix.md'),
      'utf8',
    );

    expect(matrix).toContain('Ordinary task context switches are covered by renderer/runtime-handoff tests');
    expect(matrix).toContain('deferred until the retained task detail UI exposes a stable cross-task navigation hook');
    expect(matrix).toContain('instead of the context-switch safety boundary');
  });

  it('documents deferred Agent API execution as a contract rather than an alpha smoke path', () => {
    const matrix = fs.readFileSync(
      path.join(process.cwd(), 'docs/plans/2026-05-17-acceptance-coverage-matrix.md'),
      'utf8',
    );

    expect(matrix).toContain('Agent API execution is represented only as a deferred runtime-entrypoint contract');
    expect(matrix).toContain('opt-in provider-visible preflight smoke');
    expect(matrix).toContain('no packaged task execution smoke or IPC execution path in the first Agent CLI alpha');
    expect(matrix).toContain('same `provider_visible_execution` harness gates as Agent CLI');
  });

  it('keeps relative Markdown links pointing to existing files', () => {
    const files = collectRepoMarkdownFiles();
    const brokenLinks: string[] = [];

    for (const filePath of files) {
      const relativePath = path.relative(process.cwd(), filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);

      for (const match of matches) {
        const rawTarget = match[1].trim();

        if (
          !rawTarget ||
          rawTarget.startsWith('#') ||
          /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
        ) {
          continue;
        }

        const targetWithoutTitle = rawTarget.startsWith('<')
          ? rawTarget.slice(1, rawTarget.indexOf('>'))
          : rawTarget.split(/\s+/)[0];
        const targetPath = targetWithoutTitle.split('#')[0].split('?')[0];

        if (!targetPath) {
          continue;
        }

        const resolvedPath = path.resolve(path.dirname(filePath), targetPath);

        if (!fs.existsSync(resolvedPath)) {
          brokenLinks.push(`${relativePath} -> ${rawTarget}`);
        }
      }
    }

    expect(brokenLinks).toEqual([]);
  });

  it('keeps GitHub workflow local file references pointing to existing files', () => {
    const workflowFiles = collectFiles(path.join(process.cwd(), '.github', 'workflows'), new Set(['.yml', '.yaml']));
    const missingFiles: string[] = [];

    for (const workflowFile of workflowFiles) {
      const relativePath = path.relative(process.cwd(), workflowFile);
      const content = fs.readFileSync(workflowFile, 'utf8');
      const matches = content.matchAll(/node-version-file:\s*([^\s#]+)/g);

      for (const match of matches) {
        const referencedFile = match[1].replace(/^['"]|['"]$/g, '');

        if (!fs.existsSync(path.join(process.cwd(), referencedFile))) {
          missingFiles.push(`${relativePath} -> ${referencedFile}`);
        }
      }
    }

    expect(missingFiles).toEqual([]);
  });

  it('keeps the macOS release smoke wired through package, runtime, and Timeline UI checks', () => {
    const scripts = readPackageScripts();

    expect(scripts['smoke:release:mac']).toBe(
      'npm run dist:mac:dir && npm run smoke:package:mac && npm run smoke:runtime:mac && npm run smoke:timeline-ui:mac',
    );
  });

  it('keeps the package smoke checking AI Runtime renderer freshness markers', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/smoke-package-mac.mjs'), 'utf8');

    expect(script).toContain('AI Runtime');
    expect(script).toContain('Agent CLI runtimes');
    expect(script).toContain('模型服务配置');
    expect(script).toContain('使用此方式');
    expect(script).toContain('重新检测');
    expect(script).toContain('配置 AI Provider 密钥');
    expect(script).toContain('stale Model page marker');
  });

  it('keeps the packaged Agent CLI task smoke wired after Code Agent UI smoke', () => {
    const scripts = readPackageScripts();

    expect(scripts['smoke:agent-cli-task:mac']).toBe('node scripts/smoke-agent-cli-task-run-mac.mjs');
    expect(scripts['accept:packaged-recovery:mac']).toContain(
      'npm run smoke:code-agent-ui:mac && npm run smoke:agent-cli-task:mac && npm run smoke:run-decision-recovery:mac',
    );
  });

  it('keeps reviewed patch promotion apply smoke in local agent acceptance', () => {
    const scripts = readPackageScripts();
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/sandbox-patch-promotion-apply-smoke.mjs'), 'utf8');

    expect(scripts['accept:sandbox-coding:patch-promotion-apply-smoke']).toBe(
      'npm run build:main && node scripts/sandbox-patch-promotion-apply-smoke.mjs',
    );
    expect(scripts['accept:agent-local']).toContain('npm run accept:sandbox-coding:patch-promotion-apply-smoke');
    expect(script).toContain('default=${noWrite.status}');
    expect(script).toContain('enabled=${applied.status}');
    expect(script).toContain('blocked=${blocked.status}');
    expect(script).toContain("enabledPromotionRequirements=${scalarValue(applied.auditSummary, 'promotionRequirements') ?? 'missing'}");
    expect(script).toContain("enabledSelectedRuntimeContract=${scalarValue(applied.auditSummary, 'selectedRuntimeContract') ?? 'missing'}");
    expect(script).toContain("enabledPostApplyFilesMatched=${scalarValue(applied.auditSummary, 'postApplyFilesMatched') ?? 'missing'}");
    expect(script).toContain("blockedPostApplyRunEvidence=${scalarValue(blocked.auditSummary, 'postApplyRunEvidence') ?? 'missing'}");
    expect(script).toContain('Patch promotion workspace content does not match reviewed base');
    expect(script).toContain('No workspace files were written.');
  });

  it('keeps scheduled/event Agent sweep smoke in local agent acceptance without provider calls', () => {
    const scripts = readPackageScripts();
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/scheduled-event-agent-sweep-smoke.mjs'), 'utf8');

    expect(scripts['accept:scheduled-event-agent-sweep-smoke']).toBe(
      'npm run build:main && node scripts/scheduled-event-agent-sweep-smoke.mjs',
    );
    expect(scripts['accept:agent-local']).toContain('npm run accept:scheduled-event-agent-sweep-smoke');
    expect(script).toContain('runScheduledEventAgentTriggerSweep');
    expect(script).toContain('duplicateCandidateDecision=proposed');
    expect(script).toContain('duplicateCandidateDecisionProposals=proposed');
    expect(script).toContain('runLimitDecisionProposals=none');
    expect(script).toContain('skipReason=${result.skipReason}');
    expect(script).toContain('Scheduled/event trigger daily run limit reached: 1/1.');
    expect(script).toContain('checkedTaskIds=');
    expect(script).toContain('startedRunIds=');
    expect(script).toContain('blockedReasons=');
    expect(script).toContain('blockedTaskSummaries=');
    expect(script).toContain('runFailureReasons=');
    expect(script).toContain('automationMissingRequirements=');
    expect(script).toContain('automationSatisfiedRequirements=');
    expect(script).toContain('runtimeStartMissingRequirements=');
    expect(script).toContain('terminalRunEvidenceMissingRunIds=');
    expect(script).toContain('triggerRunEvidenceRequired=');
    expect(script).toContain('triggerRunEvidenceStatus=');
    expect(script).toContain('manualSweepSummary=');
    expect(script).toContain('manualSweepAt=');
    expect(script).toContain('terminalSweepSummary=');
    expect(script).toContain('cronSweepSummary=');
    expect(script).toContain('sweepSummaryEvidence=recorded');
    expect(script).toContain('completedSweepTimeEvidence=recorded');
    expect(script).toContain('disconnectedStatus=');
    expect(script).toContain('disconnectedSkipReason=');
    expect(script).toContain('disconnectedTriggerRunEvidenceStatus=');
    expect(script).toContain('disconnectedSweepAt=');
    expect(script).toContain('disconnectedSweepSummary=');
    expect(script).toContain('disconnectedSweepSummaryEvidence=recorded');
    expect(script).toContain('inFlightStatus=');
    expect(script).toContain('inFlightSkipReason=');
    expect(script).toContain('inFlightTriggerRunEvidenceStatus=');
    expect(script).toContain('inFlightSweepAt=');
    expect(script).toContain('inFlightSweepSummary=');
    expect(script).toContain('inFlightSweepSummaryEvidence=recorded');
    expect(script).toContain('failedStatus=');
    expect(script).toContain('failedSkipReason=');
    expect(script).toContain('failedTriggerRunEvidenceStatus=');
    expect(script).toContain('failedSweepAt=');
    expect(script).toContain('failedSweepSummary=');
    expect(script).toContain('failedRecoveryStatus=');
    expect(script).toContain('failedRecoveryRunId=');
    expect(script).toContain('failedSweepDecisionProposalEvents=');
    expect(script).toContain('failedSweepSummaryEvidence=recorded');
    expect(script).toContain('failedSweepRecoveryEvidence=passed');
    expect(script).toContain('failedSweepDecisionProposalEvidence=recorded');
    expect(script).toContain('sweepFailureDecisionProposals=proposed');
    expect(script).toContain('sweep_failed: Trigger port failed - safely');
    expect(script).toContain('timelineFailedStatus=');
    expect(script).toContain('timelineFailedSkipReason=');
    expect(script).toContain('timelineFailedStartedRunIds=');
    expect(script).toContain('timelineFailedTriggerRunEvidenceStatus=');
    expect(script).toContain('timelineFailedTerminalRunEvidenceMissingRunIds=');
    expect(script).toContain('timelineFailedSweepSummary=');
    expect(script).toContain('timelineFailedDecisionProposalEvents=');
    expect(script).toContain('timelineFailedStartedRunEvidence=recorded');
    expect(script).toContain('timelineFailedTriggerRunEvidence=recorded');
    expect(script).toContain('timelineFailedSweepSummaryEvidence=recorded');
    expect(script).toContain('timelineFailedDecisionProposalEvidence=recorded');
    expect(script).toContain('timelineFailureDecisionProposals=proposed');
    expect(script).toContain('Timeline write failed - safely');
    expect(script).toContain('runIdentityFailedStatus=');
    expect(script).toContain('runIdentityFailedStartedRunIds=');
    expect(script).toContain('runIdentityFailedSweepSummary=');
    expect(script).toContain('runIdentityFailedDecisionProposalEvents=');
    expect(script).toContain('runIdentityFailedStartedRunEvidence=recorded');
    expect(script).toContain('runIdentityFailedDecisionProposalEvidence=recorded');
    expect(script).toContain('runIdentityDecisionProposals=proposed');
    expect(script).toContain('Run target task mismatch');
    expect(script).toContain('sourceFailedStatus=');
    expect(script).toContain('sourceFailedSkipReason=');
    expect(script).toContain('sourceFailedTriggerRunEvidenceStatus=');
    expect(script).toContain('sourceFailedSweepAt=');
    expect(script).toContain('sourceFailedSweepSummary=');
    expect(script).toContain('sourceFailedRecoveryStatus=');
    expect(script).toContain('sourceFailedRecoveryRunId=');
    expect(script).toContain('sourceFailedSweepSummaryEvidence=recorded');
    expect(script).toContain('sourceFailedSweepRecoveryEvidence=passed');
    expect(script).toContain('taskSourceFailureDecisionProposals=not_required_no_target_task');
    expect(script).toContain('readinessBlockedStatus=');
    expect(script).toContain('readinessBlockedAutomationMissingRequirements=');
    expect(script).toContain('readinessBlockedDecisionProposalEvents=');
    expect(script).toContain('readinessBlockedTriggerCalls=');
    expect(script).toContain('readinessBlockedDecisionProposalEvidence=recorded');
    expect(script).toContain('readinessBlockedNoTriggerEvidence=passed');
    expect(script).toContain('readinessDecisionProposals=proposed');
    expect(script).toContain('invalidRunLimitStatus=');
    expect(script).toContain('invalidRunLimitRuntimeStartMissingRequirements=');
    expect(script).toContain('invalidRunLimitDecisionProposalEvents=');
    expect(script).toContain('runLimitAccountingDecisionProposalEvidence=recorded');
    expect(script).toContain('invalidRunLimitNoTriggerEvidence=passed');
    expect(script).toContain('runLimitAccountingDecisionProposals=proposed');
    expect(script).toContain('cronSoakFirstStatus=');
    expect(script).toContain('cronSoakSecondStarted=');
    expect(script).toContain('cronSoakSecondBlocked=');
    expect(script).toContain('cronSoakSecondAutomationMissingRequirements=');
    expect(script).toContain('cronSoakSecondTriggerRunEvidenceStatus=');
    expect(script).toContain('cronSoakRunLimitEvidence=passed');
    expect(script).toContain('cronSoakAutomationReadinessEvidence=passed');
    expect(script).toContain('cronSoakNoSecondTriggerEvidence=passed');
    expect(script).toContain('Task source failed - safely');
    expect(script).toContain('skippedSweepTimeEvidence=recorded');
    expect(script).toContain('boundedRunTargetTask=passed');
    expect(script).toContain('boundedRunTargetTaskEvidence=passed');
    expect(script).toContain('boundedRunTaskMemoryGuidance=passed');
    expect(script).toContain('boundedRunTaskMemoryEvidence=passed');
    expect(script).toContain('boundedRunAutomationReadiness=passed');
    expect(script).toContain('boundedRunAutomationReadinessEvidence=passed');
    expect(script).toContain('boundedRunFirstCriterion=passed');
    expect(script).toContain('boundedRunFirstCriterionEvidence=passed');
    expect(script).toContain('boundedRunFirstSource=passed');
    expect(script).toContain('boundedRunFirstSourceEvidence=passed');
    expect(script).toContain('boundedRunPostStepGuidance=passed');
    expect(script).toContain('boundedRunPostStepEvidence=passed');
    expect(script).toContain('boundedRunWorkspaceWriteBoundary=passed');
    expect(script).toContain('boundedRunWorkspaceBoundaryEvidence=passed');
    expect(script).toContain('boundedRunStandingApprovalScope=passed');
    expect(script).toContain('boundedRunStandingApprovalScopeEvidence=passed');
    expect(script).toContain('scheduledEventAgentSweep=cron');
    expect(script).toContain('manualTriggerKind=${timelineEvents[0].payload.triggerKind}');
    expect(script).toContain('terminalTriggerKind=${terminalTimelineEvents[0].payload.triggerKind}');
    expect(script).toContain('cronTriggerKind=${cronTimelineEvents[0].payload.triggerKind}');
    expect(script).toContain('cronRunFailureReasons=');
    expect(script).toContain('startupSweepJobConnected=');
    expect(script).toContain('startupSweepJobEvidence=recorded');
    expect(script).toContain('triggerKindEvidence=passed');
    expect(script).toContain('sweepAutomationReadinessEvidence=passed');
    expect(script).toContain('cronTriggerRunEvidence=passed');
    expect(script).toContain('cronRunFailureReasonEvidence=passed');
    expect(script).toContain('failedRunDecisionDedupeEvidence=passed');
    expect(script).toContain('blockedTaskSummaryEvidence=passed');
    expect(script).toContain('checkedTaskIdsEvidence=passed');
    expect(script).toContain('panel.scheduled_event_agent_triggered');
    expect(script).toContain('timelineEvidence=recorded');
    expect(script).toContain('timelineWorkspaceBoundary=recorded');
    expect(script).toContain('terminalTimelineWorkspaceBoundary=recorded');
    expect(script).toContain('cronTimelineWorkspaceBoundary=recorded');
    expect(script).toContain('runStatusEvidence=recorded');
    expect(script).toContain('runtimeStartRequirements=passed');
    expect(script).toContain('workspace=unchanged');
    expect(script).toContain('provider=not-called');
    expect(script).toContain('docker=not-started');
  });

  it('keeps Agent CLI web research bridge smoke mocked and non-live', () => {
    const scripts = readPackageScripts();
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/agent-cli-web-research-bridge-smoke.mjs'), 'utf8');

    expect(scripts['smoke:agent-cli-web-research']).toBe(
      'node scripts/agent-cli-web-research-bridge-smoke.mjs',
    );
    expect(script).toContain('mode=mocked network=not-called provider=stubbed');
    expect(script).toContain('src/main/domain/agent-cli/agent-cli-run-service.test.ts');
    expect(script).toContain('src/renderer/lib/agentCliProgress.test.ts');
    expect(script).toContain('web research|联网调研');
    expect(script).not.toContain('TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true');
    expect(script).not.toContain('TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true');
  });

  it('keeps packaged Agent CLI live task smoke manual and skipped by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/manual-agent-cli-task-live-mac.mjs');
    const claudeResult = runScript('scripts/manual-agent-cli-task-live-mac.mjs', '', {
      TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME: 'claude',
    });
    const testingDoc = fs.readFileSync(new URL('../../docs/TESTING.md', import.meta.url), 'utf8');

    expect(scripts['manual:agent-cli-task-live:mac']).toBe('node scripts/manual-agent-cli-task-live-mac.mjs');
    expect(scripts['manual:claude-agent-cli-task-live:mac']).toBe('cross-env TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude node scripts/manual-agent-cli-task-live-mac.mjs');
    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent CLI packaged task live smoke');
    expect(result.output).toContain('runtime=codex');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('accountReadiness=not-checked');
    expect(result.output).toContain('manualEvidence=not-recorded');
    expect(result.output).toContain('cli=not-called');
    expect(result.output).toContain('packagedApp=not-launched');
    expect(result.output).toContain('workspace=unchanged');
    expect(claudeResult.status).toBe(0);
    expect(claudeResult.output).toContain('runtime=claude');
    expect(claudeResult.output).toContain('status=skip');
    expect(claudeResult.output).toContain('accountReadiness=not-checked');
    expect(claudeResult.output).toContain('manualEvidence=not-recorded');
    expect(claudeResult.output).toContain('cli=not-called');
    expect(claudeResult.output).toContain('workspace=unchanged');
    expect(claudeResult.output).toContain('local Claude Code account');
    expect(testingDoc).toContain('TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME=claude TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:claude-agent-cli-task-live:mac');
    expect(testingDoc).toContain('TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true npm run manual:agent-cli-task-live:mac');
    expect(testingDoc).toContain('The default command stays skipped');
    expect(testingDoc).toContain('accountReadiness=not-checked');
    expect(testingDoc).toContain('manualEvidence=not-recorded');
    expect(testingDoc).toContain('packaged-app live smoke passed locally');
  });

  it('keeps the packaged context refresh smoke in recovery acceptance', () => {
    const scripts = readPackageScripts();
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/smoke-context-refresh-mac.mjs'), 'utf8');

    expect(scripts['smoke:context-refresh:mac']).toBe('node scripts/smoke-context-refresh-mac.mjs');
    expect(scripts['accept:packaged-recovery:mac']).toContain(
      'npm run smoke:project-decomposition:mac && npm run smoke:context-refresh:mac && npm run smoke:context-learning:mac',
    );
    expect(script).toContain('panel.context_refreshed');
    expect(script).toContain('context-refresh-handoff');
    expect(script).toContain('会话刷新前保全');
    expect(script).toContain('persisted context refresh Task Record');
    expect(script).toContain('persisted context refresh source context');
  });

  it('keeps the packaged project smoke covering completion handoff records', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/smoke-project-decomposition-mac.mjs'), 'utf8');

    expect(script).toContain('assertCompletionHandoff');
    expect(script).toContain('panel.completion_handoff');
    expect(script).toContain('completion-handoff\\.md');
    expect(script).toContain('received-handoff\\.md');
    expect(script).toContain('persisted completion handoff Task Records');
    expect(script).toContain('persisted completion handoff timeline events');
  });

  it('keeps the real-use path helper read-only and explicit about temporary overrides', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-real-use-path-test-'));
    const userDataPath = path.join(tempRoot, 'real-use-data');

    try {
      const defaultResult = runScript('scripts/real-use-paths.mjs');
      const overrideResult = runScript('scripts/real-use-paths.mjs', '', {
        TASKPLANE_USER_DATA_DIR: userDataPath,
      });

      expect(defaultResult.status).toBe(0);
      expect(defaultResult.output).toContain('Asterism real-use paths');
      expect(defaultResult.output).toContain('defaultUserDataCompatibility=legacy Taskplane directory');
      expect(defaultResult.output).toContain('userDataOverride=<none>');
      expect(defaultResult.output).toContain('configPath=');
      expect(defaultResult.output).toContain('databasePath=');
      expect(defaultResult.output).toContain('Suggested macOS backup command while Asterism is closed:');
      expect(defaultResult.output).toContain('API keys live in the OS keychain, not in config.json.');

      expect(overrideResult.status).toBe(0);
      expect(overrideResult.output).toContain(`userDataOverride=${userDataPath}`);
      expect(overrideResult.output).toContain('Warning: TASKPLANE_USER_DATA_DIR is set.');
      expect(fs.existsSync(userDataPath)).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps targeted packaged recovery acceptance outside the release gate', () => {
    const scripts = readPackageScripts();
    const taskFilesSmoke = fs.readFileSync(path.join(process.cwd(), 'scripts/smoke-task-files-mac.mjs'), 'utf8');

    expect(scripts['accept:packaged-recovery:mac']).toBe(
      'npm run smoke:home-recovery:mac && npm run smoke:project-decomposition:mac && npm run smoke:context-refresh:mac && npm run smoke:context-learning:mac && npm run smoke:code-agent-ui:mac && npm run smoke:agent-cli-task:mac && npm run smoke:run-decision-recovery:mac && npm run smoke:settings-config:mac',
    );
    expect(scripts['accept:product-surfaces:mac']).toBe(
      'npm run smoke:external-access:mac && npm run smoke:external-access-connected:mac && npm run smoke:external-access-local-inbox:mac && npm run smoke:decisions-center:mac && npm run smoke:task-files:mac',
    );
    expect(scripts['smoke:release:mac']).not.toContain('smoke:home-recovery:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:project-decomposition:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:context-learning:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:code-agent-ui:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:run-decision-recovery:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:settings-config:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:external-access:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:decisions-center:mac');
    expect(scripts['smoke:release:mac']).not.toContain('smoke:task-files:mac');
    expect(taskFilesSmoke).toContain('TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY');
    expect(taskFilesSmoke).toContain('应用到工作区');
    expect(taskFilesSmoke).toContain('assertPatchPromotionApplied');
    expect(taskFilesSmoke).toContain('assertPatchPromotionBlocked');
    expect(taskFilesSmoke).toContain('Touched files: packaged-apply.md');
    expect(taskFilesSmoke).toContain('No workspace files were written.');
    expect(taskFilesSmoke).toContain('Patch promotion workspace content does not match reviewed base: packaged-blocked.md');
    const configurationDoc = fs.readFileSync(new URL('../../docs/CONFIGURATION.md', import.meta.url), 'utf8');
    expect(configurationDoc).toContain('reviewed-patch notices remain no-write');
    expect(configurationDoc).toContain('disabled apply action');
  });

  it('keeps alpha local acceptance non-live and explicit', () => {
    const scripts = readPackageScripts();

    expect(scripts['accept:alpha-local']).toBe(
      'npm run verify && npm run diagnostics:canonical-data:optional && npm run accept:agent-local && npm run accept:sandbox-coding:model-producer-preflight && npm run smoke:release:mac && npm run accept:packaged-recovery:mac && npm run accept:product-surfaces:mac && npm run accept:release:mac-preflight',
    );

    expect(scripts['accept:alpha-local']).not.toContain('accept:provider-native-live');
    expect(scripts['accept:alpha-local']).not.toContain('accept:external-access:gmail-oauth-local');
    expect(scripts['accept:alpha-local']).not.toContain('model-producer-live');
    expect(scripts['accept:alpha-local']).not.toContain('model-producer-preview-smoke');
    expect(scripts['accept:alpha-local']).not.toContain('producer-preview-smoke');
    expect(scripts['accept:alpha-local']).not.toContain('backend-preflight');
    expect(scripts['accept:alpha-local']).not.toContain('agent-cli-native-goal-discovery');
    expect(scripts['accept:alpha-local']).not.toContain('dist:mac ');
  });

  it('keeps mocked Gmail OAuth acceptance local and non-live', () => {
    const scripts = readPackageScripts();

    expect(scripts['accept:external-access:gmail-oauth-local']).toContain('gmail-oauth-control-service.test.ts');
    expect(scripts['accept:external-access:gmail-oauth-local']).toContain('external-access-gmail-oauth-factory.test.ts');
    expect(scripts['accept:external-access:gmail-oauth-local']).toContain('src/renderer/App.test.tsx -t');
    expect(scripts['accept:external-access:gmail-oauth-local']).not.toContain('provider-native-live');
    expect(scripts['accept:external-access:gmail-oauth-local']).not.toContain('smoke:external-access');
    expect(scripts['accept:external-access:gmail-oauth-local']).not.toContain('dist:mac');
    expect(scripts['accept:external-access:gmail-oauth-local']).not.toContain('playwright');
  });

  it('keeps optional canonical diagnostics read-only for fresh local alpha environments', () => {
    const scripts = readPackageScripts();

    expect(scripts['diagnostics:canonical-data']).toBe(
      'npm run build:main && node scripts/canonical-data-diagnostics.mjs',
    );
    expect(scripts['diagnostics:canonical-data:optional']).toBe(
      'npm run build:main && node scripts/canonical-data-diagnostics.mjs --allow-missing',
    );
    expect(scripts['diagnostics:canonical-data:optional']).not.toContain('--db ');
  });

  it('keeps product progress audit read-only and businessLineFirst architecture source-backed', () => {
    const scripts = readPackageScripts();
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/product-feature-impact-audit-summary.mjs'), 'utf8');
    const result = runScript('scripts/product-feature-impact-audit-summary.mjs');
    const nextResult = runScript('scripts/product-feature-impact-audit-summary.mjs', '', {}, ['--next']);

    expect(scripts['audit:product-progress']).toBe('node scripts/product-feature-impact-audit-summary.mjs');
    expect(script).toContain('src/shared/product-feature-impact-audit.ts');
    expect(script).toContain('findProductFeatureImpactAuditIssues');
    expect(script).toContain('findBusinessLineFirstRuleLayerAuditIssues');
    expect(script).toContain('findBusinessLineFirstImplementationAuditIssues');
    expect(script).toContain('findRuntimeArchitectureCloseoutAuditIssues');
    expect(script).toContain('src/main/domain/business-line/business-line-service.ts');
    expect(script).toContain('src/main/domain/run/run-service.ts');
    expect(script).toContain('src/shared/taskplane-writeback-apply-plan.ts');
    expect(script).toContain('src/main/domain/writeback/taskplane-writeback-dispatch-service.ts');
    expect(script).toContain('src/shared/taskplane-writeback-proposal.ts');
    expect(script).toContain('src/renderer/App.tsx');
    expect(script).toContain('docs/specs/pilot-decision-contract.md');
    expect(script).toContain('docs/specs/decision-layer-writeback-orchestration.md');
    expect(script).toContain('docs/plans/2026-05-31-release-candidate-product-chain-test-plan.md');
    expect(script).toContain('asterism product feature impact audit');
    expect(script).toContain('process.argv.includes');
    expect(script).not.toContain('better-sqlite3');
    expect(script).not.toContain('keytar');
    expect(script).not.toContain('OpenAI');
    expect(result.status).toBe(0);
    expect(result.output).toContain('features=9');
    expect(result.output).toContain('status ');
    expect(result.output).toContain('cliOnlyClosure ');
    expect(result.output).toContain('futureApiClosure ');
    expect(result.output).toContain('businessLineFirst readiness=ready checks=6 ready=5 recoverable=1 blocked=<none>');
    expect(result.output).toContain('businessLineFirstRules readiness=ready checks=7 issues=0');
    expect(result.output).toContain('businessLineFirstImplementation readiness=ready checks=7 issues=0');
    expect(result.output).toContain('runtimeArchitectureCloseout readiness=ready checks=11 issues=0');
    expect(result.output).toContain('businessLineFirstChecks');
    expect(result.output).toContain('businessLineFirstRuleChecks');
    expect(result.output).toContain('businessLineFirstImplementationChecks');
    expect(result.output).toContain('runtimeArchitectureCloseoutChecks');
    expect(result.output).toContain('ready canonical_ownership');
    expect(result.output).toContain('recoverable historical_task_recovery');
    expect(result.output).toContain('ready agents_business_line_owner doc=agents_adapter');
    expect(result.output).toContain('ready scheduler_business_line_loops doc=runtime_orchestration');
    expect(result.output).toContain('ready durable_business_writes_resolve_owner source=business_line_service');
    expect(result.output).toContain('ready writeback_dispatch_enforces_business_line_owner source=writeback_dispatch_service');
    expect(result.output).toContain('ready legacy_tasks_explorer_labeled source=app_ui');
    expect(result.output).toContain('ready cli_first_business_line_loop source=product_feature_audit');
    expect(result.output).toContain('ready agent_api_future_deferred source=product_feature_audit');
    expect(result.output).toContain('ready matrix_future_below_pilot source=product_feature_audit');
    expect(result.output).toContain('ready capability_surfaces_do_not_own_business_memory source=runtime_orchestration');
    expect(result.output).toContain('ready pilot_bounded_backend_neutral source=pilot_decision');
    expect(result.output).toContain('ready scheduler_business_line_carrier source=runtime_orchestration');
    expect(result.output).toContain('ready handoff_typed_recovery source=context_transition');
    expect(result.output).toContain('ready review_learning_typed_artifacts source=task_memory');
    expect(result.output).toContain('ready writeback_product_controlled source=decision_writeback');
    expect(result.output).toContain('ready business_memory_rc_manual_chain source=rc_test_plan');
    expect(result.output).toContain('ready tests_guard_architecture_drift source=product_feature_audit_test');
    expect(result.output).toContain(
      'summary mainlineCliP0=ready p0CliPartial=<none> p0FutureApiDeferred=right_panel_agent_run,task_creation_and_project_decomposition,decisions_checkpoints_completion,task_files_artifacts_local_writes,capabilities_external_skills_mcp',
    );
    expect(result.output).toContain(
      'currentCompletion p0Cli=ready p0CurrentBlockers=<none> futureApiDeferred=right_panel_agent_run,task_creation_and_project_decomposition,decisions_checkpoints_completion,task_files_artifacts_local_writes,capabilities_external_skills_mcp',
    );
    expect(result.output).toContain(
      'focus p0CliPartial=<none>',
    );
    expect(result.output).toContain(
      'focus p0FutureApiPartial=right_panel_agent_run,task_creation_and_project_decomposition,decisions_checkpoints_completion,task_files_artifacts_local_writes,capabilities_external_skills_mcp',
    );
    expect(result.output).toContain(
      'focus p1CliPartial=<none>',
    );
    expect(result.output).toContain('right_panel_agent_run');
    expect(result.output).toContain('smoke_tests_runtime_readiness_recovery');
    expect(result.output).not.toContain('\nissues\n');
    expect(result.output).not.toContain('openNextActions');
    expect(nextResult.status).toBe(0);
    const openNextActions = (nextResult.output.split('openNextActions')[1] ?? '').split('optionalCompatibilityEvidence')[0] ?? '';
    expect(nextResult.output).toContain('openNextActions');
    expect(openNextActions).toContain('right_panel_agent_run');
    expect(openNextActions).toContain('gap=');
    expect(openNextActions).toContain('next=');
    expect(openNextActions).not.toContain('subtask_start_and_task_switch');
    expect(openNextActions).not.toContain('smoke_tests_runtime_readiness_recovery');
    expect(nextResult.output).toContain('optionalCompatibilityEvidence');
    expect(nextResult.output.split('optionalCompatibilityEvidence')[1] ?? '').toContain('smoke_tests_runtime_readiness_recovery');
  });

  it('keeps sandbox producer preview smoke skipped without Docker or AI by default', () => {
    const result = runScript('scripts/sandbox-coding-producer-preview-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Sandbox coding producer preview smoke: skipped');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('ai=not-called');
    expect(result.output).not.toContain('checks-started');
  });

  it('keeps Code Agent model producer live smoke skipped without provider spend by default', () => {
    const result = runScript('scripts/code-agent-model-producer-live-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer live smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('validates Code Agent model producer live smoke config before provider calls', () => {
    const result = runScript('scripts/code-agent-model-producer-live-smoke.mjs', '', {
      TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer live smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps Agent CLI read-only smoke skipped without CLI or provider spend by default', () => {
    const result = runScript('scripts/agent-cli-readonly-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent CLI read-only smoke');
    expect(result.output).toContain('runtime=codex');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('cli=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps Agent CLI native web/search smoke skipped without CLI or network by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/agent-cli-native-web-search-smoke.mjs');

    expect(scripts['manual:agent-cli-native-web-search-smoke']).toBe('node scripts/agent-cli-native-web-search-smoke.mjs');
    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent CLI native web/search smoke');
    expect(result.output).toContain('runtime=codex');
    expect(result.output).toContain('mode=opt-in live');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('cli=not-called');
    expect(result.output).toContain('network=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps Agent API execution preflight smoke skipped without provider spend by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/agent-api-execution-preflight-smoke.mjs');

    expect(scripts['manual:agent-api-execution-preflight-smoke']).toBe('node scripts/agent-api-execution-preflight-smoke.mjs');
    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent API execution preflight smoke');
    expect(result.output).toContain('mode=opt-in live');
    expect(result.output).toContain('runtime=agent_api');
    expect(result.output).toContain('executionRun=deferred');
    expect(result.output).toContain('promotionReady=no');
    expect(result.output).toContain('promotionRequirements=0/11');
    expect(result.output).toContain('requiredGates=0/9');
    expect(result.output).toContain('promotionMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(result.output).toContain('executionRunMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(result.output).toContain('executionRunMissingGates=simplicity_check,runtime_action,runtime_context_assembly');
    expect(result.output).toContain('missingGates=simplicity_check,runtime_action,runtime_context_assembly');
    expect(result.output).toContain('promotionRequirementList=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(result.output).toContain('requiredGateList=simplicity_check,runtime_action,runtime_context_assembly');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps Agent API promotion readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/agent-api-promotion-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:agent-api-promotion-readiness-smoke']).toBe(
      'npm run build:main && node scripts/agent-api-promotion-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent API promotion readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('promotionInProduct=deferred');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
    expect(result.output).toContain('serviceEvidenceProviderConfigured=ready');
    expect(result.output).toContain('serviceEvidenceProviderPreflightStatus=ready');
    expect(result.output).toContain('serviceEvidenceConfiguredProvider=openai');
    expect(result.output).toContain('serviceEvidenceProviderStartupProbe=not_called');
    expect(result.output).toContain('serviceEvidenceRunEvidenceTaskEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceProviderPreflightRun=run_api_execution_partial');
    expect(result.output).toContain('serviceEvidenceProviderPreflightRunEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceProviderPreflightTask=task_1');
    expect(result.output).toContain('serviceEvidenceProviderPreflightTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidencePilotDecisionEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidencePilotDecisionExecutor=agent_api');
    expect(result.output).toContain('serviceEvidencePilotDecisionMovement=execute');
    expect(result.output).toContain('serviceEvidencePilotDecisionOperationMode=product_control_layer');
    expect(result.output).toContain('serviceEvidencePilotDecisionBackend=agent_api');
    expect(result.output).toContain('serviceEvidencePilotDecisionMessagePriority=steer');
    expect(result.output).toContain('serviceEvidencePilotDecisionPriorityLane=continue_or_review');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeRun=run_api_execution_partial');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeRunEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeTask=task_1');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProvider=openai');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceContextStepTask=task_1');
    expect(result.output).toContain('serviceEvidenceContextStepTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceContextManifestTask=task_1');
    expect(result.output).toContain('serviceEvidenceContextManifestEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceTaskMemoryGuidance=ready');
    expect(result.output).toContain('serviceEvidenceTaskMemoryGuidanceCount=0');
    expect(result.output).toContain('serviceEvidenceTaskMemoryGuidanceTask=task_1');
    expect(result.output).toContain('serviceEvidenceTaskMemoryGuidanceTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceRunGoalConditions=1');
    expect(result.output).toContain('serviceEvidenceRunGoalRun=run_api_execution_partial');
    expect(result.output).toContain('serviceEvidenceRunGoalRunEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceRunGoalTask=task_1');
    expect(result.output).toContain('serviceEvidenceRunGoalTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceWriteIntentRunEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceWriteIntentTaskEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceWriteIntentExtraction=missing');
    expect(result.output).toContain('serviceEvidenceWriteIntentSupportedActionCount=0');
    expect(result.output).toContain('serviceEvidenceWriteIntentDeclaredActionCount=0');
    expect(result.output).toContain('serviceEvidenceWriteIntentActionIdentityChain=missing');
    expect(result.output).toContain('serviceEvidenceReviewedPatchExplicitApply=no');
    expect(result.output).toContain('serviceEvidencePatchPromotionPreflight=missing');
    expect(result.output).toContain('artifactOnlyPromotionReady=no');
    expect(result.output).toContain('artifactOnlyMissingRequirements=write_intent_extraction');
    expect(result.output).toContain('artifactOnlyWriteIntentSupportedActionCount=1');
    expect(result.output).toContain('artifactOnlyWriteIntentActions=artifact.propose');
    expect(result.output).toContain('artifactOnlyWriteIntentDeclaredActionCount=1');
    expect(result.output).toContain('artifactOnlyWriteIntentExtraction=ready');
    expect(result.output).toContain('artifactOnlyWriteIntentActionIdentityChain=missing');
    expect(result.output).toContain('artifactOnlyWriteIntentRunEvidenceChain=ready');
    expect(result.output).toContain('artifactOnlyWriteIntentTaskEvidenceChain=ready');
    expect(result.output).toContain('artifactOnlyTaskMemoryGuidanceTask=task_1');
    expect(result.output).toContain('artifactOnlyTaskMemoryGuidanceTaskEvidenceChain=ready');
    expect(result.output).toContain('artifactOnlyTerminalRunStatus=completed');
    expect(result.output).toContain('artifactOnlyTerminalRunStatusEvidenceChain=ready');
    expect(result.output).toContain('patchProposalReadyPromotionReady=yes');
    expect(result.output).toContain('patchProposalReadyRequirements=11/11');
    expect(result.output).toContain('patchProposalReadyGates=9/9');
    expect(result.output).toContain('patchProposalReadyMissingRequirements=none');
    expect(result.output).toContain('patchProposalReadyWriteIntentSupportedActionCount=2');
    expect(result.output).toContain('patchProposalReadyWriteIntentActions=artifact.propose,task_file.propose');
    expect(result.output).toContain('patchProposalReadyWriteIntentDeclaredActionCount=2');
    expect(result.output).toContain('patchProposalReadyDeclaredWriteIntentActions=artifact.propose,task_file.propose');
    expect(result.output).toContain('patchProposalReadyWriteIntentDeclaredActionEvidenceChain=ready');
    expect(result.output).toContain('patchProposalReadyWriteIntentActionIdentityChain=ready');
    expect(result.output).toContain('patchProposalReadyWriteIntentActionBoundary=ready');
    expect(result.output).toContain('patchProposalReadyReviewedPatchApplyBoundary=ready');
    expect(result.output).toContain('patchProposalReadyReviewedPatchExplicitApply=yes');
    expect(result.output).toContain('patchProposalReadyPatchPromotionPreflight=ready');
    expect(result.output).toContain('patchProposalReadyPatchPromotionStatus=applied');
    expect(result.output).toContain('patchProposalReadyPatchPromotionRunEvidenceChain=ready');
    expect(result.output).toContain('patchProposalReadyPatchPromotionTaskEvidenceChain=ready');
    expect(result.output).toContain('patchProposalReadyTerminalEvidenceSummary=output_chars=128');
    expect(result.output).toContain('postRunNoWritebackWriteIntentExtraction=missing');
    expect(result.output).toContain('postRunNoWritebackWriteIntentSupportedActionCount=0');
    expect(result.output).toContain('postRunNoWritebackWriteIntentDeclaredActionCount=0');
    expect(result.output).toContain('postRunNoWritebackReviewedPatchExplicitApply=no');
    expect(result.output).toContain('postRunNoWritebackPatchPromotionPreflight=missing');
    expect(result.output).toContain('noWriteRequiredPromotionReady=yes');
    expect(result.output).toContain('noWriteRequiredRequirements=11/11');
    expect(result.output).toContain('noWriteRequiredGates=9/9');
    expect(result.output).toContain('noWriteRequiredMissingRequirements=none');
    expect(result.output).toContain('noWriteRequiredWriteIntentSupportedActionCount=0');
    expect(result.output).toContain('noWriteRequiredWriteIntentActions=none');
    expect(result.output).toContain('noWriteRequiredWriteIntentDeclaredActionCount=0');
    expect(result.output).toContain('noWriteRequiredWriteIntentMode=no_write_intents_required');
    expect(result.output).toContain('noWriteRequiredNoWriteIntentRequired=yes');
    expect(result.output).toContain('noWriteRequiredWriteIntentActionBoundary=ready');
    expect(result.output).toContain('noWriteRequiredReviewedPatchApplyBoundary=ready');
    expect(result.output).toContain('noWriteRequiredNoWorkspaceWriteRequired=yes');
    expect(result.output).toContain('noWriteRequiredPatchPromotionStatus=not_required');
  });

  it('keeps Agent API decomposition promotion readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/agent-api-decomposition-promotion-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:agent-api-decomposition-promotion-readiness-smoke']).toBe(
      'npm run build:main && node scripts/agent-api-decomposition-promotion-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent API decomposition promotion readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('subtasks=not-created');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('promotionInProduct=deferred');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
    expect(result.output).toContain('serviceEvidenceExpectedProposalId=project_decomposition:task_project');
    expect(result.output).toContain('serviceEvidenceProposalIdEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceProposalSubtaskUniqueChain=ready');
    expect(result.output).toContain('serviceEvidenceSourceEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceEvidenceRunIdChain=ready');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeEvidenceRunId=run_cli_decomposition_smoke');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeEvidenceRunChain=ready');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeParentTask=task_project');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeParentTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProvider=openai');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceProviderConfigured=ready');
    expect(result.output).toContain('serviceEvidenceConfiguredProvider=openai');
    expect(result.output).toContain('serviceEvidenceConfiguredProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceTimelineRuntimeMode=api');
    expect(result.output).toContain('serviceEvidenceTimelineInvocationLayer=api_runtime');
    expect(result.output).toContain('serviceEvidenceTimelineInvocationPhase=decomposition_draft');
    expect(result.output).toContain('serviceEvidenceTimelineRuntimeProvider=openai');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeEvidenceChain=ready');
  });

  it('keeps decomposition create-many apply plan readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/decomposition-create-many-apply-plan-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:decomposition-create-many-apply-plan-readiness-smoke']).toBe(
      'npm run build:main && node scripts/decomposition-create-many-apply-plan-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Subtask create-many apply plan readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('subtasks=not-created');
    expect(result.output).toContain('dispatch=mocked-port-only');
    expect(result.output).toContain('workspace=unchanged');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
    expect(result.output).toContain('apiDispatchStatus=completed');
    expect(result.output).toContain('apiDispatchAction=subtask.create_many');
    expect(result.output).toContain('apiDispatchCreatedTaskCount=1');
    expect(result.output).toContain('apiDispatchCreatedTaskIds=mock_child_1');
    expect(result.output).toContain('apiDispatchUpdatedTask=task_project');
    expect(result.output).toContain('apiDispatchTaskRecordPath=Task Records/mock-project-decomposition.md');
    expect(result.output).toContain('apiDispatchTimelineEventCount=1');
    expect(result.output).toContain('apiDispatchTimelineTask=task_project');
    expect(result.output).toContain('apiDispatchTimelineType=panel.project_decomposed');
    expect(result.output).toContain('apiDispatchTimelineChildTaskIds=mock_child_1');
    expect(result.output).toContain('apiDispatchTimelineRecordPath=Task Records/mock-project-decomposition.md');
    expect(result.output).toContain('apiDispatchTimelineSource=agent_api_decomposition');
    expect(result.output).toContain('apiDispatchTimelineConfirmationBoundary=operator_confirmed_subtask_create_many');
    expect(result.output).toContain('apiDispatchTimelineDraftOnlyBeforeConfirmation=true');
    expect(result.output).toContain('missingConfirmationDispatchStatus=blocked');
    expect(result.output).toContain('missingConfirmationDispatchAction=subtask.create_many');
    expect(result.output).toContain('missingConfirmationDispatchMessage=子任务草案已暂停：缺少已确认的项目拆解写入边界。');
    expect(result.output).toContain('missingConfirmationCreateSubtasksCalled=no');
  });

  it('keeps Agent API provider tool readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/agent-api-provider-tool-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:agent-api-provider-tool-readiness-smoke']).toBe(
      'npm run build:main && node scripts/agent-api-provider-tool-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent API provider tool readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('network=not-called');
    expect(result.output).toContain('startupProbe=not-attempted');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
    expect(result.output).toContain('providerToolStatus=not_declared');
    expect(result.output).toContain('providerNativeSessionReady=no');
    expect(result.output).toContain('providerNativeSessionRequirements=2/7');
    expect(result.output).toContain('providerNativeSessionMissingRequirements=provider_payload_identity,normalized_plan_identity,provider_call_ids,provider_web_search_calls,provider_web_search_declaration');
    expect(result.output).toContain('providerNativeFlag=enabled');
    expect(result.output).toContain('providerNativeSelectedProvider=openai');
    expect(result.output).toContain('providerNativePayloadProvider=missing');
    expect(result.output).toContain('providerNativePayloadProviderMatchesSelected=no');
    expect(result.output).toContain('providerNativePlanProvider=missing');
    expect(result.output).toContain('providerNativePlanProviderMatchesSelected=no');
    expect(result.output).toContain('providerNativeProviderCallIdCount=0');
    expect(result.output).toContain('providerNativeProviderCallIdIdentity=duplicate_or_missing');
    expect(result.output).toContain('providerNativeProviderWebSearchCallCount=0');
    expect(result.output).toContain('providerNativeReadySessionReady=yes');
    expect(result.output).toContain('providerNativeReadySessionRequirements=7/7');
    expect(result.output).toContain('providerNativeReadySessionMissingRequirements=none');
    expect(result.output).toContain('providerNativeReadyPayloadProvider=openai');
    expect(result.output).toContain('providerNativeReadyPayloadProviderMatchesSelected=yes');
    expect(result.output).toContain('providerNativeReadyPlanProvider=openai');
    expect(result.output).toContain('providerNativeReadyPlanProviderMatchesSelected=yes');
    expect(result.output).toContain('providerNativeReadyProviderCallSource=provider_payload');
    expect(result.output).toContain('providerNativeReadyProviderCallIdCount=1');
    expect(result.output).toContain('providerNativeReadyProviderCallIdIdentity=ready');
    expect(result.output).toContain('providerNativeReadyProviderCallTools=web_search_preview');
    expect(result.output).toContain('providerNativeReadyProviderWebSearchCallCount=1');
    expect(result.output).toContain('providerNativeReadyProviderWebSearchCallTools=web_search_preview');
    expect(result.output).toContain('providerNativeReadyTrustedWebSearchDeclarationCount=1');
    expect(result.output).toContain('providerNativeReadyTrustedWebSearchDeclarations=web_search_preview');
    expect(result.output).toContain('providerNativeReadyTrustedWebSearchCallCount=1');
    expect(result.output).toContain('providerNativeReadyTrustedWebSearchCallTools=web_search_preview');
    expect(result.output).toContain('providerNativeReadyUntrustedWebSearchCallCount=0');
    expect(result.output).toContain('selectedApiRuntime=ready');
    expect(result.output).toContain('providerConfiguredStatus=ready');
    expect(result.output).toContain('configuredProviderEvidenceChain=ready');
    expect(result.output).toContain('selectedRuntimeProvider=openai');
    expect(result.output).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(result.output).toContain('providerOwnedMetadata=ready');
    expect(result.output).toContain('providerMetadataPackage=@ai-sdk/openai');
    expect(result.output).toContain('explicitToolDeclaration=missing');
    expect(result.output).toContain('explicitToolDeclarationPackage=@ai-sdk/openai');
    expect(result.output).toContain('explicitToolDeclarationPackageMatchesMetadata=yes');
    expect(result.output).toContain('declaredWebSearchToolCount=0');
    expect(result.output).toContain('declaredWebSearchTools=none');
    expect(result.output).toContain('trustedWebSearchToolCount=0');
    expect(result.output).toContain('trustedWebSearchTools=none');
    expect(result.output).toContain('untrustedWebSearchToolCount=0');
    expect(result.output).toContain('untrustedWebSearchTools=none');
    expect(result.output).toContain('serviceEvidenceSelectedApiRuntime=ready');
    expect(result.output).toContain('serviceEvidenceProviderConfigured=ready');
    expect(result.output).toContain('serviceEvidenceConfiguredProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProvider=openai');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceProviderOwnedMetadata=ready');
    expect(result.output).toContain('serviceEvidenceProviderMetadataPackage=@ai-sdk/openai');
    expect(result.output).toContain('serviceEvidenceExplicitToolDeclaration=missing');
    expect(result.output).toContain('serviceEvidenceExplicitToolDeclarationPackage=@ai-sdk/openai');
    expect(result.output).toContain('serviceEvidenceExplicitToolDeclarationPackageMatchesMetadata=yes');
    expect(result.output).toContain('serviceEvidenceDeclaredWebSearchToolCount=0');
    expect(result.output).toContain('serviceEvidenceDeclaredWebSearchTools=none');
    expect(result.output).toContain('serviceEvidenceTrustedWebSearchToolCount=0');
    expect(result.output).toContain('serviceEvidenceTrustedWebSearchTools=none');
    expect(result.output).toContain('serviceEvidenceUntrustedWebSearchToolCount=0');
    expect(result.output).toContain('serviceEvidenceUntrustedWebSearchTools=none');
    expect(result.output).toContain('genericHelperProviderToolStatus=not_declared');
    expect(result.output).toContain('genericHelperProviderToolReadiness=not_declared');
    expect(result.output).toContain('genericHelperProviderToolRequirements=4/5');
    expect(result.output).toContain('genericHelperProviderToolMissingRequirements=explicit_tool_declaration');
    expect(result.output).toContain('genericHelperDeclaredToolCount=5');
    expect(result.output).toContain('genericHelperDeclaredWebSearchToolCount=0');
    expect(result.output).toContain('genericHelperDeclaredWebSearchTools=none');
    expect(result.output).toContain('genericHelperTrustedWebSearchToolCount=0');
    expect(result.output).toContain('genericHelperTrustedWebSearchTools=none');
    expect(result.output).toContain('genericHelperUntrustedWebSearchToolCount=0');
    expect(result.output).toContain('genericHelperUntrustedWebSearchTools=none');
    expect(result.output).toContain('legacyPreviewProviderToolStatus=declared');
    expect(result.output).toContain('legacyPreviewProviderToolReadiness=declared');
    expect(result.output).toContain('legacyPreviewProviderToolRequirements=5/5');
    expect(result.output).toContain('legacyPreviewProviderToolMissingRequirements=none');
    expect(result.output).toContain('legacyPreviewDeclaredToolCount=2');
    expect(result.output).toContain('legacyPreviewDeclaredWebSearchToolCount=1');
    expect(result.output).toContain('legacyPreviewDeclaredWebSearchTools=web_search_preview');
    expect(result.output).toContain('legacyPreviewTrustedWebSearchToolCount=1');
    expect(result.output).toContain('legacyPreviewTrustedWebSearchTools=web_search_preview');
    expect(result.output).toContain('legacyPreviewUntrustedWebSearchToolCount=0');
    expect(result.output).toContain('legacyPreviewUntrustedWebSearchTools=none');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps runtime patch promotion routing readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/runtime-patch-promotion-routing-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:runtime-patch-promotion-routing-readiness-smoke']).toBe(
      'npm run build:main && node scripts/runtime-patch-promotion-routing-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Runtime patch promotion routing readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('workspaceApply=not-attempted');
    expect(result.output).toContain('promotionInProduct=explicit_apply_only');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
    expect(result.output).toContain('blockedDirectRuntimeWorkspaceWrite=blocked');
    expect(result.output).toContain('blockedWorkspaceMutationPath=explicit_operator_apply_only');
    expect(result.output).toContain('syntheticDirectRuntimeWorkspaceWrite=blocked');
    expect(result.output).toContain('syntheticWorkspaceMutationPath=explicit_operator_apply_only');
    expect(result.output).toContain('serviceEvidenceRequirements=2/8');
    expect(result.output).toContain('serviceEvidenceMissingRequirements=selected_runtime_contract,target_task_identity,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence');
    expect(result.output).toContain('serviceEvidenceDirectRuntimeWorkspaceWrite=blocked');
    expect(result.output).toContain('serviceEvidenceWorkspaceMutationPath=explicit_operator_apply_only');
    expect(result.output).toContain('serviceEvidenceReadyRequirements=8/8');
    expect(result.output).toContain('serviceEvidenceReadyMissingRequirements=none');
    expect(result.output).toContain('serviceEvidenceReadyDirectRuntimeWorkspaceWrite=blocked');
    expect(result.output).toContain('serviceEvidenceReadyWorkspaceMutationPath=explicit_operator_apply_only');
    expect(result.output).toContain('serviceEvidenceReadySelectedRuntimeContract=ready');
    expect(result.output).toContain('serviceEvidenceReadyTargetTaskEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceReadyOperatorApplyEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceReadyOperatorApplySurface=ipc_explicit_apply');
    expect(result.output).toContain('serviceEvidenceReadyOperatorApplySurfaceEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceReadySameRunId=run_patch_1');
    expect(result.output).toContain('serviceEvidenceReadyPostApplyFilesMatched=yes');
    expect(result.output).toContain('selectedRuntimeMismatchRequirements=6/8');
    expect(result.output).toContain('selectedRuntimeMismatchMissingRequirements=selected_runtime_contract,same_run_evidence_chain');
    expect(result.output).toContain('selectedRuntimeMismatchSelectedRuntimeRun=run_other');
    expect(result.output).toContain('selectedRuntimeMismatchSelectedRuntimeRunEvidenceChain=missing');
    expect(result.output).toContain('selectedRuntimeMismatchSameRunEvidenceChain=missing');
    expect(result.output).toContain('selectedRuntimeMismatchSameRunId=missing');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeRunEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeTaskEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProvider=openai');
    expect(result.output).toContain('serviceEvidenceSelectedRuntimeProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceProviderConfigured=ready');
    expect(result.output).toContain('serviceEvidenceConfiguredProvider=openai');
    expect(result.output).toContain('serviceEvidenceConfiguredProviderEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceExpectedFileCount=1');
    expect(result.output).toContain('serviceEvidenceExpectedFiles=src/app.ts');
    expect(result.output).toContain('serviceEvidenceExpectedFileEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceOperatorApplySurface=missing');
    expect(result.output).toContain('serviceEvidenceOperatorApplySurfaceEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceOperatorApplyEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidencePostApplyFilesMatched=no');
    expect(result.output).toContain('serviceEvidenceFilePathSafetyChain=missing');
    expect(result.output).toContain('serviceEvidenceTouchedFileEvidenceChain=missing');
  });

  it('keeps sandbox patch promotion readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/sandbox-patch-promotion-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:sandbox-patch-promotion-readiness-smoke']).toBe(
      'npm run build:main && node scripts/sandbox-patch-promotion-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Sandbox patch promotion readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('workspaceApply=not-attempted');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
  });

  it('keeps scheduler Decision proposal readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/scheduler-decision-proposal-readiness-smoke.mjs', '', {}, []);

    expect(scripts['manual:scheduler-decision-proposal-readiness-smoke']).toBe(
      'npm run build:main && node scripts/scheduler-decision-proposal-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduler Decision proposal readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('decisionPersistence=not-attempted');
    expect(result.output).toContain('writebackDispatch=not-attempted');
    expect(result.output).toContain('schedulerTrigger=not-attempted');
    expect(result.output).toContain('workspace=unchanged');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
    expect(result.output).toContain('localRecoveryProposalReady=yes');
    expect(result.output).toContain('localRecoveryAuthorizationCount=1');
    expect(result.output).toContain('localRecoveryAuthorization=local_recovery');
    expect(result.output).toContain('localRecoveryAuthorizationEvidenceChain=ready');
    expect(result.output).toContain('localRecoveryDecisionTitleKey=confirm_scheduler_action');
    expect(result.output).toContain('localRecoveryDecisionOptionKeys=approve,hold');
    expect(result.output).toContain('localRecoveryDecisionProposedOutcomeKey=approve');
    expect(result.output).toContain('localRecoveryRunId=run_scheduler_recovery_smoke');
    expect(result.output).toContain('localRecoveryTask=task_scheduler_decision_recovery_smoke');
    expect(result.output).toContain('localRecoveryCompleted=yes');
    expect(result.output).toContain('localRecoveryTaskMatched=yes');
    expect(result.output).toContain('localRecoveryDecisionPersistenceAllowed=false');
    expect(result.output).toContain('scopeMismatchAuthorizationCount=0');
    expect(result.output).toContain('scopeMismatchAuthorizationEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceAuthorizationCount=0');
    expect(result.output).toContain('serviceEvidenceAuthorizationEvidenceChain=missing');
    expect(result.output).toContain('serviceEvidenceDecisionTitleKey=confirm_scheduler_action');
    expect(result.output).toContain('serviceEvidenceDecisionOptionKeys=approve,hold');
    expect(result.output).toContain('serviceEvidenceDecisionProposedOutcomeKey=approve');
    expect(result.output).toContain('serviceEvidenceReadyProposalReady=yes');
    expect(result.output).toContain('serviceEvidenceReadyRequirements=4/4');
    expect(result.output).toContain('serviceEvidenceReadyMissingRequirements=none');
    expect(result.output).toContain('serviceEvidenceReadyDecisionPayload=ready');
    expect(result.output).toContain('serviceEvidenceReadyEvidenceSourceType=run');
    expect(result.output).toContain('serviceEvidenceReadyEvidenceRunId=run_scheduler_service_ready_smoke');
    expect(result.output).toContain('serviceEvidenceReadyAuthorization=operator_confirmation');
    expect(result.output).toContain('serviceEvidenceReadyAuthorizationEvidenceChain=ready');
    expect(result.output).toContain('serviceEvidenceReadyDecisionPersistenceAllowed=false');
    expect(result.output).toContain('serviceEvidenceReadyWritebackDispatchAllowed=false');
    expect(result.output).toContain('serviceEvidenceReadySchedulerTriggerAllowed=false');
    expect(result.output).toContain('approvalItemDecisionCreateReady=yes');
    expect(result.output).toContain('approvalItemCount=1');
    expect(result.output).toContain('approvalItemKind=scheduler_decision');
    expect(result.output).toContain('approvalItemSource=scheduler_decision_proposal');
    expect(result.output).toContain('approvalItemTask=task_scheduler_decision_service_ready_smoke');
    expect(result.output).toContain('approvalItemRun=run_scheduler_service_ready_smoke');
    expect(result.output).toContain('approvalPlanAction=decision.create');
    expect(result.output).toContain('approvalPlanSourceId=run_scheduler_service_ready_smoke');
    expect(result.output).toContain('approvalPlanSourceLabel=Scheduler/background Decision proposal');
    expect(result.output).toContain('approvalPlanTask=task_scheduler_decision_service_ready_smoke');
    expect(result.output).toContain('approvalPlanTitle=Confirm scheduler action');
    expect(result.output).toContain('approvalPlanOptionCount=2');
    expect(result.output).toContain('approvalPlanRecommended=Approve');
    expect(result.output).toContain('approvalPlanConfirmationBoundary=task_dynamics_scheduler_decision_confirmed');
    expect(result.output).toContain('approvalPlanConfirmationSurface=task_dynamics_scheduler_decision_approval_queue');
    expect(result.output).toContain('approvalPlanDraftOnlyBeforeConfirmation=yes');
    expect(result.output).toContain('approvalItemStillRequiresConfirmation=yes');
  });

  it('validates Agent API execution preflight config before calling a provider', () => {
    const result = runScript('scripts/agent-api-execution-preflight-smoke.mjs', '', {
      TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent API execution preflight smoke');
    expect(result.output).toContain('executionRun=deferred');
    expect(result.output).toContain('promotionReady=no');
    expect(result.output).toContain('promotionRequirements=0/11');
    expect(result.output).toContain('requiredGates=0/9');
    expect(result.output).toContain('promotionMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(result.output).toContain('executionRunMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(result.output).toContain('executionRunMissingGates=simplicity_check,runtime_action,runtime_context_assembly');
    expect(result.output).toContain('missingGates=simplicity_check,runtime_action,runtime_context_assembly');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('TASKPLANE_AI_PROVIDER is empty.');
    expect(result.output).toContain('TASKPLANE_AI_MODEL is empty.');
    expect(result.output).toContain('TASKPLANE_AI_API_KEY is empty.');
  });

  it('keeps scheduled/event background live preflight skipped without provider spend by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/scheduled-event-agent-background-live-preflight.mjs');

    expect(scripts['manual:scheduled-event-agent-background-live-preflight']).toBe(
      'node scripts/scheduled-event-agent-background-live-preflight.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent background live preflight');
    expect(result.output).toContain('mode=opt-in live preflight');
    expect(result.output).toContain('runtime=code_agent_model_producer');
    expect(result.output).toContain('backgroundLiveRun=deferred');
    expect(result.output).toContain('requiredEvidence=scheduler_job_connected,standing_approval,context_readiness');
    expect(result.output).toContain('evidenceRequirements=0/11');
    expect(result.output).toContain('missingEvidence=scheduler_job_connected,standing_approval,context_readiness');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('validates scheduled/event background live preflight config before provider calls', () => {
    const result = runScript('scripts/scheduled-event-agent-background-live-preflight.mjs', '', {
      TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_PREFLIGHT: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent background live preflight');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('TASKPLANE_ENABLE_SCHEDULER must be true');
    expect(result.output).toContain('TASKPLANE_ENABLE_SANDBOX_CODING_AGENT must be true');
    expect(result.output).toContain('TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER must be true');
    expect(result.output).toContain('TASKPLANE_AI_PROVIDER is empty');
    expect(result.output).toContain('TASKPLANE_WORKSPACE_ROOT is empty');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('marks scheduled/event background live preflight ready without calling a provider when gates are configured', () => {
    const result = runScript('scripts/scheduled-event-agent-background-live-preflight.mjs', '', {
      TASKPLANE_AI_API_KEY: 'test-key',
      TASKPLANE_AI_MODEL: 'google/gemini-2.5-flash',
      TASKPLANE_AI_PROVIDER: 'fal-openrouter',
      TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER: 'true',
      TASKPLANE_ENABLE_SANDBOX_CODING_AGENT: 'true',
      TASKPLANE_ENABLE_SCHEDULER: 'true',
      TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_PREFLIGHT: 'true',
      TASKPLANE_WORKSPACE_ROOT: process.cwd(),
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent background live preflight');
    expect(result.output).toContain('scheduler=true');
    expect(result.output).toContain('sandboxCodingAgent=true');
    expect(result.output).toContain('modelProducer=true');
    expect(result.output).toContain('status=ready');
    expect(result.output).toContain('backgroundLiveRun=ready_to_attempt');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
    if (result.output.includes('status=skip')) {
      expect(result.output).toContain('skipReason=build_required');
      return;
    }
  });

  it('keeps scheduled/event background live smoke skipped without provider spend by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/scheduled-event-agent-background-live-smoke.mjs');

    expect(scripts['manual:scheduled-event-agent-background-live-smoke']).toBe(
      'npm run build:main && node scripts/scheduled-event-agent-background-live-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent background live smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('backgroundLiveRun=not-started');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps scheduled/event trigger readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/scheduled-event-trigger-readiness-smoke.mjs');

    expect(scripts['manual:scheduled-event-trigger-readiness-smoke']).toBe(
      'npm run build:main && node scripts/scheduled-event-trigger-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event trigger readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('validates scheduled/event background live smoke config before provider calls', () => {
    const result = runScript('scripts/scheduled-event-agent-background-live-smoke.mjs', '', {
      TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_SMOKE: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent background live smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('backgroundLiveRun=not-started');
    expect(result.output).toContain('TASKPLANE_ENABLE_SCHEDULER must be true');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps scheduled/event packaged background soak skipped without launching the app by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/scheduled-event-agent-packaged-background-soak-mac.mjs');

    expect(scripts['manual:scheduled-event-agent-packaged-background-soak:mac']).toBe(
      'node scripts/scheduled-event-agent-packaged-background-soak-mac.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent packaged background soak');
    expect(result.output).toContain('mode=opt-in packaged soak');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('packagedApp=not-launched');
    expect(result.output).toContain('backgroundLiveRun=not-started');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('validates scheduled/event packaged background soak gates before launching the app', () => {
    const result = runScript('scripts/scheduled-event-agent-packaged-background-soak-mac.mjs', '', {
      TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_PACKAGED_BACKGROUND_SOAK: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Scheduled/event Agent packaged background soak');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('TASKPLANE_ENABLE_SCHEDULER must be true');
    expect(result.output).toContain('TASKPLANE_AI_RUNTIME_MODE must be api');
    expect(result.output).toContain('packagedApp=not-launched');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps Codex native web/search smoke using top-level search before exec', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/agent-cli-native-web-search-smoke.mjs'), 'utf8');

    expect(script).toContain("'--search',");
    expect(script).toContain("'exec',");
    expect(script.indexOf("'--search',")).toBeLessThan(script.indexOf("'exec',"));
    expect(script).toContain('codex --search exec');
    expect(script).not.toContain('codex exec --search');
  });

  it('documents opt-in Codex CLI read-only live evidence without making it a default smoke requirement', () => {
    const testingDoc = fs.readFileSync(new URL('../../docs/TESTING.md', import.meta.url), 'utf8');
    const configurationDoc = fs.readFileSync(new URL('../../docs/CONFIGURATION.md', import.meta.url), 'utf8');

    expect(testingDoc).toContain('2026-05-20');
    expect(testingDoc).toContain('codex-cli 0.125.0');
    expect(testingDoc).toContain('TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=codex npm run manual:agent-cli-readonly-smoke');
    expect(testingDoc).toContain('workspace=unchanged');
    expect(testingDoc).toContain('status=passed');
    expect(configurationDoc).toContain('Treat this as manual acceptance evidence');
    expect(configurationDoc).toContain('the default smoke path stays skipped unless the explicit environment flag is set');
  });

  it('documents Claude Code live smoke as non-blocking when the provider account is not executable', () => {
    const testingDoc = fs.readFileSync(new URL('../../docs/TESTING.md', import.meta.url), 'utf8');
    const configurationDoc = fs.readFileSync(new URL('../../docs/CONFIGURATION.md', import.meta.url), 'utf8');

    expect(testingDoc).toContain('Claude Code `2.1.144`');
    expect(testingDoc).toContain('optional secondary adapter');
    expect(testingDoc).toContain('do not let it block Codex CLI, Agent API');
    expect(testingDoc).toContain('account/organization error');
    expect(testingDoc).toContain('401 authentication_failed');
    expect(testingDoc).toContain('Do not count a third-party model behind Claude Code as Claude account readiness');
    expect(testingDoc).toContain('workspace=unchanged');
    expect(configurationDoc).toContain('401 authentication_failed');
    expect(configurationDoc).toContain('Codex CLI adapter');
    expect(configurationDoc).toContain('Treat that smoke as optional');
    expect(configurationDoc).toContain('secondary adapter compatibility evidence');
    expect(configurationDoc).toContain('Taskplane workspace safety');
  });

  it('keeps Claude smoke stream-json invocations verbose for current Claude Code', () => {
    const readOnlySmoke = fs.readFileSync(path.join(process.cwd(), 'scripts/agent-cli-readonly-smoke.mjs'), 'utf8');
    const webSearchSmoke = fs.readFileSync(path.join(process.cwd(), 'scripts/agent-cli-native-web-search-smoke.mjs'), 'utf8');
    const configurationDoc = fs.readFileSync(new URL('../../docs/CONFIGURATION.md', import.meta.url), 'utf8');

    expect(readOnlySmoke).toContain("'--output-format', 'stream-json', '--verbose'");
    expect(webSearchSmoke).toContain("'--output-format', 'stream-json', '--verbose'");
    expect(configurationDoc).toContain('claude -p --output-format stream-json --verbose');
  });

  it('validates the Agent CLI smoke runtime before calling a CLI', () => {
    const result = runScript('scripts/agent-cli-readonly-smoke.mjs', '', {
      TASKPLANE_AGENT_CLI_SMOKE_RUNTIME: 'unknown',
      TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE: 'true',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('Agent CLI read-only smoke');
    expect(result.output).toContain('runtime=invalid');
    expect(result.output).toContain('cli=invalid');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('TASKPLANE_AGENT_CLI_SMOKE_RUNTIME must be codex or claude');
  });

  it('validates the Agent CLI native web/search smoke runtime before calling a CLI', () => {
    const result = runScript('scripts/agent-cli-native-web-search-smoke.mjs', '', {
      TASKPLANE_AGENT_CLI_SMOKE_RUNTIME: 'unknown',
      TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE: 'true',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('Agent CLI native web/search smoke');
    expect(result.output).toContain('runtime=invalid');
    expect(result.output).toContain('cli=invalid');
    expect(result.output).toContain('network=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('TASKPLANE_AGENT_CLI_SMOKE_RUNTIME must be codex or claude');
  });

  it('keeps Agent CLI native-goal discovery non-executing by default', () => {
    const result = runScript('scripts/agent-cli-native-goal-discovery.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent CLI native-goal discovery');
    expect(result.output).toContain('runtime=codex');
    expect(result.output).toContain('enabled=false');
    expect(result.output).toContain('taskplaneGoalLoop=available');
    expect(result.output).toContain('nativeGoalForwarding=audit-only');
    expect(result.output).toContain('passthrough=closed');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('continueWith=taskplane_goal_loop');
    expect(result.output).toContain('default discovery only probes version/help');
    expect(result.output).toContain('candidateExample=');
    expect(result.output).not.toContain('probe=codex goal --help');
    expect(result.output).not.toContain('probe=codex goals --help');
    expect(result.output).not.toContain('candidateCommand=');
  });

  it('keeps native goal forwarding readiness smoke read-only and build-gated by default', () => {
    const scripts = readPackageScripts();
    const result = runScript('scripts/native-goal-forwarding-readiness-smoke.mjs');

    expect(scripts['manual:native-goal-forwarding-readiness-smoke']).toBe(
      'npm run build:main && node scripts/native-goal-forwarding-readiness-smoke.mjs',
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('Native goal forwarding readiness smoke');
    expect(result.output).toContain('mode=read-only');
    expect(result.output).toContain('cli=not-called');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('taskplaneGoalLoop=available');
    expect(result.output).toContain('passthrough=closed');
  });

  it('documents native goal and verifier shadow readiness as local contract tests', () => {
    const testingDoc = fs.readFileSync(path.join(process.cwd(), 'docs/TESTING.md'), 'utf8');

    expect(testingDoc).toContain('src/shared/native-goal-forwarding-readiness.test.ts');
    expect(testingDoc).toContain('src/shared/agent-runtime-verifier-shadow-readiness.test.ts');
    expect(testingDoc).toContain('They keep native goal forwarding audit-only until the evidence gate is complete');
    expect(testingDoc).toContain('future API verifier in shadow/assist mode');
  });

  it('keeps the runtime harness plan aligned with stabilized first-version goal coverage', () => {
    const plan = fs.readFileSync(path.join(process.cwd(), 'docs/plans/2026-05-19-agent-runtime-harness-and-goals.md'), 'utf8');
    const runtimeDeepeningPlan = fs.readFileSync(
      path.join(process.cwd(), 'docs/plans/2026-05-14-runtime-deepening-design.md'),
      'utf8',
    );
    const matrix = fs.readFileSync(path.join(process.cwd(), 'docs/plans/2026-05-17-acceptance-coverage-matrix.md'), 'utf8');

    expect(plan).toContain('The first-version Taskplane-owned goal loop is now stabilized for the Agent CLI path');
    expect(plan).toContain('packaged-app Codex live smoke');
    expect(plan).toContain('active task-bound Agent CLI run as a read-only execution card');
    expect(plan).toContain('summarizes Task Memory write proposals before the editable draft');
    expect(plan).toContain('pending-memory gate clearance in the panel message');
    expect(plan).toContain('Remaining work should stay in preservation or deferred tracks');
    expect(plan).not.toContain('Remaining next steps are hardening the Taskplane-owned goal loop');
    expect(runtimeDeepeningPlan).toContain('The product-owned Agent CLI goal loop is now stable');
    expect(runtimeDeepeningPlan).toContain('native forwarding should remain deferred');
    expect(matrix).toContain('Updated: 2026-05-27');
    expect(matrix).toContain('Agent API execution preflight');
    expect(matrix).toContain('Scheduled/event Agent sweep');
    expect(matrix).toContain('Runtime-native web/search');
    expect(matrix).toContain('accept:scheduled-event-agent-sweep-smoke');
    expect(matrix).toContain('persisted sweep summaries');
    expect(matrix).toContain('disconnected-port skip evidence');
    expect(matrix).toContain('in-flight skip evidence');
    expect(matrix).toContain('trigger-port and task-source `sweep_failed` recovery evidence');
    expect(matrix).toContain('timeline-failure started-run evidence');
    expect(matrix).toContain('trigger-port failure, timeline failure, and task-source failure outcomes');
    expect(matrix).toContain('proves `sweep_failed` recovery for trigger-port and task-source failure paths');
    expect(matrix).toContain('proves timeline-failure started-run evidence is preserved');
    expect(matrix).toContain('lastScheduledEventAgentSweepSummary');
    expect(matrix).toContain('Packaged Codex live task run');
    expect(matrix).toContain('Manual only; passed locally on 2026-05-20; default skipped');
  });

  it('validates Agent CLI native-goal discovery runtime before candidate execution', () => {
    const result = runScript('scripts/agent-cli-native-goal-discovery.mjs', '', {
      TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME: 'unknown',
      TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY: 'true',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('Agent CLI native-goal discovery');
    expect(result.output).toContain('runtime=invalid');
    expect(result.output).toContain('TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME must be codex or claude');
    expect(result.output).not.toContain('candidateCommand=');
  });

  it('keeps provider-native live preflight non-spending when config is incomplete', () => {
    const result = runScript('scripts/provider-native-live-preflight.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Provider-native live preflight');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('TASKPLANE_AI_PROVIDER is empty.');
    expect(result.output).toContain('TASKPLANE_AI_MODEL is empty.');
    expect(result.output).toContain('TASKPLANE_AI_API_KEY is empty.');
  });

  it('keeps Code Agent model producer preview smoke skipped without provider spend by default', () => {
    const result = runScript('scripts/code-agent-model-producer-preview-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer preview smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=opt_in_required');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('validates Code Agent model producer preview smoke config before provider calls', () => {
    const result = runScript('scripts/code-agent-model-producer-preview-smoke.mjs', '', {
      TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer preview smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('skipReason=config_missing');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });
});
