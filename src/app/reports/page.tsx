import Link from "next/link";
import { Body, PageHeader } from "@/components/ui";
import { BankIcon, BookIcon, BoxesIcon, CanIcon, ChartIcon, CowIcon, PeopleIcon, ReportIcon, WalletIcon } from "@/components/icons";

const REPORT_GROUPS = [
  {
    id: "customers", label: "Customer Reports", Icon: PeopleIcon,
    description: "Customer delivery, bill, wasooli aur Khata history saved records se. Sales activity na rakhne walay active customers muddat ke mutabiq dekhein.",
    reports: [
      ["Customer Report", "/reports/customer/"],
      ["Khata Report", "/reports/khata/"],
      ["Inactive Customers", "/reports/customer/inactive/"],
    ],
  },
  {
    id: "milk", label: "Milk Reports", Icon: CanIcon,
    description: "Production, destinations, carry-forward balance, actual collections aur customer breakdown.",
    reports: [
      ["Milk Report", "/reports/milk/"],
      ["Animal-wise Milk Report", "/reports/animal/milk/"],
    ],
  },
  {
    id: "purchases", label: "Purchase Reports", Icon: BoxesIcon,
    description: "Inventory Report mein darj khareed, item, supplier aur raqam dekhein. Supplier balance, purchase returns aur purchase orders alag se track nahi hote.",
    reports: [["Stock ki Report", "/reports/inventory/"]],
  },
  {
    id: "sales", label: "Sales Reports", Icon: WalletIcon,
    description: "Milk Report mein doodh ki cash/Khata sales aur asal wasooli hain. Dahi, makkhan ya ghee ki sales alag se record nahi hoti.",
    reports: [
      ["Milk Report", "/reports/milk/"],
      ["Customer Report", "/reports/customer/"],
    ],
  },
  {
    id: "accounts", label: "Accounts Reports", Icon: BankIcon,
    description: "Account balance, owner movements, Khata ledger aur expense day book.",
    reports: [
      ["Accounts Report", "/reports/accounts/"],
      ["Khata Report", "/reports/khata/"],
      ["Kharcha Report", "/reports/kharcha/"],
    ],
  },
  {
    id: "financial", label: "Financial Reports", Icon: ChartIcon,
    description: "Billed income aur saved farm/personal expenses ke separate totals.",
    reports: [
      ["Maali Report", "/reports/financial/"],
      ["Kharcha Report", "/reports/kharcha/"],
    ],
  },
  {
    id: "animals", label: "Animal Reports", Icon: CowIcon,
    description: "Herd, animal milk, breeding aur health records.",
    reports: [
      ["Animal Report", "/reports/animal/"],
      ["Animal-wise Milk Report", "/reports/animal/milk/"],
    ],
  },
  {
    id: "feed-inventory", label: "Feed & Inventory Reports", Icon: BookIcon,
    description: "Stock, feed purchases, usage, wastage aur low stock dekhein. Har janwar ka feed record aur muddat ka miqdar uske profile mein milega.",
    reports: [
      ["Stock ki Report", "/reports/inventory/"],
      ["Per-animal feed history", "/janwar/"],
    ],
  },
  {
    id: "analytics", label: "Farm Analytics", Icon: ReportIcon,
    description: "Period ka farm khulasa saved records se banta hai; missing data ko asal income ya munafa nahi maana jata.",
    reports: [
      ["Final Report", "/reports/final/"],
      ["Maali Report", "/reports/financial/"],
    ],
  },
] as const;

export default function ReportsPage() {
  return <><PageHeader title="Reports" sub="Apni zaroorat ki report chunein" />
    <Body className="pb-8">
      <nav aria-label="Report categories" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_GROUPS.map(({ id, label, Icon, description, reports }) => <section key={id} aria-labelledby={`report-group-${id}`} className="min-w-0 rounded-2xl border border-line bg-paper p-4">
          <header className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-berseem-soft text-berseem"><Icon /></span>
            <h2 id={`report-group-${id}`} className="min-w-0 font-display text-lg font-bold">{label}</h2>
          </header>
          {description && <p className="mt-3 text-sm text-muted">{description}</p>}
          <ul className="mt-3 divide-y divide-line">
            {reports.map(([name, href]) => <li key={`${name}-${href}`}>
              <Link href={href} className="flex min-h-11 items-center rounded-lg px-2 py-2 text-sm font-semibold text-berseem-deep underline-offset-2 hover:bg-ground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berseem">{name}</Link>
            </li>)}
          </ul>
        </section>)}
      </nav>
    </Body></>;
}
