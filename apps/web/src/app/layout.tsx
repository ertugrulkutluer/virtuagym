import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gymflow — AI-assisted overbooking for gyms",
  description:
    "Mini gym class booking SaaS with an AI advisor that predicts no-shows and greenlights smart overbooking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased bg-ink-50 text-ink-900 font-sans">
        <ToastProvider>
          <Nav />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
