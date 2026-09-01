import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, products } from "@/db/schema";
import { authenticatedUserId } from "../auth";
import { devPlanFrom } from "../dev-plan";

const slugFrom = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "nuevo-catalogo";

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: "Iniciá sesión para crear otro catálogo." }, { status: 401 });
  const payload = await request.json() as { name?: string };
  const name = payload.name?.trim() ?? "";
  if (name.length < 2) return Response.json({ error: "Ingresá un nombre para el catálogo." }, { status: 400 });
  const db = getDb();
  const owned = await db.select().from(businesses).where(eq(businesses.ownerUserId, userId)).orderBy(asc(businesses.id));
  if (!owned.length) return Response.json({ error: "Primero configurá tu catálogo principal." }, { status: 404 });
  const account = owned[0];
  const devPlan = devPlanFrom(request);
  const trialActive = devPlan === "trial" || (!devPlan && account.subscriptionStatus !== "authorized" && Boolean(account.trialEndsAt) && new Date(account.trialEndsAt!).getTime() > Date.now());
  const paidPeriodActive = Boolean(account.currentPeriodEnd) && new Date(account.currentPeriodEnd!).getTime() > Date.now();
  const negocioActive = devPlan === "negocio" || devPlan === "empresa" || (!devPlan && (account.subscriptionStatus === "authorized" || paidPeriodActive) && (account.plan === "negocio" || account.plan === "empresa"));
  if (!trialActive && !negocioActive) return Response.json({ error: "Los catálogos adicionales están incluidos en el plan Negocio." }, { status: 403 });
  const catalogLimit = devPlan === "empresa" || (!devPlan && account.plan === "empresa" && (account.subscriptionStatus === "authorized" || paidPeriodActive)) ? 20 : 3;
  if (owned.length >= catalogLimit) return Response.json({ error: catalogLimit === 20 ? "El plan Empresa permite hasta 20 catálogos." : "El plan Negocio permite hasta 3 catálogos. Elegí Empresa para crear hasta 20." }, { status: 409 });
  const baseSlug = slugFrom(name);
  let slug = baseSlug;
  let suffix = 2;
  while ((await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1)).length) slug = `${baseSlug.slice(0, 56)}-${suffix++}`;
  const [business] = await db.insert(businesses).values({ ownerUserId: userId, name: name.slice(0, 80), slug, whatsapp: account.whatsapp, brandColor: account.brandColor, minimumOrder: 0, deliveryZones: account.deliveryZones, deliveryDays: account.deliveryDays, plan: account.plan, billingCycle: account.billingCycle, subscriptionStatus: account.subscriptionStatus, trialEndsAt: account.trialEndsAt, currentPeriodEnd: account.currentPeriodEnd }).returning();
  return Response.json({ business: { id: business.id, name: business.name, slug: business.slug, isActive: business.isActive } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: "Iniciá sesión para eliminar un catálogo." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Catálogo inválido." }, { status: 400 });
  const db = getDb();
  const owned = await db.select().from(businesses).where(eq(businesses.ownerUserId, userId)).orderBy(asc(businesses.id));
  const target = owned.find((business) => business.id === id);
  if (!target) return Response.json({ error: "No encontramos ese catálogo." }, { status: 404 });
  if (owned.length <= 1) return Response.json({ error: "No podés eliminar tu único catálogo." }, { status: 409 });
  const productImages = await db.select({ imageKey: products.imageKey }).from(products).where(eq(products.businessId, id));
  const keysToDelete = productImages.map((product) => product.imageKey).filter((key): key is string => Boolean(key));
  if (target.logoKey) keysToDelete.push(target.logoKey);
  await db.delete(businesses).where(eq(businesses.id, id));
  if (keysToDelete.length) await Promise.all(keysToDelete.map((key) => env.FILES.delete(key)));
  const remaining = owned.filter((business) => business.id !== id);
  return Response.json({ ok: true, nextCatalogId: remaining[0].id });
}
