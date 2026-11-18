import Link from "next/link";
import { Body, PageHeader, Panel } from "@/components/ui";

export default function ReportCategoryPlaceholder({ title }: { title: string }) {
  return <><PageHeader title={title} sub="Report section" back="/reports/" />
    <Body className="pb-8">
      <Panel title="Jald aa raha hai">
        <p className="text-muted">Is report ki tafseeli screen abhi tayyar ho rahi hai. Hum sirf asal saved data ke saath isay add karein ge.</p>
        <Link href="/reports/" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-berseem px-4 font-semibold text-berseem">Reports par wapas</Link>
      </Panel>
    </Body></>;
}
