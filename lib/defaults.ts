/* What a brand-new tenant starts with: a plain, useful set that fits
   most lives, not the owner's personal taxonomy. Icons must exist in
   components/ui/CategoryIcon - npm run check guards the owner's set,
   so keep to names already mapped there. */

export const DEFAULT_CATEGORIES: {
  id: string;
  name: string;
  icon: string;
  matches: string[];
  kind: "spend" | "income";
  sort: number;
}[] = [
  { id: "food", name: "Food & groceries", icon: "ShoppingCart", matches: ["food", "groceries", "market", "foodstuff"], kind: "spend", sort: 1 },
  { id: "transport", name: "Transport", icon: "GasPump", matches: ["transport", "fuel", "ride", "bus", "uber", "bolt"], kind: "spend", sort: 2 },
  { id: "bills", name: "Bills & utilities", icon: "Lightning", matches: ["bill", "electricity", "power", "water", "utility"], kind: "spend", sort: 3 },
  { id: "data", name: "Data & airtime", icon: "WifiHigh", matches: ["data", "airtime", "recharge", "internet"], kind: "spend", sort: 4 },
  { id: "dining", name: "Eating out", icon: "ForkKnife", matches: ["dining", "restaurant", "lunch", "dinner", "eat"], kind: "spend", sort: 5 },
  { id: "shopping", name: "Shopping", icon: "ShoppingBag", matches: ["shopping", "clothes", "shoe"], kind: "spend", sort: 6 },
  { id: "health", name: "Health", icon: "Barbell", matches: ["health", "hospital", "drug", "pharmacy", "gym"], kind: "spend", sort: 7 },
  { id: "family", name: "Family & friends", icon: "HandHeart", matches: ["family", "mum", "dad", "friend"], kind: "spend", sort: 8 },
  { id: "giving", name: "Giving", icon: "Gift", matches: ["gift", "giving", "donation"], kind: "spend", sort: 9 },
  { id: "subscriptions", name: "Subscriptions", icon: "PlayCircle", matches: ["subscription", "netflix", "spotify"], kind: "spend", sort: 10 },
  { id: "savings", name: "Savings", icon: "PiggyBank", matches: ["savings", "save"], kind: "spend", sort: 11 },
  { id: "income", name: "Income", icon: "Bank", matches: ["income", "salary", "pay", "credit"], kind: "income", sort: 12 },
];
