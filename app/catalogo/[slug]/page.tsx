import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import PublicCatalog from "./public-catalog";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    if (slug === "demo") return { title: "Catálogo demo — PasáLista", description: "Probá cómo tus clientes recorren un catálogo y arman un pedido con PasáLista." };
    const [business] = await getDb().select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!business) return { title: "Catálogo no encontrado — PasáLista" };
    return { title: `${business.name} — catálogo mayorista`, description: `Consultá precios y armá tu pedido online en ${business.name}.`, openGraph: { title: business.name, description: "Catálogo mayorista y pedidos por WhatsApp.", images: [] }, twitter: { card: "summary", title: business.name, description: "Catálogo mayorista y pedidos por WhatsApp.", images: [] } };
  } catch { return { title: "Catálogo — PasáLista" }; }
}

export default async function CatalogPage({ params }: Props) {
  const { slug } = await params;
  return <PublicCatalog slug={slug} />;
}
