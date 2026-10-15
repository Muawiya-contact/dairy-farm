import { confirmedEidForDate } from "../lib/eid";
import type { FarmSettings } from "../lib/settings";
import { DismissibleNotice } from "./DismissibleNotice";
import { GyarhwinNotice } from "./GyarhwinNotice";

export function FarmObservances({ today, settings, className = "" }: { today: string; settings: FarmSettings; className?: string }) {
  const eid = confirmedEidForDate(today, settings);
  if (eid) {
    const name = settings.owner_name.trim() || "Chaudhry sahib";
    return <DismissibleNotice
      storageKey={`dairy-farm:eid:dismissed:${today}:${eid.kind}:${eid.startDate}`}
      ariaLabel={`${eid.label} greeting`}
      title={`Assalam o Alaikum, ${name}!`}
      message={`${eid.label} Mubarak. Allah aap ke ghar mein khushiyan aur barkat de.`}
      tone="eid" className={className}
    />;
  }
  return <GyarhwinNotice today={today} settings={settings} className={className} />;
}
