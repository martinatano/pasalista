import { getDb } from "@/db";
import { cancellationRequests } from "@/db/schema";
import { bodyTooLarge, rateLimit, rateLimitResponse } from "../security";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTIFY_EMAIL = "bajas@pasalista.com.ar";

async function notifyOwner(type: string, email: string, reason: string, confirmationCode: string) {
  if (!process.env.RESEND_API_KEY) return;
  const label = type === "withdrawal" ? "arrepentimiento" : "baja de servicio";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "PasáLista <alertas@pasalista.com.ar>",
        to: [NOTIFY_EMAIL],
        subject: `Nueva solicitud de ${label} — ${email}`,
        html: `<p>Se registró una solicitud de <b>${label}</b>.</p><ul><li><b>Email:</b> ${email}</li><li><b>Código:</b> ${confirmationCode}</li><li><b>Motivo:</b> ${reason || "(sin especificar)"}</li></ul>`,
      }),
    });
  } catch (error) {
    console.error("Cancellation notification email failed", error);
  }
}

export async function POST(request: Request) {
  try {
    if (bodyTooLarge(request, 16_000)) return Response.json({ error: "La solicitud es demasiado extensa." }, { status: 413 });
    const rate = await rateLimit(request, "cancellation", 5, 60 * 60);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfter);
    const payload = await request.json() as { email?: string; reason?: string; type?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";
    if (!emailPattern.test(email) || email.length > 180) return Response.json({ error: "Ingresá el email usado para contratar PasáLista." }, { status: 400 });
    const type = payload.type === "withdrawal" ? "withdrawal" : "cancellation";
    const reason = (payload.reason ?? "").trim().slice(0, 500);
    const confirmationCode = `PL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    await getDb().insert(cancellationRequests).values({ email, type, reason, confirmationCode });
    await notifyOwner(type, email, reason, confirmationCode);
    return Response.json({ confirmationCode }, { status: 201 });
  } catch (error) {
    console.error("Cancellation request failed", error);
    return Response.json({ error: "No pudimos registrar la solicitud. Volvé a intentarlo en unos minutos." }, { status: 500 });
  }
}
