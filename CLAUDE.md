# CLAUDE.md: Bontrend

## Workflow

- `GOALS.md` holds the end criteria for the whole project. Every daily plan works toward them.
- Each working day starts by agreeing on a goal for the day and writing it as a plan in `PLAN.md`.
- When a plan is finished, move it to `archive/` as `archive/YYYY-MM-DD-{short-topic}.md`, using the date the plan was started.
- Where this file conflicts with `GOALS.md`, `GOALS.md` wins, and this file is updated as part of that day's plan.

## 1. Project overview

Bontrend is a minimal MVP that turns mock supermarket receipts into a long-term trend report on food purchases. It runs locally in TypeScript as three scripts, one after another: `generate`, `ingest`, `report`.

**Pipeline**

1. `generate`: a seeded script writes one month of mock receipts as JSON files. Items carry only raw receipt-style names (e.g. "BIO VOLLM. 1L"), including some non-food items. The data follows baseline purchase probabilities only, with no planted trends or events.
2. `ingest`: each run processes one receipt, the next JSON file not yet stored, and validates it with Zod. For each item name on it not yet in SQLite, it sends one Claude call to assign a food group and extract quantity and unit, and queries Open Food Facts once. Both results are stored in an item lookup table. The receipt and its items are stored in SQLite and reference this table.
3. `report`: code aggregates quantity per food group and unit by month and quarter and computes the changes between periods. Claude receives only these tables and writes a Markdown report in German.

**In scope**

- Mock data only, no real receipt photos, no vision extraction, no Telegram
- Happy path only

**Out of scope (post-MVP backlog)**

- Vision extraction from receipt photos
- Telegram bot, follow-up questions, scheduling
- Error handling, retries, edge cases, handling of invalid Claude responses
- Duplicate check on receipt content (only the file name is checked, see Ingest)
- Using Open Food Facts category data for grouping
- Flagging one-off outliers in code
- Recommendations or DGE comparison in the report
- Rate-limit handling for Open Food Facts beyond the fixed delay and the 503 retry
- Tests beyond the deterministic report code

---

## 2. Stack and conventions

**Stack**

- Node.js with TypeScript, scripts run with `tsx`
- Tests with Vitest, covering only the deterministic code (aggregation, period-change calculation and estimate share in `report`)
- SQLite via `better-sqlite3`, plain SQL, no ORM
- Zod for validating receipt JSON and Claude's categorization response
- Anthropic API with model `claude-sonnet-5-5` for both categorization and the report
- Open Food Facts API, no authentication

**Scripts**

- `npm run generate`, `npm run ingest`, `npm run report`, run in this order
- Each script is a standalone entry point, with shared code (schemas, db access, API clients) in a common folder

**Conventions**

- `ANTHROPIC_API_KEY` is read from a `.env` file, which is never committed
- Code, comments and commit messages are in English. The food group values, the report and the "AI-generated" notice are in German.
- The generator uses a fixed seed, so the same seed produces the same files
- Any Zod validation failure stops the run with an error. No retries, no fallbacks.
- Claude is called once per unique item name, and Open Food Facts is queried once per unique item name. Both results are stored in SQLite, and later receipts read them from there.
- The report prompt restricts Claude to describing trends and anomalies, with no recommendations
- The report states that seasonality and trend cannot be separated within the available data, and that some quantities are estimates

**Known limitations**

- Claude sees only the item name, not the rest of the receipt. An ambiguous name gets one fixed group for the whole year, so a wrong call is systematic, not random.
- Claude estimates quantities for items without a size in the name, and the estimate is fixed per name

**AI Act**

- Article 50: the report is LLM-generated and carries an "AI-generated" notice at the top

---

## 3. Data model (SQLite)

**Food groups**

12 German food groups plus `non_food`, 13 allowed values in total:

- From the Ernährungskreis (7): Getreide/Kartoffeln, Gemüse/Salat, Obst, Milch/Milchprodukte, Fisch/Fleisch/Wurst/Eier, Öle/Fette, Getränke
- Added (5): Süßigkeiten, Salzige Snacks, Alkohol, Fertiggerichte, Hülsenfrüchte
- `non_food` is excluded from analysis

**`items`** (item lookup table, one row per unique item name)

- `id` (integer, primary key)
- `name` (text, unique): raw receipt name, e.g. "BIO VOLLM. 1L"
- `food_group` (text): one of the 12 German group values or `non_food`
- `quantity` (real, nullable): normalized to kg or l, null for `non_food`
- `unit` (text, nullable): `kg` or `l`, null for `non_food`
- `quantity_estimated` (integer, 0 or 1): 1 if Claude estimated the quantity because the name has no size
- `off_matched` (integer, 0 or 1): 1 if Open Food Facts returned a match
- `off_product_name` (text, nullable)
- `off_nutri_score` (text, nullable)
- `off_nutrients_json` (text, nullable): raw nutrient data as returned

