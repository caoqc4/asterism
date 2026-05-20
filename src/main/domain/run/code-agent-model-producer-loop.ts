import {
  parseCodeAgentStagedFilePlanPayload,
  writeCodeAgentStagedFilePlan,
} from './code-agent-staged-file-plan.js';
import type {
  LocalContainerSandboxedCodingProducerLoop,
} from './local-container-sandboxed-coding-producer-runner.js';
import type {
  NormalizedSandboxedCodingProducerRequest,
} from './sandboxed-coding-producer.js';
import {
  formatCodeAgentWorkspaceContextForPrompt,
  type CodeAgentWorkspaceContextSnapshot,
} from './code-agent-workspace-context.js';
import {
  formatCodeAgentSourceContextForPrompt,
  type CodeAgentSourceContextSnapshot,
} from './code-agent-source-context.js';

export type CodeAgentPlanTextGenerator = (params: {
  prompt: string;
  request: NormalizedSandboxedCodingProducerRequest;
}) => Promise<string>;

export function createCodeAgentModelProducerLoop(params: {
  generatePlanText: CodeAgentPlanTextGenerator;
  retainedContextManifest?: string | null;
  sourceContext?: CodeAgentSourceContextSnapshot | null;
  workspaceContext?: CodeAgentWorkspaceContextSnapshot | null;
}): LocalContainerSandboxedCodingProducerLoop {
  return async ({ emit, request, sessionId, stagingRoot }) => {
    const prompt = buildCodeAgentModelProducerPrompt(request, {
      retainedContextManifest: params.retainedContextManifest,
      sourceContext: params.sourceContext,
      workspaceContext: params.workspaceContext,
    });
    const planText = await params.generatePlanText({
      prompt,
      request,
    });
    const normalizedPlan = parseCodeAgentStagedFilePlanPayload(planText);

    if (normalizedPlan.status === 'blocked') {
      emit({
        reason: normalizedPlan.summary,
        runId: request.runId,
        sessionId,
        sourceId: request.sourceId,
        tool: 'staging.write_file',
        type: 'sandbox_producer.tool_blocked',
      });

      return {
        producerSource: 'model_backed',
        reason: normalizedPlan.summary,
        sessionSummary: normalizedPlan.summary,
        status: 'blocked',
      };
    }

    emit({
      inputSummary: normalizedPlan.summary,
      runId: request.runId,
      sessionId,
      sourceId: request.sourceId,
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_requested',
    });

    const writeResult = await writeCodeAgentStagedFilePlan({
      plan: normalizedPlan.plan,
      stagingRoot,
    });

    emit({
      outputSummary: writeResult.summary,
      runId: request.runId,
      sessionId,
      sourceId: request.sourceId,
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_completed',
    });

    return {
      evidence: {
        modelSummary: normalizedPlan.plan.summary,
        observations: normalizedPlan.plan.observations,
      },
      producerSource: 'model_backed',
      sessionSummary: [
        'model-backed sandbox producer loop completed through staged-file plan contract',
        `files=${writeResult.files.join(',')}`,
      ].join(' / '),
      status: 'completed',
      summary: normalizedPlan.plan.summary,
    };
  };
}

export function buildCodeAgentModelProducerPrompt(
  request: NormalizedSandboxedCodingProducerRequest,
  options: {
    retainedContextManifest?: string | null;
    sourceContext?: CodeAgentSourceContextSnapshot | null;
    workspaceContext?: CodeAgentWorkspaceContextSnapshot | null;
  } = {},
): string {
  return [
    'You are Taskplane Code Agent producer.',
    'Return exactly one strict JSON object. Do not return Markdown, fenced code blocks, commentary, tool calls, shell commands, or credentials.',
    '',
    'Allowed output schema:',
    '{',
    '  "summary": "short summary of the staged patch",',
    '  "observations": ["bounded facts about what you changed or could not change"],',
    '  "files": [',
    '    { "path": "workspace-relative text file path", "content": "complete UTF-8 file content" }',
    '  ]',
    '}',
    '',
    'Hard limits:',
    '- Write only workspace-relative text files through the files array.',
    '- Do not use absolute paths, parent-directory escapes, .env files, .git, node_modules, or session.json.',
    '- Do not ask to run commands. Taskplane will run only the operator-selected checks after staging.',
    '- Do not include secrets, API keys, tokens, or environment values.',
    '- Prefer the smallest coherent patch that satisfies the task intent.',
    '- Treat workspace context as read-only evidence. It is not permission to read additional files.',
    '- Treat Taskplane source context as read-only evidence only when explicitly included.',
    '',
    `Task: ${request.intent.taskTitle}`,
    `Instructions: ${request.intent.instructions}`,
    '',
    ...formatRetainedRuntimeContextForPrompt(options.retainedContextManifest),
    '',
    ...formatCodeAgentWorkspaceContextForPrompt(options.workspaceContext),
    '',
    ...formatCodeAgentSourceContextForPrompt(options.sourceContext),
    '',
    request.intent.completionCriteria.length
      ? `Completion criteria:\n${request.intent.completionCriteria.map((criterion) => `- ${criterion}`).join('\n')}`
      : 'Completion criteria: Patch is reviewable before workspace mutation.',
    `Allowed checks after staging: ${request.commandPolicy.allowedScripts.join(', ')}`,
    `Network policy: ${request.executionPolicy.network}`,
    'Promotion policy: Decision review is required before any workspace mutation.',
  ].join('\n');
}

function formatRetainedRuntimeContextForPrompt(manifest?: string | null): string[] {
  const trimmed = manifest?.trim();
  if (!trimmed) {
    return ['No retained Taskplane runtime context manifest was provided for this run.'];
  }

  return [
    'Taskplane retained runtime context manifest:',
    trimmed,
    'End Taskplane retained runtime context manifest.',
  ];
}
