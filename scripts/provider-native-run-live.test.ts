import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateText, jsonSchema, tool } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getProviderNativeLiveLanguageModel,
  PROVIDER_NATIVE_LIVE_TOOL_NAME,
} from './provider-native-live-validate.mjs';
import {
  getProviderNativeLivePreflight,
  printProviderNativeLivePreflight,
} from './provider-native-live-preflight.mjs';
import { ArtifactRepository } from '../src/main/db/repositories/artifact-repository.js';
import { BlockerRepository } from '../src/main/db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../src/main/db/repositories/completion-criteria-repository.js';
import { DecisionRepository } from '../src/main/db/repositories/decision-repository.js';
import { ProcessTemplateRepository } from '../src/main/db/repositories/process-template-repository.js';
import { RunCheckpointRepository } from '../src/main/db/repositories/run-checkpoint-repository.js';
import { RunRepository } from '../src/main/db/repositories/run-repository.js';
import { RunStepRepository } from '../src/main/db/repositories/run-step-repository.js';
import { SourceContextRepository } from '../src/main/db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../src/main/db/repositories/task-dependency-repository.js';
import { TaskProcessBindingRepository } from '../src/main/db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../src/main/db/repositories/task-repository.js';
import { WaitingItemRepository } from '../src/main/db/repositories/waiting-item-repository.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../src/main/db/client.js';
import { makeTempDir } from '../src/main/test-utils.js';
import { TaskService } from '../src/main/domain/task/task-service.js';
import { AgentToolRegistry } from '../src/main/domain/run/agent-tool-registry.js';
import { RunService } from '../src/main/domain/run/run-service.js';

const preflightEnvKeys = [
  'TASKPLANE_AI_PROVIDER',
  'TASKPLANE_AI_MODEL',
  'TASKPLANE_AI_BASE_URL',
  'TASKPLANE_AI_API_KEY',
  'TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS',
  'TASKPLANE_ENV_FILE',
];

function withPreflightEnv<T>(
  envContents: string,
  envOverrides: NodeJS.ProcessEnv,
  callback: () => T,
): T {
  const originalValues = new Map<string, string | undefined>();
  const envFilePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-provider-native-preflight-test-')),
    '.env',
  );

  fs.writeFileSync(envFilePath, envContents);

  for (const key of preflightEnvKeys) {
    originalValues.set(key, process.env[key]);
    delete process.env[key];
  }

  process.env.TASKPLANE_ENV_FILE = envFilePath;
  Object.assign(process.env, envOverrides);

  try {
    return callback();
  } finally {
    for (const [key, value] of originalValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    fs.rmSync(path.dirname(envFilePath), { recursive: true, force: true });
  }
}

function buildProviderToolPayload(params: {
  finishReason: string | undefined;
  model: string;
  provider: string;
  toolCalls: unknown[];
}) {
  const providerCallIds: string[] = [];
  const steps = params.toolCalls.map((item) => {
    const toolCall = item as {
      input?: unknown;
      toolCallId?: unknown;
      toolName?: unknown;
    };

    if (typeof toolCall.toolCallId === 'string' && toolCall.toolCallId.trim()) {
      providerCallIds.push(toolCall.toolCallId);
    }

    return {
      tool: toolCall.toolName,
      input: toolCall.input && typeof toolCall.input === 'object' && !Array.isArray(toolCall.input)
        ? toolCall.input
        : undefined,
    };
  });
  const rawSummary = `sdk_tool_calls=${steps.length}`;

  return {
    source: 'ai_sdk_tool_calls' as const,
    provider: params.provider,
    model: params.model,
    rawSummary,
    payload: {
      source: 'provider_tool_call',
      rawSummary,
      providerCallIds,
      stopReason: params.finishReason ?? null,
      proposal: {
        finalOutput: null,
        steps,
      },
    },
  };
}

