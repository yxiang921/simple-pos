import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted Inter (variable weight) — no network access needed at build time.
const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Restaurant POS", template: "%s · Restaurant POS" },
  description: "Point of sale, digital ordering and ingredient inventory for cafés.",
};

export const viewport: Viewport = {
  themeColor: "#285943",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh text-[14px] leading-normal">{children}</body>
    </html>
  );
}
