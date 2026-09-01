"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { productEmoji } from "../../product-emoji";
import Link from "next/link";

type Product = { code: string; name: string; detail: string; category: string; price: number; stock?: number | null; emoji: string; imageKey?: string | null };
type Business = { name: string; slug: string; whatsapp: string; brandColor: string; currency: string; minimumOrder: number; deliveryZones: string; deliveryDays: string; logoKey?: string | null };
const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const productsPerPage = 24;
const demoBusiness: Business = { name: "Distribuidora El Buen Sabor", slug: "demo", whatsapp: "", brandColor: "#fa7c4a", currency: "ARS", minimumOrder: 80000, deliveryZones: "Zona Norte", deliveryDays: "Jueves" };
const demoProducts: Product[] = [
  { code: "POL-001", name: "Pollo entero", detail: "Caja de 12 kg", category: "Pollos", price: 48000, stock: 18, emoji: "🍗" },
  { code: "POL-014", name: "Suprema de pollo", detail: "Caja de 10 kg", category: "Pollos", price: 73500, stock: 9, emoji: "🍗" },
  { code: "POL-021", name: "Pata muslo", detail: "Caja de 15 kg", category: "Pollos", price: 52000, stock: 24, emoji: "🍗" },
  { code: "HUE-030", name: "Maple de huevos", detail: "30 unidades · color", category: "Huevos", price: 4800, stock: 42, emoji: "🥚" },
  { code: "HUE-036", name: "Cajón de huevos", detail: "12 maples", category: "Huevos", price: 52800, stock: 7, emoji: "🥚" },
  { code: "QUE-041", name: "Queso cremoso", detail: "Precio por kg", category: "Quesos", price: 7200, stock: 16, emoji: "🧀" },
  { code: "QUE-052", name: "Mozzarella", detail: "Barra de 4 kg aprox.", category: "Quesos", price: 8900, stock: 12, emoji: "🧀" },
  { code: "QUE-063", name: "Queso pategrás", detail: "Hormas de 3 kg aprox.", category: "Quesos", price: 11400, stock: 5, emoji: "🧀" },
  { code: "FIA-071", name: "Jamón cocido", detail: "Pieza de 5 kg aprox.", category: "Fiambres", price: 9800, stock: 8, emoji: "🥩" },
  { code: "FIA-082", name: "Panceta ahumada", detail: "Precio por kg", category: "Fiambres", price: 12600, stock: 0, emoji: "🥩" },
  { code: "CON-091", name: "Mayonesa gastronómica", detail: "Balde de 3 kg", category: "Almacén", price: 9400, stock: 14, emoji: "🥣" },
  { code: "CON-102", name: "Aceite de girasol", detail: "Caja de 6 × 1,5 l", category: "Almacén", price: 21200, stock: 20, emoji: "🫗" },
];

