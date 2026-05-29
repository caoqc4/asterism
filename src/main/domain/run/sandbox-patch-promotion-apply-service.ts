import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ApplySandboxPatchPromotionResult,
  SandboxPatchPromotionRecord,
} from '../../../shared/types/sandbox-patch-promotion.js';
import {
  evaluateRuntimePatchPromotionRoutingReadinessFromEvidence,
  type RuntimePatchPromotionRoutingServiceEvidence,
} from '../../../shared/runtime-patch-promotion-routing.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import type {
  SandboxPatchPromotionPreflightResult,
  SandboxPatchPromotionPreflightService,
} from './sandbox-patch-promotion-preflight-service.js';
import type { SandboxPatchReviewArtifactContent } from './sandbox-patch-review-persister.js';

export type SandboxPatchPromotionApplyResult = ApplySandboxPatchPromotionResult;

type ParsedSandboxPatchFile = {
  file: string;
  newContent: string;
  oldContent: string;
};

type RuntimePatchPromotionSelectedRuntimeContract = NonNullable<
  RuntimePatchPromotionRoutingServiceEvidence['selectedRuntimeContract']
>;

type RuntimePatchPromotionSelectedRuntimeContractResolver = (
  runId: string,
  taskId: string,
) => Promise<RuntimePatchPromotionSelectedRuntimeContract | null>;

export type SandboxPatchPromotionApplySurface =
  | 'decision_checkpoint_resume'
  | 'ipc_explicit_apply'
  | 'service_explicit_apply';

export class SandboxPatchPromotionApplyService {
  constructor(
    private readonly preflightService: Pick<SandboxPatchPromotionPreflightService, 'preflight'>,
    private readonly promotionRepository: Pick<SandboxPatchPromotionRepository, 'markApplied' | 'markBlocked'>,
    private readonly workspaceRootResolver: () => string,
    private readonly selectedRuntimeContractResolver: RuntimePatchPromotionSelectedRuntimeContractResolver | null = null,
  ) {}

  async apply(
    checkpointId: string,
    options: {
      operatorConfirmed?: boolean;
      operatorId?: string | null;
      operatorSurface?: SandboxPatchPromotionApplySurface | null;
    } = {},
  ): Promise<SandboxPatchPromotionApplyResult> {
    if (options.operatorConfirmed !== true || !options.operatorId?.trim()) {
      return {
        auditSummary: 'Sandbox patch promotion apply blocked: explicit operator confirmation is required before workspace files can be written.',
        blockedReasons: ['Sandbox patch promotion apply requires explicit operator confirmation.'],
        status: 'blocked',
        touchedFiles: [],
      };
    }

    const preflight = await this.preflightService.preflight(checkpointId);

    if (preflight.status === 'blocked') {
      const selectedRuntimeContract = await this.resolveSelectedRuntimeContract(preflight.promotion);
      return this.blocked(
        preflight.blockedReasons,
        preflight.promotion,
        buildRuntimePatchPromotionRoutingReadinessSummaryFromBlockedPromotion({
          operatorConfirmed: options.operatorConfirmed === true,
          operatorId: options.operatorId,
          operatorSurface: options.operatorSurface ?? null,
          promotion: preflight.promotion,
          selectedRuntimeContract,
        }),
      );
    }

    if (preflight.status === 'already_applied') {
      const selectedRuntimeContract = await this.resolveSelectedRuntimeContract(preflight.promotion);
      const auditSummary = [
        'Sandbox patch promotion already applied',
        `checkpoint=${preflight.promotion.checkpointId}`,
        `files=${preflight.promotion.expectedFiles.join(', ')}`,
        formatPatchApplyFileEvidence({
          expectedFiles: preflight.promotion.expectedFiles,
          touchedFiles: preflight.promotion.expectedFiles,
        }),
        buildRuntimePatchPromotionRoutingReadinessSummaryFromAppliedPromotion({
          operatorConfirmed: options.operatorConfirmed === true,
          operatorId: options.operatorId,
          operatorSurface: options.operatorSurface ?? null,
          promotion: preflight.promotion,
          selectedRuntimeContract,
        }),
      ].join(' / ');
      return {
        auditSummary,
        promotion: preflight.promotion,
        status: 'already_applied',
        touchedFiles: preflight.promotion.expectedFiles,
      };
    }

    return this.applyReady(preflight, options);
  }