describe('provider-native live RunService acceptance', () => {
  let tempRoot = '';
  let workspaceRoot = '';

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);

    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }

    if (workspaceRoot) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = '';
    }
  });

  it('settles a real provider-native tool call through a temporary RunService database', async () => {
    const preflight = getProviderNativeLivePreflight();
    printProviderNativeLivePreflight(preflight);

    if (!preflight.ready) {
      console.log('Provider-native live RunService acceptance');
      console.log('status=skip');
      return;
    }

    const liveResult = await generateText({
      experimental_include: {
        responseBody: true,
      },
      model: getProviderNativeLiveLanguageModel({
        apiKey: preflight.apiKey,
        baseUrl: preflight.baseUrl,
        model: preflight.model,
        provider: preflight.provider,
      }),
      prompt: [
        'Call the available tool exactly once.',
        'Do not answer with prose.',
        'The tool has no input fields.',
      ].join('\n'),
      toolChoice: {
        type: 'tool',
        toolName: PROVIDER_NATIVE_LIVE_TOOL_NAME,
      },
      tools: {
        [PROVIDER_NATIVE_LIVE_TOOL_NAME]: tool({
          description: 'Inspect the current Taskplane working context snapshot for this run.',
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
            additionalProperties: false,
          }),
        }),
      },
    });
    const toolCalls = Array.isArray(liveResult.toolCalls) ? liveResult.toolCalls : [];

    expect(toolCalls.some((item) => item.toolName === PROVIDER_NATIVE_LIVE_TOOL_NAME)).toBe(true);

    tempRoot = makeTempDir('taskplane-provider-native-live-run-');
    workspaceRoot = makeTempDir('taskplane-provider-native-live-workspace-');
    setDatabaseUserDataPathForTests(tempRoot);

    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const providerPayload = buildProviderToolPayload({
      finishReason: liveResult.finishReason,
      model: preflight.model,
      provider: preflight.provider,
      toolCalls,
    });
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: preflight.provider,
        model: preflight.model,
        baseUrl: preflight.baseUrl || null,
        apiKey: preflight.apiKey,
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      execute: vi.fn(),
      executeWithResult: vi.fn().mockResolvedValue({
        text: '',
        providerPayload,
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for provider-native live RunService acceptance.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Provider native live RunService acceptance',
      summary: 'Validate one real provider tool call through the Taskplane RunService boundary.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Validate provider-native live payload through RunService.',
    });
    const detail = await service.getDetail(run.id);
    const agentSession = detail?.agentSessions[0];

    console.log('Provider-native live RunService acceptance');
    console.log(`runStatus=${run.status}`);
    console.log(`toolCalls=${toolCalls.length}`);
    console.log(`structuredToolCalls=${agentSession?.capabilities.structuredToolCalls ? 'true' : 'false'}`);
    console.log(`metadata=${agentSession?.metadata ? '<present>' : '<empty>'}`);
    console.log(`steps=${detail?.steps.map((step) => `${step.kind}:${step.title}`).join(' | ') ?? '<empty>'}`);
    console.log('status=passed');

    expect(run.status).toBe('completed');
    expect(run.outputSource).toBe('ai');
    expect(run.output).toContain('任务：Provider native live RunService acceptance');
    expect(run.output).toContain('状态：captured');
    expect(agentSession).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        structuredToolCalls: true,
        textOnlyPlanning: false,
      }),
      metadata: expect.stringContaining(`provider=${preflight.provider}`),
    });
    expect(agentSession?.metadata).toContain(providerPayload.rawSummary);
    expect(detail?.steps.some((step) =>
      step.kind === 'tool_result' &&
      step.title === '工具结果：task.inspect_context'
    )).toBe(true);
  });
});

describe('provider-native live preflight', () => {
  it('lets shell environment override .env values without printing the API key', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const preflight = withPreflightEnv([
        'TASKPLANE_AI_PROVIDER=anthropic',
        'TASKPLANE_AI_MODEL=claude-env-file',
        'TASKPLANE_AI_API_KEY=env-file-provider-key-secret',
        'TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS=true',
      ].join('\n'), {
        TASKPLANE_AI_MODEL: 'claude-shell',
        TASKPLANE_AI_API_KEY: 'shell-provider-key-secret',
      }, () => getProviderNativeLivePreflight());

      printProviderNativeLivePreflight(preflight);

      const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');

      expect(preflight.ready).toBe(true);
      expect(preflight.model).toBe('claude-shell');
      expect(preflight.apiKey).toBe('shell-provider-key-secret');
      expect(output).toContain('model=claude-shell');
      expect(output).toContain('apiKey=<set>');
      expect(output).not.toContain('env-file-provider-key-secret');
      expect(output).not.toContain('shell-provider-key-secret');
    } finally {
      logSpy.mockRestore();
    }
  });
});
