import fs from "node:fs";
import path from "node:path";
import { openDb } from "../shared/db";
import { receiptSchema } from "../shared/schemas";
import { categorize } from "./categorize";
import { searchOpenFoodFacts } from "./openFoodFacts";

const RECEIPTS_DIR = path.join("data", "receipts");

async function main() {
  const db = openDb();
  const ingested = new Set(db.prepare("SELECT source_file FROM receipts").pluck().all() as string[]);
  const pending = fs
    .readdirSync(RECEIPTS_DIR)
    .filter((f) => f.endsWith(".json") && !ingested.has(f))
    .sort();
  const file = pending[0];
  if (!file) {
    console.log("All receipts are ingested.");
    db.close();
    return;
  }

  const json = JSON.parse(fs.readFileSync(path.join(RECEIPTS_DIR, file), "utf8"));
  const parsed = receiptSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Invalid receipt ${file}: ${parsed.error.message}`);
  const receipt = parsed.data;

  const insertItem = db.prepare(`
    INSERT INTO items (name, food_group, quantity, unit, quantity_estimated,
                       off_matched, off_product_name, off_nutri_score, off_nutrients_json)
    VALUES (@name, @food_group, @quantity, @unit, @quantity_estimated,
            @off_matched, @off_product_name, @off_nutri_score, @off_nutrients_json)
  `);
  const findItem = db.prepare("SELECT id FROM items WHERE name = ?").pluck();

  let newItems = 0;
  for (const name of new Set(receipt.items.map((i) => i.name))) {
    if (findItem.get(name) !== undefined) continue;
    // Each item is stored right away, so a stopped run does not repeat its API calls.
    const category = await categorize(name);
    const off = await searchOpenFoodFacts(name);
    insertItem.run({
      name,
      food_group: category.food_group,
      quantity: category.quantity,
      unit: category.unit,
      quantity_estimated: category.quantity_estimated ? 1 : 0,
      off_matched: off ? 1 : 0,
      off_product_name: off?.productName ?? null,
      off_nutri_score: off?.nutriScore ?? null,
      off_nutrients_json: off?.nutrients ? JSON.stringify(off.nutrients) : null,
    });
    newItems++;
    console.log(`${name} -> ${category.food_group}, OFF: ${off ? "yes" : "no"}`);
  }

  const insertReceipt = db.prepare("INSERT INTO receipts (retailer, date, total, source_file) VALUES (?, ?, ?, ?)");
  const insertLine = db.prepare("INSERT INTO receipt_items (receipt_id, item_id, count, price) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    const { lastInsertRowid } = insertReceipt.run(receipt.retailer, receipt.date, receipt.total, file);
    for (const item of receipt.items) {
      insertLine.run(lastInsertRowid, findItem.get(item.name), item.count, item.price);
    }
  })();

  console.log(
    `Ingested ${file}: ${receipt.items.length} lines, ${newItems} new item names, ${pending.length - 1} receipt files left`,
  );
  db.close();
}

main();
