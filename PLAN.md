# PLAN.md: Bontrend

Work through the phases in order. `CLAUDE.md` defines the stack, scope and conventions, and this file defines the tasks. Anything listed as out of scope in `CLAUDE.md` is not built.

## Phase 1: Setup

**Tasks**

1. Initialize the npm package with TypeScript. Dependencies: `better-sqlite3`, `zod`, `@anthropic-ai/sdk`, `dotenv`. Dev dependencies: `tsx`, `vitest`, `typescript`, and the type packages needed.
2. Create `tsconfig.json`, `.gitignore` (`.env`, `node_modules/`, `data/`, `reports/`) and `.env.example` with `ANTHROPIC_API_KEY=`.
3. Create the folder structure from the project structure section in `CLAUDE.md`, with empty entry points in `src/generate`, `src/ingest` and `src/report`.
4. Add the npm scripts `generate`, `ingest`, `report` and `test`.
5. Write `src/shared/foodGroups.ts`: the 12 German food groups plus `non_food`, exported as a constant and a type.
6. Write `src/shared/schemas.ts`:
   - Receipt schema: `retailer`, `date`, `total`, `items` (each with `name`, `count`, `price`).
   - Categorization response schema: `food_group` (one of the 13 values), `quantity` (positive number or null), `unit` (`kg`, `l` or null), `quantity_estimated`.
7. Write `src/shared/db.ts`: opens `data/mvp.sqlite` and creates the tables `items`, `receipts` and `receipt_items` if they do not exist. In `items`, `quantity` and `unit` are nullable.
8. Write `src/shared/anthropic.ts`: the API client, reading `ANTHROPIC_API_KEY` from `.env`.

**Done when**

- `npm run generate`, `npm run ingest` and `npm run report` each start and exit without error.
- `npm test` runs.
- Running any script creates `data/mvp.sqlite` with the three empty tables.

---

## Phase 2: Generate

**Tasks**

1. Write `src/generate/catalogue.ts`: a hand-written list of roughly 80 to 120 receipt-style German item names, each with a base price and an internal food group. Cover all 12 groups plus a few non-food items. Include some names without a size (e.g. "EIER 10ER", "BROT"). The internal group is never written to the output files.
2. Write `src/generate/patterns.ts`: a base purchase probability per group per trip. No trends, seasonality or events.
3. Write `src/generate/index.ts`:
   - A fixed seed and a fixed start date, both as config constants. The start date is the first day of a month, and the generator covers that one calendar month.
   - A seeded random number generator (a small hand-written one, no extra dependency), so the same seed produces the same files.
   - Per week, 1 to 3 shopping trips, each with 5 to 25 items drawn from the catalogue according to the pattern probabilities.
   - Retailers: 3 to 4 German supermarket names, chosen per trip.
   - Prices: base price with small random variation. `total` is the sum of the line prices.
   - One JSON file per receipt in `data/receipts/`, with `retailer`, `date`, `total`, `items` (`name`, `count`, `price`).
4. Each run first empties `data/receipts/`, so old files never mix with new ones.

**Done when**

- `npm run generate` writes receipt files covering one calendar month, starting on the configured start date.
- Running it twice produces identical files.
- Every file passes the receipt Zod schema from `schemas.ts`.
- No file contains a food group, quantity or unit.

**AI Act**

- Nothing to flag. No LLM is involved in this phase.

---

## Phase 3: Ingest

**Tasks**

1. Write `src/ingest/categorize.ts`:
   - One function that takes an item name and makes one Claude call (`claude-sonnet-5-5`).
   - The prompt contains the item name, the 12 German food groups plus `non_food`, and the quantity rules: normalize to kg or l, and estimate a typical size if the name has none.
   - The response is JSON only. It is parsed and validated with the categorization Zod schema from `schemas.ts`. Any failure throws and stops the run.
   - For `non_food`, `quantity` and `unit` are null.
2. Write `src/ingest/openFoodFacts.ts`:
   - One function that takes an item name, queries the Open Food Facts search endpoint, and returns the first result or null.
   - Sets a custom `User-Agent` header.
   - Returns product name, Nutri-Score and the raw nutrient data when there is a match.
   - Waits a fixed delay (12 seconds) between requests. A 503 is retried up to 5 times, 20 seconds apart. Any other failure, or a 503 after the last retry, stops the run.
