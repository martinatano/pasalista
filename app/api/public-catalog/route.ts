import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, orderItems, orders, products } from "@/db/schema";
import { devPlanFrom } from "../dev-plan";
import { bodyTooLarge, rateLimit, rateLimitResponse } from "../security";

function catalogActive(request: Request, business: { subscriptionStatus: string; trialEndsAt: string | null; currentPeriodEnd: string | null }) {
  const devPlan = devPlanFrom(request);
  if (devPlan) return devPlan !== "expired";
  const trialActive = business.subscriptionStatus !== "authorized" && Boolean(business.trialEndsAt) && new Date(business.trialEndsAt!).getTime() > Date.now();
  const paidPeriodActive = Boolean(business.currentPeriodEnd) && new Date(business.currentPeriodEnd!).getTime() > Date.now();
  return trialActive || business.subscriptionStatus === "authorized" || paidPeriodActive;
}

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim();
    if (!slug) return Response.json({ error: "Falta el enlace del catálogo." }, { status: 400 });
    const db = getDb();
    const [business] = await db.select({ id: businesses.id, name: businesses.name, slug: businesses.slug, whatsapp: businesses.whatsapp, brandColor: businesses.brandColor, minimumOrder: businesses.minimumOrder, deliveryZones: businesses.deliveryZones, deliveryDays: businesses.deliveryDays, logoKey: businesses.logoKey, subscriptionStatus: businesses.subscriptionStatus, trialEndsAt: businesses.trialEndsAt, currentPeriodEnd: businesses.currentPeriodEnd }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!business) return Response.json({ error: "Este catálogo no existe." }, { status: 404 });
    if (!catalogActive(request, business)) return Response.json({ business, products: [], paused: true });
    const catalogProducts = await db.select({ code: products.code, name: products.name, detail: products.detail, category: products.category, price: products.price, stock: products.stock, emoji: products.emoji, imageKey: products.imageKey }).from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.id));
    return Response.json({ business, products: catalogProducts });
  } catch {
    return Response.json({ error: "No pudimos abrir el catálogo. Volvé a intentarlo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (bodyTooLarge(request, 128_000)) return Response.json({ error: "El pedido es demasiado grande." }, { status: 413 });
    const rate = await rateLimit(request, "public-order", 20, 10 * 60);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfter);
    const payload = await request.json() as { slug?: string; customerName?: string; customerPhone?: string; deliveryAddress?: string; notes?: string; items?: Array<{ code: string; quantity: number }> };
    const requested = (payload.items ?? []).filter((item) => item.code?.trim() && Number.isInteger(item.quantity) && item.quantity > 0);
    if (!payload.slug?.trim() || !requested.length) return Response.json({ error: "El pedido está vacío." }, { status: 400 });
    const customerName = payload.customerName?.trim() ?? "";
    if (customerName.length < 2) return Response.json({ error: "Ingresá tu nombre o el de tu comercio." }, { status: 400 });
    const db = getDb();
    const [business] = await db.select().from(businesses).where(eq(businesses.slug, payload.slug.trim())).limit(1);
    if (!business) return Response.json({ error: "Este catálogo no existe." }, { status: 404 });
    if (!catalogActive(request, business)) return Response.json({ error: "Este catálogo está temporalmente pausado. Contactá al comercio para consultar su lista vigente." }, { status: 403 });
    const published = await db.select().from(products).where(eq(products.businessId, business.id));
    const productByCode = new Map(published.map((product) => [product.code, product]));
    const clean = requested.flatMap((item) => {
      const product = productByCode.get(item.code);
      return product && product.stock !== 0 ? [{ product, quantity: item.quantity }] : [];
    });
    if (!clean.length) return Response.json({ error: "Los productos elegidos ya no están disponibles." }, { status: 400 });
    const total = clean.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    if (business.minimumOrder > 0 && total < business.minimumOrder) return Response.json({ error: `El pedido mínimo es de $${business.minimumOrder.toLocaleString("es-AR")}.` }, { status: 400 });
    const [order] = await db.insert(orders).values({ businessId: business.id, customerName: customerName.slice(0, 100), customerPhone: (payload.customerPhone ?? "").replace(/[^0-9+()\-\s]/g, "").slice(0, 30), deliveryAddress: (payload.deliveryAddress ?? "").trim().slice(0, 180), notes: (payload.notes ?? "").trim().slice(0, 500), total, status: "new" }).returning();
    await db.insert(orderItems).values(clean.map(({ product, quantity }) => ({ orderId: order.id, productCode: product.code, productName: product.name, unitPrice: product.price, quantity })));
    return Response.json({ order }, { status: 201 });
  } catch {
    return Response.json({ error: "No pudimos guardar el pedido. Tu carrito sigue intacto; volvé a intentarlo." }, { status: 500 });
  }
}
