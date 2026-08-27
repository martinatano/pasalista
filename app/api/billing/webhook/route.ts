import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { bodyTooLarge } from "../../security";

function hexBytes(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function validSignature(request: Request, dataId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  const signatureBytes = hexBytes(parts.v1 ?? "");
  if (!parts.ts || !requestId || !signatureBytes) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(manifest));
}

export async function POST(request: Request) {
  try {
    if (bodyTooLarge(request, 64_000)) return Response.json({ ok: false }, { status: 413 });
    const payload = await request.json() as { type?: string; data?: { id?: string } };
    if (payload.type !== "subscription_preapproval" || !payload.data?.id) return Response.json({ ok: true });
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN || !process.env.MERCADOPAGO_WEBHOOK_SECRET) return Response.json({ ok: false }, { status: 503 });
    const requestDataId = new URL(request.url).searchParams.get("data.id") || payload.data.id;
    if (!(await validSignature(request, requestDataId))) return Response.json({ ok: false }, { status: 401 });
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(payload.data.id)}`, { headers: { authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } });
    if (!response.ok) return Response.json({ ok: false }, { status: 502 });
    const subscription = await response.json() as { id: string; status?: string; next_payment_date?: string };
    const mapped = subscription.status === "authorized" ? "authorized" : subscription.status === "cancelled" ? "cancelled" : subscription.status === "paused" ? "paused" : "pending";
    await getDb().update(businesses).set({ subscriptionStatus: mapped, currentPeriodEnd: subscription.next_payment_date ?? null }).where(eq(businesses.mpPreapprovalId, subscription.id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Billing webhook failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
