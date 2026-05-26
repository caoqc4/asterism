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
  'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT',
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
    expect(script).toContain('default=${noWrite}');
    expect(script).toContain('enabled=${applied}');
    expect(script).toContain('blocked=${blocked}');
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
    expect(script).toContain('duplicateRunLimit=blocked');
    expect(script).toContain('daily run limit reached: 3/3');
    expect(script).toContain('panel.scheduled_event_agent_triggered');
    expect(script).toContain('timelineEvidence=recorded');
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
      expect(defaultResult.output).toContain('Taskplane real-use paths');
      expect(defaultResult.output).toContain('userDataOverride=<none>');
      expect(defaultResult.output).toContain('configPath=');
      expect(defaultResult.output).toContain('databasePath=');
      expect(defaultResult.output).toContain('Suggested macOS backup command while Taskplane is closed:');
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

  it('keeps product progress audit read-only and source-backed', () => {
    const scripts = readPackageScripts();
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/product-feature-impact-audit-summary.mjs'), 'utf8');
    const result = runScript('scripts/product-feature-impact-audit-summary.mjs');
    const nextResult = runScript('scripts/product-feature-impact-audit-summary.mjs', '', {}, ['--next']);

    expect(scripts['audit:product-progress']).toBe('node scripts/product-feature-impact-audit-summary.mjs');
    expect(script).toContain('src/shared/product-feature-impact-audit.ts');
    expect(script).toContain('findProductFeatureImpactAuditIssues');
    expect(script).toContain('Taskplane product feature impact audit');
    expect(script).toContain('process.argv.includes');
    expect(script).not.toContain('better-sqlite3');
    expect(script).not.toContain('keytar');
    expect(script).not.toContain('OpenAI');
    expect(result.status).toBe(0);
    expect(result.output).toContain('features=9');
    expect(result.output).toContain('status ');
    expect(result.output).toContain('cliOnlyClosure ');
    expect(result.output).toContain('futureApiClosure ');
    expect(result.output).toContain(
      'focus p0CliPartial=<none>',
    );
    expect(result.output).toContain(
      'focus p0FutureApiPartial=right_panel_agent_run,task_creation_and_project_decomposition,decisions_checkpoints_completion,task_files_artifacts_local_writes,capabilities_external_skills_mcp',
    );
    expect(result.output).toContain(
      'focus p1CliPartial=work_habits_settings_scheduled',
    );
    expect(result.output).toContain('right_panel_agent_run');
    expect(result.output).toContain('smoke_tests_runtime_readiness_recovery');
    expect(result.output).not.toContain('issues');
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
    expect(result.output).toContain('promotionRequirements=0/11');
    expect(result.output).toContain('requiredGates=0/9');
    expect(result.output).toContain('promotionRequirementList=selected_runtime_contract,target_task_identity,provider_visible_preflight');
    expect(result.output).toContain('requiredGateList=simplicity_check,runtime_action,runtime_context_assembly');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('validates Agent API execution preflight config before calling a provider', () => {
    const result = runScript('scripts/agent-api-execution-preflight-smoke.mjs', '', {
      TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE: 'true',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent API execution preflight smoke');
    expect(result.output).toContain('executionRun=deferred');
    expect(result.output).toContain('promotionRequirements=0/11');
    expect(result.output).toContain('requiredGates=0/9');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('workspace=unchanged');
    expect(result.output).toContain('TASKPLANE_AI_PROVIDER is empty.');
    expect(result.output).toContain('TASKPLANE_AI_MODEL is empty.');
    expect(result.output).toContain('TASKPLANE_AI_API_KEY is empty.');
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
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('default discovery only probes version/help');
    expect(result.output).toContain('candidateExample=');
    expect(result.output).not.toContain('probe=codex goal --help');
    expect(result.output).not.toContain('probe=codex goals --help');
    expect(result.output).not.toContain('candidateCommand=');
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
    expect(matrix).toContain('Updated: 2026-05-26');
    expect(matrix).toContain('Agent API execution preflight');
    expect(matrix).toContain('Scheduled/event Agent sweep');
    expect(matrix).toContain('accept:scheduled-event-agent-sweep-smoke');
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

  it('keeps Code Agent model producer preview smoke skipped without provider spend by default', () => {
    const result = runScript('scripts/code-agent-model-producer-preview-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer preview smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });
});
