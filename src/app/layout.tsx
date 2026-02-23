import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk, Syne } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Becca NYC Trip Countdown",
  description: "Live countdown and drive ETA for Becca's New York arrival.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#fff8f3]">
      <body
        className={`${spaceGrotesk.variable} ${geistMono.variable} ${syne.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
