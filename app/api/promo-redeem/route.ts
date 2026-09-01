import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, promoCodes } from "@/db/schema";
import { authenticatedUserId } from "../auth";
import { bodyTooLarge, rateLimit, rateLimitResponse } from "../security";

const planNames: Record<string, string> = { simple: "Simple", negocio: "Negocio", empresa: "Empresa" };

export async function POST(request: Request) {
  try {
    if (bodyTooLarge(request, 2_000)) return Response.json({ error: "La solicitud es demasiado extensa." }, { status: 413 });
    const rate = await rateLimit(request, "promo-redeem", 10, 10 * 60);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfter);
    const userId = await authenticatedUserId(request);
    if (!userId) return Response.json({ error: "Iniciá sesión para canjear un código." }, { status: 401 });
    const payload = await request.json() as { code?: string };
    const code = payload.code?.trim().toUpperCase() ?? "";
    if (!code) return Response.json({ error: "Ingresá un código." }, { status: 400 });
    const db = getDb();
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
    if (!promo) return Response.json({ error: "Ese código no existe." }, { status: 404 });
    if (promo.redeemedAt) return Response.json({ error: "Ese código ya fue usado." }, { status: 409 });
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return Response.json({ error: "Ese código venció." }, { status: 409 });
    const owned = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerUserId, userId));
    if (!owned.length) return Response.json({ error: "Primero configurá tu catálogo principal." }, { status: 404 });
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + promo.months);
    await db.update(businesses).set({ plan: promo.plan, subscriptionStatus: "authorized", currentPeriodEnd: periodEnd.toISOString(), isActive: true }).where(eq(businesses.ownerUserId, userId));
    await db.update(promoCodes).set({ redeemedAt: new Date().toISOString(), redeemedByUserId: userId }).where(eq(promoCodes.id, promo.id));
    return Response.json({ ok: true, plan: promo.plan, planName: planNames[promo.plan] ?? promo.plan, months: promo.months, currentPeriodEnd: periodEnd.toISOString() });
  } catch (error) {
    console.error("Promo redeem failed", error);
    return Response.json({ error: "No pudimos canjear el código. Volvé a intentarlo." }, { status: 500 });
  }
}
