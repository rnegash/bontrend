import type { FoodGroup } from "../shared/foodGroups";

// Expected number of receipt lines per group on an average trip (before the trip size factor).
export const BASE_LINES_PER_TRIP: Record<FoodGroup, number> = {
  "Getreide/Kartoffeln": 1.8,
  "Gemüse/Salat": 2.2,
  Obst: 1.5,
  "Milch/Milchprodukte": 1.8,
  "Fisch/Fleisch/Wurst/Eier": 1.4,
  "Öle/Fette": 0.4,
  Getränke: 1.2,
  Süßigkeiten: 0.8,
  "Salzige Snacks": 0.5,
  Alkohol: 0.4,
  Fertiggerichte: 0.7,
  Hülsenfrüchte: 0.4,
  non_food: 0.6,
};
