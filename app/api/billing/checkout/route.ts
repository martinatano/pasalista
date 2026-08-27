import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { authenticatedUserId } from "../../auth";
import { bodyTooLarge, rateLimit, rateLimitResponse } from "../../security";

const plans = { simple: { monthly: 12900, annual: 129000, reason: "PasáLista Simple" }, negocio: { monthly: 24900, annual: 249000, reason: "PasáLista Negocio" } } as const;

export async function POST(request: Request) {
  try {
    if (bodyTooLarge(request, 16_000)) return Response.json({ error: "La solicitud es demasiado extensa." }, { status: 413 });
    const rate = await rateLimit(request, "billing-checkout", 10, 10 * 60);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfter);
    const userId = await authenticatedUserId(request);
    if (!userId) return Response.json({ error: "Iniciá sesión para elegir un plan." }, { status: 401 });
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return Response.json({ error: "Los cobros todavía no están habilitados." }, { status: 503 });
    const payload = await request.json() as { plan?: keyof typeof plans; cycle?: "monthly" | "annual"; email?: string };
    const plan = payload.plan ? plans[payload.plan] : null;
    const cycle = payload.cycle === "annual" ? "annual" : "monthly";
    const email = payload.email?.trim() ?? "";
    if (!plan || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Elegí un plan e ingresá un email válido." }, { status: 400 });
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const db = getDb();
    const [business] = await db.select().from(businesses).where(eq(businesses.ownerUserId, userId)).limit(1);
    if (!business) return Response.json({ error: "Primero configurá tu negocio." }, { status: 404 });
    if (business.subscriptionStatus === "authorized" && business.mpPreapprovalId) {
      if (business.plan === payload.plan) return Response.json({ error: "Ese ya es tu plan actual." }, { status: 409 });
      if (business.plan !== "simple" || payload.plan !== "negocio") return Response.json({ error: "El cambio a Simple se aplica al finalizar el período actual." }, { status: 409 });
      const currentCycle = business.billingCycle === "annual" ? "annual" : "monthly";
      const upgradeResponse = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(business.mpPreapprovalId)}`, { method: "PUT", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ reason: `${plan.reason} ${currentCycle === "annual" ? "Anual" : "Mensual"}`, auto_recurring: { transaction_amount: plan[currentCycle], currency_id: "ARS" } }) });
      const upgradeData = await upgradeResponse.json() as { id?: string; status?: string; error?: string; message?: string; cause?: Array<{ description?: string }> };
      if (!upgradeResponse.ok || !upgradeData.id) {
        const causes = upgradeData.cause?.map((cause) => cause.description).filter(Boolean).join(" · ");
        throw new Error([upgradeData.message || upgradeData.error || "Mercado Pago rechazó el cambio de plan.", causes].filter(Boolean).join(" — "));
      }
      await db.update(businesses).set({ plan: "negocio", subscriptionStatus: "authorized" }).where(eq(businesses.id, business.id));
      return Response.json({ upgraded: true, plan: "negocio", billingCycle: currentCycle });
    }
    const isTestMode = accessToken.startsWith("TEST-");
    const testPayerEmail = process.env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim();
    if (isTestMode && !testPayerEmail) return Response.json({ error: "Falta configurar el email del comprador de prueba argentino." }, { status: 503 });
    const payerEmail = isTestMode ? testPayerEmail! : email;
    const requestUrl = new URL(request.url);
    const publicOrigin = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1"
      ? "https://pasalista.com.ar"
      : requestUrl.origin;
    const response = await fetch("https://api.mercadopago.com/preapproval", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ reason: `${plan.reason} ${cycle === "annual" ? "Anual" : "Mensual"}`, external_reference: `${business.id}:${payload.plan}:${cycle}`, payer_email: payerEmail, auto_recurring: { frequency: cycle === "annual" ? 12 : 1, frequency_type: "months", transaction_amount: plan[cycle], currency_id: "ARS" }, back_url: `${publicOrigin}/?suscripcion=confirmada`, status: "pending" }) });
    const data = await response.json() as { id?: string; init_point?: string; error?: string; message?: string; status?: number; cause?: Array<{ code?: string | number; description?: string }> };
    if (!response.ok || !data.id || !data.init_point) {
      const causes = data.cause?.map((cause) => cause.description || String(cause.code || "")).filter(Boolean).join(" · ");
      console.error("Mercado Pago checkout response", { status: response.status, error: data.error, message: data.message, cause: data.cause });
      throw new Error([data.message || data.error || "Mercado Pago rechazó la solicitud.", causes].filter(Boolean).join(" — "));
    }
    await db.update(businesses).set({ plan: payload.plan, billingCycle: cycle, subscriptionStatus: "pending", mpPreapprovalId: data.id }).where(eq(businesses.id, business.id));
    return Response.json({ checkoutUrl: data.init_point });
  } catch (error) {
    console.error("Billing checkout failed", error);
    const isTestMode = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith("TEST-");
    const detail = error instanceof Error ? error.message : "Error desconocido";
    return Response.json({ error: isTestMode ? `Mercado Pago: ${detail}` : "No pudimos iniciar el cobro. Volvé a intentarlo." }, { status: 500 });
  }
}
