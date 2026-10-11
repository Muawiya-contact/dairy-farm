import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import QueryProvider from "@/components/QueryProvider";
import { FARM_NAME } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: { default: FARM_NAME, template: `%s | ${FARM_NAME}` },
  description: "Dairy farm ka hisaab: janwar, doodh, khata aur kharcha",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2d6a39",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ur-Latn">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Hind:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="antialiased">
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