  private async applyReady(
    preflight: Extract<SandboxPatchPromotionPreflightResult, { status: 'ready' }>,
    options: {
      operatorConfirmed?: boolean;
      operatorId?: string | null;
      operatorSurface?: SandboxPatchPromotionApplySurface | null;
    },
  ): Promise<SandboxPatchPromotionApplyResult> {
    const selectedRuntimeContract = await this.resolveSelectedRuntimeContract(preflight.promotion);
    const content = parseArtifactContent(preflight.artifact.content);
    if (!content) {
      return this.blocked(
        ['Patch promotion artifact content is not valid sandbox patch review JSON.'],
        preflight.promotion,
        buildRuntimePatchPromotionRoutingReadinessSummaryFromBlockedPreflight({
          operatorConfirmed: options.operatorConfirmed === true,
          operatorId: options.operatorId,
          operatorSurface: options.operatorSurface ?? null,
          preflight,
          selectedRuntimeContract,
        }),
      );
    }

    let parsedPatch: ParsedSandboxPatchFile[];
    try {
      parsedPatch = parseSandboxPatchDiff(content.artifact.diff);
    } catch (error) {
      return this.blocked(
        [error instanceof Error ? error.message : 'Sandbox patch promotion diff is not in the supported review format.'],
        preflight.promotion,
        buildRuntimePatchPromotionRoutingReadinessSummaryFromBlockedPreflight({
          operatorConfirmed: options.operatorConfirmed === true,
          operatorId: options.operatorId,
          operatorSurface: options.operatorSurface ?? null,
          preflight,
          selectedRuntimeContract,
        }),
      );
    }

    const validation = await validateSandboxPatchApplication({
      expectedFiles: preflight.promotion.expectedFiles,
      parsedPatch,
      workspaceRoot: this.workspaceRootResolver(),
    });

    if (!validation.valid) {
      return this.blocked(
        validation.blockedReasons,
        preflight.promotion,
        buildRuntimePatchPromotionRoutingReadinessSummaryFromBlockedPreflight({
          operatorConfirmed: options.operatorConfirmed === true,
          operatorId: options.operatorId,
          operatorSurface: options.operatorSurface ?? null,
          preflight,
          selectedRuntimeContract,
        }),
      );
    }

    const routingReadiness = evaluateRuntimePatchPromotionRoutingReadinessForReadyPreflight({
      operatorConfirmed: options.operatorConfirmed === true,
      operatorId: options.operatorId,
      operatorSurface: options.operatorSurface ?? null,
      preflight,
      selectedRuntimeContract,
      touchedFiles: validation.touchedFiles,
    });

    if (!routingReadiness.ready) {
      return this.blocked(
        ['Patch promotion apply requires complete runtime patch promotion routing evidence before workspace files can be written.'],
        preflight.promotion,
        `futureRuntimeRouting=${routingReadiness.summary}`,
      );
    }

    if (validation.alreadyApplied) {
      const auditSummary = [
        'Sandbox patch promotion already applied',
        `checkpoint=${preflight.promotion.checkpointId}`,
        `files=${validation.touchedFiles.join(', ')}`,
        formatPatchApplyFileEvidence({
          expectedFiles: preflight.promotion.expectedFiles,
          touchedFiles: validation.touchedFiles,
        }),
        `futureRuntimeRouting=${routingReadiness.summary}`,
      ].join(' / ');
      const applied = await this.promotionRepository.markApplied(preflight.promotion.id, auditSummary);
      return {
        auditSummary,
        promotion: applied,
        status: 'already_applied',
        touchedFiles: validation.touchedFiles,
      };
    }

    for (const write of validation.pendingWrites) {
      await fs.mkdir(path.dirname(write.filePath), { recursive: true });
      await fs.writeFile(write.filePath, write.content, 'utf8');
    }

    const auditSummary = [
      'Sandbox patch promotion applied',
      `checkpoint=${preflight.promotion.checkpointId}`,
      `files=${validation.touchedFiles.join(', ')}`,
      formatPatchApplyFileEvidence({
        expectedFiles: preflight.promotion.expectedFiles,
        touchedFiles: validation.touchedFiles,
      }),
      `futureRuntimeRouting=${routingReadiness.summary}`,
    ].join(' / ');
    const applied = await this.promotionRepository.markApplied(preflight.promotion.id, auditSummary);

    return {
      auditSummary,
      promotion: applied,
      status: 'applied',
      touchedFiles: validation.touchedFiles,
    };
  }

