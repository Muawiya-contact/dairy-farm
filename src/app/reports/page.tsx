import Link from "next/link";
import { Body, PageHeader } from "@/components/ui";
import { BankIcon, BookIcon, BoxesIcon, CanIcon, ChartIcon, CowIcon, PeopleIcon, ReportIcon, WalletIcon } from "@/components/icons";

const REPORTS = [
  { label: "Customer Report", href: "/reports/customer/", Icon: PeopleIcon },
  { label: "Milk Report", href: "/reports/milk/", Icon: CanIcon },
  { label: "Khata Report", href: "/reports/khata/", Icon: BookIcon },
  { label: "Kharcha Report", href: "/reports/kharcha/", Icon: WalletIcon },
  { label: "Inventory Report", href: "/reports/inventory/", Icon: BoxesIcon },
  { label: "Animal Report", href: "/reports/animal/", Icon: CowIcon },
  { label: "Financial Report", href: "/reports/financial/", Icon: ChartIcon },
  { label: "Accounts Report", href: "/reports/accounts/", Icon: BankIcon },
  { label: "Final Report", href: "/reports/final/", Icon: ReportIcon },
];

export default function ReportsPage() {
  return <><PageHeader title="Reports" sub="Apni zaroorat ki report chunein" />
    <Body className="pb-8">
      <nav aria-label="Report categories" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(({ label, href, Icon }) => <Link key={href} href={href} className="flex min-h-24 items-center gap-3 rounded-2xl border border-line bg-paper p-4 font-display text-lg font-bold hover:border-berseem hover:bg-berseem-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berseem">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-berseem-soft text-berseem"><Icon /></span>
          {label}
        </Link>)}
      </nav>
    </Body></>;
}