**`receipts`**

- `id` (integer, primary key)
- `retailer` (text)
- `date` (text, ISO 8601)
- `total` (real)
- `source_file` (text): name of the JSON file it was read from

**`receipt_items`**

- `id` (integer, primary key)
- `receipt_id` (integer, foreign key to `receipts`)
- `item_id` (integer, foreign key to `items`)
- `count` (integer): how many units of the item were bought on this receipt
- `price` (real): line price on the receipt

**Quantity calculation**

- The quantity of a receipt line is `items.quantity * receipt_items.count`
- The report aggregates this per `food_group`, `unit`, and period (month, quarter), and excludes `non_food`
- A group with both litres and kilograms has two separate series. They are never added or compared.

**Notes**

- No hash column, since the duplicate check is in the backlog
- `price` and `total` are stored but not used by the report in the MVP

---

## 4. Generator (`npm run generate`)

**Output**

- One JSON file per receipt, written to `data/receipts/`
- Fields per receipt: `retailer`, `date` (ISO 8601), `total`, `items`
- Fields per item: `name` (raw receipt-style name), `count`, `price`
- No food group, quantity or unit in the files. Claude derives these during ingestion.

**Period and volume**

- One calendar month, with a fixed start date that is the first day of a month
- A fixed seed (set in a config constant), so the same seed produces the same files
- Roughly 1 to 3 shopping trips per week, with 5 to 25 items per receipt
- A few retailers (e.g. 3 to 4 German supermarket names)

**Item catalogue**

- A hand-written list of roughly 80 to 120 receipt-style German item names with a base price, covering all 12 food groups
- Names are abbreviated as on real receipts (e.g. "BIO VOLLM. 1L", "HAEHNCHENBRUST 500G")
- Some names have no size (e.g. "EIER 10ER", "BROT"), so that Claude has to estimate quantities
- Some non-food items (e.g. "SPUELMITTEL", "MUELLBEUTEL")
- Each catalogue item has a group assigned internally, only to drive the purchase probabilities. This is never written to the files.

**Purchase pattern**

- Baseline only: each group has a base purchase probability per trip
- No trends, seasonality or one-off events, since one month of data cannot show them
- Prices are the base price with small random variation

**Notes**

- The mock data is kept small because ingest is limited by the APIs (Claude and Open Food Facts), not by the code
- The report code still computes month-over-month and quarter-over-quarter changes, since real usage builds up data over many months. With one month of mock data there is only one period, so the change tables are empty.

---

## 5. Ingest (`npm run ingest`)

**Steps**

1. List the JSON files in `data/receipts/` in name order and pick the first one whose file name is not yet in `receipts.source_file`. If there is none, log that all receipts are ingested and exit.
2. Validate that file with the Zod receipt schema. Any failure stops the run.
3. For each unique item name on the receipt not yet in `items`:
   - Send one Claude call (`claude-sonnet-5-5`) containing only the item name.
   - Validate the response with a Zod schema.
   - Query Open Food Facts once with the item name, take the first result if there is one, and set a custom `User-Agent` header (Open Food Facts asks for this).
   - Insert one row into `items`.
4. Insert the receipt into `receipts` and its lines into `receipt_items`, referencing `items`, in one transaction.

**Claude call**

- The prompt contains the item name, the list of the 12 German food groups plus `non_food`, and the rules for quantity: normalize to kg or l, and estimate a typical size if the name has none.
- Response format is JSON only: `food_group`, `quantity`, `unit`, `quantity_estimated`.
- Zod schema: `food_group` must be one of the 13 allowed values, `unit` must be `kg` or `l`, `quantity` must be a positive number.
- For `non_food`, `quantity` and `unit` are null.

**Open Food Facts**

- A match sets `off_matched = 1` and stores the product name, Nutri-Score and nutrient data. No match sets `off_matched = 0` and leaves the other `off_` fields null.
- The result does not influence `food_group`.
- Requests are spaced by a fixed delay (12 seconds), since the search endpoint often returns 503. A 503 is retried up to 5 times, 20 seconds apart. Any other failure, or a 503 after the last retry, stops the run.

**Notes**

