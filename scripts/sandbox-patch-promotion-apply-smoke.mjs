#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const distMain = path.join(root, 'dist-electron', 'main');
const distShared = path.join(root, 'dist-electron', 'shared');

await assertBuiltModule(path.join(distMain, 'domain', 'decision', 'decision-service.js'));

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-patch-promotion-smoke-'));
const workspaceRoot = path.join(tempRoot, 'workspace');
const userDataRoot = path.join(tempRoot, 'user-data');
process.env.TASKPLANE_USER_DATA_DIR = userDataRoot;

const [
  { ArtifactRepository },
  { BlockerRepository },
  { CompletionCriteriaRepository },
  { DecisionRepository },
  { ProcessTemplateRepository },
  { RunCheckpointRepository },
  { RunRepository },
  { RunStepRepository },
  { SandboxPatchPromotionRepository },
  { SourceContextRepository },
  { TaskDependencyRepository },
  { TaskProcessBindingRepository },
  { TaskRepository },
  { WaitingItemRepository },
  { closeDatabase, setDatabaseUserDataPathForTests },
  { buildDefaultAgentToolExecutionPolicy },
  { createPatchPromotionCheckpointPayload },
  { AgentToolRegistry },
  {
    inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps,
    SandboxPatchPromotionApplyService,
  },
  { SandboxPatchPromotionPreflightService },
  { buildSandboxPatchDigest },
  { TaskService },
  { DecisionService },
] = await Promise.all([
  import(fileUrl('db/repositories/artifact-repository.js')),
  import(fileUrl('db/repositories/blocker-repository.js')),
  import(fileUrl('db/repositories/completion-criteria-repository.js')),
  import(fileUrl('db/repositories/decision-repository.js')),
  import(fileUrl('db/repositories/process-template-repository.js')),
  import(fileUrl('db/repositories/run-checkpoint-repository.js')),
  import(fileUrl('db/repositories/run-repository.js')),
  import(fileUrl('db/repositories/run-step-repository.js')),
  import(fileUrl('db/repositories/sandbox-patch-promotion-repository.js')),
  import(fileUrl('db/repositories/source-context-repository.js')),
  import(fileUrl('db/repositories/task-dependency-repository.js')),
  import(fileUrl('db/repositories/task-process-binding-repository.js')),
  import(fileUrl('db/repositories/task-repository.js')),
  import(fileUrl('db/repositories/waiting-item-repository.js')),
  import(fileUrl('db/client.js')),
  import(sharedUrl('agent-tool-scaffold.js')),
  import(sharedUrl('types/run-checkpoint-payload.js')),
  import(fileUrl('domain/run/agent-tool-registry.js')),
  import(fileUrl('domain/run/sandbox-patch-promotion-apply-service.js')),
  import(fileUrl('domain/run/sandbox-patch-promotion-preflight-service.js')),
  import(fileUrl('domain/run/sandbox-patch-review-persister.js')),
  import(fileUrl('domain/task/task-service.js')),
  import(fileUrl('domain/decision/decision-service.js')),
]);

try {
  await fs.mkdir(workspaceRoot, { recursive: true });
  setDatabaseUserDataPathForTests(userDataRoot);

  const noWrite = await runScenario({
    enabled: false,
    id: 'default',
    nextContent: 'beta-default\n',
    originalContent: 'alpha-default\n',
  });
  const applied = await runScenario({
    enabled: true,
    id: 'enabled',
    nextContent: 'beta-enabled\n',
    originalContent: 'alpha-enabled\n',
  });
  const blocked = await runScenario({
    driftContent: 'operator-edited-before-apply\n',
    enabled: true,
    id: 'blocked',
    nextContent: 'beta-blocked\n',
    originalContent: 'alpha-blocked\n',
  });

  console.log([
    'Sandbox patch promotion apply smoke: ready',
    `default=${noWrite.status}`,
    `enabled=${applied.status}`,
    `blocked=${blocked.status}`,
    `enabledPromotionRequirements=${scalarValue(applied.auditSummary, 'promotionRequirements') ?? 'missing'}`,
    `enabledSelectedRuntimeContract=${scalarValue(applied.auditSummary, 'selectedRuntimeContract') ?? 'missing'}`,
    `enabledTargetTaskEvidenceChain=${scalarValue(applied.auditSummary, 'targetTaskEvidenceChain') ?? 'missing'}`,
    `enabledOperatorApplyEvidenceChain=${scalarValue(applied.auditSummary, 'operatorApplyEvidenceChain') ?? 'missing'}`,
    `enabledSameRunEvidenceChain=${scalarValue(applied.auditSummary, 'sameRunEvidenceChain') ?? 'missing'}`,
    `enabledPostApplyRunEvidence=${scalarValue(applied.auditSummary, 'postApplyRunEvidence') ?? 'missing'}`,
    `enabledPostApplyFilesMatched=${scalarValue(applied.auditSummary, 'postApplyFilesMatched') ?? 'missing'}`,
    `enabledPromotionMissingRequirements=${scalarValue(applied.auditSummary, 'promotionMissingRequirements') ?? 'missing'}`,
    `blockedPostApplyRunEvidence=${scalarValue(blocked.auditSummary, 'postApplyRunEvidence') ?? 'missing'}`,
    `blockedPostApplyFilesMatched=${scalarValue(blocked.auditSummary, 'postApplyFilesMatched') ?? 'missing'}`,
    'docker=not-started',
    'ai=not-called',
  ].join(' / '));
} finally {
  closeDatabase();
  await fs.rm(tempRoot, { force: true, recursive: true });
}

