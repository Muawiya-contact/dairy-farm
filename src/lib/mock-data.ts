// ─────────────────────────────────────────────────────────────
// ALL DUMMY DATA LIVES HERE.
// When we connect Supabase, replace these exports with real queries.
// Screens only read from this file, so nothing else needs to change.
// ─────────────────────────────────────────────────────────────

export const FARM_NAME = "Demo Dairy Farm";
export const OWNER_NAME = "Chaudhry Sahab";
export const TODAY = "2026-10-10";

// Collection center (Nestle/Engro type) takes whatever milk is left.
export const COLLECTION_CENTER_RATE = 185;

// Gestation days, used to auto-calculate expected delivery.
export const GESTATION_DAYS = { bhains: 310, gaye: 283 } as const;

export type AnimalKind = "bhains" | "gaye";
export type AnimalStatus = "milking" | "dry" | "pregnant" | "sick" | "calf";

export type HealthEvent = {
  date: string;
  kind: "vaccine" | "illness" | "delivery" | "checkup";
  title: string;
  note?: string;
  cost?: number;
};

export type Animal = {
  id: string; // tag number painted / ear tag
  kind: AnimalKind;
  breed: string;
  sex: "female" | "male";
  born: string;
  status: AnimalStatus;
  alsoMilking?: boolean; // pregnant but still giving milk
  purchasePrice?: number;
  purchaseDate?: string;
  motherId?: string;
  last7: number[]; // litres per day, oldest first
  inseminated?: string;
  health: HealthEvent[];
  monthCost: number; // feed + vet share this month (estimate)
};

