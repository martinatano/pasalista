import type { Metadata } from "next";
import { PasaListaClerkProvider } from "./clerk-provider";
import { AddToHomeScreen } from "./add-to-home";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
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

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const siteUrl = "https://pasalista.com.ar";
const title = "PasáLista — tu Excel, listo para tomar pedidos";
const description = "Convertí tu lista de precios en un catálogo mayorista y recibí pedidos ordenados por WhatsApp. Sin comisión por venta, sin cambiar cómo trabajás.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — PasáLista" },
  description,
  keywords: ["catálogo mayorista", "lista de precios online", "pedidos por WhatsApp", "catálogo digital", "Excel a catálogo web", "PasáLista"],
  applicationName: "PasáLista",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: siteUrl,
    siteName: "PasáLista",
    title,
    description,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "PasáLista — tu Excel ahora toma pedidos solo" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl },
};

export const viewport = {
  themeColor: "#150e08",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} antialiased`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "PasáLista",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: siteUrl,
          description,
          offers: { "@type": "Offer", price: "12900", priceCurrency: "ARS" },
        }) }} />
        <PasaListaClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""}>{children}</PasaListaClerkProvider>
        <AddToHomeScreen />
      </body>
    </html>
  );
}
