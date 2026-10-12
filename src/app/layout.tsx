import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "California Trip · October 28–November 3",
  description: "Kian’s California visit, October 28–November 3, 2026. JetBlue flights, a day-by-day itinerary, and trip essentials.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
