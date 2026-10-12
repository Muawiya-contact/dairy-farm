import { milkFill } from "@/lib/milk-fill";
import styles from "./MilkCan.module.css";

export default function MilkCan({ morning, evening }: { morning: number; evening: number }) {
  const { fillPercent, morningSharePercent, eveningSharePercent } = milkFill(morning, evening);

  return (
    <div
      role="img"
      aria-label={`Doodh ka drum ${Math.round(fillPercent)} fee-sad bhara: subah ${morning} litre, shaam ${evening} litre`}
      className="flex shrink-0 flex-col items-center"
    >
      <div className="h-3 w-10 rounded-t-md bg-[#3c7a48]" />
      <div className="relative h-40 w-20 overflow-hidden rounded-b-2xl rounded-t-[28px] bg-[#2a5c33] lg:h-52 lg:w-28">
        <div className={`${styles.fill} absolute inset-x-0 bottom-0`} style={{ height: `${fillPercent}%` }}>
          <div className="absolute inset-x-0 top-0 bg-haldi" style={{ height: `${eveningSharePercent}%` }} />
          <div className="absolute inset-x-0 bottom-0 bg-[#f4f1e6]" style={{ height: `${morningSharePercent}%` }} />
          <div className="absolute inset-x-0 top-0 h-0.5 bg-white/40" />
        </div>
        <div className="pointer-events-none absolute inset-y-3 right-2 w-1 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