  private async resolveSelectedRuntimeContract(
    promotion: SandboxPatchPromotionRecord | undefined,
  ): Promise<RuntimePatchPromotionSelectedRuntimeContract | null> {
    if (!promotion) return null;
    if (!this.selectedRuntimeContractResolver) return null;

    return this.selectedRuntimeContractResolver(promotion.runId, promotion.taskId).catch(() => null);
  }

  private async blocked(
    blockedReasons: string[],
    promotion: SandboxPatchPromotionRecord | undefined,
    routingSummary?: string,
  ): Promise<SandboxPatchPromotionApplyResult> {
    const auditSummary = [
      `Sandbox patch promotion apply blocked: ${blockedReasons.join(' ')}`,
      routingSummary,
    ].filter(Boolean).join(' / ');
    const blockedPromotion = promotion
      ? await this.promotionRepository.markBlocked(promotion.id, blockedReasons, auditSummary)
      : undefined;

    return {
      auditSummary,
      blockedReasons,
      promotion: blockedPromotion,
      status: 'blocked',
      touchedFiles: [],
    };
  }
}

function formatPatchApplyFileEvidence(params: {
  expectedFiles: string[];
  touchedFiles: string[];
}): string {
  const expectedFiles = params.expectedFiles.map((file) => file.trim()).filter(Boolean);
  const touchedFiles = params.touchedFiles.map((file) => file.trim()).filter(Boolean);
  return [
    `expectedFileCount=${expectedFiles.length}`,
    `touchedFileCount=${touchedFiles.length}`,
    `filesMatched=${sameStringSet(expectedFiles, touchedFiles) ? 'yes' : 'no'}`,
  ].join(' / ');
}

function buildRuntimePatchPromotionRoutingReadinessSummaryFromBlockedPreflight(params: {
  operatorConfirmed: boolean;
  operatorId?: string | null;
  operatorSurface?: SandboxPatchPromotionApplySurface | null;
  preflight: Extract<SandboxPatchPromotionPreflightResult, { status: 'ready' }>;
  selectedRuntimeContract?: RuntimePatchPromotionSelectedRuntimeContract | null;
}): string {
  const evidence: RuntimePatchPromotionRoutingServiceEvidence = {
    explicitOperatorApply: {
      checkpointId: params.preflight.checkpoint.id,
      confirmed: params.operatorConfirmed,
      operatorId: params.operatorId ?? null,
      surface: params.operatorSurface ?? null,
      runId: params.preflight.checkpoint.runId,
      taskId: params.preflight.promotion.taskId,
    },
    patchArtifact: {
      artifactId: params.preflight.artifact.id,
      expectedFiles: params.preflight.promotion.expectedFiles,
      kind: params.preflight.artifact.kind === 'patch' ? 'patch' : 'unknown',
      runId: params.preflight.artifact.sourceId,
      status: params.preflight.artifact.kind === 'patch' ? 'ready' : 'missing',
      taskId: params.preflight.promotion.taskId,
    },
    postApplyRunEvidence: {
      runId: null,
      status: 'missing',
      taskId: null,
      touchedFiles: [],
    },
    promotionDecision: {
      artifactId: params.preflight.promotion.artifactId,
      checkpointId: params.preflight.checkpoint.id,
      decisionId: params.preflight.promotion.decisionId,
      runId: params.preflight.checkpoint.runId,
      status: 'approved',
      taskId: params.preflight.promotion.taskId,
    },
    promotionPreflight: {
      artifactId: params.preflight.promotion.artifactId,
      checkpointId: params.preflight.checkpoint.id,
      runId: params.preflight.checkpoint.runId,
      status: 'ready',
      taskId: params.preflight.promotion.taskId,
    },
    selectedRuntimeContract: params.selectedRuntimeContract ?? null,
    targetTaskId: params.preflight.promotion.taskId,
  };
  const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence(evidence);
  return `futureRuntimeRouting=${readiness.summary}`;
}

