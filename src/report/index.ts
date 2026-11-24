import { openDb } from "../shared/db";
import { aggregate, periodChanges } from "./aggregate";
import { readLines } from "./readData";
import { writeReport } from "./writeReport";

async function main() {
  const db = openDb();
  const lines = readLines(db);
  db.close();
  if (lines.length === 0) throw new Error("No ingested receipts with food items. Run npm run ingest first.");

  const dates = lines.map((l) => l.date).sort();
  const months = aggregate(lines, "month");
  const quarters = aggregate(lines, "quarter");
  const file = await writeReport({
    dataRange: { from: dates[0], to: dates[dates.length - 1] },
    months,
    quarters,
    monthChanges: periodChanges(months),
    quarterChanges: periodChanges(quarters),
  });
  console.log(`Report written to ${file}`);
}

main();
