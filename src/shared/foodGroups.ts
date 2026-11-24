export const FOOD_GROUPS = [
  "Getreide/Kartoffeln",
  "Gemüse/Salat",
  "Obst",
  "Milch/Milchprodukte",
  "Fisch/Fleisch/Wurst/Eier",
  "Öle/Fette",
  "Getränke",
  "Süßigkeiten",
  "Salzige Snacks",
  "Alkohol",
  "Fertiggerichte",
  "Hülsenfrüchte",
  "non_food",
] as const;

export type FoodGroup = (typeof FOOD_GROUPS)[number];