- One receipt per run, since real usage digests one receipt at a time and a run may take a few minutes. Run `ingest` repeatedly to ingest more receipts.
- The only duplicate check is the file name in `source_file`. The same receipt under a different file name is stored twice.
- Items are inserted one by one before the receipt. If a run stops, the receipt is not stored, and the next run continues with the items still missing.
- After running `generate` again, delete the SQLite file, since the new files reuse the old file names.
- Item names are processed sequentially, with no parallelism, to keep the code simple.

---

## 6. Report (`npm run report`)

**Steps**

1. Read `receipts`, `receipt_items` and `items` from SQLite. Exclude `non_food`.
2. Aggregation in code: quantity per `food_group`, `unit` and period, for every month and every quarter. A line's quantity is `items.quantity * receipt_items.count`.
3. Change calculation in code: for each series, the absolute and percentage change from one period to the next (month over month, quarter over quarter).
4. Estimate share in code: for each series and period, the share of the quantity that comes from items with `quantity_estimated = 1`.
5. Send the tables to Claude (`claude-sonnet-5-5`) and write the response to `reports/report-{timestamp_of_run}.md`.

**Claude input**

- Only the pre-aggregated tables from steps 2 to 4, as JSON. No raw receipts, no prices, no Open Food Facts data.

**Prompt rules**

- Write in German.
- Describe trends and anomalies only. No recommendations, and no judgments such as "too much" or "Schwachstelle".
- Do not compare against DGE guidance.
- State that seasonality and trend cannot be separated within the available data.
- If there is only one period, say that no changes between periods can be shown yet.
- State that some quantities are estimates, and point out series with a high estimate share.
- State that series with different units (l and kg) cannot be compared or added.
- State that Süßigkeiten, Salzige Snacks, Alkohol, Fertiggerichte and Hülsenfrüchte are additions to the 7 Ernährungskreis groups and have no DGE counterpart.
- Do not claim causes for deviations. Unexplained deviations are reported as such.

**Output**

- A Markdown file at `reports/report-{timestamp_of_run}.md`, with the timestamp in the format `YYYY-MM-DDTHH-mm-ss`. Each run writes a new file.
- The "AI-generated" notice is written by code at the top of the file, not by Claude, so it cannot be omitted or reworded by the model. Text: "Hinweis: Dieser Bericht wurde von einem KI-Modell (Claude) erstellt und nicht manuell geprüft."

**Code structure and tests**

- Aggregation, change calculation and estimate share are pure functions in their own module, with no database or API access, so Vitest can test them with fixed inputs.
- Database reads and the Claude call sit in separate modules and are untested in the MVP.

**Notes**

- Months and quarters are calendar periods. A period only partly covered by data (e.g. a quarter with one month of receipts) is still aggregated as is.
- The Article 50 notice is the only AI Act obligation addressed here. The no-recommendations rule keeps the report from giving dietary advice.

---

## 7. Project structure

```
.
├── CLAUDE.md
├── GOALS.md                # end criteria for the whole project
├── PLAN.md                 # current day's plan
├── archive/                # finished plans, YYYY-MM-DD-{topic}.md
├── package.json
├── tsconfig.json
├── .env                    # ANTHROPIC_API_KEY, never committed
├── .gitignore
├── data/
│   ├── receipts/           # generated JSON files
│   └── mvp.sqlite          # created by ingest
├── reports/                # report-{timestamp}.md files
├── src/
│   ├── generate/
│   │   ├── index.ts        # entry point
│   │   ├── catalogue.ts    # item names, base prices, internal groups
│   │   └── patterns.ts     # baseline purchase probabilities
│   ├── ingest/
│   │   ├── index.ts        # entry point
│   │   ├── categorize.ts   # Claude call per item name
│   │   └── openFoodFacts.ts
│   ├── report/
│   │   ├── index.ts        # entry point
│   │   ├── aggregate.ts    # pure functions, tested with Vitest
│   │   ├── aggregate.test.ts
│   │   ├── readData.ts     # SQLite reads
│   │   └── writeReport.ts  # Claude call and file output
│   └── shared/
│       ├── schemas.ts      # Zod schemas
│       ├── db.ts           # better-sqlite3 setup and schema creation
│       ├── foodGroups.ts   # the 12 groups plus non_food
│       └── anthropic.ts    # API client
```

**npm scripts**

- `generate`: `tsx src/generate/index.ts`
- `ingest`: `tsx src/ingest/index.ts`
- `report`: `tsx src/report/index.ts`
- `test`: `vitest run`

**Notes**

- `.gitignore` covers `.env`, `node_modules/`, `data/` and `reports/`
- The SQLite schema is created by `shared/db.ts` if the tables do not exist
