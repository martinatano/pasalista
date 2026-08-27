import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return <main className="legal-page"><header><Link href="/" className="legal-brand" aria-label="Volver al inicio"><span>→</span>PasáLista</Link><Link href="/" className="legal-back">Volver al inicio</Link></header><article><div className="legal-title"><h1>{title}</h1><p>{summary}</p></div><div className="legal-content">{children}</div></article><footer><span>PasáLista · Argentina</span><nav><Link href="/terminos">Términos</Link><Link href="/privacidad">Privacidad</Link><Link href="/cancelacion">Cancelación</Link><Link href="/baja">Baja del servicio</Link></nav></footer></main>;
}

