import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderItems, orders, products } from "@/db/schema";
import { devPlanFrom } from "../dev-plan";
import { ownedBusiness as selectedOwnedBusiness } from "../owned-business";

async function ownedBusiness(request: Request) {
  return selectedOwnedBusiness(request);
}

function hasNegocioAccess(request: Request, business: Awaited<ReturnType<typeof ownedBusiness>>) {
  if (!business) return false;
  const devPlan = devPlanFrom(request);
  if (devPlan) return devPlan === "trial" || devPlan === "negocio" || devPlan === "empresa";
  const trialActive = business.subscriptionStatus !== "authorized" && Boolean(business.trialEndsAt) && new Date(business.trialEndsAt!).getTime() > Date.now();
  const paidPeriodActive = Boolean(business.currentPeriodEnd) && new Date(business.currentPeriodEnd!).getTime() > Date.now();
  return trialActive || ((business.subscriptionStatus === "authorized" || paidPeriodActive) && (business.plan === "negocio" || business.plan === "empresa"));
}

function hasCatalogAccess(request: Request, business: Awaited<ReturnType<typeof ownedBusiness>>) {
  if (!business) return false;
  const devPlan = devPlanFrom(request);
  if (devPlan) return devPlan !== "expired";
  const trialActive = business.subscriptionStatus !== "authorized" && Boolean(business.trialEndsAt) && new Date(business.trialEndsAt!).getTime() > Date.now();
  const paidPeriodActive = Boolean(business.currentPeriodEnd) && new Date(business.currentPeriodEnd!).getTime() > Date.now();
  return trialActive || business.subscriptionStatus === "authorized" || paidPeriodActive;
}

export async function GET(request: Request) {
  try {
    const business = await ownedBusiness(request);
    if (!business) return Response.json({ error: "Iniciá sesión para ver tus pedidos." }, { status: 401 });
    if (!hasNegocioAccess(request, business)) return Response.json({ error: "El panel de pedidos está incluido en el plan Negocio." }, { status: 403 });
    const db = getDb();
    const businessOrders = await db.select().from(orders).where(eq(orders.businessId, business.id)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(100);
    const result = await Promise.all(businessOrders.map(async (order) => ({ ...order, items: await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)) })));
    return Response.json({ orders: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos cargar los pedidos." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const business = await ownedBusiness(request);
    if (!business) return Response.json({ error: "Iniciá sesión para actualizar pedidos." }, { status: 401 });
    if (!hasNegocioAccess(request, business)) return Response.json({ error: "La gestión de pedidos está incluida en el plan Negocio." }, { status: 403 });
    const payload = await request.json() as { id?: number; status?: string };
    const allowed = new Set(["new", "confirmed", "prepared", "delivered"]);
    if (!Number.isInteger(payload.id) || !payload.status || !allowed.has(payload.status)) return Response.json({ error: "Elegí un estado válido." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(orders).where(eq(orders.id, payload.id!)).limit(1);
    if (!existing || existing.businessId !== business.id) return Response.json({ error: "No encontramos ese pedido." }, { status: 404 });
    const [order] = await db.update(orders).set({ status: payload.status }).where(eq(orders.id, existing.id)).returning();
    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos actualizar el pedido." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { customerName?: string; customerPhone?: string; deliveryAddress?: string; notes?: string; items?: Array<{ code: string; name: string; price: number; quantity: number }> };
    const requested = (payload.items ?? []).filter((item) => item.code?.trim() && Number.isInteger(item.quantity) && item.quantity > 0);
    if (!requested.length) return Response.json({ error: "El pedido está vacío." }, { status: 400 });
    const customerName = payload.customerName?.trim() ?? "";
    if (customerName.length < 2) return Response.json({ error: "Ingresá tu nombre o el de tu comercio." }, { status: 400 });
    const business = await ownedBusiness(request);
    const db = getDb();
    if (!business) return Response.json({ error: "El catálogo todavía no está configurado." }, { status: 404 });
    if (!hasCatalogAccess(request, business)) return Response.json({ error: "Tu catálogo está pausado. Elegí un plan para volver a recibir pedidos." }, { status: 403 });
    const published = await db.select().from(products).where(eq(products.businessId, business.id));
    const productByCode = new Map(published.map((product) => [product.code, product]));
    const items = requested.flatMap((item) => { const product = productByCode.get(item.code); return product && product.stock !== 0 ? [{ product, quantity: item.quantity }] : []; });
    if (!items.length) return Response.json({ error: "Los productos elegidos ya no están disponibles." }, { status: 400 });
    const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const [order] = await db.insert(orders).values({ businessId: business.id, customerName: customerName.slice(0, 100), customerPhone: (payload.customerPhone ?? "").replace(/[^0-9+()\-\s]/g, "").slice(0, 30), deliveryAddress: (payload.deliveryAddress ?? "").trim().slice(0, 180), notes: (payload.notes ?? "").trim().slice(0, 500), total, status: "new" }).returning();
    const createdItems = await db.insert(orderItems).values(items.map(({ product, quantity }) => ({ orderId: order.id, productCode: product.code, productName: product.name, unitPrice: product.price, quantity }))).returning();
    return Response.json({ order: { ...order, items: createdItems } }, { status: 201 });
  } catch {
    return Response.json({ error: "No pudimos guardar el pedido. Volvé a intentarlo." }, { status: 500 });
  }
}
