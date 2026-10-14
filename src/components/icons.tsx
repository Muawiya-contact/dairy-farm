import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true, ...props,
});

export const HomeIcon = (p: P) => <svg {...base(p)}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>;
export const CowIcon = (p: P) => <svg {...base(p)}>
  <path d="M7 7 4 5 2.5 7l2.8 3M17 7l3-2 1.5 2-2.8 3" />
  <path d="M8 6 7.5 3.5 10 5M16 6l.5-2.5L14 5" />
  <path d="M6 10c0-3 2.5-5 6-5s6 2 6 5v4c0 4.3-2.5 7-6 7s-6-2.7-6-7z" />
  <path d="M8 15.5c0-1.5 1.7-2.3 4-2.3s4 .8 4 2.3v1c0 1.8-1.7 3-4 3s-4-1.2-4-3z" />
  <path d="M9 10.5h.01M15 10.5h.01M10.5 16.2h.01M13.5 16.2h.01" strokeWidth="2.8" />
</svg>;
// Milk can (gaagar)
export const CanIcon = (p: P) => <svg {...base(p)}><path d="M9 3h6" /><path d="M10 3v3l-3 3v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9l-3-3V3" /><path d="M7 13h10" /></svg>;
export const BookIcon = (p: P) => <svg {...base(p)}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></svg>;
export const WalletIcon = (p: P) => <svg {...base(p)}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M15 15h3" /></svg>;
export const CoinsIcon = (p: P) => <svg {...base(p)}><circle cx="9" cy="9" r="5" /><path d="M9 6v6M7 7.5h3a1.5 1.5 0 0 1 0 3H8M16 7a5 5 0 1 1-1 9.9" /></svg>;
export const BackIcon = (p: P) => <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>;
export const SearchIcon = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
export const PlusIcon = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const MinusIcon = (p: P) => <svg {...base(p)}><path d="M5 12h14" /></svg>;
export const BellIcon = (p: P) => <svg {...base(p)}><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
export const SunIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const MoonIcon = (p: P) => <svg {...base(p)}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>;
export const ShareIcon = (p: P) => <svg {...base(p)}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v12M7 8l5-5 5 5" /></svg>;
export const CheckIcon = (p: P) => <svg {...base(p)}><path d="M5 12l5 5 9-10" /></svg>;
export const CloseIcon = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
