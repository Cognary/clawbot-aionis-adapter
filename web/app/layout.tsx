import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Aionis OpenClaw Adapter | Execution Control for OpenClaw",
  description:
    "Reduce tool-loop churn, cut token burn, and improve completion in OpenClaw with Aionis policy, replay, handoff, and externalized context.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className={`${dmSans.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
