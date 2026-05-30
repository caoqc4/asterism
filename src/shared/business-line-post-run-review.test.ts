import { describe, expect, it } from 'vitest';

import { buildBusinessLinePostRunReviewOptions } from './business-line-post-run-review.js';
import { classifyRunScope } from './run-scope.js';
import type { RunRecord } from './types/run.js';

describe('buildBusinessLinePostRunReviewOptions', () => {
  it('returns post-run review options for completed business line runs', () => {
    const run = buildRun({
      businessLineId: 'business_line_product',
      output: 'Completed launch review.',
      scope: classifyRunScope({
        businessLineId: 'business_line_product',
        taskId: 'task_1',
      }),
      status: 'completed',
    });

    const options = buildBusinessLinePostRunReviewOptions({
      run,
      taskTitle: 'Launch action',
    });

    expect(options).toMatchObject({
      businessLineId: 'business_line_product',
      sourceActionId: 'task_1',
      sourceRunId: 'run_1',
      writebackOptions: expect.arrayContaining([
        expect.objectContaining({ ready: true, type: 'business_record' }),
        expect.objectContaining({ type: 'proposed_sop_revision' }),
      ]),
    });
  });

  it('does not generate durable business review options for one-off runs', () => {
    const run = buildRun({
      businessLineId: 'business_line_product',
      output: 'Temporary answer that should not enter the business review loop.',
      scope: classifyRunScope({
        businessLineId: 'business_line_product',
        requestedScopeKind: 'one_off_non_durable_action',
        taskId: 'task_1',
      }),
      status: 'completed',
    });

    expect(buildBusinessLinePostRunReviewOptions({ run })).toBeNull();
  });
});

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    businessLineId: partial.businessLineId,
    scope: partial.scope,
    type: partial.type ?? 'draft',
    status: partial.status ?? 'running',
    instructions: partial.instructions ?? 'Run this.',
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? null,
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}
