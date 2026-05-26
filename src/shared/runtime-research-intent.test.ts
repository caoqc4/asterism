import { describe, expect, it } from 'vitest';

import {
  buildRuntimeResearchIntentText,
  evaluateRuntimeResearchIntent,
} from './runtime-research-intent.js';

describe('evaluateRuntimeResearchIntent', () => {
  it('detects external tutorial research needs', () => {
    const intent = evaluateRuntimeResearchIntent('做一个 Codex 基础教程网站，参考官方文档和案例。');

    expect(intent.shouldUseExternalResearch).toBe(true);
    expect(intent.localWorkspaceOnly).toBe(false);
  });

  it('keeps local workspace search out of external research', () => {
    const intent = evaluateRuntimeResearchIntent('请搜索本地工作区里的 TaskAdvancementOrchestrator 实现。');

    expect(intent.localWorkspaceOnly).toBe(true);
    expect(intent.shouldUseExternalResearch).toBe(false);
  });

  it('does not treat runtime names or current-task wording as external research', () => {
    expect(evaluateRuntimeResearchIntent('用 Codex CLI 检查下一步。').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('让 Claude Code 继续当前任务。').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('检查当前任务下一步。').shouldUseExternalResearch).toBe(false);
  });

  it('still treats product documentation and best-practice requests as external research', () => {
    expect(evaluateRuntimeResearchIntent('整理 Codex CLI 官方文档和最佳实践。').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('比较 Claude Code release notes。').shouldUseExternalResearch).toBe(true);
  });

  it('treats latest current and pricing requests as fresh external research', () => {
    expect(evaluateRuntimeResearchIntent('Check the latest model pricing before drafting the plan.').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('Review current API status and recent release changes.').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('比较 2026 年最新模型定价。').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('确认目前 API 价格和限制。').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('查看现在的官方文档状态。').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('结合本地实现，确认目前 OpenAI API 限制。').shouldUseExternalResearch).toBe(true);
    expect(evaluateRuntimeResearchIntent('Check the current OpenAI API rate limits before changing the integration.').shouldUseExternalResearch).toBe(true);
  });

  it('does not treat current task wording as fresh external research', () => {
    expect(evaluateRuntimeResearchIntent('Continue the current task and summarize the next step.').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('Review the current API implementation in this repo.').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('检查当前任务下一步。').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('分析现在本地实现状态。').shouldUseExternalResearch).toBe(false);
  });

  it('does not treat local docs folders as external documentation research', () => {
    const intent = evaluateRuntimeResearchIntent('请搜索本地 docs 文件夹里的 API 说明。');

    expect(intent.localWorkspaceOnly).toBe(true);
    expect(intent.shouldUseExternalResearch).toBe(false);
  });

  it('lets explicit external intent override local workspace wording', () => {
    const intent = evaluateRuntimeResearchIntent('检查本地实现，并联网查看官方文档是否有最新 API 变化。');

    expect(intent.localWorkspaceSignal).toBe(true);
    expect(intent.explicitExternalResearch).toBe(true);
    expect(intent.shouldUseExternalResearch).toBe(true);
  });

  it('treats latest public API changes as external even when local context is mentioned', () => {
    const intent = evaluateRuntimeResearchIntent('结合本地实现，检查最新 API 变化。');

    expect(intent.explicitExternalResearch).toBe(true);
    expect(intent.shouldUseExternalResearch).toBe(true);
  });

  it('honors explicit research opt-outs', () => {
    const intent = evaluateRuntimeResearchIntent('不要联网，只根据当前仓库代码继续分析。');

    expect(intent.declined).toBe(true);
    expect(intent.shouldUseExternalResearch).toBe(false);

    expect(evaluateRuntimeResearchIntent('不用搜索，直接根据本地实现分析最新 API 变化。').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('别联网，整理目前 OpenAI API 限制。').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('不需要联网，按已有 Source Context 总结当前价格。').shouldUseExternalResearch).toBe(false);
    expect(evaluateRuntimeResearchIntent('Summarize current pricing without web research.').shouldUseExternalResearch).toBe(false);
  });

  it('normalizes task and prompt parts for shared runtime decisions', () => {
    expect(buildRuntimeResearchIntentText(['  A  ', null, 'B\nC'])).toBe('A B C');
    expect(buildRuntimeResearchIntentText('  A\n B  ')).toBe('A B');
  });
});