async function runScenario({ driftContent, enabled, id, nextContent, originalContent }) {
  closeDatabase();
  setDatabaseUserDataPathForTests(path.join(userDataRoot, id));
  const workspaceFile = path.join(workspaceRoot, `${id}.md`);
  await fs.writeFile(workspaceFile, originalContent, 'utf8');
  const patchDiff = [
    `--- a/${id}.md`,
    `+++ b/${id}.md`,
    '@@',
    `-${originalContent.trimEnd()}`,
    `+${nextContent.trimEnd()}`,
  ].join('\n');
  const checkpoint = await createPromotionCheckpoint({
    filePath: `${id}.md`,
    patchDiff,
    sourceId: `sandbox_source_${id}`,
  });

  closeDatabase();
  const services = createServices({ enableSandboxPatchPromotionApply: enabled });
  if (driftContent !== undefined) {
    await fs.writeFile(workspaceFile, driftContent, 'utf8');
  }
  await services.decisionService.act({
    action: 'approve',
    id: checkpoint.decisionId,
  });

  const content = await fs.readFile(workspaceFile, 'utf8');
  const [resolvedCheckpoint] = await services.runCheckpointRepository.listForRun(checkpoint.runId);
  const promotion = await services.sandboxPatchPromotionRepository.findByCheckpointId(checkpoint.checkpointId);
  const steps = await services.runStepRepository.listForRun(checkpoint.runId);

  if (driftContent !== undefined) {
    assert(content === driftContent, 'blocked promotion unexpectedly changed the diverged workspace file');
    assert(resolvedCheckpoint?.status === 'cancelled', 'blocked promotion did not cancel the checkpoint');
    assert(promotion?.status === 'blocked', 'blocked promotion record was not marked blocked');
    assert(
      promotion?.auditSummary?.includes('selectedRuntimeContract=ready'),
      'blocked promotion did not preserve selected runtime routing evidence',
    );
    assert(
      steps.some((step) =>
        step.status === 'failed' &&
        step.output?.includes('No workspace files were written.') &&
        step.output?.includes(`Patch promotion workspace content does not match reviewed base: ${id}.md`)
      ),
      'blocked promotion did not record no-write failure evidence',
    );
    return {
      auditSummary: promotion.auditSummary ?? '',
      status: 'blocked-no-write',
    };
  }

  if (enabled) {
    assert(content === nextContent, 'enabled promotion did not update the workspace file');
    assert(resolvedCheckpoint?.status === 'resolved', 'enabled promotion did not resolve the checkpoint');
    assert(promotion?.status === 'applied', 'enabled promotion record was not marked applied');
    assert(
      promotion?.auditSummary?.includes('promotionRequirements=8/8') &&
        promotion.auditSummary.includes('selectedRuntimeContract=ready'),
      'enabled promotion did not record selected runtime routing readiness',
    );
    assert(steps.some((step) => step.output?.includes(`Touched files: ${id}.md`)), 'enabled promotion did not record touched files');
    return {
      auditSummary: promotion.auditSummary ?? '',
      status: 'applied',
    };
  }

  assert(content === originalContent, 'default promotion unexpectedly changed the workspace file');
  assert(resolvedCheckpoint?.status === 'resolved', 'default promotion did not resolve the checkpoint');
  assert(promotion?.status === 'pending', 'default promotion should keep the durable record pending');
  assert(
    steps.some((step) => step.output?.includes('Workspace file application is disabled by feature flag; no workspace files were written.')),
    'default promotion did not record no-write output',
  );
  return {
    auditSummary: promotion?.auditSummary ?? '',
    status: 'no-write',
  };
}

