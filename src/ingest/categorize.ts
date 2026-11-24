import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, MODEL } from "../shared/anthropic";
import { FOOD_GROUPS } from "../shared/foodGroups";
import { categorizationSchema, validCategorizationSchema, type Categorization } from "../shared/schemas";

const SYSTEM_PROMPT = `You categorize item names from German supermarket receipts.
You get one raw, abbreviated receipt item name. Return:

- food_group: exactly one of these values:
${FOOD_GROUPS.map((g) => `  - ${g}`).join("\n")}
  Use non_food for anything that is not food or drink (cleaning products, hygiene, household goods).
- quantity and unit: the total amount of the item as sold, normalized to kg (solids) or l (liquids).
  Convert g to kg and ml to l. For multipacks multiply, e.g. "6X1,5L" is 9 l.
  If the name contains no size, estimate a typical package or piece size sold in German supermarkets.
  For non_food, quantity and unit are null.
- quantity_estimated: true if you estimated the quantity because the name contains no size, otherwise false.
  For non_food it is false.`;

export async function categorize(itemName: string): Promise<Categorization> {
  const response = await getAnthropic().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(categorizationSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: itemName }],
  });
  if (response.parsed_output == null) {
    throw new Error(`No parsable response for "${itemName}" (stop_reason: ${response.stop_reason})`);
  }
  return validCategorizationSchema.parse(response.parsed_output);
}
