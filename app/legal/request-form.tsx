"use client";

import { FormEvent, useState } from "react";

export default function LegalRequestForm({ type }: { type: "cancellation" | "withdrawal" }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError("");
    try {
      const response = await fetch("/api/cancellation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, reason, type }) });
      const data = await response.json() as { confirmationCode?: string; error?: string };
      if (!response.ok || !data.confirmationCode) throw new Error(data.error || "No pudimos registrar la solicitud.");
      setCode(data.confirmationCode);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No pudimos registrar la solicitud."); }
    finally { setSending(false); }
  }

  if (code) return <section className="legal-request-success" role="status"><span>Solicitud recibida</span><h2>Guardá este código</h2><strong>{code}</strong><p>Registramos tu pedido. Usaremos el email indicado para verificar la cuenta y confirmar el resultado.</p></section>;
  return <form className="legal-request-form" onSubmit={submit}><label>Email usado para contratar<input required type="email" maxLength={180} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" /></label><label>Comentario <small>Opcional</small><textarea maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contanos si hubo un problema que debamos revisar." /></label>{error && <p className="legal-form-error" role="alert">{error}</p>}<button disabled={sending} type="submit">{sending ? "Registrando…" : type === "withdrawal" ? "Solicitar arrepentimiento" : "Solicitar baja"}</button><p>Podremos pedir una verificación razonable de identidad para evitar bajas fraudulentas.</p></form>;
}

