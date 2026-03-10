import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kian Visits Becca at Stanford",
  description: "Live countdown and drive ETA for Kian's California arrival.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#07111f]">
      <body className="antialiased">{children}</body>
    </html>
  );
}