function parseArtifactContent(value: string): SandboxPatchReviewArtifactContent | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.artifact) || typeof parsed.artifact.diff !== 'string') {
      return null;
    }

    return parsed as SandboxPatchReviewArtifactContent;
  } catch {
    return null;
  }
}

function parseSandboxPatchDiff(diff: string): ParsedSandboxPatchFile[] {
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  const files: ParsedSandboxPatchFile[] = [];
  let index = 0;

  while (index < lines.length) {
    while (index < lines.length && !lines[index]?.startsWith('--- ')) {
      index += 1;
    }

    if (index >= lines.length) {
      break;
    }

    const oldHeader = lines[index] ?? '';
    const newHeader = lines[index + 1] ?? '';
    const hunkHeader = lines[index + 2] ?? '';
    if (!newHeader.startsWith('+++ ') || !hunkHeader.startsWith('@@')) {
      throw new Error('Sandbox patch promotion diff is not in the supported review format.');
    }

    const file = normalizeDiffFilePath(newHeader.slice('+++ '.length));
    const oldLines: string[] = [];
    const newLines: string[] = [];
    index += 3;

    while (index < lines.length && !lines[index]?.startsWith('--- ')) {
      const line = lines[index] ?? '';
      if (line.startsWith('-')) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1));
      } else if (line.trim()) {
        throw new Error('Sandbox patch promotion diff contains unsupported context lines.');
      }
      index += 1;
    }

    files.push({
      file,
      newContent: joinDiffContent(newLines),
      oldContent: oldHeader === '--- /dev/null' ? '' : joinDiffContent(oldLines),
    });
  }

  if (!files.length) {
    throw new Error('Sandbox patch promotion diff does not contain changed files.');
  }

  return files;
}

function buildRuntimePatchPromotionRoutingReadinessSummary(params: {
  operatorConfirmed: boolean;
  operatorId?: string | null;
  operatorSurface?: SandboxPatchPromotionApplySurface | null;
  preflight: Extract<SandboxPatchPromotionPreflightResult, { status: 'ready' }>;
  selectedRuntimeContract?: RuntimePatchPromotionSelectedRuntimeContract | null;
  touchedFiles: string[];
}): string {
  const readiness = evaluateRuntimePatchPromotionRoutingReadinessForReadyPreflight(params);
  return `futureRuntimeRouting=${readiness.summary}`;
}

