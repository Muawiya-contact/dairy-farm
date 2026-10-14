# Farm logo

The milk-churn mark comes from `logo-update.zip`. The visible farm name in the app, print report, customer bills, receipts, and PDF table exports comes from **Settings → Farm ka naam**. Changing that setting does not require replacing image files.

## Where the mark appears

- `src/components/LogoMark.tsx`: sidebar, mobile header, and owner sign-in.
- `src/app/favicon.ico`, `icon.svg`, and `apple-icon.png`: browser tab and phone home-screen icons.
- `src/app/manifest.webmanifest` and `public/brand/icon-*.png`: installed app icons, including a maskable icon.
- `public/brand/icon-192.png`: customer bill, payment receipt, and data-export PDF headers.
- `src/app/reports/page.tsx`: printable monthly report header.

The ZIP's outlined wordmarks contain the fixed text “SDF Dairy Farm”. They are intentionally not used in generated documents or the app because the owner's selected farm name must stay accurate.

When updating the mark, replace the matching icon assets and the SVG paths in `LogoMark.tsx` together. Check a browser tab, an installed shortcut, a printed report, a customer bill, a receipt, and one PDF table export after the change.
