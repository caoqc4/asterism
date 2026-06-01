import type {
  AgentSandboxCheckResult,
  AgentSandboxCommandPolicy,
  AgentSandboxSessionHandle,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import {
  buildAgentSandboxCheckPlan,
} from '../../../shared/agent-sandbox-provider.js';
import {
  buildDefaultAgentToolExecutionPolicy,
} from '../../../shared/agent-tool-scaffold.js';
import type {
  SandboxedCodingInjectedProducerRunner,
  SandboxedCodingInjectedProducerRunnerResult,
} from './sandboxed-coding-producer.js';
import type {
  SandboxedCodingProducerBackendLaunchEnvelope,
} from './sandboxed-coding-producer-backend.js';
import type {
  LocalContainerSandboxCommandRunner,
  LocalContainerSandboxProvider,
} from './local-container-sandbox-backend.js';

export type LocalContainerSandboxedCodingProducerLoop = (params: {
  emit: Parameters<SandboxedCodingInjectedProducerRunner>[0]['emit'];
  envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>;
  handle: AgentSandboxSessionHandle;
  request: Parameters<SandboxedCodingInjectedProducerRunner>[0]['request'];
  sessionId: string;
  stagingRoot: string;
}) => Promise<SandboxedCodingInjectedProducerRunnerResult>;

export type LocalContainerSandboxedCodingProducerRunnerSession = {
  dispose: () => Promise<void>;
  handle: AgentSandboxSessionHandle;
  request: AgentSandboxSessionRequest;
  runner: SandboxedCodingInjectedProducerRunner;
  stagingRoot: string;
  summary: string;
};

export async function prepareLocalContainerSandboxedCodingProducerRunnerSession(params: {
  commandRunner: LocalContainerSandboxCommandRunner;
  envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>;
  producerLoop: LocalContainerSandboxedCodingProducerLoop;
  provider: Pick<LocalContainerSandboxProvider, 'disposeSession' | 'prepareSession' | 'runChecks'>;
}): Promise<LocalContainerSandboxedCodingProducerRunnerSession> {
  assertLocalContainerProducerEnvelope(params.envelope);

  const request = buildLocalContainerProducerSessionRequest(params.envelope);
  const handle = await params.provider.prepareSession(request);

  return {
    dispose: () => params.provider.disposeSession(handle),
    handle,
    request,
    runner: async ({ emit, request: producerRequest, sessionId, stagingRoot }) => {
      if (stagingRoot !== handle.stagingRoot) {
        return {
          reason: 'Local container producer runner received a staging root outside its prepared session.',
          sessionSummary: `local-container producer session=${handle.id}`,
          status: 'failed',
        };
      }

      const loopResult = await params.producerLoop({
        emit,
        envelope: params.envelope,
        handle,
        request: producerRequest,
        sessionId,
        stagingRoot,
      });

      if (loopResult.status !== 'completed') {
        return loopResult;
      }

      const checkRun = await params.provider.runChecks({
        checkPlan: buildAgentSandboxCheckPlan({
          policy: request.commandPolicy,
          requestedScripts: producerRequest.commandPolicy.allowedScripts,
        }),
        handle,
        request,
        runner: params.commandRunner,
      });

      for (const result of checkRun.results) {
        emit({
          outputSummary: result.outputPreview || `${result.script}: ${result.status}`,
          runId: producerRequest.runId,
          script: result.script,
          sessionId,
          sourceId: producerRequest.sourceId,
          status: result.status,
          type: 'sandbox_producer.check_completed',
        });
      }

      return {
        evidence: {
          commandSummaries: summarizeCheckResults(checkRun.results),
          modelSummary: loopResult.evidence?.modelSummary,
          observations: loopResult.evidence?.observations,
        },
        sessionSummary: [
          loopResult.sessionSummary,
          `checks=${checkRun.summary}`,
          `session=${handle.id}`,
        ].join(' / '),
        status: 'completed',
        summary: loopResult.summary,
      };
    },
    stagingRoot: handle.stagingRoot,
    summary: `Local container sandboxed coding producer runner prepared / session=${handle.id}`,
  };
}

function assertLocalContainerProducerEnvelope(
  envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>,
): void {
  if (envelope.backendKind !== 'local_container') {
    throw new Error('Local container producer runner requires a local_container backend envelope.');
  }

  if (envelope.requiredRunner !== 'local_container_sandboxed_coding_producer') {
    throw new Error('Local container producer runner requires the local container producer runner family.');
  }

  if (envelope.executionPolicy.network !== 'disabled') {
    throw new Error('Local container producer runner requires disabled network.');
  }

  if (envelope.executionPolicy.noCredentialPassthrough !== true) {
    throw new Error('Local container producer runner must not pass credentials.');
  }

  if (envelope.executionPolicy.promotion !== 'decision_required') {
    throw new Error('Local container producer runner requires Decision promotion.');
  }
}

function buildLocalContainerProducerSessionRequest(
  envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>,
): AgentSandboxSessionRequest {
  return {
    commandPolicy: buildLocalContainerProducerCommandPolicy(envelope),
    descriptorId: 'workspace.staged_patch',
    executionPolicy: {
      ...buildDefaultAgentToolExecutionPolicy({
        descriptorId: 'workspace.staged_patch',
        outputLimitBytes: envelope.commandPolicy.outputLimitBytes,
        timeoutMs: envelope.commandPolicy.timeoutMs,
      }),
      networkPolicy: envelope.executionPolicy.network,
      workspaceRoot: envelope.workspaceRoot,
    },
    providerKind: 'local_container',
    runId: envelope.runId,
    taskId: envelope.taskId,
    workspace: {
      mode: 'staged_write',
      mountPath: '/workspace',
      workspaceRoot: envelope.workspaceRoot,
    },
  };
}

function buildLocalContainerProducerCommandPolicy(
  envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>,
): AgentSandboxCommandPolicy {
  return {
    allowedScripts: envelope.commandPolicy.allowedScripts,
    allowArbitraryShell: false,
    allowInteractive: false,
    outputLimitBytes: envelope.commandPolicy.outputLimitBytes,
    timeoutMs: envelope.commandPolicy.timeoutMs,
  };
}

function summarizeCheckResults(results: AgentSandboxCheckResult[]): string[] {
  return results.map((result) => `${result.script}: ${result.status}`);
}
