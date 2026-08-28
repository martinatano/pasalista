import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { authenticatedUserId } from "../auth";
import { devPlanFrom } from "../dev-plan";
import { ownedBusiness } from "../owned-business";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const db = getDb();
  const [business] = await db.select({ logoKey: businesses.logoKey }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!business?.logoKey) return new Response(null, { status: 404 });
  const object = await env.FILES.get(business.logoKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/png", "cache-control": "public, max-age=3600" } });
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: "Iniciá sesión para subir el logo." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) return Response.json({ error: "Elegí una imagen." }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "El archivo debe ser una imagen." }, { status: 400 });
  if (file.size > 2_000_000) return Response.json({ error: "El logo debe pesar menos de 2 MB." }, { status: 400 });

  const db = getDb();
  const business = await ownedBusiness(request);
  if (!business) return Response.json({ error: "No encontramos tu empresa." }, { status: 404 });
  const devPlan = devPlanFrom(request);
  const trialActive = devPlan === "trial" || (!devPlan && business.subscriptionStatus !== "authorized" && Boolean(business.trialEndsAt) && new Date(business.trialEndsAt!).getTime() > Date.now());
  const paidPeriodActive = Boolean(business.currentPeriodEnd) && new Date(business.currentPeriodEnd!).getTime() > Date.now();
  const subscriptionActive = devPlan === "simple" || devPlan === "negocio" || devPlan === "empresa" || (!devPlan && (business.subscriptionStatus === "authorized" || paidPeriodActive));
  if (!trialActive && !subscriptionActive) return Response.json({ error: "Tu catálogo está pausado. Elegí un plan para cambiar el logo." }, { status: 403 });
  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const key = `logos/${business.id}/${crypto.randomUUID()}.${extension}`;
  await env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  if (business.logoKey) await env.FILES.delete(business.logoKey);
  await db.update(businesses).set({ logoKey: key }).where(eq(businesses.id, business.id));
  return Response.json({ logoUrl: `/api/logo?slug=${encodeURIComponent(business.slug)}` });
}
