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
  'TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE',
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

function runScript(scriptPath: string, envContents = '', overrides: NodeJS.ProcessEnv = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-local-smoke-boundary-test-'));
  const envFilePath = path.join(tempRoot, '.env');
  fs.writeFileSync(envFilePath, envContents);

  try {
    const result = spawnSync(process.execPath, [scriptPath], {
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

    expect(scripts['accept:packaged-recovery:mac']).toBe(
      'npm run smoke:home-recovery:mac && npm run smoke:project-decomposition:mac && npm run smoke:context-learning:mac && npm run smoke:code-agent-ui:mac && npm run smoke:agent-cli-task:mac && npm run smoke:run-decision-recovery:mac && npm run smoke:settings-config:mac',
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

  it('keeps Agent CLI native-goal discovery non-executing by default', () => {
    const result = runScript('scripts/agent-cli-native-goal-discovery.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Agent CLI native-goal discovery');
    expect(result.output).toContain('runtime=codex');
    expect(result.output).toContain('enabled=false');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('default discovery only probes version/help');
    expect(result.output).not.toContain('candidateCommand=');
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
