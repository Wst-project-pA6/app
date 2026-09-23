export interface ReorderRuleInput {
  onHand: number;
  reserved: number;
  minLevel: number;
  maxLevel: number;
  openPurchaseOrderQuantity: number;
  averageWeeklyConsumption: string;
}

export interface ReorderRuleResult {
  suggestedQuantity: number;
  estimatedWeeksOfCover?: string;
}

/**
 * Deterministic reorder rule baseline (WST-FR-14): "when available + open purchase order
 * quantity is at or below minLevel, suggest maxLevel minus (available + open purchase order
 * quantity)". Callers only invoke this for candidates that already satisfy the trigger condition
 * (see ReorderBaselineRepository.findCandidates), so suggestedQuantity is always clamped to at
 * least 1 (the contract's minimum) rather than a non-positive number.
 */
export function computeReorderSuggestion(input: ReorderRuleInput): ReorderRuleResult {
  const available = input.onHand - input.reserved;
  const rawSuggestion = input.maxLevel - (available + input.openPurchaseOrderQuantity);
  const suggestedQuantity = Math.max(1, rawSuggestion);

  const weeklyConsumption = Number(input.averageWeeklyConsumption);
  const estimatedWeeksOfCover = weeklyConsumption > 0 ? (available / weeklyConsumption).toFixed(2) : undefined;

  return { suggestedQuantity, estimatedWeeksOfCover };
}
