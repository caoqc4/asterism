import type { BusinessLineCreationTemplate } from './types/business-line.js';

export type BusinessLineCreationDraftInput = {
  aiWorkAndConfirmation?: string | null;
  continuousInformation?: string | null;
  desiredOutcome?: string | null;
  template?: BusinessLineCreationTemplate | null;
  title?: string | null;
};

export type BusinessLineCreationDraft = {
  initialNextActions: string[];
  initialRecords: string[];
  initialStructure: string[];
  proposedSops: string[];
  reviewPrompts: string[];
};

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function withFallback(value: string | null | undefined, fallback: string): string {
  return compact(value) ?? fallback;
}

export function buildBusinessLineCreationDraft(input: BusinessLineCreationDraftInput): BusinessLineCreationDraft {
  const template = input.template ?? 'custom';
  const title = withFallback(input.title, 'New business line');
  const outcome = withFallback(input.desiredOutcome, 'Make this business line measurably better.');
  const continuousInformation = withFallback(
    input.continuousInformation,
    'Record material signals, decisions, actions, results, and review evidence as they happen.',
  );
  const aiBoundary = withFallback(
    input.aiWorkAndConfirmation,
    'AI can draft, synthesize, and propose next actions; human confirmation is required for irreversible or risky changes.',
  );

  if (template === 'web_product') {
    return {
      initialStructure: [
        `Outcome target: ${outcome}`,
        'Customer/problem signals',
        'Product surface, release notes, and experiment backlog',
        'Decision log and risk register',
        'Metrics, feedback, and result evidence',
      ],
      initialRecords: [
        `Template: Web Product / Software Product for ${title}`,
        `Outcome that would make this better: ${outcome}`,
        `Information to record continuously: ${continuousInformation}`,
        `AI work and confirmation boundary: ${aiBoundary}`,
      ],
      initialNextActions: [
        'Capture the current user problem, product surface, and one success metric.',
      ],
      reviewPrompts: [
        'What user, market, or product signal changed?',
        'What shipped or changed in the product?',
        'What metric, feedback, decision, or risk should change the next action?',
        'What SOP should be updated before the next cycle?',
      ],
      proposedSops: [
        'Before suggesting product work, check the current outcome, latest customer signal, open decision, and release evidence.',
        'AI may draft specs, tests, release notes, and synthesis; human confirmation is required before publishing, deploying, changing pricing, or changing policy.',
        'Every completed product action should end with a short review: result, evidence, changed hypothesis, next action, and possible SOP update.',
      ],
    };
  }

  return {
    initialStructure: [
      `Outcome target: ${outcome}`,
      `Continuous records: ${continuousInformation}`,
      `AI and confirmation boundary: ${aiBoundary}`,
    ],
    initialRecords: [
      `Custom business line: ${title}`,
      `Outcome that would make this better: ${outcome}`,
      `Information to record continuously: ${continuousInformation}`,
      `AI work and confirmation boundary: ${aiBoundary}`,
    ],
    initialNextActions: [
      'Capture the first operating record and define the next action.',
    ],
    reviewPrompts: [
      'What changed since the last action?',
      'What evidence supports that result?',
      'What hypothesis or plan should change?',
      'What next action or SOP update should be proposed?',
    ],
    proposedSops: [
      'Before suggesting next actions, check the recorded outcome, latest signals, open decisions, and confirmation boundaries.',
      'After each meaningful action, record result, evidence, changed hypothesis, next action, and any SOP update.',
    ],
  };
}

export function normalizeBusinessLineCreationLines(lines: string[] | null | undefined): string[] {
  return (lines ?? []).map((line) => line.trim()).filter(Boolean);
}
