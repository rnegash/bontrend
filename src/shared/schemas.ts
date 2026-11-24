import { z } from "zod";
import { FOOD_GROUPS } from "./foodGroups";

export const receiptItemSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
  price: z.number(),
});

export const receiptSchema = z.object({
  retailer: z.string().min(1),
  date: z.iso.date(),
  total: z.number(),
  items: z.array(receiptItemSchema).min(1),
});

export type Receipt = z.infer<typeof receiptSchema>;

// Shape of Claude's categorization response, also sent to the API as the output format.
export const categorizationSchema = z.object({
  food_group: z.enum(FOOD_GROUPS),
  quantity: z.number().positive().nullable(),
  unit: z.enum(["kg", "l"]).nullable(),
  quantity_estimated: z.boolean(),
});

// Adds the cross-field rule: non_food has no quantity or unit, every food group has both.
export const validCategorizationSchema = categorizationSchema.refine(
  (c) =>
    c.food_group === "non_food"
      ? c.quantity === null && c.unit === null
      : c.quantity !== null && c.unit !== null,
  { message: "non_food must have null quantity and unit, food groups must have both" },
);

export type Categorization = z.infer<typeof categorizationSchema>;
