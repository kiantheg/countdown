import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Kian & Becca",
  title: "California Trip · November 18–22",
  description: "Kian’s California visit, November 18–22, 2026. United flight to San Francisco, five days in the Bay Area, and a drive to Los Angeles.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