function evaluateRuntimePatchPromotionRoutingReadinessForReadyPreflight(params: {
  operatorConfirmed: boolean;
  operatorId?: string | null;
  operatorSurface?: SandboxPatchPromotionApplySurface | null;
  preflight: Extract<SandboxPatchPromotionPreflightResult, { status: 'ready' }>;
  selectedRuntimeContract?: RuntimePatchPromotionSelectedRuntimeContract | null;
  touchedFiles: string[];
}): ReturnType<typeof evaluateRuntimePatchPromotionRoutingReadinessFromEvidence> {
  const evidence: RuntimePatchPromotionRoutingServiceEvidence = {
    explicitOperatorApply: {
      checkpointId: params.preflight.checkpoint.id,
      confirmed: params.operatorConfirmed,
      operatorId: params.operatorId ?? null,
      surface: params.operatorSurface ?? null,
      runId: params.preflight.promotion.runId,
      taskId: params.preflight.promotion.taskId,
    },
    patchArtifact: {
      artifactId: params.preflight.artifact.id,
      expectedFiles: params.preflight.promotion.expectedFiles,
      kind: params.preflight.artifact.kind === 'patch' ? 'patch' : 'unknown',
      runId: params.preflight.artifact.sourceId,
      status: params.preflight.artifact.kind === 'patch' ? 'ready' : 'missing',
      taskId: params.preflight.promotion.taskId,
    },
    postApplyRunEvidence: {
      runId: params.preflight.promotion.runId,
      status: params.touchedFiles.length ? 'present' : 'missing',
      taskId: params.preflight.promotion.taskId,
      touchedFiles: params.touchedFiles,
    },
    promotionDecision: {
      artifactId: params.preflight.promotion.artifactId,
      checkpointId: params.preflight.checkpoint.id,
      decisionId: params.preflight.promotion.decisionId,
      runId: params.preflight.checkpoint.runId,
      status: 'approved',
      taskId: params.preflight.promotion.taskId,
    },
    promotionPreflight: {
      artifactId: params.preflight.promotion.artifactId,
      checkpointId: params.preflight.checkpoint.id,
      runId: params.preflight.checkpoint.runId,
      status: 'ready',
      taskId: params.preflight.promotion.taskId,
    },
    selectedRuntimeContract: params.selectedRuntimeContract ?? null,
    targetTaskId: params.preflight.promotion.taskId,
  };
  return evaluateRuntimePatchPromotionRoutingReadinessFromEvidence(evidence);
}

function buildRuntimePatchPromotionRoutingReadinessSummaryFromAppliedPromotion(params: {
  operatorConfirmed: boolean;
  operatorId?: string | null;
  operatorSurface?: SandboxPatchPromotionApplySurface | null;
  promotion: SandboxPatchPromotionRecord;
  selectedRuntimeContract?: RuntimePatchPromotionSelectedRuntimeContract | null;
}): string {
  const evidence: RuntimePatchPromotionRoutingServiceEvidence = {
    explicitOperatorApply: {
      checkpointId: params.promotion.checkpointId,
      confirmed: params.operatorConfirmed,
      operatorId: params.operatorId ?? null,
      surface: params.operatorSurface ?? null,
      runId: params.promotion.runId,
      taskId: params.promotion.taskId,
    },
    patchArtifact: {
      artifactId: params.promotion.artifactId,
      expectedFiles: params.promotion.expectedFiles,
      kind: 'patch',
      runId: params.promotion.runId,
      status: 'ready',
      taskId: params.promotion.taskId,
    },
    postApplyRunEvidence: {
      runId: params.promotion.runId,
      status: params.promotion.expectedFiles.length ? 'present' : 'missing',
      taskId: params.promotion.taskId,
      touchedFiles: params.promotion.expectedFiles,
    },
    promotionDecision: {
      artifactId: params.promotion.artifactId,
      checkpointId: params.promotion.checkpointId,
      decisionId: params.promotion.decisionId,
      runId: params.promotion.runId,
      status: 'approved',
      taskId: params.promotion.taskId,
    },
    promotionPreflight: {
      artifactId: params.promotion.artifactId,
      checkpointId: params.promotion.checkpointId,
      runId: params.promotion.runId,
      status: 'ready',
      taskId: params.promotion.taskId,
    },
    selectedRuntimeContract: params.selectedRuntimeContract ?? null,
    targetTaskId: params.promotion.taskId,
  };
  const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence(evidence);
  return `futureRuntimeRouting=${readiness.summary}`;
}

