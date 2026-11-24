import fs from "node:fs";
import path from "node:path";
import { getAnthropic, MODEL } from "../shared/anthropic";
import type { PeriodChange, PeriodTotal } from "./aggregate";

const REPORTS_DIR = "reports";
const AI_NOTICE = "Hinweis: Dieser Bericht wurde von einem KI-Modell (Claude) erstellt und nicht manuell geprüft.";

export type ReportInput = {
  dataRange: { from: string; to: string };
  months: PeriodTotal[];
  quarters: PeriodTotal[];
  monthChanges: PeriodChange[];
  quarterChanges: PeriodChange[];
};

const SYSTEM_PROMPT = `You write a short report in German on a household's food purchases, as Markdown.
You receive pre-aggregated tables as JSON:
- dataRange: the first and last receipt date in the data.
- months and quarters: purchased quantity per food group, unit (kg or l) and calendar period.
  estimateShare is the share of that quantity based on estimated package sizes (0 to 1), null if nothing was bought.
- monthChanges and quarterChanges: absolute and percentage change from one period to the next per series.
  percentChange is null when the previous period was 0.
A food group can have one series in kg and one in l.

Rules:
- Write in German. Start with a level-1 heading.
- Describe trends and anomalies only. Give no recommendations and no judgments such as "zu viel", "zu wenig", "ungesund" or "Schwachstelle".
- Do not compare the data against DGE guidance or any other dietary guideline.
- Do not claim causes for deviations. Report unexplained deviations as unexplained.
- If there is only one period, say that no changes between periods can be shown yet, and describe the totals only.
- A period only partly covered by dataRange (e.g. a quarter with only one month of receipts) must be named as partly covered.
- Include a section "Einschränkungen" that states:
  - Seasonality and trend cannot be separated within the available data.
  - Some quantities are estimates because the item name has no size. Name the series with a high estimate share.
  - Series in litres and in kilograms cannot be compared or added.
  - Süßigkeiten, Salzige Snacks, Alkohol, Fertiggerichte and Hülsenfrüchte are additions to the 7 groups of the DGE-Ernährungskreis and have no DGE counterpart.
- Do not add a note that the report is AI-generated. It is added separately.`;

const round = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);

function roundInput(input: ReportInput): ReportInput {
  const totals = (t: PeriodTotal[]) =>
    t.map((x) => ({ ...x, quantity: round(x.quantity)!, estimateShare: round(x.estimateShare) }));
  const changes = (c: PeriodChange[]) =>
    c.map((x) => ({ ...x, absoluteChange: round(x.absoluteChange)!, percentChange: round(x.percentChange) }));
  return {
    dataRange: input.dataRange,
    months: totals(input.months),
    quarters: totals(input.quarters),
    monthChanges: changes(input.monthChanges),
    quarterChanges: changes(input.quarterChanges),
  };
}

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Sends the tables to Claude and writes the report file. Returns its path. */
export async function writeReport(input: ReportInput): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(roundInput(input)) }],
  });
  if (response.stop_reason !== "end_turn") {
    throw new Error(`Report generation stopped early (stop_reason: ${response.stop_reason})`);
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `report-${timestamp(new Date())}.md`);
  fs.writeFileSync(file, `> ${AI_NOTICE}\n\n${text}\n`);
  return file;
}
