/** Shared Roman Urdu copy for guarded actions and connection errors. */
export const UI_TEXT = {
  openingBalance: "Shuru ka baqaya",
  openingDate: "Shuru ki tareekh",
  active: "Chalu",
  signIn: "Login karein",
  signingIn: "Login ho raha hai…",
  naslHelp: "Tukhm rezi, checkup, khushk hone aur paidaish ki tareekhein yahan dekhein. Asal nateeja janwar ke record mein darj karein.",
  naslExpectedDates: "Mutawaqqa tareekhein tukhm rezi ki tareekh se khud nikalti hain.",
  missingConnection: "Farm connection ki maloomat set nahi hain.",
  cancelAction: "Wapas",
  animalExitTitle: { sold: "Farokht ki tasdeeq", dead: "Wafat ki tasdeeq", removed: "Ikhtitam ki tasdeeq" },
  animalExitButton: { sold: "Farokht darj karein", dead: "Wafat darj karein", removed: "Ikhtitam darj karein" },
  animalExitMessage: (tag: string, action: string, date: string) =>
    `${tag} ka ${action} ${date} ko darj karein? Is ke baad yeh janwar chalu list se hat jayega.`,
  calvingTitle: "Paidaish ki tasdeeq",
  calvingButton: "Paidaish darj karein",
  calvingMessage: (tag: string, date: string, count: number, liveCount: number) =>
    `${tag} ki ${date} wali paidaish aur ${count} bachay darj karein? ${liveCount} zinda bachay ka janwar record banega. Is entry ko baad mein seedha badal nahi sakte.`,
  salaryTitle: "Tankhwah ki tasdeeq",
  salaryButton: "Tankhwah ada karein",
  salaryMessage: (name: string, amount: string, account: string, date: string) =>
    `${name} ko ${amount} ${account} se ${date} ko ada karein? Yeh Galla aur kharchay mein darj hoga.`,
} as const;