3. Write `src/ingest/index.ts`:
   - Each run processes one receipt: list the JSON files in `data/receipts/` in name order and pick the first one whose file name is not yet in `receipts.source_file`. If there is none, log that all receipts are ingested and exit.
   - Validate that file with the receipt Zod schema. Any failure stops the run.
   - For each unique item name on the receipt not yet in `items`, call `categorize` and `openFoodFacts` sequentially, then insert one row into `items` (including `off_matched` and the `off_` fields).
   - Insert the receipt into `receipts` (with `source_file`) and its lines into `receipt_items`, referencing `items` by `item_id`, inside one SQLite transaction.
4. Log one line per new item name (name, assigned group, OFF matched yes or no) and a final summary: the ingested file, its number of lines, new item names, and how many receipt files are still left.

**Done when**

- Each `npm run ingest` after `npm run generate` stores exactly one new receipt with its lines, and creates `items` rows only for names not seen before.
- Running `ingest` once per receipt file stores every receipt once. One more run after that stores nothing and logs that all receipts are ingested.
- `items` has exactly one row per unique item name.
- Every `food_group` is one of the 13 allowed values, and `non_food` rows have null `quantity` and `unit`.
- Items without a size in the name have `quantity_estimated = 1`.
- A receipt whose item names are all in `items` already is stored without any Claude or Open Food Facts call.

**AI Act**

- Claude classifies item names here, which is not generated content for readers, so Article 50 does not apply. Nothing further to flag.

---

## Phase 4: Report

**Tasks**

1. Write `src/report/aggregate.ts` as pure functions with no database or API access:
   - Aggregation: quantity per `food_group`, `unit` and period, for every month and every quarter. A line's quantity is `items.quantity * receipt_items.count`. `non_food` is excluded.
   - Change calculation: for each series, the absolute and percentage change from one period to the next (month over month, quarter over quarter). If the previous period is 0, the percentage change is null.
   - Estimate share: for each series and period, the share of the quantity that comes from items with `quantity_estimated = 1`.
2. Write `src/report/aggregate.test.ts` with Vitest and fixed inputs. It covers aggregation, change calculation (including the previous-period-zero case) and estimate share. Nothing else is tested in the MVP.
3. Write `src/report/readData.ts`: reads the joined data from SQLite (receipt date, `food_group`, `unit`, `quantity`, `count`, `quantity_estimated`) and returns it in the shape `aggregate.ts` expects.
4. Write `src/report/writeReport.ts`:
   - Sends the pre-aggregated tables as JSON to Claude (`claude-sonnet-5-5`). No raw receipts, no prices, no Open Food Facts data.
   - The prompt rules are those in the report section of `CLAUDE.md`: German, trends and anomalies only, no recommendations or judgments, no DGE comparison, the limitation statements (seasonality and trend not separable within the available data, estimated quantities, l and kg not comparable, five added groups without DGE counterpart), no claimed causes.
   - Writes the file to `reports/report-{timestamp_of_run}.md`, timestamp format `YYYY-MM-DDTHH-mm-ss`. Creates `reports/` if it does not exist.
   - Code writes this notice at the top of the file, before Claude's text: "Hinweis: Dieser Bericht wurde von einem KI-Modell (Claude) erstellt und nicht manuell geprüft."
5. Write `src/report/index.ts`: reads the data, runs the aggregation, calls `writeReport`, and logs the path of the written file.

**Done when**

- `npm test` passes.
- `npm run report` after `npm run ingest` writes a new file in `reports/`, and a second run writes a second file.
- The file starts with the AI-generated notice.
- The report covers the periods present in the data. With only one period, it says that no changes between periods can be shown yet.
- The report contains no recommendations and no judgments such as "zu viel" or "Schwachstelle".
- The report contains all required limitation statements.

**AI Act**

- Article 50: the report is LLM-generated text, and the notice is written by code so the model cannot omit it. If the report is ever shared with others, check that the notice stays visible.
