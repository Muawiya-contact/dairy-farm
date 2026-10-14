/** The supplied milk-churn mark; the farm name stays live text from Settings. */
export default function LogoMark({ size = 40, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="shrink-0"
    >
      <rect width="512" height="512" rx="116" fill="#1d4626" />
      <g fill="#f4f1e6">
        <rect x="243" y="92" width="26" height="18" rx="7" />
        <path d="M194 128 Q256 92 318 128 Z" />
        <rect x="184" y="122" width="144" height="20" rx="9" />
        <rect x="214" y="138" width="84" height="46" />
        <path d="M214 180 H298 L360 236 Q370 245 370 258 V404 H142 V258 Q142 245 152 236 Z" />
        <rect x="134" y="398" width="244" height="34" rx="12" />
      </g>
      <path d="M214 156 H186 Q172 156 172 170 V200" fill="none" stroke="#f4f1e6" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M298 156 H326 Q340 156 340 170 V200" fill="none" stroke="#f4f1e6" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="142" y="282" width="228" height="62" fill="#e3a52c" />
      <rect x="142" y="252" width="228" height="8" fill="#1d4626" opacity=".18" />
      <path d="M256 290 C256 290 237 312 237 325 A19 19 0 0 0 275 325 C275 312 256 290 256 290 Z" fill="#1d4626" />
    </svg>
  );
}
