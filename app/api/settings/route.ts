import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { authenticatedUserId } from "../auth";
import { devPlanFrom } from "../dev-plan";

const hexColor = /^#[0-9a-f]{6}$/i;
const slugFrom = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mi-negocio";

export async function PATCH(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: "Iniciá sesión para guardar la configuración." }, { status: 401 });

  const payload = await request.json() as { name?: string; whatsapp?: string; brandColor?: string; minimumOrder?: number; deliveryZones?: string; deliveryDays?: string };
  const name = payload.name?.trim() ?? "";
  const brandColor = payload.brandColor?.trim() ?? "";
  if (name.length < 2) return Response.json({ error: "Ingresá el nombre del negocio." }, { status: 400 });
  if (!hexColor.test(brandColor)) return Response.json({ error: "Elegí un color válido para tu marca." }, { status: 400 });

  const db = getDb();
  const [currentBusiness] = await db.select().from(businesses).where(eq(businesses.ownerUserId, userId)).limit(1);
  if (!currentBusiness) return Response.json({ error: "No encontramos tu empresa." }, { status: 404 });
  const devPlan = devPlanFrom(request);
  const trialActive = devPlan === "trial" || (!devPlan && currentBusiness.subscriptionStatus !== "authorized" && Boolean(currentBusiness.trialEndsAt) && new Date(currentBusiness.trialEndsAt!).getTime() > Date.now());
  const paidPeriodActive = Boolean(currentBusiness.currentPeriodEnd) && new Date(currentBusiness.currentPeriodEnd!).getTime() > Date.now();
  const subscriptionActive = devPlan === "simple" || devPlan === "negocio" || (!devPlan && (currentBusiness.subscriptionStatus === "authorized" || paidPeriodActive));
  if (!trialActive && !subscriptionActive) return Response.json({ error: "Tu catálogo está pausado. Elegí un plan para guardar cambios." }, { status: 403 });
  const baseSlug = slugFrom(name);
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const [match] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (!match || match.id === currentBusiness.id) break;
    slug = `${baseSlug.slice(0, 56)}-${suffix++}`;
  }
  const [business] = await db.update(businesses).set({
    name: name.slice(0, 80),
    slug,
    whatsapp: (payload.whatsapp ?? "").replace(/[^0-9+]/g, "").slice(0, 20),
    brandColor,
    minimumOrder: Math.max(0, Number(payload.minimumOrder) || 0),
    deliveryZones: (payload.deliveryZones ?? "").trim().slice(0, 240),
    deliveryDays: (payload.deliveryDays ?? "").trim().slice(0, 160),
  }).where(eq(businesses.id, currentBusiness.id)).returning();
  return Response.json({ business });
}
