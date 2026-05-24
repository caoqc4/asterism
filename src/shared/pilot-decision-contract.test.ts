import { describe, expect, it } from 'vitest';

import {
  classifyPilotMessagePriority,
  evaluatePilotDecision,
  highestPriorityLane,
  selectPilotDecisionBackend,
} from './pilot-decision-contract.js';

describe('Pilot Decision Contract', () => {
  it('treats user corrections as steer events without turning Pilot into the executor', () => {
    const decision = evaluatePilotDecision({
      entrypoint: 'right_panel_chat',
      hasTaskContext: true,
      prompt: '不对，先改成基础教程和案例展示，不要继续问目录结构。',
      runtime: { agentCliReady: true },
      selectedCliRuntime: 'codex',
      task: {
        nextStep: '明确网站目标和范围。',
        summary: 'Codex 基础教程网站。',
        title: '明确网站目标与范围',
      },
    });

    expect(decision.role).toBe('pilot');
    expect(decision.messagePriority).toBe('steer');
    expect(decision.backend).toBe('codex_cli');
    expect(decision.operationMode).toBe('bounded_decision_backend');
    expect(decision.executor).toBe('codex_cli');
    expect(decision.requiredRules).toContain('pilot.decision_contract');
    expect(decision.requiredRules).toContain('agent.execution_rules');
  });

  it('routes user-owned high-risk boundaries to human review', () => {
    const decision = evaluatePilotDecision({
      entrypoint: 'right_panel_chat',
      hasTaskContext: true,
      prompt: '是否允许直接部署到生产环境？',
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      task: {
        nextStep: '确认发布方式。',
        riskLevel: 'high',
        riskNote: '生产部署需要用户授权。',
        title: '发布站点',
      },
    });

    expect(decision.messagePriority).toBe('escalate');
    expect(decision.executor).toBe('human');
    expect(decision.operationMode).not.toBe('persistent_ai_pilot_reserved');
    expect(decision.priorityLane).toBe('escalate_now');
    expect(decision.shouldStartExecutor).toBe(false);
  });

  it('does not treat every high-risk task message as an escalation', () => {
    const decision = evaluatePilotDecision({
      entrypoint: 'right_panel_chat',
      hasTaskContext: true,
      prompt: '先做只读风险检查。',
      runtime: { agentCliReady: true },
      selectedCliRuntime: 'codex',
      task: {
        nextStep: '复核董事会材料。',
        riskLevel: 'high',
        riskNote: '需要高管过目。',
        title: '董事会材料修订',
      },
    });

    expect(decision.messagePriority).toBe('follow_up');
    expect(decision.priorityLane).toBe('escalate_now');
    expect(decision.executor).toBe('codex_cli');
  });

  it('keeps ordinary project context words out of escalation detection', () => {
    expect(classifyPilotMessagePriority({
      prompt: '上线项目里先切换到下一项界面设计。',
    })).toBe('follow_up');
    expect(classifyPilotMessagePriority({
      prompt: '这轮需要保留法务意见和风险说明。',
    })).toBe('follow_up');
  });

  it('uses API or CLI as a Pilot DecisionBackend when multi-task coordination is ambiguous', () => {
    const apiDecision = evaluatePilotDecision({
      availableDecisionBackends: ['rules', 'agent_api', 'codex_cli'],
      entrypoint: 'right_panel_chat',
      hasTaskContext: true,
      multiTaskCandidateCount: 3,
      prompt: '现在应该先推进哪个任务？',
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      task: {
        nextStep: '选择当前焦点。',
        title: '多任务排序',
      },
    });

    expect(apiDecision.backend).toBe('agent_api');
    expect(apiDecision.operationMode).toBe('bounded_decision_backend');
    expect(apiDecision.requiredRules).toContain('priority.attention_routing');

    expect(selectPilotDecisionBackend({
      availableBackends: ['rules', 'claude_cli'],
      needsModelJudgment: true,
      runtime: { agentCliReady: true },
      selectedCliRuntime: 'claude',
    })).toBe('claude_cli');
  });

  it('keeps context refresh as a local handoff movement with memory rules', () => {
    const decision = evaluatePilotDecision({
      entrypoint: 'context_refresh',
      hasTaskContext: true,
      prompt: '先保全并刷新当前任务会话。',
      task: {
        nextStep: '继续推进。',
        title: '上下文管理',
      },
    });

    expect(decision.movement).toBe('handoff');
    expect(decision.executor).toBe('local_rule');
    expect(decision.operationMode).toBe('product_control_layer');
    expect(decision.requiredRules).toContain('context.transition_policy');
    expect(decision.requiredRules).toContain('task.memory_rules');
  });

  it('exposes shared priority lane ordering for Brief and Pilot', () => {
    expect(highestPriorityLane(['steady', 'continue_or_review', 'unblock_or_decide'])).toBe('unblock_or_decide');
    expect(classifyPilotMessagePriority({
      prompt: '继续推进前先确认是否允许正式发布。',
      priorityLane: 'escalate_now',
    })).toBe('escalate');
  });
});
