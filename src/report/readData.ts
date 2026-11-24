import type Database from "better-sqlite3";
import type { LineRow } from "./aggregate";

export function readLines(db: Database.Database): LineRow[] {
  const rows = db
    .prepare(
      `SELECT r.date, i.food_group, i.unit, i.quantity, ri.count, i.quantity_estimated
       FROM receipt_items ri
       JOIN receipts r ON r.id = ri.receipt_id
       JOIN items i ON i.id = ri.item_id
       WHERE i.food_group != 'non_food'`,
    )
    .all() as {
    date: string;
    food_group: LineRow["foodGroup"];
    unit: LineRow["unit"];
    quantity: number;
    count: number;
    quantity_estimated: number;
  }[];

  return rows.map((r) => ({
    date: r.date,
    foodGroup: r.food_group,
    unit: r.unit,
    quantity: r.quantity,
    count: r.count,
    quantityEstimated: r.quantity_estimated === 1,
  }));
}
