import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { SWCleanup } from "@/components/sw-cleanup";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Turkana Jewelry — Joyería de lujo en Los Mochis",
  description:
    "Piezas de joyería con elegancia y sofisticación. Turkana Jewelry, Los Mochis, Sinaloa.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${inter.variable} ${cormorant.variable}`}>
      <body>
        <SWCleanup />
        {children}
      </body>
    </html>
  );
}
