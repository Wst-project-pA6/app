import { computeReorderSuggestion } from './reorder-rule.util';

describe('computeReorderSuggestion', () => {
  it('suggests maxLevel minus (available + open PO quantity)', () => {
    const result = computeReorderSuggestion({
      onHand: 5, reserved: 1, minLevel: 10, maxLevel: 30, openPurchaseOrderQuantity: 4, averageWeeklyConsumption: '2.00',
    });
    // available = 5 - 1 = 4; 4 + 4 = 8 <= minLevel 10 (caller-guaranteed trigger condition)
    // suggestedQuantity = 30 - (4 + 4) = 22
    expect(result.suggestedQuantity).toBe(22);
  });

  it('clamps suggestedQuantity to at least 1, never zero or negative', () => {
    const result = computeReorderSuggestion({
      onHand: 10, reserved: 0, minLevel: 10, maxLevel: 10, openPurchaseOrderQuantity: 0, averageWeeklyConsumption: '0',
    });
    // available=10, maxLevel-available = 0 -> clamped to 1
    expect(result.suggestedQuantity).toBe(1);
  });

  it('computes estimatedWeeksOfCover as available / averageWeeklyConsumption when consumption is positive', () => {
    const result = computeReorderSuggestion({
      onHand: 20, reserved: 0, minLevel: 10, maxLevel: 30, openPurchaseOrderQuantity: 0, averageWeeklyConsumption: '5.00',
    });
    expect(result.estimatedWeeksOfCover).toBe('4.00');
  });

  it('omits estimatedWeeksOfCover when average weekly consumption is zero', () => {
    const result = computeReorderSuggestion({
      onHand: 20, reserved: 0, minLevel: 10, maxLevel: 30, openPurchaseOrderQuantity: 0, averageWeeklyConsumption: '0',
    });
    expect(result.estimatedWeeksOfCover).toBeUndefined();
  });
});
