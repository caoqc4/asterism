export type ProcessTemplateSelectionInput<T extends { id: string }> = {
  candidates: T[];
  shouldUse: boolean;
  selectedTemplateIds: string[];
  reason: string;
  emptySelectionReason?: string;
};

export type ProcessTemplateSelectionNormalization<T extends { id: string }> = {
  shouldUse: boolean;
  selectedTemplates: T[];
  reason: string;
};

export function normalizeProcessTemplateSelection<T extends { id: string }>(
  input: ProcessTemplateSelectionInput<T>,
): ProcessTemplateSelectionNormalization<T> {
  const reason = input.reason.trim() || '未说明选择原因。';
  const selectedIdSet = new Set(input.selectedTemplateIds);
  const selectedTemplates = input.candidates.filter((item) => selectedIdSet.has(item.id));
  const shouldUse = input.shouldUse && selectedTemplates.length > 0;

  if (!shouldUse) {
    return {
      shouldUse: false,
      selectedTemplates: [],
      reason: input.shouldUse && selectedTemplates.length === 0
        ? input.emptySelectionReason ?? reason
        : reason,
    };
  }

  return {
    shouldUse: true,
    selectedTemplates,
    reason,
  };
}
