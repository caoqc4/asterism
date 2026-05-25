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
  });

  it('normalizes task and prompt parts for shared runtime decisions', () => {
    expect(buildRuntimeResearchIntentText(['  A  ', null, 'B\nC'])).toBe('A B C');
    expect(buildRuntimeResearchIntentText('  A\n B  ')).toBe('A B');
  });
});