function buildRuntimePatchPromotionRoutingReadinessSummaryFromBlockedPromotion(params: {
  operatorConfirmed: boolean;
  operatorId?: string | null;
  operatorSurface?: SandboxPatchPromotionApplySurface | null;
  promotion?: SandboxPatchPromotionRecord;
  selectedRuntimeContract?: RuntimePatchPromotionSelectedRuntimeContract | null;
}): string | undefined {
  if (!params.promotion) return undefined;

  const evidence: RuntimePatchPromotionRoutingServiceEvidence = {
    explicitOperatorApply: {
      checkpointId: params.promotion.checkpointId,
      confirmed: params.operatorConfirmed,
      operatorId: params.operatorId ?? null,
      surface: params.operatorSurface ?? null,
      runId: params.promotion.runId,
      taskId: params.promotion.taskId,
    },
    patchArtifact: {
      artifactId: params.promotion.artifactId,
      expectedFiles: params.promotion.expectedFiles,
      kind: 'patch',
      runId: params.promotion.runId,
      status: 'ready',
      taskId: params.promotion.taskId,
    },
    postApplyRunEvidence: {
      runId: null,
      status: 'missing',
      taskId: null,
      touchedFiles: [],
    },
    promotionDecision: {
      artifactId: params.promotion.artifactId,
      checkpointId: params.promotion.checkpointId,
      decisionId: params.promotion.decisionId,
      runId: params.promotion.runId,
      status: 'approved',
      taskId: params.promotion.taskId,
    },
    promotionPreflight: {
      artifactId: params.promotion.artifactId,
      checkpointId: params.promotion.checkpointId,
      runId: params.promotion.runId,
      status: 'blocked',
      taskId: params.promotion.taskId,
    },
    selectedRuntimeContract: params.selectedRuntimeContract ?? null,
    targetTaskId: params.promotion.taskId,
  };
  const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence(evidence);
  return `futureRuntimeRouting=${readiness.summary}`;
}

export function inferRuntimePatchPromotionSelectedRuntimeContractFromRunSteps(params: {
  runId: string;
  steps: RunStepRecord[];
  taskId: string;
}): RuntimePatchPromotionSelectedRuntimeContract | null {
  const runId = params.runId.trim();
  const taskId = params.taskId.trim();
  if (!runId || !taskId) return null;

  const evidenceSteps = params.steps.filter((step) =>
    step.runId === runId
    && step.status === 'completed',
  );
  const apiReadinessStep = evidenceSteps.find((step) => {
    const output = step.output ?? '';
    return output.includes('Agent API execution')
      && output.includes('selectedRuntimeContract=ready')
      && output.includes('runtimeMode=api')
      && output.includes('invocationLayer=api_runtime')
      && output.includes(`selectedRuntimeRun=${runId}`)
      && output.includes(`selectedRuntimeTask=${taskId}`)
      && output.includes('selectedRuntimeProviderEvidenceChain=ready');
  });
  if (apiReadinessStep) {
    const provider = scalarValue(apiReadinessStep.output ?? '', 'selectedRuntimeProvider');
    if (!provider || provider === 'missing') return null;

    return {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      provider,
      runId,
      runtimeMode: 'api',
      taskId,
    };
  }

  const cliRuntimeId = evidenceSteps
    .map((step) => step.output ?? '')
    .flatMap((output) => output.split(/\r?\n/))
    .map((line) => /^runtime=(codex|claude)$/.exec(line.trim())?.[1] ?? null)
    .find((runtimeId): runtimeId is 'codex' | 'claude' => runtimeId === 'codex' || runtimeId === 'claude');
  if (!cliRuntimeId) return null;

  return {
    invocationLayer: 'selected_runtime',
    phase: 'execution_run',
    runId,
    runtimeMode: cliRuntimeId,
    taskId,
  };
}

