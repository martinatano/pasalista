"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("PasáLista page error", error); }, [error]);
  return <main className="recovery-page">
    <div className="recovery-card">
      <span aria-hidden="true">!</span>
      <p>Algo se interrumpió</p>
      <h1>No pudimos cargar esta parte de PasáLista.</h1>
      <p>Tu catálogo y tus pedidos siguen guardados. Probá nuevamente; si continúa, volvé al inicio.</p>
      <div><button className="primary" onClick={reset}>Volver a intentar</button><Link href="/">Ir al inicio</Link></div>
    </div>
  </main>;
}
