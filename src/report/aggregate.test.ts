import { describe, expect, it } from "vitest";
import { aggregate, periodChanges, type LineRow } from "./aggregate";

const line = (over: Partial<LineRow>): LineRow => ({
  date: "2025-01-10",
  foodGroup: "Obst",
  unit: "kg",
  quantity: 1,
  count: 1,
  quantityEstimated: false,
  ...over,
});

const find = (totals: ReturnType<typeof aggregate>, group: string, unit: string, period: string) =>
  totals.find((t) => t.foodGroup === group && t.unit === unit && t.period === period);

describe("aggregate", () => {
  it("sums quantity times count per group, unit and month, keeps kg and l apart and drops non_food", () => {
    const totals = aggregate(
      [
        line({ quantity: 0.5, count: 3 }),
        line({ quantity: 1, count: 2 }),
        line({ foodGroup: "Getränke", unit: "l", quantity: 1.5, count: 2 }),
        line({ foodGroup: "Getränke", unit: "kg", quantity: 0.5, count: 1 }),
        line({ foodGroup: "non_food", unit: null, quantity: null, count: 4 }),
      ],
      "month",
    );

    expect(totals).toHaveLength(3);
    expect(find(totals, "Obst", "kg", "2025-01")?.quantity).toBeCloseTo(3.5);
    expect(find(totals, "Getränke", "l", "2025-01")?.quantity).toBeCloseTo(3);
    expect(find(totals, "Getränke", "kg", "2025-01")?.quantity).toBeCloseTo(0.5);
  });

  it("groups months into calendar quarters", () => {
    const totals = aggregate(
      [line({ date: "2025-01-05" }), line({ date: "2025-03-31" }), line({ date: "2025-04-01", count: 5 })],
      "quarter",
    );

    expect(totals.map((t) => [t.period, t.quantity])).toEqual([
      ["2025-Q1", 2],
      ["2025-Q2", 5],
    ]);
  });

  it("fills periods without purchases with 0 across the whole data range", () => {
    const totals = aggregate(
      [line({ date: "2025-01-10" }), line({ foodGroup: "Alkohol", unit: "l", date: "2025-03-10" })],
      "month",
    );

    expect(totals.filter((t) => t.foodGroup === "Obst").map((t) => [t.period, t.quantity])).toEqual([
      ["2025-01", 1],
      ["2025-02", 0],
      ["2025-03", 0],
    ]);
  });

  it("computes the estimate share per series and period, null when nothing was bought", () => {
    const totals = aggregate(
      [
        line({ date: "2025-01-10", quantity: 0.5, count: 2, quantityEstimated: true }),
        line({ date: "2025-01-12", quantity: 3, count: 1 }),
        line({ date: "2025-03-01", quantity: 1, count: 1, quantityEstimated: true }),
      ],
      "month",
    );

    expect(find(totals, "Obst", "kg", "2025-01")?.estimateShare).toBeCloseTo(0.25);
    expect(find(totals, "Obst", "kg", "2025-02")?.estimateShare).toBeNull();
    expect(find(totals, "Obst", "kg", "2025-03")?.estimateShare).toBe(1);
  });
});

describe("periodChanges", () => {
  it("computes absolute and percentage changes per series, null percentage after a zero period", () => {
    const totals = aggregate(
      [
        line({ date: "2025-01-10", count: 2 }),
        line({ date: "2025-03-10", count: 3 }),
        line({ date: "2025-04-10", count: 6 }),
        line({ foodGroup: "Alkohol", unit: "l", date: "2025-04-10" }),
      ],
      "month",
    );

    const obst = periodChanges(totals).filter((c) => c.foodGroup === "Obst");
    expect(obst.map((c) => [c.from, c.to, c.absoluteChange, c.percentChange])).toEqual([
      ["2025-01", "2025-02", -2, -100],
      ["2025-02", "2025-03", 3, null],
      ["2025-03", "2025-04", 3, 100],
    ]);
    // No change pairs across two different series.
    expect(periodChanges(totals)).toHaveLength(6);
  });
});
