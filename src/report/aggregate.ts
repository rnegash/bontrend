import type { FoodGroup } from "../shared/foodGroups";

export type Unit = "kg" | "l";
export type Granularity = "month" | "quarter";

/** One receipt line joined with its item. */
export type LineRow = {
  date: string; // ISO date, YYYY-MM-DD
  foodGroup: FoodGroup;
  unit: Unit | null;
  quantity: number | null; // per unit bought, null for non_food
  count: number;
  quantityEstimated: boolean;
};

export type PeriodTotal = {
  foodGroup: FoodGroup;
  unit: Unit;
  period: string; // "2025-01" or "2025-Q1"
  quantity: number;
  estimateShare: number | null; // null when the quantity is 0
};

export type PeriodChange = {
  foodGroup: FoodGroup;
  unit: Unit;
  from: string;
  to: string;
  absoluteChange: number;
  percentChange: number | null; // null when the previous period is 0
};

export function periodOf(date: string, granularity: Granularity): string {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  return granularity === "month"
    ? `${year}-${String(month).padStart(2, "0")}`
    : `${year}-Q${Math.ceil(month / 3)}`;
}

/** Every calendar period from the one containing `first` to the one containing `last`, in order. */
export function periodsBetween(first: string, last: string, granularity: Granularity): string[] {
  const step = granularity === "month" ? 1 : 3;
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  month -= (month - 1) % step; // first month of the period
  const end = periodOf(last, granularity);
  const periods: string[] = [];
  for (;;) {
    const period = periodOf(`${year}-${String(month).padStart(2, "0")}-01`, granularity);
    periods.push(period);
    if (period === end) return periods;
    month += step;
    if (month > 12) {
      month -= 12;
      year++;
    }
  }
}

/**
 * Sums `quantity * count` per food group, unit and period, excluding non_food.
 * Every series gets a row for every period in the data range, with 0 where nothing was bought,
 * so that changes between periods also cover periods without purchases.
 */
export function aggregate(rows: LineRow[], granularity: Granularity): PeriodTotal[] {
  const food = rows.filter((r) => r.foodGroup !== "non_food" && r.quantity !== null && r.unit !== null);
  if (food.length === 0) return [];

  const dates = food.map((r) => r.date).sort();
  const periods = periodsBetween(dates[0], dates[dates.length - 1], granularity);

  const sums = new Map<string, { total: number; estimated: number }>();
  const series = new Map<string, { foodGroup: FoodGroup; unit: Unit }>();
  for (const r of food) {
    const seriesKey = `${r.foodGroup}|${r.unit}`;
    series.set(seriesKey, { foodGroup: r.foodGroup, unit: r.unit! });
    const key = `${seriesKey}|${periodOf(r.date, granularity)}`;
    const sum = sums.get(key) ?? { total: 0, estimated: 0 };
    const lineQuantity = r.quantity! * r.count;
    sum.total += lineQuantity;
    if (r.quantityEstimated) sum.estimated += lineQuantity;
    sums.set(key, sum);
  }

  const result: PeriodTotal[] = [];
  for (const [seriesKey, { foodGroup, unit }] of [...series].sort(([a], [b]) => a.localeCompare(b))) {
    for (const period of periods) {
      const sum = sums.get(`${seriesKey}|${period}`) ?? { total: 0, estimated: 0 };
      result.push({
        foodGroup,
        unit,
        period,
        quantity: sum.total,
        estimateShare: sum.total > 0 ? sum.estimated / sum.total : null,
      });
    }
  }
  return result;
}

/** Change from each period to the next within each series. Expects the output of `aggregate`. */
export function periodChanges(totals: PeriodTotal[]): PeriodChange[] {
  const changes: PeriodChange[] = [];
  for (let i = 1; i < totals.length; i++) {
    const prev = totals[i - 1];
    const curr = totals[i];
    if (prev.foodGroup !== curr.foodGroup || prev.unit !== curr.unit) continue;
    changes.push({
      foodGroup: curr.foodGroup,
      unit: curr.unit,
      from: prev.period,
      to: curr.period,
      absoluteChange: curr.quantity - prev.quantity,
      percentChange: prev.quantity === 0 ? null : ((curr.quantity - prev.quantity) / prev.quantity) * 100,
    });
  }
  return changes;
}
