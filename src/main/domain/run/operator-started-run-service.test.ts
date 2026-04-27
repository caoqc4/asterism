import { describe, expect, it, vi } from 'vitest';

import { buildBrowserEvidenceRunnerSmokeFixture } from '../../../shared/types/browser-evidence.js';
import { buildDefaultOperatorStartedRunRequest } from '../../../shared/types/operator-started-run.js';
import type { RunRecord } from '../../../shared/types/run.js';
import { OperatorStartedRunService } from './operator-started-run-service.js';

describe('OperatorStartedRunService', () => {
  it('runs a browser evidence smoke through Run, RunSteps, and artifact persistence', async () => {
    const fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: 'http://127.0.0.1:4173',
    });
    const runRepository = buildRunRepositoryMock();
    const taskService = buildTaskServiceMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const browserEvidencePersister = {
      persistCaptured: vi.fn().mockResolvedValue({
        artifact: {
          id: 'artifact_browser_1',
        },
      }),
    };
    const executor = vi.fn().mockResolvedValue({
      browserRequest: fixture.request,
      result: {
        artifacts: [
          {
            kind: 'screenshot',
            path: '/tmp/browser-evidence-screenshot.png',
            summary: 'Viewport screenshot captured from an isolated browser context.',
            title: 'Browser screenshot',
          },
        ],
        status: 'captured',
        summary: 'Browser evidence captured / artifacts=screenshot / credentials=no / mutation=no',
      },
    });
    const service = new OperatorStartedRunService(
      runRepository,
      taskService,
      runStepRepository,
      browserEvidencePersister,
      executor,
    );

    const completed = await service.trigger(buildDefaultOperatorStartedRunRequest({
      kind: 'browser_evidence_smoke',
      reason: 'Capture local UI evidence.',
      taskId: 'task_1',
    }));

    expect(runRepository.create).toHaveBeenCalledWith({
      instructions: 'Operator-started browser_evidence_smoke: Capture local UI evidence.',
      taskId: 'task_1',
      type: 'agent',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      output: 'descriptor=browser.readonly_evidence',
      runId: 'run_operator_1',
      status: 'completed',
      title: 'operator-started run accepted',
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      run: expect.objectContaining({ id: 'run_operator_1' }),
    }));
    expect(browserEvidencePersister.persistCaptured).toHaveBeenCalledWith({
      request: fixture.request,
      result: expect.objectContaining({
        status: 'captured',
      }),
      runId: 'run_operator_1',
      taskId: 'task_1',
    });
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_operator_1',
      'completed',
      'Browser evidence captured / artifacts=screenshot / credentials=no / mutation=no',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_operator_1');
    expect(completed).toMatchObject({
      id: 'run_operator_1',
      status: 'completed',
    });
  });

  it('marks the run failed when browser evidence is blocked', async () => {
    const fixture = buildBrowserEvidenceRunnerSmokeFixture({
      origin: 'http://127.0.0.1:4173',
    });
    const runRepository = buildRunRepositoryMock();
    const taskService = buildTaskServiceMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const service = new OperatorStartedRunService(
      runRepository,
      taskService,
      runStepRepository,
      {
        persistCaptured: vi.fn(),
      },
      vi.fn().mockResolvedValue({
        browserRequest: fixture.request,
        result: {
          blockedReasons: ['Browser evidence request URL must match an allowed origin.'],
          status: 'blocked',
          summary: 'Browser evidence request blocked.',
        },
      }),
    );

    const failed = await service.trigger(buildDefaultOperatorStartedRunRequest({
      kind: 'browser_evidence_smoke',
      taskId: 'task_1',
    }));

    expect(runStepRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({
      error: 'Browser evidence request blocked.',
      kind: 'tool_result',
      status: 'failed',
      title: 'browser evidence blocked',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_operator_1',
      'failed',
      'Browser evidence request blocked.',
      'system',
      'Browser evidence request blocked.',
    );
    expect(taskService.annotateRunFailed).toHaveBeenCalledWith(
      'task_1',
      'Browser evidence request blocked.',
      'run_operator_1',
    );
    expect(failed.status).toBe('failed');
  });

  it('rejects invalid or unsupported operator-started requests before creating a run', async () => {
    const runRepository = buildRunRepositoryMock();
    const service = new OperatorStartedRunService(
      runRepository,
      buildTaskServiceMock(),
      buildRunStepRepositoryMock(),
      {
        persistCaptured: vi.fn(),
      },
      vi.fn(),
    );

    await expect(service.trigger({
      ...buildDefaultOperatorStartedRunRequest({
        kind: 'browser_evidence_smoke',
        taskId: 'task_1',
      }),
      operatorConfirmed: false,
    })).rejects.toThrow('Operator-started run request requires explicit operator confirmation.');

    await expect(service.trigger(buildDefaultOperatorStartedRunRequest({
      kind: 'code_agent_preview',
      taskId: 'task_1',
    }))).rejects.toThrow('Operator-started run kind is not implemented: code_agent_preview.');

    expect(runRepository.create).not.toHaveBeenCalled();
  });
});

function buildRunRepositoryMock() {
  const runningRun = buildRunRecord('running');

  return {
    create: vi.fn().mockResolvedValue(runningRun),
    updateResult: vi.fn().mockImplementation(async (
      runId: string,
      status: RunRecord['status'],
      output: string | null,
      outputSource: RunRecord['outputSource'],
      failureReason: string | null = null,
    ) => ({
      ...runningRun,
      failureReason,
      id: runId,
      output,
      outputSource,
      status,
    })),
  };
}

function buildTaskServiceMock() {
  return {
    annotateRunCompleted: vi.fn(),
    annotateRunFailed: vi.fn(),
    getDetail: vi.fn().mockResolvedValue({
      id: 'task_1',
      title: 'Task 1',
    }),
  };
}

function buildRunStepRepositoryMock() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'run_step_1',
    }),
  };
}

function buildRunRecord(status: RunRecord['status']): RunRecord {
  return {
    createdAt: '2026-04-27T00:00:00.000Z',
    failureReason: null,
    id: 'run_operator_1',
    instructions: 'Operator-started browser_evidence_smoke.',
    output: null,
    outputSource: null,
    status,
    taskId: 'task_1',
    type: 'agent',
    updatedAt: '2026-04-27T00:00:00.000Z',
  };
}