async function createPromotionCheckpoint({ filePath, patchDiff, sourceId }) {
  const services = createServices({ enableSandboxPatchPromotionApply: false });
  const task = await services.taskService.create({
    title: `Promote sandbox patch ${filePath}`,
  });
  const run = await services.runRepository.create({
    instructions: 'Promote a reviewed sandbox patch after confirmation.',
    taskId: task.id,
    type: 'agent',
  });
  await services.runStepRepository.create({
    runId: run.id,
    kind: 'plan',
    status: 'completed',
    title: 'agent cli run accepted',
    output: [
      'runtime=codex',
      'sandbox=read-only',
    ].join('\n'),
  });
  const artifact = await services.artifactRepository.createPatchFromRun({
    content: JSON.stringify({
      artifact: {
        commandLogs: [],
        diff: patchDiff,
        files: [filePath],
        kind: 'patch',
        riskSummary: 'Pending review.',
        summary: 'Reviewable sandbox patch',
      },
      review: {
        audit: null,
        sandboxSessionId: sourceId,
        sessionSummary: `sandbox=${sourceId}`,
      },
    }),
    runId: run.id,
    taskId: task.id,
    title: `Reviewable sandbox patch ${filePath}`,
  });
  const initialPayload = buildPayload({
    artifact,
    decisionId: null,
    decisionTitle: '确认提升 sandbox patch',
    filePath,
    patchDiff,
    sourceId,
  });
  const checkpoint = await services.runCheckpointRepository.create({
    kind: 'patch_promotion',
    payload: JSON.stringify(initialPayload),
    runId: run.id,
  });
  const decision = await services.decisionRepository.create({
    sourceId: checkpoint.id,
    sourceLabel: 'workspace.staged_patch',
    sourceType: 'agent_checkpoint',
    taskId: task.id,
    title: '确认提升 sandbox patch',
  });
  await services.runCheckpointRepository.updatePayload(
    checkpoint.id,
    JSON.stringify(buildPayload({
      artifact,
      decisionId: decision.id,
      decisionTitle: decision.title,
      filePath,
      patchDiff,
      sourceId,
    })),
  );
  await services.sandboxPatchPromotionRepository.createPending({
    artifactId: artifact.id,
    auditSummary: artifact.title,
    checkpointId: checkpoint.id,
    decisionId: decision.id,
    expectedFiles: [filePath],
    patchDigest: buildSandboxPatchDigest(patchDiff),
    runId: run.id,
    sourceId,
    taskId: task.id,
  });

  return {
    checkpointId: checkpoint.id,
    decisionId: decision.id,
    runId: run.id,
  };
}

function buildPayload({ artifact, decisionId, decisionTitle, filePath, patchDiff, sourceId }) {
  return createPatchPromotionCheckpointPayload({
    artifactId: artifact.id,
    artifactSummary: artifact.title,
    decisionId,
    decisionTitle,
    descriptorId: 'workspace.staged_patch',
    expectedFiles: [filePath],
    patchDigest: buildSandboxPatchDigest(patchDiff),
    policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
    preview: patchDiff,
    sessionId: sourceId,
  });
}

function createServices({ enableSandboxPatchPromotionApply }) {
  const taskRepository = new TaskRepository();
  const waitingItemRepository = new WaitingItemRepository();
  const artifactRepository = new ArtifactRepository();
  const sourceContextRepository = new SourceContextRepository();
  const processTemplateRepository = new ProcessTemplateRepository();
  const taskProcessBindingRepository = new TaskProcessBindingRepository();
  const blockerRepository = new BlockerRepository();
  const taskDependencyRepository = new TaskDependencyRepository();
  const completionCriteriaRepository = new CompletionCriteriaRepository();
  const decisionRepository = new DecisionRepository();
  const runRepository = new RunRepository();
  const runStepRepository = new RunStepRepository();
  const runCheckpointRepository = new RunCheckpointRepository();
  const sandboxPatchPromotionRepository = new SandboxPatchPromotionRepository();
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
  );
  const preflightService = new SandboxPatchPromotionPreflightService(
    sandboxPatchPromotionRepository,
    runCheckpointRepository,
    artifactRepository,
  );
  const applyService = new SandboxPatchPromotionApplyService(
    preflightService,
    sandboxPatchPromotionRepository,
    () => workspaceRoot,
    async (runId, taskId) => inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps({
      runId,
      steps: await runStepRepository.listForRun(runId),
      taskId,
    }),
  );
  const decisionService = new DecisionService(
    decisionRepository,
    taskService,
    {},
    undefined,
    runCheckpointRepository,
    runStepRepository,
    runRepository,
    agentToolRegistry,
    preflightService,
    applyService,
    () => Boolean(enableSandboxPatchPromotionApply),
  );

  return {
    artifactRepository,
    decisionRepository,
    decisionService,
    runCheckpointRepository,
    runRepository,
    runStepRepository,
    sandboxPatchPromotionRepository,
    taskService,
  };
}

async function assertBuiltModule(modulePath) {
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error('Run npm run build:main before the sandbox patch promotion apply smoke.');
  }
}

function fileUrl(relativePath) {
  return pathToFileURL(path.join(distMain, relativePath)).href;
}

function sharedUrl(relativePath) {
  return pathToFileURL(path.join(distShared, relativePath)).href;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function scalarValue(summary, key) {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}
