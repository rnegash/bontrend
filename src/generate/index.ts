import fs from "node:fs";
import path from "node:path";
import { FOOD_GROUPS, type FoodGroup } from "../shared/foodGroups";
import { receiptSchema, type Receipt } from "../shared/schemas";
import { CATALOGUE, type CatalogueItem } from "./catalogue";
import { BASE_LINES_PER_TRIP } from "./patterns";

const SEED = 20250101;
const START_DATE = "2025-01-01"; // first day of the one generated month
const OUT_DIR = path.join("data", "receipts");
const RETAILERS = ["REWE", "EDEKA", "ALDI SUED", "LIDL"];
const MIN_ITEMS = 2;
const MAX_ITEMS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// mulberry32: small seeded PRNG returning floats in [0, 1).
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(SEED);
const randInt = (min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;
const toIso = (d: Date) => d.toISOString().slice(0, 10);

function pickDistinct<T>(list: T[], n: number): T[] {
  const pool = [...list];
  const result: T[] = [];
  while (result.length < n && pool.length > 0) {
    result.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return result;
}

const itemsByGroup = new Map<FoodGroup, CatalogueItem[]>(
  FOOD_GROUPS.map((group) => [
    group,
    CATALOGUE.filter((item) => item.group === group),
  ]),
);

function line(item: CatalogueItem, count: number) {
  const unitPrice = item.basePrice * (0.9 + rng() * 0.2);
  return { name: item.name, count, price: round2(unitPrice * count) };
}

function normalCount(): number {
  const r = rng();
  return r < 0.75 ? 1 : r < 0.95 ? 2 : 3;
}

function drawTripItems(): CatalogueItem[] {
  // Resample until the trip size is within bounds, so the sequence stays deterministic.
  for (;;) {
    const tripSize = 0.4 + rng() * 1.3;
    const items: CatalogueItem[] = [];
    for (const group of FOOD_GROUPS) {
      const expected = BASE_LINES_PER_TRIP[group] * tripSize;
      const lines = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
      items.push(...pickDistinct(itemsByGroup.get(group)!, lines));
    }
    if (items.length >= MIN_ITEMS && items.length <= MAX_ITEMS) return items;
  }
}

function buildReceipt(date: string, lines: Receipt["items"]): Receipt {
  const receipt = {
    retailer: pick(RETAILERS),
    date,
    total: round2(lines.reduce((sum, l) => sum + l.price, 0)),
    items: lines,
  };
  return receiptSchema.parse(receipt);
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const start = new Date(`${START_DATE}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1); // exclusive
  const totalDays = (end.getTime() - start.getTime()) / DAY_MS;

  const receipts: Receipt[] = [];
  for (let weekStart = 0; weekStart < totalDays; weekStart += 7) {
    const offsets = pickDistinct([0, 1, 2, 3, 4, 5, 6], randInt(1, 3)).sort(
      (a, b) => a - b,
    );
    for (const offset of offsets) {
      const dayIndex = weekStart + offset;
      if (dayIndex >= totalDays) continue;
      const date = toIso(new Date(start.getTime() + dayIndex * DAY_MS));
      receipts.push(
        buildReceipt(
          date,
          drawTripItems().map((item) => line(item, normalCount())),
        ),
      );
    }
  }

  receipts.forEach((receipt, i) => {
    const file = `receipt-${String(i + 1).padStart(4, "0")}-${receipt.date}.json`;
    fs.writeFileSync(
      path.join(OUT_DIR, file),
      JSON.stringify(receipt, null, 2) + "\n",
    );
  });

  console.log(
    `Wrote ${receipts.length} receipts to ${OUT_DIR} (${START_DATE} to ${toIso(new Date(end.getTime() - DAY_MS))})`,
  );
}

main();
