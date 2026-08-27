import Link from "next/link";

export default function NotFound() {
  return <main className="recovery-page"><div className="recovery-card"><span aria-hidden="true">404</span><p>Página no encontrada</p><h1>Este enlace no existe o cambió.</h1><p>Volvé al inicio para entrar a tu panel o buscar el catálogo correcto.</p><div><Link className="primary" href="/">Ir al inicio</Link></div></div></main>;
}
