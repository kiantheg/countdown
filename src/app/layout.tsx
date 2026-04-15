import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Becca Visits Kian in NYC",
  description: "Live countdown and drive ETA for Becca's NYC arrival on April 29.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`bg-[#07111f] ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