function scalarValue(summary: string, key: string): string | null {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

async function validateSandboxPatchApplication(params: {
  expectedFiles: string[];
  parsedPatch: ParsedSandboxPatchFile[];
  workspaceRoot: string;
}): Promise<
  | {
      alreadyApplied: boolean;
      pendingWrites: Array<{ content: string; filePath: string }>;
      touchedFiles: string[];
      valid: true;
    }
  | {
      blockedReasons: string[];
      valid: false;
    }
> {
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const normalizedExpectedFiles = params.expectedFiles.map(normalizeWorkspaceRelativePath);
  const expectedFiles = new Set(normalizedExpectedFiles);
  const blockedReasons: string[] = [];
  const touchedFiles = params.parsedPatch.map((item) => normalizeWorkspaceRelativePath(item.file));
  const pendingWrites: Array<{ content: string; filePath: string }> = [];
  let alreadyApplied = true;
  const seenExpectedFiles = new Set<string>();
  const seenTouchedFiles = new Set<string>();

  for (const file of normalizedExpectedFiles) {
    if (seenExpectedFiles.has(file)) {
      blockedReasons.push(`Patch promotion expected duplicate file: ${file}`);
    }
    seenExpectedFiles.add(file);

    if (!isSafeWorkspaceRelativePath(file)) {
      blockedReasons.push(`Patch promotion expected unsafe file: ${file}`);
    }
  }

  for (const file of touchedFiles) {
    if (seenTouchedFiles.has(file)) {
      blockedReasons.push(`Patch promotion touched duplicate file: ${file}`);
    }
    seenTouchedFiles.add(file);

    if (!expectedFiles.has(file)) {
      blockedReasons.push(`Patch promotion touched unexpected file: ${file}`);
    }

    if (!isSafeWorkspaceRelativePath(file)) {
      blockedReasons.push(`Patch promotion touched unsafe file: ${file}`);
    }
  }

  if (!sameStringSet(touchedFiles, normalizedExpectedFiles)) {
    blockedReasons.push('Patch promotion touched files do not match expected files.');
  }

  if (blockedReasons.length) {
    return { blockedReasons, valid: false };
  }

  for (const operation of params.parsedPatch) {
    const file = normalizeWorkspaceRelativePath(operation.file);
    const filePath = resolveWorkspacePath(workspaceRoot, file);
    const symlinkEscapeReason = await validateWorkspacePathHasNoSymlinkEscape(workspaceRoot, filePath, file);
    if (symlinkEscapeReason) {
      blockedReasons.push(symlinkEscapeReason);
      continue;
    }

    const currentContent = await readWorkspaceText(filePath);

    if (currentContent === operation.newContent) {
      continue;
    }

    alreadyApplied = false;

    if (currentContent !== operation.oldContent) {
      blockedReasons.push(`Patch promotion workspace content does not match reviewed base: ${file}`);
      continue;
    }

    pendingWrites.push({
      content: operation.newContent,
      filePath,
    });
  }

  if (blockedReasons.length) {
    return { blockedReasons, valid: false };
  }

  return {
    alreadyApplied,
    pendingWrites,
    touchedFiles,
    valid: true,
  };
}

async function readWorkspaceText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function resolveWorkspacePath(workspaceRoot: string, requestedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Patch promotion workspace path must stay inside the configured workspace root.');
  }

  return resolved;
}

async function validateWorkspacePathHasNoSymlinkEscape(
  workspaceRoot: string,
  filePath: string,
  displayPath: string,
): Promise<string | null> {
  const root = path.resolve(workspaceRoot);
  const relative = path.relative(root, filePath);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;

  for (const segment of segments) {
    current = path.join(current, segment);
    let stats: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stats = await fs.lstat(current);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        break;
      }

      throw error;
    }

    if (stats.isSymbolicLink()) {
      return `Patch promotion workspace path uses symlink: ${displayPath}`;
    }
  }

  return null;
}

function normalizeDiffFilePath(filePath: string): string {
  return normalizeWorkspaceRelativePath(filePath).replace(/^a\//, '').replace(/^b\//, '');
}

function joinDiffContent(lines: string[]): string {
  return lines.length ? `${lines.join('\n')}\n` : '';
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function normalizeWorkspaceRelativePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/').trim();
}

function isSafeWorkspaceRelativePath(value: string): boolean {
  const normalized = normalizeWorkspaceRelativePath(value);
  if (!normalized
    || normalized.startsWith('/')
    || /^[a-z]:\//i.test(normalized)
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || normalized === '.'
    || normalized === '..') {
    return false;
  }

  const segments = normalized.split('/');
  return segments.every((segment) =>
    Boolean(segment)
    && segment !== '.'
    && segment !== '.git'
    && segment !== 'node_modules'
    && !segment.startsWith('.env'),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
