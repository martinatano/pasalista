import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, products } from "@/db/schema";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug")?.trim();
  const code = params.get("code")?.trim();
  if (!slug || !code) return new Response(null, { status: 400 });
  const db = getDb();
  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!business) return new Response(null, { status: 404 });
  const [product] = await db.select({ imageKey: products.imageKey }).from(products).where(and(eq(products.businessId, business.id), eq(products.code, code))).limit(1);
  if (!product?.imageKey) return new Response(null, { status: 404 });
  const object = await env.FILES.get(product.imageKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/png", "cache-control": "public, max-age=86400" } });
}
