import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "FINN",
  description: "Financial Investment Agent — what changed, why it matters, and who in your network can explain it.",
  appleWebApp: { capable: true, title: "FINN", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1013" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} antialiased`}>
      <body className="min-h-dvh">
        <main className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pb-28 pt-[max(env(safe-area-inset-top),12px)]">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