export const animals: Animal[] = [
  {
    id: "B-014", kind: "bhains", breed: "Nili-Ravi", sex: "female", born: "2021-08-02",
    status: "pregnant", alsoMilking: true, purchasePrice: 320000, purchaseDate: "2024-02-14",
    last7: [12.5, 13, 12, 12.6, 11.8, 11.4, 11], inseminated: "2025-12-16",
    health: [
      { date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" },
      { date: "2026-07-18", kind: "illness", title: "Thanela (mastitis)", note: "3 din ilaaj, theek ho gayi", cost: 2400 },
      { date: "2024-10-12", kind: "delivery", title: "Katti paida hui", note: "B-031" },
    ],
    monthCost: 18200,
  },
  {
    id: "B-022", kind: "bhains", breed: "Nili-Ravi", sex: "female", born: "2019-03-10",
    status: "milking", purchasePrice: 360000, purchaseDate: "2023-05-20",
    last7: [13, 12.8, 13.2, 12.6, 12.4, 12.9, 12.5],
    health: [
      { date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" },
      { date: "2026-03-11", kind: "vaccine", title: "Mun-khur (FMD) vaccine" },
    ],
    monthCost: 17600,
  },
  {
    id: "B-017", kind: "bhains", breed: "Nili-Ravi", sex: "female", born: "2020-11-21",
    status: "milking", purchasePrice: 340000, purchaseDate: "2023-11-02",
    last7: [10.6, 11, 10.8, 11.2, 10.9, 11.1, 11],
    health: [{ date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" }],
    monthCost: 17100,
  },
  {
    id: "B-009", kind: "bhains", breed: "Kundi", sex: "female", born: "2018-01-15",
    status: "sick", purchasePrice: 240000, purchaseDate: "2022-08-08",
    last7: [7.2, 7, 6.8, 6.1, 5.4, 5.2, 5],
    health: [
      { date: "2026-10-07", kind: "illness", title: "Bukhaar, khuraak kam", note: "Vet ne injection lagaya", cost: 3500 },
      { date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" },
    ],
    monthCost: 19800,
  },
  {
    id: "B-026", kind: "bhains", breed: "Nili-Ravi", sex: "female", born: "2021-04-09",
    status: "milking", purchasePrice: 330000, purchaseDate: "2024-06-01",
    last7: [11.4, 11.6, 11.2, 11.8, 11.5, 11.7, 11.6],
    health: [{ date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" }],
    monthCost: 17300,
  },
  {
    id: "B-029", kind: "bhains", breed: "Kundi", sex: "female", born: "2020-07-30",
    status: "dry", purchasePrice: 280000, purchaseDate: "2024-01-18",
    last7: [0, 0, 0, 0, 0, 0, 0], inseminated: "2026-02-20",
    health: [{ date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" }],
    monthCost: 12400,
  },
  {
    id: "B-031", kind: "bhains", breed: "Nili-Ravi", sex: "female", born: "2024-10-12",
    status: "calf", motherId: "B-014",
    last7: [0, 0, 0, 0, 0, 0, 0],
    health: [{ date: "2026-09-02", kind: "vaccine", title: "Galghotu (HS) vaccine" }],
    monthCost: 6200,
  },
  {
    id: "C-003", kind: "gaye", breed: "Sahiwal", sex: "female", born: "2022-02-05",
    status: "milking", purchasePrice: 260000, purchaseDate: "2024-03-09",
    last7: [9.6, 9.8, 10, 9.7, 9.9, 9.8, 9.8],
    health: [{ date: "2026-08-15", kind: "vaccine", title: "Lumpy skin vaccine" }],
    monthCost: 14200,
  },
  {
    id: "C-007", kind: "gaye", breed: "Sahiwal", sex: "female", born: "2021-09-14",
    status: "pregnant", alsoMilking: true, purchasePrice: 250000, purchaseDate: "2023-12-12",
    last7: [8.8, 8.6, 8.5, 8.4, 8.2, 8.1, 8], inseminated: "2026-04-03",
    health: [{ date: "2026-08-15", kind: "vaccine", title: "Lumpy skin vaccine" }],
    monthCost: 14000,
  },
  {
    id: "C-011", kind: "gaye", breed: "Cholistani", sex: "female", born: "2020-05-22",
    status: "dry", purchasePrice: 210000, purchaseDate: "2023-04-30",
    last7: [0, 0, 0, 0, 0, 0, 0],
    health: [{ date: "2026-08-15", kind: "vaccine", title: "Lumpy skin vaccine" }],
    monthCost: 9800,
  },
  {
    id: "C-014", kind: "gaye", breed: "Holstein cross", sex: "female", born: "2021-12-01",
    status: "milking", purchasePrice: 380000, purchaseDate: "2025-01-10",
    last7: [15.2, 15.6, 15, 15.4, 15.8, 15.5, 15.6],
    health: [
      { date: "2026-08-15", kind: "vaccine", title: "Lumpy skin vaccine" },
      { date: "2026-06-04", kind: "checkup", title: "Routine checkup", cost: 1500 },
    ],
    monthCost: 19200,
  },
  {
    id: "C-018", kind: "gaye", breed: "Sahiwal", sex: "male", born: "2026-01-19",
    status: "calf", motherId: "C-003",
    last7: [0, 0, 0, 0, 0, 0, 0],
    health: [{ date: "2026-08-15", kind: "vaccine", title: "Lumpy skin vaccine" }],
    monthCost: 4100,
  },
];

export type Customer = {
  id: string;
  name: string;
  area: string;
  phone: string;
  rate: number;
  morning: number; // usual litres
  evening: number;
  openingBalance: number; // udhaar carried from last month
  // October deliveries: [morning, evening] litres for day 1..10
  days: [number, number][];
  payments: { date: string; amount: number; mode: "cash" | "bank" | "easypaisa" }[];
};

const usual = (m: number, e: number, changes: Record<number, [number, number]> = {}) =>
  Array.from({ length: 10 }, (_, i) => changes[i + 1] ?? [m, e]) as [number, number][];

export const customers: Customer[] = [
  {
    id: "al-madina", name: "Hotel Al-Madina", area: "GT Road", phone: "0300-1234567",
    rate: 220, morning: 6, evening: 6, openingBalance: 18800,
    days: usual(6, 6, { 2: [6, 8], 5: [8, 8], 8: [6, 4], 9: [6, 8] }),
    payments: [{ date: "2026-10-03", amount: 20000, mode: "cash" }],
  },
  {
    id: "shahid-bakery", name: "Shahid Bakery", area: "Main Bazaar", phone: "0321-7654321",
    rate: 210, morning: 4, evening: 4, openingBalance: 0,
    days: usual(4, 4, { 4: [6, 4], 10: [6, 4] }),
    payments: [{ date: "2026-10-05", amount: 8000, mode: "bank" }],
  },
  {
    id: "ali-raza", name: "Ali Raza", area: "Model Town", phone: "0333-1112223",
    rate: 230, morning: 2, evening: 2, openingBalance: 2300,
    days: usual(2, 2, { 6: [2, 0] }),
    payments: [{ date: "2026-10-01", amount: 2300, mode: "easypaisa" }],
  },
  {
    id: "rana-sweets", name: "Rana Sweets", area: "Chowk", phone: "0345-9998887",
    rate: 205, morning: 8, evening: 6, openingBalance: 31500,
    days: usual(8, 6, { 7: [10, 6], 8: [10, 8] }),
    payments: [],
  },
  {
    id: "masjid-madrassa", name: "Madrassa Jamia", area: "Gali 4", phone: "0301-4445556",
    rate: 200, morning: 5, evening: 0, openingBalance: 0,
    days: usual(5, 0),
    payments: [{ date: "2026-10-02", amount: 10000, mode: "cash" }],
  },
  {
    id: "bilal-ahmed", name: "Bilal Ahmed", area: "Model Town", phone: "0312-2223334",
    rate: 230, morning: 2, evening: 2, openingBalance: 0,
    days: usual(2, 2, { 3: [0, 0], 4: [0, 0] }),
    payments: [],
  },
];

// Total milk per shift for October 1..10 (whole farm)
export const farmMilk: { date: string; morning: number; evening: number }[] = [
  [47, 40], [47.5, 40], [48, 40.5], [48.5, 41], [47.5, 40.5], [48, 40.5], [47, 40], [46.5, 39.5], [46.5, 39], [46, 38.5],
].map(([morning, evening], i) => ({
  date: `2026-10-${String(i + 1).padStart(2, "0")}`,
  morning,
  evening,
}));

// Litres kept at home / wasted per shift (rough)
export const HOME_USE_PER_SHIFT = 2;

export type ExpenseCategory =
  | "wanda" | "khal" | "chokar" | "chara" | "labour" | "bijli" | "vet" | "other";

export const expenseCategories: { key: ExpenseCategory; label: string }[] = [
  { key: "wanda", label: "Wanda" },
  { key: "khal", label: "Khal" },
  { key: "chokar", label: "Chokar" },
  { key: "chara", label: "Hara chara" },
  { key: "labour", label: "Labour" },
  { key: "bijli", label: "Bijli" },
  { key: "vet", label: "Vet / dawai" },
  { key: "other", label: "Doosra" },
];

export type Expense = { id: string; date: string; category: ExpenseCategory; amount: number; note: string };

export const expenses: Expense[] = [
  { id: "e1", date: "2026-10-01", category: "wanda", amount: 21000, note: "10 bori wanda" },
  { id: "e2", date: "2026-10-01", category: "labour", amount: 45000, note: "3 bandon ki tankhwah (Sept)" },
  { id: "e3", date: "2026-10-02", category: "chara", amount: 6000, note: "Makai ka chara, 1 trolley" },
  { id: "e4", date: "2026-10-03", category: "khal", amount: 18000, note: "Binola khal, 6 bori" },
  { id: "e5", date: "2026-10-04", category: "chokar", amount: 12500, note: "Chokar, 10 bori" },
  { id: "e6", date: "2026-10-05", category: "chara", amount: 6000, note: "Makai ka chara, 1 trolley" },
  { id: "e7", date: "2026-10-06", category: "bijli", amount: 12800, note: "Bijli ka bill (Sept)" },
  { id: "e8", date: "2026-10-07", category: "vet", amount: 3500, note: "B-009 ka ilaaj" },
  { id: "e9", date: "2026-10-08", category: "chara", amount: 6000, note: "Makai ka chara, 1 trolley" },
  { id: "e11", date: "2026-10-09", category: "khal", amount: 9000, note: "Binola khal, 3 bori" },
  { id: "e12", date: "2026-10-10", category: "chara", amount: 6000, note: "Makai ka chara, 1 trolley" },
  { id: "e13", date: "2026-10-10", category: "other", amount: 2500, note: "Diesel, generator" },
];

// Month-wise totals for 2026 (Jan..Sep closed, Oct is computed live from the data above)
export const monthlyHistory: { month: string; sales: number; expenses: number }[] = [
  { month: "Jan", sales: 548000, expenses: 281000 },
  { month: "Feb", sales: 497000, expenses: 266000 },
  { month: "Mar", sales: 552000, expenses: 289000 },
  { month: "Apr", sales: 531000, expenses: 302000 },
  { month: "May", sales: 509000, expenses: 318000 },
  { month: "Jun", sales: 468000, expenses: 327000 },
  { month: "Jul", sales: 486000, expenses: 309000 },
  { month: "Aug", sales: 512000, expenses: 294000 },
  { month: "Sep", sales: 527000, expenses: 288000 },
];
