import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
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
  const negocioActive = devPlan === "negocio" || (!devPlan && (account.subscriptionStatus === "authorized" || paidPeriodActive) && account.plan === "negocio");
  if (!trialActive && !negocioActive) return Response.json({ error: "Los catálogos adicionales están incluidos en el plan Negocio." }, { status: 403 });
  if (owned.length >= 3) return Response.json({ error: "El plan Negocio permite hasta 3 catálogos." }, { status: 409 });
  const baseSlug = slugFrom(name);
  let slug = baseSlug;
  let suffix = 2;
  while ((await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1)).length) slug = `${baseSlug.slice(0, 56)}-${suffix++}`;
  const [business] = await db.insert(businesses).values({ ownerUserId: userId, name: name.slice(0, 80), slug, whatsapp: account.whatsapp, brandColor: account.brandColor, minimumOrder: 0, deliveryZones: account.deliveryZones, deliveryDays: account.deliveryDays, plan: account.plan, billingCycle: account.billingCycle, subscriptionStatus: account.subscriptionStatus, trialEndsAt: account.trialEndsAt, currentPeriodEnd: account.currentPeriodEnd }).returning();
  return Response.json({ business: { id: business.id, name: business.name, slug: business.slug } }, { status: 201 });
}
