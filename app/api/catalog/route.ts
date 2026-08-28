import { env } from "cloudflare:workers";
import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, imports, orders, products } from "@/db/schema";
import { authenticatedUserId } from "../auth";
import { devPlanFrom } from "../dev-plan";
import { bodyTooLarge } from "../security";

async function requireBusiness(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return null;
  const db = getDb();
  let owned = await db.select().from(businesses).where(eq(businesses.ownerUserId, userId)).orderBy(asc(businesses.id));
  let business = owned[0];
  if (!business) {
    const [legacyBusiness] = await db.select().from(businesses).where(isNull(businesses.ownerUserId)).limit(1);
    if (legacyBusiness) {
      [business] = await db.update(businesses).set({ ownerUserId: userId }).where(eq(businesses.id, legacyBusiness.id)).returning();
    } else {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      [business] = await db.insert(businesses).values({ ownerUserId: userId, name: "Mi distribuidora", slug: `catalogo-${userId.slice(-8).toLowerCase()}`, trialEndsAt }).returning();
    }
    owned = [business];
  }
  const requestedId = Number(request.headers.get("x-pasalista-catalog-id"));
  business = owned.find((item) => item.id === requestedId) ?? business;
  if (!business.trialEndsAt) {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    [business] = await db.update(businesses).set({ trialEndsAt }).where(eq(businesses.id, business.id)).returning();
  }
  return business;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const business = await requireBusiness(request);
    if (!business) return Response.json({ error: "Iniciá sesión para acceder a tu catálogo." }, { status: 401 });
    const [catalogProducts, lastImport, orderCount] = await Promise.all([
      db.select({ code: products.code, name: products.name, detail: products.detail, category: products.category, price: products.price, stock: products.stock, emoji: products.emoji, imageKey: products.imageKey }).from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.id)),
      db.select().from(imports).where(eq(imports.businessId, business.id)).orderBy(desc(imports.createdAt), desc(imports.id)).limit(1),
      db.select({ count: sql<number>`count(*)` }).from(orders).where(eq(orders.businessId, business.id)),
    ]);
    const catalogs = await db.select({ id: businesses.id, name: businesses.name, slug: businesses.slug }).from(businesses).where(eq(businesses.ownerUserId, business.ownerUserId)).orderBy(asc(businesses.id));
    return Response.json({ business, catalogs, products: catalogProducts, lastImport: lastImport[0] ?? null, orders: Number(orderCount[0]?.count ?? 0) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No pudimos cargar el catálogo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (bodyTooLarge(request, 80_000_000)) return Response.json({ error: "La lista contiene demasiadas imágenes para procesarlas juntas. Excluí algunas fotos y volvé a intentarlo." }, { status: 413 });
    const payload = await request.json() as { filename?: string; products?: Array<{ code: string; name: string; detail?: string; category?: string; price: number; stock?: number; emoji?: string; imageDataUrl?: string | null }> };
    if (!payload.filename?.trim() || !payload.products?.length) return Response.json({ error: "La importación está vacía." }, { status: 400 });
    const valid = payload.products.filter((item) => item.code?.trim() && item.name?.trim() && Number(item.price) > 0).map((item) => ({ ...item, code: item.code.trim(), name: item.name.trim() }));
    const usedCodes = new Set<string>();
    let adjustedCodes = 0;
    const clean = valid.map((item) => {
      const baseCode = item.code;
      let code = baseCode;
      let suffix = 2;
      while (usedCodes.has(code.toLocaleLowerCase("es"))) code = `${baseCode}-${suffix++}`;
      usedCodes.add(code.toLocaleLowerCase("es"));
      if (code !== baseCode) adjustedCodes += 1;
      return { ...item, code };
    });
    if (!clean.length) return Response.json({ error: "No hay productos válidos para publicar." }, { status: 400 });
    const db = getDb();
    const business = await requireBusiness(request);
    if (!business) return Response.json({ error: "Iniciá sesión para publicar tu catálogo." }, { status: 401 });
    if (business.name.trim().toLowerCase() === "mi distribuidora" || business.whatsapp.replace(/\D/g, "").length < 8) return Response.json({ error: "Antes de publicar, configurá el nombre del negocio y el WhatsApp donde querés recibir pedidos." }, { status: 409 });
    const devPlan = devPlanFrom(request);
    const trialActive = devPlan === "trial" || (!devPlan && business.subscriptionStatus !== "authorized" && Boolean(business.trialEndsAt) && new Date(business.trialEndsAt!).getTime() > Date.now());
    const paidPeriodActive = Boolean(business.currentPeriodEnd) && new Date(business.currentPeriodEnd!).getTime() > Date.now();
    const subscriptionActive = devPlan === "simple" || devPlan === "negocio" || devPlan === "empresa" || (!devPlan && (business.subscriptionStatus === "authorized" || paidPeriodActive));
    const negocioActive = devPlan === "negocio" || devPlan === "empresa" || (!devPlan && (business.subscriptionStatus === "authorized" || paidPeriodActive) && (business.plan === "negocio" || business.plan === "empresa"));
    if (!trialActive && !subscriptionActive) return Response.json({ error: "Tu prueba terminó. Elegí un plan para volver a publicar el catálogo." }, { status: 403 });
    if (!trialActive && !negocioActive && clean.length > 300) return Response.json({ error: "El plan Simple admite hasta 300 productos. Elegí Negocio para publicar la lista completa." }, { status: 403 });
    const previousProducts = await db.select({ code: products.code, imageKey: products.imageKey }).from(products).where(eq(products.businessId, business.id));
    const previousImageByCode = new Map(previousProducts.flatMap((item) => item.imageKey ? [[item.code.toLocaleLowerCase("es"), item.imageKey] as const] : []));
    const previousImages = previousProducts.flatMap((item) => item.imageKey ? [item.imageKey] : []);
    const uploadedKeys = new Set<string>();
    const imageKeys = new Map<string, string>();
    const imageEntries = Array.from(new Set(clean.flatMap((item) => item.imageDataUrl ? [item.imageDataUrl] : [])));
    try {
      for (let offset = 0; offset < imageEntries.length; offset += 10) {
        await Promise.all(imageEntries.slice(offset, offset + 10).map(async (dataUrl) => {
          const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
          if (!match) return;
          const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
          if (bytes.byteLength > 2_000_000) return;
          const extension = match[1].split("/")[1].replace("jpeg", "jpg");
          const key = `products/${business.id}/${crypto.randomUUID()}.${extension}`;
          await env.FILES.put(key, bytes, { httpMetadata: { contentType: match[1] } });
          imageKeys.set(dataUrl, key);
          uploadedKeys.add(key);
        }));
      }
    } catch (error) {
      await Promise.all(Array.from(uploadedKeys, (key) => env.FILES.delete(key)));
      throw error;
    }
    const values = clean.map((item) => ({ businessId: business.id, code: item.code, name: item.name, detail: item.detail?.trim() ?? "", category: item.category?.trim() || "General", price: Number(item.price), stock: item.stock == null ? null : Number(item.stock), emoji: item.emoji || "📦", imageKey: item.imageDataUrl ? imageKeys.get(item.imageDataUrl) ?? previousImageByCode.get(item.code.toLocaleLowerCase("es")) ?? null : previousImageByCode.get(item.code.toLocaleLowerCase("es")) ?? null }));
    // D1 accepts at most 100 bound values per SQL statement. Each product uses
    // ten, so groups of ten keep large catalogs safely below that limit.
    const productsPerInsert = 10;
    const chunks = Array.from({ length: Math.ceil(values.length / productsPerInsert) }, (_, index) => values.slice(index * productsPerInsert, index * productsPerInsert + productsPerInsert));
    const statements = [
      db.delete(products).where(eq(products.businessId, business.id)),
      ...chunks.map((chunk) => db.insert(products).values(chunk)),
      db.insert(imports).values({ businessId: business.id, filename: payload.filename.trim(), productCount: clean.length }),
    ];
    try {
      await db.batch(statements as [typeof statements[number], ...Array<typeof statements[number]>]);
    } catch (error) {
      await Promise.all(Array.from(uploadedKeys, (key) => env.FILES.delete(key)));
      throw error;
    }
    const retainedImages = new Set(values.flatMap((item) => item.imageKey ? [item.imageKey] : []));
    await Promise.all(previousImages.filter((key) => !retainedImages.has(key)).map((key) => env.FILES.delete(key)));
    const responseProducts = values.map((item) => ({ code: item.code, name: item.name, detail: item.detail, category: item.category, price: item.price, stock: item.stock, emoji: item.emoji, imageKey: item.imageKey }));
    return Response.json({ products: responseProducts, adjustedCodes, lastImport: { filename: payload.filename.trim(), productCount: clean.length } });
  } catch (error) {
    console.error("Catalog import failed", error);
    return Response.json({ error: "No pudimos guardar la lista. Tu catálogo anterior no fue modificado; volvé a intentarlo." }, { status: 500 });
  }
}
