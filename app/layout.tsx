import type { Metadata } from "next";
import { PasaListaClerkProvider } from "./clerk-provider";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./share.css";
import "./import-review.css";
import "./publish-success.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PasáLista — tu Excel, listo para tomar pedidos",
  description: "Convertí tu lista de precios en un catálogo mayorista y recibí pedidos ordenados por WhatsApp.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PasaListaClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""}>{children}</PasaListaClerkProvider>
      </body>
    </html>
  );
}
