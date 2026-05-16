import { buildRuntimeRecoveryGuidance } from '../../../shared/runtime-recovery-guidance.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';

export async function persistRunArtifactMemoryGuidanceStep(
  runStepRepository: Pick<RunStepRepository, 'create'>,
  params: {
    artifactId: string;
    output: string;
    runId: string;
    taskId: string;
  },
): Promise<RunStepRecord | null> {
  const guidance = buildRuntimeRecoveryGuidance({
    text: params.output,
    hasTaskContext: Boolean(params.taskId),
    importantFilePath: params.artifactId,
    producedDurableChange: true,
    taskMdDurableFields: ['artifact'],
  });
  if (!guidance.items.length) return null;

  const referencedItems = guidance.items
    .filter((item) => Boolean(item.referencePath))
    .map((item) => ({
      target: item.target,
      reason: item.evaluation.reason,
      referencePath: item.referencePath ?? null,
    }));

  return runStepRepository.create({
    runId: params.runId,
    kind: 'plan',
    status: 'completed',
    title: '任务记忆建议',
    input: JSON.stringify({
      targets: Array.from(new Set(guidance.items.map((item) => item.target))),
      ...(referencedItems.length ? { items: referencedItems } : {}),
    }),
    output: guidance.items.map((item) => {
      const target = item.target === 'task_md' ? 'Task.md' : 'Task Record';
      const reference = item.referencePath ? ` / reference=${item.referencePath}` : '';
      return `- ${target}: ${item.evaluation.reason}${reference}`;
    }).join('\n'),
  });
}