export default function PublicCatalog({ slug }: { slug: string }) {
  const isDemo = slug === "demo";
  const [business, setBusiness] = useState<Business | null>(isDemo ? demoBusiness : null);
  const money = business?.currency === "USD" ? dollars : pesos;
  const [products, setProducts] = useState<Product[]>(isDemo ? demoProducts : []);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [page, setPage] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(!isDemo);
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const customerNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDemo) {
      return;
    }
    const headers = new Headers();
    const localPlan = window.localStorage.getItem("pasalista-dev-plan");
    if (localPlan) headers.set("x-pasalista-dev-plan", localPlan);
    fetch(`/api/public-catalog?slug=${encodeURIComponent(slug)}`, { headers }).then(async (response) => {
      const data = await response.json() as { business?: Business; products?: Product[]; paused?: boolean; error?: string };
      if (!response.ok || !data.business) throw new Error(data.error || "No pudimos abrir el catálogo.");
      setBusiness(data.business); setProducts(data.products ?? []); setPaused(Boolean(data.paused));
    }).catch((error) => setNotice(error instanceof Error ? error.message : "No pudimos abrir el catálogo.")).finally(() => setLoading(false));
  }, [isDemo, slug]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))], [products]);
  const visible = products.filter((product) => (category === "Todos" || product.category === category) && normalize(`${product.name} ${product.code}`).includes(normalize(search)));
  const pageCount = Math.max(1, Math.ceil(visible.length / productsPerPage));
  const pagedProducts = visible.slice((page - 1) * productsPerPage, page * productsPerPage);
  const count = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const total = products.reduce((sum, product) => sum + (quantities[product.code] ?? 0) * product.price, 0);
  const selectedProducts = products.filter((product) => (quantities[product.code] ?? 0) > 0);
  const delivery = [business?.deliveryZones, business?.deliveryDays].filter(Boolean).join(" · ") || "Entrega a coordinar";
  function change(code: string, delta: number) { setQuantities((current) => ({ ...current, [code]: Math.max(0, (current[code] ?? 0) + delta) })); setNotice(""); setCheckoutError(""); }

  useEffect(() => {
    if (!showCheckout) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setShowCheckout(false); };
    document.addEventListener("keydown", close); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [showCheckout]);

  async function sendOrder() {
    if (!business || !count) return setCheckoutError("Agregá al menos un producto al pedido.");
    if (customerName.trim().length < 2) {
      setCheckoutError("Completá el nombre o comercio para poder hacer el pedido.");
      customerNameRef.current?.focus();
      return;
    }
    if (business.minimumOrder > 0 && total < business.minimumOrder) return setCheckoutError(`Te faltan ${money.format(business.minimumOrder - total)} para llegar al pedido mínimo de ${money.format(business.minimumOrder)}.`);
    setCheckoutError("");
    if (isDemo) {
      setShowCheckout(false);
      setNotice("¡Demo completada! En un catálogo real, ahora se abriría WhatsApp con el pedido listo para enviar.");
      setQuantities({});
      return;
    }
    setSending(true); setNotice("");
    try {
      const selected = selectedProducts;
      const headers = new Headers({ "content-type": "application/json" });
      const localPlan = window.localStorage.getItem("pasalista-dev-plan");
      if (localPlan) headers.set("x-pasalista-dev-plan", localPlan);
      const response = await fetch("/api/public-catalog", { method: "POST", headers, body: JSON.stringify({ slug, customerName, customerPhone, deliveryAddress, notes, items: selected.map((product) => ({ code: product.code, quantity: quantities[product.code] })) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos guardar el pedido.");
      const lines = selected.map((product) => `${quantities[product.code]} × ${product.name} (${product.code}) — ${money.format(product.price * quantities[product.code])}`);
      const message = [`*Pedido — ${customerName.trim()}*`, customerPhone.trim() ? `Teléfono: ${customerPhone.trim()}` : "", deliveryAddress.trim() ? `Dirección: ${deliveryAddress.trim()}` : "", "", ...lines, "", `*Total estimado: ${money.format(total)}*`, `Entrega: ${delivery}`, notes.trim() ? `Observaciones: ${notes.trim()}` : ""].filter(Boolean).join("\n");
      const phone = business.whatsapp.replace(/\D/g, "");
      if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      setNotice(phone ? "Pedido preparado. Se abrió WhatsApp para enviarlo." : "Pedido enviado correctamente.");
      setQuantities({});
      setShowCheckout(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos guardar el pedido."); }
    finally { setSending(false); }
  }

  if (loading) return <main className="public-state">Abriendo catálogo…</main>;
  if (!business) return <main className="public-state"><h1>Catálogo no disponible</h1><p>{notice}</p></main>;
  if (paused) return <main className="public-catalog paused-public" style={{ "--customer-brand": business.brandColor } as React.CSSProperties}><header className="store-header"><div className="store-identity">{business.logoKey ? <img src={`/api/logo?slug=${encodeURIComponent(slug)}`} alt={`Logo de ${business.name}`} /> : <span>{business.name.charAt(0)}</span>}<div><b>{business.name}</b><small>Catálogo mayorista</small></div></div></header><section className="paused-public-message"><span aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M9 14V9a7 7 0 0114 0v5M7 14h18v14H7z"/><path d="M16 19v4"/></svg></span><h1>Este catálogo está temporalmente pausado</h1><p>La lista no está disponible en este momento. Contactá al comercio para consultar precios o realizar un pedido.</p></section><footer className="public-footer">Catálogo creado con <b>PasáLista</b></footer></main>;
  return <main className="public-catalog" style={{ "--customer-brand": business.brandColor } as React.CSSProperties}>
    {isDemo && <aside className="demo-catalog-banner"><div><b>Estás explorando una demo</b><span>Probá el buscador, agregá productos y completá un pedido. Nada se guarda ni se envía.</span></div><Link href="/">Crear mi catálogo</Link></aside>}
    <header className="store-header"><div className="store-identity">{business.logoKey ? <img src={`/api/logo?slug=${encodeURIComponent(slug)}`} alt={`Logo de ${business.name}`} /> : <span>{business.name.charAt(0)}</span>}<div><b>{business.name}</b><small>Catálogo mayorista{business.currency === "USD" && <> · <span className="currency-badge">Precios en USD</span></>}</small></div></div><small>{business.minimumOrder > 0 ? `Pedido mínimo ${money.format(business.minimumOrder)}` : "Sin pedido mínimo"}</small></header>
    <section className="customer-main public-main"><div className="public-welcome"><div><span>Catálogo actualizado</span><h1>Armá tu pedido</h1><p>Elegí los productos, revisá las cantidades y envialo listo por WhatsApp.</p></div></div>
      {notice && <div className="notice" role="status">{notice}</div>}<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label="Buscar productos" placeholder="Buscar por producto o código…" />
      <div className="category-row">{categories.map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => { setCategory(item); setPage(1); }}>{item}</button>)}</div>
      <div className="product-grid">{pagedProducts.map((product) => { const quantity = quantities[product.code] ?? 0; const image = product.imageKey ? `/api/product-image?slug=${encodeURIComponent(slug)}&code=${encodeURIComponent(product.code)}` : ""; return <article className={`product ${product.stock === 0 ? "sold-out" : ""}`} key={product.code}><span className="product-emoji">{image ? <img src={image} alt={product.name} /> : productEmoji(product.name, product.category, product.emoji)}</span><div><b>{product.name}</b><small>{product.detail}{product.detail ? " · " : ""}{product.code}</small><strong>{money.format(product.price)}</strong></div>{product.stock === 0 ? <em>Sin stock</em> : <div className="quantity"><button onClick={() => change(product.code, -1)} aria-label={`Quitar ${product.name}`}>−</button><span>{quantity}</span><button onClick={() => change(product.code, 1)} aria-label={`Agregar ${product.name}`}>+</button></div>}</article>; })}</div>
      {visible.length > productsPerPage && <nav className="catalog-pagination" aria-label="Páginas del catálogo"><span>Mostrando {(page - 1) * productsPerPage + 1}–{Math.min(page * productsPerPage, visible.length)} de {visible.length}</span><div><button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><b>{page} de {pageCount}</b><button disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></nav>}
      {!visible.length && <div className="empty">No encontramos productos con esa búsqueda.</div>}{showCheckout && count > 0 && <section className="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="public-checkout-title"><header><div><h2 id="public-checkout-title">Revisá tu pedido</h2><p>Confirmá los productos y completá tus datos.</p></div><button onClick={() => { setShowCheckout(false); setCheckoutError(""); }} aria-label="Cerrar revisión">Cerrar</button></header><div className="checkout-items">{selectedProducts.map((product) => <div key={product.code}><span>{quantities[product.code]}×</span><div><b>{product.name}</b><small>{product.code}</small></div><strong>{money.format(product.price * quantities[product.code])}</strong></div>)}</div><div className="checkout-fields"><label>Nombre o comercio *<input ref={customerNameRef} required minLength={2} maxLength={100} aria-invalid={checkoutError.includes("nombre") || undefined} aria-describedby={checkoutError ? "public-checkout-error" : undefined} value={customerName} onChange={(event) => { setCustomerName(event.target.value); if (checkoutError) setCheckoutError(""); }} placeholder="Ej. Almacén Don José" /></label><label>Teléfono<input inputMode="tel" maxLength={30} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Ej. 11 2345 6789" /></label><label className="wide">Dirección de entrega<input maxLength={180} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Calle, número y localidad" /></label><label className="wide">Observaciones<textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Horario, indicaciones o productos a reemplazar…" /></label>{checkoutError && <p className="checkout-error wide" id="public-checkout-error" role="alert">{checkoutError}</p>}</div><footer><span>Total</span><strong>{money.format(total)}</strong><button disabled={sending} onClick={sendOrder}>{sending ? "Preparando…" : "Confirmar y abrir WhatsApp"}</button></footer></section>}<div className="cart-bar"><div><b>{count} productos · {money.format(total)}</b><small>{business.minimumOrder > 0 && total < business.minimumOrder ? `Faltan ${money.format(business.minimumOrder - total)} para el mínimo` : delivery}</small></div><button disabled={sending || count === 0} onClick={() => { setCheckoutError(""); setShowCheckout(true); }}>Revisar pedido</button></div>
    </section><footer className="public-footer">Catálogo creado con <b>PasáLista</b> · <a href="/privacidad">Privacidad</a>{isDemo && <> · <Link href="/">Creá el tuyo</Link></>}</footer>
  </main>;
}
