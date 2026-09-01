"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignIn, SignUp, UserButton, useAuth, useUser } from "@clerk/react";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { productEmoji } from "./product-emoji";

type Product = { code: string; name: string; detail: string; category: string; price: number; stock?: number | null; emoji: string; imageKey?: string | null; imageDataUrl?: string | null };
type ImportSummary = { filename: string; added: number; updated: number; removed: number; adjustedCodes: number; products: Product[] };
type BusinessSettings = { id?: number; name: string; whatsapp: string; brandColor: string; currency: string; minimumOrder: number; deliveryZones: string; deliveryDays: string; slug: string; logoKey?: string | null };
type CatalogSummary = { id: number; name: string; slug: string; isActive?: boolean };
type PaidPlan = "simple" | "negocio" | "empresa";
type BillingInfo = { plan: "trial" | PaidPlan; billingCycle: "monthly" | "annual"; subscriptionStatus: "trial" | "pending" | "authorized" | "paused" | "cancelled"; trialEndsAt?: string | null; currentPeriodEnd?: string | null; isActive?: boolean };
type DevScenario = "trial" | PaidPlan | "expired";
type MappingKey = "name" | "price" | "code" | "detail" | "category" | "stock";
type ColumnMapping = Record<MappingKey, number | null>;
type PendingMapping = { filename: string; headers: string[]; rows: unknown[][]; images: Array<string | null>; mapping: ColumnMapping };
type OrderItem = { id: number; productCode: string; productName: string; unitPrice: number; quantity: number };
type Order = { id: number; customerName: string; customerPhone?: string; deliveryAddress?: string; notes?: string; total: number; status: "new" | "confirmed" | "prepared" | "delivered"; createdAt: string; items: OrderItem[] };

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const productsPerPage = 24;
const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const slugFrom = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mi-negocio";
const columnAliases = {
  code: ["codigo", "cod", "sku", "referencia", "ref", "idproducto", "idarticulo"],
  name: ["producto", "nombre", "descripcion", "articulo", "item", "mercaderia", "detalleproducto"],
  detail: ["presentacion", "detalle", "formato", "unidad", "envase", "contenido", "medida"],
  category: ["categoria", "rubro", "familia", "grupo"],
  price: ["precio", "precioventa", "preciounitario", "venta", "importe", "pvp", "valor", "lista", "neto"],
  stock: ["stock", "existencia", "cantidad", "disponible", "saldo"],
};

function findColumnIndex(headers: string[], aliases: string[]) {
  const exact = headers.findIndex((header) => aliases.includes(normalize(header)));
  if (exact >= 0) return exact;
  const partial = headers.findIndex((header) => aliases.some((alias) => normalize(header).includes(alias)));
  return partial >= 0 ? partial : null;
}
function numberFrom(value: unknown) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").replace(/[$\s]/g, "");
  if (!raw) return 0;
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, "")) || 0;
  return Number(raw) || 0;
}

function readableCategory(value: unknown) {
  return String(value ?? "")
    .replace(/^\s*productos?(?:\s+de)?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSectionRow(row: unknown[], mapping: ColumnMapping) {
  if (mapping.name == null || mapping.price == null) return false;
  const name = String(row[mapping.name] ?? "").trim();
  const rawPrice = String(row[mapping.price] ?? "").trim();
  if (!name || numberFrom(row[mapping.price]) > 0) return false;
  return normalize(rawPrice).includes("precio");
}

function inferredDetail(row: unknown[], headers: string[], mapping: ColumnMapping) {
  if (mapping.detail != null) return String(row[mapping.detail] ?? "").trim();
  if (mapping.name == null || mapping.price == null) return "";
  const reserved = new Set(Object.values(mapping).filter((index): index is number => index != null));
  const start = Math.min(mapping.name, mapping.price) + 1;
  const end = Math.max(mapping.name, mapping.price);
  return row.slice(start, end).map((cell, offset) => ({
    value: String(cell ?? "").replace(/\s+/g, " ").trim(),
    index: start + offset,
  })).filter(({ value, index }) => value && !reserved.has(index) && /^Columna \d+$/.test(headers[index] ?? ""))
    .map(({ value }) => value)
    .join(" · ");
}
function iconFor(name: string, category: string) {
  const text = normalize(`${name} ${category}`);
  if (text.includes("huevo")) return "🥚";
  if (text.includes("ques") || text.includes("muz")) return "🧀";
  if (text.includes("pollo") || text.includes("pechuga")) return "🍗";
  if (text.includes("carne") || text.includes("vacio") || text.includes("asado")) return "🥩";
  if (text.includes("pescado") || text.includes("atun")) return "🐟";
  if (text.includes("aceitun") || text.includes("oliva")) return "🫒";
  if (text.includes("miel")) return "🍯";
  if (text.includes("mermelada") || text.includes("dulce")) return "🍓";
  if (text.includes("yerba") || text.includes("mate")) return "🧉";
  if (text.includes("ajo")) return "🧄";
  if (text.includes("cebolla")) return "🧅";
  if (text.includes("berenjena")) return "🍆";
  if (text.includes("pepino")) return "🥒";
  if (text.includes("poroto") || text.includes("hummus")) return "🫘";
  if (text.includes("aji") || text.includes("pimiento") || text.includes("salsa") || text.includes("kimchi")) return "🌶️";
  if (text.includes("alcaucil") || text.includes("esparrago") || text.includes("hortaliza") || text.includes("coliflor") || text.includes("chucrut")) return "🥬";
  if (text.includes("pasta") || text.includes("crema") || text.includes("pure") || text.includes("conserva") || text.includes("pickle")) return "🫙";
  if (text.includes("pan") || text.includes("gallet") || text.includes("tostada")) return "🥖";
  if (text.includes("harina") || text.includes("cereal") || text.includes("avena")) return "🌾";
  if (text.includes("cafe")) return "☕";
  if (text.includes("vino")) return "🍷";
  if (text.includes("cerveza")) return "🍺";
  if (text.includes("agua") || text.includes("jugo") || text.includes("gaseosa") || text.includes("bebida")) return "🥤";
  if (text.includes("mascota") || text.includes("perro") || text.includes("gato") || text.includes("pet")) return "🐾";
  if (text.includes("limpieza") || text.includes("jabon") || text.includes("detergente")) return "🧼";
  return "🛍️";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

function optimizeCatalogImage(dataUrl: string) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maximumSide = 720;
      const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return resolve(dataUrl);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const optimized = canvas.toDataURL("image/webp", 0.7);
      resolve(optimized.length < dataUrl.length ? optimized : dataUrl);
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function optimizeCellImages(images: Map<number, string>) {
  const optimizedBySource = new Map<string, string>();
  await Promise.all(Array.from(new Set(images.values())).map(async (source) => {
    optimizedBySource.set(source, await optimizeCatalogImage(source));
  }));
  return new Map(Array.from(images, ([row, source]) => [row, optimizedBySource.get(source) ?? source]));
}

function extractCellImages(buffer: ArrayBuffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const text = (path: string) => files[path] ? strFromU8(files[path]) : "";
  const sheetXml = text("xl/worksheets/sheet1.xml");
  const metadataXml = text("xl/metadata.xml");
  const valuesXml = text("xl/richData/rdrichvalue.xml");
  const valueRelsXml = text("xl/richData/richValueRel.xml");
  const relsXml = text("xl/richData/_rels/richValueRel.xml.rels");
  if (!sheetXml || !metadataXml || !valuesXml || !valueRelsXml || !relsXml) return new Map<number, string>();

  const metadataToValue = Array.from(metadataXml.matchAll(/<xlrd:rvb\b[^>]*\bi="(\d+)"/g), (match) => Number(match[1]));
  const valueToRelation = Array.from(valuesXml.matchAll(/<rv\b[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/rv>/g), (match) => Number(match[1]));
  const relationIds = Array.from(valueRelsXml.matchAll(/<rel\b[^>]*\br:id="([^"]+)"/g), (match) => match[1]);
  const targets = new Map(Array.from(relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g), (match) => [match[1], match[2]]));
  const images = new Map<number, string>();

  for (const match of sheetXml.matchAll(/<c\b[^>]*\br="B(\d+)"[^>]*\bvm="(\d+)"[^>]*>/g)) {
    const sheetRow = Number(match[1]) - 1;
    const valueIndex = metadataToValue[Number(match[2]) - 1];
    const relationId = relationIds[valueToRelation[valueIndex]];
    const target = relationId ? targets.get(relationId) : undefined;
    const filename = target?.split("/").pop();
    const bytes = filename ? files[`xl/media/${filename}`] : undefined;
    if (!bytes || !filename) continue;
    const extension = filename.split(".").pop()?.toLowerCase();
    const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : extension === "gif" ? "image/gif" : "image/png";
    images.set(sheetRow, bytesToDataUrl(bytes, mime));
  }

  for (const match of sheetXml.matchAll(/<mergeCell\b[^>]*\bref="B(\d+):B(\d+)"/g)) {
    const start = Number(match[1]) - 1;
    const end = Number(match[2]) - 1;
    const image = images.get(start);
    if (image) for (let row = start + 1; row <= end; row += 1) images.set(row, image);
  }
  return images;
}

function FlowIcon({ type }: { type: "file" | "link" | "message" | "repeat" | "price" | "refresh" }) {
  const paths = {
    file: <><path d="M7 3.75h6.5L17 7.25v13H7z"/><path d="M13.5 3.75v3.5H17M9.5 11h5M9.5 14.5h5"/></>,
    link: <><path d="M9.5 14.5l5-5"/><path d="M7.3 16.7l-1 1a3 3 0 104.2 4.2l3-3a3 3 0 000-4.2M16.7 7.3l1-1a3 3 0 114.2 4.2l-3 3a3 3 0 01-4.2 0"/></>,
    message: <><path d="M4 5.5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></>,
    repeat: <><path d="M20 8a8 8 0 00-13.8-2.5L4 8"/><path d="M4 4v4h4M4 16a8 8 0 0013.8 2.5L20 16M20 20v-4h-4"/></>,
    price: <><circle cx="12" cy="12" r="9"/><path d="M15 8.5h-4a2 2 0 000 4h2a2 2 0 010 4H9M12 6.5v11"/></>,
    refresh: <><path d="M20 11a8 8 0 00-14.5-4.6L4 9"/><path d="M4 5v4h4M4 13a8 8 0 0014.5 4.6L20 15M20 19v-4h-4"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M10 12h10M10 19h8M10 26h10"/><path d="M21 19h9M26 14l5 5-5 5"/></svg></span>;
}

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [screen, setScreen] = useState<"landing" | "auth" | "app">("landing");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [view, setView] = useState<"business" | "customer">("business");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [section, setSection] = useState<"catalog" | "orders" | "customers" | "settings" | "billing">("catalog");
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [pendingImport, setPendingImport] = useState<ImportSummary | null>(null);
  const [pendingMapping, setPendingMapping] = useState<PendingMapping | null>(null);
  const [lastFile, setLastFile] = useState("lista-agosto.xlsx");
  const [lastUpdate, setLastUpdate] = useState("Hoy, 08:42");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [productPage, setProductPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [orders, setOrders] = useState(38);
  const [orderList, setOrderList] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [manualOrderSearch, setManualOrderSearch] = useState("");
  const [manualQuantities, setManualQuantities] = useState<Record<string, number>>({});
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualCustomerPhone, setManualCustomerPhone] = useState("");
  const [manualDeliveryAddress, setManualDeliveryAddress] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [catalogQr, setCatalogQr] = useState("");
  const [importReviewSearch, setImportReviewSearch] = useState("");
  const [justPublished, setJustPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annualPricing, setAnnualPricing] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [redeemingPromo, setRedeemingPromo] = useState(false);
  const [billing, setBilling] = useState<BillingInfo>({ plan: "trial", billingCycle: "monthly", subscriptionStatus: "trial", trialEndsAt: null, currentPeriodEnd: null });
  const [devScenario, setDevScenario] = useState<DevScenario | null>(null);
  const [isLocalPreview, setIsLocalPreview] = useState(false);
  const [businessName, setBusinessName] = useState("Distribuidora El Buen Sabor");
  const [settings, setSettings] = useState<BusinessSettings>({ name: "Distribuidora El Buen Sabor", whatsapp: "", brandColor: "#fa7c4a", currency: "ARS", minimumOrder: 80000, deliveryZones: "Zona Norte", deliveryDays: "Jueves", slug: "el-buen-sabor" });
  const [minimumOrderInput, setMinimumOrderInput] = useState("80000");
  const money = settings.currency === "USD" ? dollars : pesos;
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [businessSetupSaved, setBusinessSetupSaved] = useState(false);
  const [catalogs, setCatalogs] = useState<CatalogSummary[]>([]);
  const [simpleCatalogId, setSimpleCatalogId] = useState<number | null>(null);
  const [activeCatalogId, setActiveCatalogId] = useState<number | null>(null);
  const [newCatalogOpen, setNewCatalogOpen] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState("");
  const [logoVersion, setLogoVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const checkoutNameRef = useRef<HTMLInputElement>(null);

  const authenticatedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (activeCatalogId) headers.set("x-pasalista-catalog-id", String(activeCatalogId));
    if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      const localPlan = window.localStorage.getItem("pasalista-dev-plan");
      if (localPlan) headers.set("x-pasalista-dev-plan", localPlan);
    }
    return fetch(url, { ...init, headers });
  }, [activeCatalogId, getToken]);

  useEffect(() => {
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") return;
    setIsLocalPreview(true);
    const saved = window.localStorage.getItem("pasalista-dev-plan");
    if (saved === "trial" || saved === "simple" || saved === "negocio" || saved === "empresa" || saved === "expired") setDevScenario(saved);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    authenticatedFetch("/api/catalog")
      .then(async (response) => {
        const data = await response.json() as { business?: BusinessSettings & BillingInfo; catalogs?: CatalogSummary[]; products?: Product[]; lastImport?: { filename: string; createdAt: string } | null; orders?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "No pudimos conectar la base de datos.");
        if (!active) return;
        if (data.business?.name) {
          if (data.business.id) setActiveCatalogId(data.business.id);
          const loadedCatalogs = data.catalogs ?? [];
          setCatalogs(loadedCatalogs);
          setSimpleCatalogId((current) => current && loadedCatalogs.some((catalog) => catalog.id === current) ? current : loadedCatalogs.find((catalog) => catalog.isActive)?.id ?? data.business!.id ?? null);
          setBusinessName(data.business.name);
          setSettings({ ...data.business, brandColor: data.business.brandColor || "#fa7c4a", minimumOrder: Number(data.business.minimumOrder) || 0 });
          setMinimumOrderInput(String(Number(data.business.minimumOrder) || 0));
          setBusinessSetupSaved(data.business.name.trim().toLowerCase() !== "mi distribuidora" && data.business.whatsapp.replace(/\D/g, "").length >= 8);
          setBilling({ plan: data.business.plan || "trial", billingCycle: data.business.billingCycle || "monthly", subscriptionStatus: data.business.subscriptionStatus || "trial", trialEndsAt: data.business.trialEndsAt, currentPeriodEnd: data.business.currentPeriodEnd, isActive: data.business.isActive });
        }
        setProducts(data.products ?? []);
        if (data.lastImport) {
          setLastFile(data.lastImport.filename);
          setLastUpdate(new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastImport.createdAt.replace(" ", "T") + "Z")));
        }
        if (typeof data.orders === "number") setOrders(data.orders);
      })
      .catch((error) => { if (active) setNotice(error instanceof Error ? error.message : "No pudimos conectar la base de datos."); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [authenticatedFetch, isLoaded, isSignedIn]);

  async function createCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newCatalogName.trim().length < 2) { setNotice("Ingresá un nombre para el nuevo catálogo."); return; }
    setSaving(true); setNotice("");
    try {
      const response = await authenticatedFetch("/api/catalogs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newCatalogName }) });
      const data = await response.json() as { business?: CatalogSummary; error?: string };
      if (!response.ok || !data.business) throw new Error(data.error || "No pudimos crear el catálogo.");
      setCatalogs((current) => [...current, data.business!]);
      setNewCatalogName(""); setNewCatalogOpen(false); setSection("catalog"); setProducts([]); setOrderList([]); setBusinessSetupSaved(false); setCatalogLoading(true); setActiveCatalogId(data.business.id);
      setNotice("Nuevo catálogo creado. Configurá sus datos y después subí el Excel.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos crear el catálogo."); }
    finally { setSaving(false); }
  }

  async function deleteCatalog(id: number, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"? Se van a borrar sus productos y pedidos para siempre. Esta acción no se puede deshacer.`)) return;
    setSaving(true); setNotice("");
    try {
      const response = await authenticatedFetch(`/api/catalogs?id=${id}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; nextCatalogId?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "No pudimos eliminar el catálogo.");
      setCatalogs((current) => current.filter((catalog) => catalog.id !== id));
      if (data.nextCatalogId) { setProducts([]); setOrderList([]); setBusinessSetupSaved(false); setCatalogLoading(true); setActiveCatalogId(data.nextCatalogId); }
      setNotice("Catálogo eliminado.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos eliminar el catálogo."); }
    finally { setSaving(false); }
  }

  async function redeemPromoCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promoCodeInput.trim()) return;
    setRedeemingPromo(true); setNotice("");
    try {
      const response = await authenticatedFetch("/api/promo-redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: promoCodeInput }) });
      const data = await response.json() as { ok?: boolean; plan?: PaidPlan; planName?: string; months?: number; currentPeriodEnd?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "No pudimos canjear el código.");
      setBilling((current) => ({ ...current, plan: data.plan ?? current.plan, subscriptionStatus: "authorized", currentPeriodEnd: data.currentPeriodEnd ?? current.currentPeriodEnd, isActive: true }));
      setPromoCodeInput("");
      setNotice(`¡Listo! Activamos el plan ${data.planName} por ${data.months} ${data.months === 1 ? "mes" : "meses"}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos canjear el código."); }
    finally { setRedeemingPromo(false); }
  }

  useEffect(() => {
    if ((section !== "orders" && section !== "customers") || !isSignedIn) return;
    setOrdersLoading(true);
    authenticatedFetch("/api/orders").then(async (response) => {
      const data = await response.json() as { orders?: Order[]; error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos cargar los pedidos.");
      setOrderList(data.orders ?? []);
      setOrders(data.orders?.length ?? 0);
      setSelectedOrder((current) => current ?? data.orders?.[0]?.id ?? null);
      setSelectedCustomer((current) => current ?? data.orders?.[0]?.customerName ?? null);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "No pudimos cargar los pedidos.")).finally(() => setOrdersLoading(false));
  }, [authenticatedFetch, isSignedIn, section]);

  useEffect(() => {
    if (isSignedIn && screen === "auth") {
      setScreen("app");
      setView("business");
    }
  }, [isSignedIn, screen]);

  useEffect(() => {
    if (sessionStorage.getItem("pl_auth_pending") === "1") setScreen("auth");
  }, []);

  useEffect(() => {
    if (screen === "auth") sessionStorage.setItem("pl_auth_pending", "1");
    else sessionStorage.removeItem("pl_auth_pending");
  }, [screen]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))], [products]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = normalize(`${product.name} ${product.code} ${product.detail}`).includes(normalize(search));
    return matchesSearch && (category === "Todos" || product.category === category);
  }), [products, search, category]);
  const productPageCount = Math.max(1, Math.ceil(visibleProducts.length / productsPerPage));
  const pagedProducts = visibleProducts.slice((productPage - 1) * productsPerPage, productPage * productsPerPage);
  const customers = useMemo(() => {
    const grouped = new Map<string, { name: string; orders: Order[]; total: number; lastOrder: string }>();
    orderList.forEach((order) => {
      const key = normalize(order.customerName) || "cliente";
      const current = grouped.get(key) ?? { name: order.customerName, orders: [], total: 0, lastOrder: order.createdAt };
      current.orders.push(order); current.total += order.total;
      if (order.createdAt > current.lastOrder) current.lastOrder = order.createdAt;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).filter((customer) => normalize(customer.name).includes(normalize(customerSearch))).sort((a,b) => b.lastOrder.localeCompare(a.lastOrder));
  }, [customerSearch, orderList]);
  const itemCount = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const total = products.reduce((sum, product) => sum + (quantities[product.code] ?? 0) * product.price, 0);
  const deliverySummary = [settings.deliveryZones, settings.deliveryDays].filter(Boolean).join(" · ") || "Entrega a coordinar";
  const productImage = (product: Product) => product.imageDataUrl || (product.imageKey ? `/api/product-image?slug=${encodeURIComponent(settings.slug)}&code=${encodeURIComponent(product.code)}` : "");
  const selectedOrderData = orderList.find((order) => order.id === selectedOrder) ?? orderList[0] ?? null;
  const simulatedBilling: BillingInfo | null = devScenario === "trial"
    ? { plan: "trial", billingCycle: "monthly", subscriptionStatus: "trial", trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() }
    : devScenario === "simple"
      ? { plan: "simple", billingCycle: "monthly", subscriptionStatus: "authorized", trialEndsAt: null }
      : devScenario === "negocio"
        ? { plan: "negocio", billingCycle: "monthly", subscriptionStatus: "authorized", trialEndsAt: null }
        : devScenario === "empresa"
          ? { plan: "empresa", billingCycle: "monthly", subscriptionStatus: "authorized", trialEndsAt: null }
        : devScenario === "expired"
          ? { plan: "trial", billingCycle: "monthly", subscriptionStatus: "cancelled", trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
          : null;
  const activeBilling = simulatedBilling ?? billing;
  const trialEndTime = activeBilling.trialEndsAt ? new Date(activeBilling.trialEndsAt).getTime() : 0;
  const trialActive = activeBilling.subscriptionStatus !== "authorized" && trialEndTime > Date.now();
  const trialDaysLeft = Math.max(0, Math.ceil((trialEndTime - Date.now()) / (24 * 60 * 60 * 1000)));
  const paidPlanActive = activeBilling.subscriptionStatus === "authorized" || Boolean(activeBilling.currentPeriodEnd && new Date(activeBilling.currentPeriodEnd).getTime() > Date.now());
  const accountPaused = !trialActive && (!paidPlanActive || activeBilling.isActive === false);
  const needsBusinessSetup = !catalogLoading && !businessSetupSaved;
  const canUseNegocio = trialActive || (paidPlanActive && (activeBilling.plan === "negocio" || activeBilling.plan === "empresa"));
  const catalogLimit = paidPlanActive && activeBilling.plan === "empresa" ? 20 : 3;
  const activePlanName = activeBilling.plan === "empresa" ? "Empresa" : activeBilling.plan === "negocio" ? "Negocio" : "Simple";
  const billingAnnual = paidPlanActive ? activeBilling.billingCycle === "annual" : annualPricing;
  const manualProducts = products.filter((product) => normalize(`${product.name} ${product.code} ${product.detail}`).includes(normalize(manualOrderSearch)) && product.stock !== 0);
  const manualItemCount = Object.values(manualQuantities).reduce((sum, quantity) => sum + quantity, 0);
  const manualTotal = products.reduce((sum, product) => sum + (manualQuantities[product.code] ?? 0) * product.price, 0);

  useEffect(() => {
    if (!checkoutOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setCheckoutOpen(false); };
    document.addEventListener("keydown", close); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [checkoutOpen]);
  useEffect(() => {
    if ((section !== "settings" && !(section === "catalog" && justPublished)) || !settings.slug) return;
    let active = true;
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(`${window.location.origin}/catalogo/${settings.slug}`, { width: 640, margin: 2, color: { dark: "#18211b", light: "#ffffff" } })).then((url) => { if (active) setCatalogQr(url); }).catch(() => { if (active) setCatalogQr(""); });
    return () => { active = false; };
  }, [justPublished, section, settings.slug]);

  function updateQuantity(code: string, delta: number) {
    if (accountPaused) { setNotice("Esta es una vista previa. Elegí un plan para volver a recibir pedidos."); return; }
    setQuantities((current) => ({ ...current, [code]: Math.max(0, (current[code] ?? 0) + delta) }));
    setNotice("");
  }

  function prepareImport(filename: string, headers: string[], rows: unknown[][], mapping: ColumnMapping, remember = false, images: Array<string | null> = []) {
    if (mapping.name == null || mapping.price == null) {
      setNotice("Elegí qué columnas contienen el producto y el precio.");
      return;
    }
    const firstHeaderCategory = mapping.name != null && normalize(headers[mapping.name]).startsWith("productos")
      ? readableCategory(headers[mapping.name])
      : "";
    let inferredCategory = firstHeaderCategory || "General";
    const parsedRows = rows.map((row, index) => {
      const name = String(row[mapping.name!] ?? "").trim();
      if (mapping.category == null && isSectionRow(row, mapping)) {
        const sectionName = [name, ...row.slice(mapping.name! + 1, mapping.price!).map((cell) => String(cell ?? "").trim())]
          .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        inferredCategory = readableCategory(sectionName) || inferredCategory;
        return null;
      }
      const categoryValue = mapping.category != null ? String(row[mapping.category] ?? "General").trim() : inferredCategory;
      return {
        code: mapping.code != null && row[mapping.code] ? String(row[mapping.code]).trim() : `${normalize(name).slice(0, 10).toUpperCase()}-${index + 1}`,
        name,
        detail: inferredDetail(row, headers, mapping),
        category: categoryValue || "General",
        price: numberFrom(row[mapping.price!]),
        stock: mapping.stock != null && String(row[mapping.stock] ?? "").trim() !== "" ? numberFrom(row[mapping.stock]) : undefined,
        emoji: iconFor(name, categoryValue),
        imageDataUrl: images[index] ?? null,
      } satisfies Product;
    }).filter((product): product is Product => Boolean(product?.name && product.price > 0));
    const usedCodes = new Set<string>();
    let adjustedCodes = 0;
    const parsed = parsedRows.map((product) => {
      const baseCode = product.code;
      let code = baseCode;
      let suffix = 2;
      while (usedCodes.has(code.toLocaleLowerCase("es"))) code = `${baseCode}-${suffix++}`;
      usedCodes.add(code.toLocaleLowerCase("es"));
      if (code !== baseCode) adjustedCodes += 1;
      return { ...product, code };
    });
    if (!parsed.length) {
      setNotice("No encontramos productos con un nombre y un precio válido. Revisá las dos columnas elegidas.");
      return;
    }
    const current = new Map(products.map((product) => [product.code, product]));
    const nextCodes = new Set(parsed.map((product) => product.code));
    const added = parsed.filter((product) => !current.has(product.code)).length;
    const updated = parsed.filter((product) => current.has(product.code) && current.get(product.code)?.price !== product.price).length;
    const removed = products.filter((product) => !nextCodes.has(product.code)).length;
    setPendingImport({ filename, products: parsed, added, updated, removed, adjustedCodes });
    setPendingMapping(null);
    setNotice("");
    if (remember) {
      const byHeader = Object.fromEntries(Object.entries(mapping).map(([key, index]) => [key, index == null ? null : headers[index]]));
      localStorage.setItem(`repedido:mapping:${settings.slug}`, JSON.stringify(byHeader));
    }
  }

  async function readExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (accountPaused) { event.target.value = ""; setSection("billing"); setNotice("Elegí un plan para volver a importar tu lista."); return; }
    setJustPublished(false);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const extractedImages = file.name.toLowerCase().endsWith(".xlsx") ? extractCellImages(buffer) : new Map<number, string>();
      const cellImages = await optimizeCellImages(extractedImages);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
      if (!matrix.length) throw new Error("El archivo está vacío.");
      const candidates = matrix.slice(0, 20).map((row, index) => {
        const headers = row.map((cell) => String(cell ?? "").trim());
        const score = (Object.keys(columnAliases) as MappingKey[]).reduce((sum, key) => sum + (findColumnIndex(headers, columnAliases[key]) != null ? (key === "name" || key === "price" ? 3 : 1) : 0), 0);
        return { index, headers, score };
      }).sort((a, b) => b.score - a.score)[0];
      if (!candidates || candidates.headers.every((header) => !header)) throw new Error("No encontramos una fila con títulos de columnas.");
      const headers = candidates.headers.map((header, index) => header || `Columna ${index + 1}`);
      const rowRecords = matrix.slice(candidates.index + 1).map((row, offset) => ({ row, image: cellImages.get(candidates.index + 1 + offset) ?? null })).filter(({ row }) => row.some((cell) => String(cell ?? "").trim() !== ""));
      const rows = rowRecords.map(({ row }) => row);
      const images = rowRecords.map(({ image }) => image);
      let mapping = Object.fromEntries((Object.keys(columnAliases) as MappingKey[]).map((key) => [key, findColumnIndex(headers, columnAliases[key])])) as ColumnMapping;
      try {
        const saved = JSON.parse(localStorage.getItem(`repedido:mapping:${settings.slug}`) || "null") as Record<MappingKey, string | null> | null;
        if (saved) {
          const remembered = Object.fromEntries((Object.keys(columnAliases) as MappingKey[]).map((key) => [key, saved[key] ? headers.indexOf(saved[key]!) : null]).map(([key, value]) => [key, value === -1 ? null : value])) as ColumnMapping;
          if (remembered.name != null && remembered.price != null) mapping = remembered;
        }
      } catch { /* Ignoramos una preferencia local dañada. */ }
      if (mapping.name != null && mapping.price != null) prepareImport(file.name, headers, rows, mapping, false, images);
      else {
        setPendingMapping({ filename: file.name, headers, rows, images, mapping });
        setPendingImport(null);
        setNotice("");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos leer ese archivo.");
    } finally {
      event.target.value = "";
    }
  }

  async function publishImport(limitToSimple = false) {
    if (!pendingImport) return;
    if (accountPaused) { setPendingImport(null); setSection("billing"); setNotice("Tu catálogo está pausado. Elegí un plan para volver a publicar."); return; }
    const importToPublish = limitToSimple ? { ...pendingImport, products: pendingImport.products.slice(0, 300) } : pendingImport;
    if (!canUseNegocio && importToPublish.products.length > 300) { setNotice("Tu lista supera los 300 productos incluidos en Simple. Pasá a Negocio o publicá una selección de hasta 300."); return; }
    setSaving(true);
    const imageCount = importToPublish.products.filter((product) => product.imageDataUrl).length;
    setNotice(imageCount ? `Guardando ${importToPublish.products.length} productos y ${imageCount} fotos. Puede tardar unos segundos…` : `Guardando ${importToPublish.products.length} productos. Las fotos anteriores se conservarán…`);
    try {
      const response = await authenticatedFetch("/api/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: importToPublish.filename, products: importToPublish.products }) });
      const data = await response.json() as { products?: Product[]; adjustedCodes?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos guardar la lista.");
      setProducts(data.products ?? importToPublish.products);
      setLastFile(importToPublish.filename);
      setLastUpdate("Ahora");
      setPendingImport(null);
      setJustPublished(true);
      setNotice(data.adjustedCodes ? `Catálogo publicado. Ajustamos ${data.adjustedCodes} ${data.adjustedCodes === 1 ? "código repetido" : "códigos repetidos"} sin eliminar productos.` : "Catálogo guardado y actualizado. Tus clientes ya ven los precios nuevos.");
      setQuantities({});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos guardar la lista.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountPaused) { setSection("billing"); setNotice("Elegí un plan para volver a editar la configuración."); return; }
    setSaving(true);
    setNotice("");
    try {
      const response = await authenticatedFetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json() as { business?: BusinessSettings; error?: string };
      if (!response.ok || !data.business) throw new Error(data.error || "No pudimos guardar la configuración.");
      setSettings(data.business);
      setMinimumOrderInput(String(Number(data.business.minimumOrder) || 0));
      setBusinessName(data.business.name);
      if (data.business.id) setCatalogs((current) => current.map((catalog) => catalog.id === data.business!.id ? { id: catalog.id, name: data.business!.name, slug: data.business!.slug } : catalog));
      setNotice("Configuración guardada. El catálogo ya muestra estos cambios.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBusinessSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onboardingStep === 1) {
      if (settings.name.trim().length < 2 || settings.name.trim().toLowerCase() === "mi distribuidora") { setNotice("Ingresá el nombre real de tu negocio."); return; }
      const phone = settings.whatsapp.replace(/\D/g, "");
      if (phone.length < 8 || phone.length > 15) { setNotice("Ingresá un WhatsApp válido, con código de área."); return; }
      setNotice("");
      setOnboardingStep(2);
      return;
    }
    if (onboardingStep === 2) {
      setNotice("");
      setOnboardingStep(3);
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await authenticatedFetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json() as { business?: BusinessSettings; error?: string };
      if (!response.ok || !data.business) throw new Error(data.error || "No pudimos guardar los datos del negocio.");
      setSettings(data.business);
      setMinimumOrderInput(String(Number(data.business.minimumOrder) || 0));
      setBusinessName(data.business.name);
      if (data.business.id) setCatalogs((current) => current.map((catalog) => catalog.id === data.business!.id ? { id: catalog.id, name: data.business!.name, slug: data.business!.slug } : catalog));
      setBusinessSetupSaved(true);
      setNotice(products.length ? "Datos guardados. Tu catálogo ya está listo para recibir pedidos." : "Datos guardados. Ahora subí tu Excel para crear el catálogo.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos guardar los datos del negocio.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (accountPaused) { event.target.value = ""; setSection("billing"); setNotice("Elegí un plan para volver a cambiar el logo."); return; }
    setSaving(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("logo", file);
      const response = await authenticatedFetch("/api/logo", { method: "POST", body: form });
      const data = await response.json() as { logoUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos subir el logo.");
      setSettings((current) => ({ ...current, logoKey: data.logoUrl || current.logoKey }));
      setLogoVersion((value) => value + 1);
      setNotice("Logo actualizado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos subir el logo.");
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  function repeatOrder() {
    if (accountPaused) { setNotice("Esta es una vista previa. El catálogo público está pausado."); return; }
    const next: Record<string, number> = {};
    products.slice(0, 3).forEach((product, index) => { next[product.code] = [2, 5, 3][index]; });
    setQuantities(next);
    setNotice("Último pedido cargado. Podés modificarlo antes de enviarlo.");
  }

  async function sendOrder() {
    if (accountPaused) { setCheckoutOpen(false); setNotice("El catálogo está pausado. Elegí un plan para volver a recibir pedidos."); return; }
    const selected = products.filter((product) => (quantities[product.code] ?? 0) > 0);
    const lines = selected.map((product) => `${quantities[product.code]} × ${product.name} (${product.code}) — ${money.format(product.price * quantities[product.code])}`);
    if (!selected.length) { setCheckoutError("Agregá al menos un producto antes de enviar el pedido."); return; }
    if (checkoutName.trim().length < 2) {
      setCheckoutError("Completá el nombre o comercio para poder hacer el pedido.");
      checkoutNameRef.current?.focus();
      return;
    }
    setCheckoutError("");
    const message = [`*Pedido — ${checkoutName.trim()}*`, checkoutPhone.trim() ? `Teléfono: ${checkoutPhone.trim()}` : "", checkoutAddress.trim() ? `Dirección: ${checkoutAddress.trim()}` : "", "", ...lines, "", `*Total estimado: ${money.format(total)}*`, `Entrega: ${deliverySummary}`, checkoutNotes.trim() ? `Observaciones: ${checkoutNotes.trim()}` : ""].filter(Boolean).join("\n");
    setSaving(true);
    try {
      const response = await authenticatedFetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName: checkoutName, customerPhone: checkoutPhone, deliveryAddress: checkoutAddress, notes: checkoutNotes, items: selected.map((product) => ({ code: product.code, name: product.name, price: product.price, quantity: quantities[product.code] })) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos guardar el pedido.");
      setNotice("Pedido guardado. Se abrió WhatsApp para enviarlo.");
      setOrders((value) => value + 1);
      setCheckoutOpen(false);
      setQuantities({});
      const phone = settings.whatsapp.replace(/\D/g, "");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No pudimos guardar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  async function changeOrderStatus(id: number, status: Order["status"]) {
    setSaving(true);
    setNotice("");
    try {
      const response = await authenticatedFetch("/api/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos actualizar el pedido.");
      setOrderList((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos actualizar el pedido."); }
    finally { setSaving(false); }
  }

  function updateManualQuantity(code: string, delta: number) {
    setManualQuantities((current) => {
      const quantity = Math.max(0, (current[code] ?? 0) + delta);
      if (quantity === 0) { const next = { ...current }; delete next[code]; return next; }
      return { ...current, [code]: quantity };
    });
    setNotice("");
  }

  function closeManualOrder() {
    setManualOrderOpen(false);
    setManualOrderSearch("");
    setManualQuantities({});
    setManualCustomerName("");
    setManualCustomerPhone("");
    setManualDeliveryAddress("");
    setManualNotes("");
  }

  async function saveManualOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = products.filter((product) => (manualQuantities[product.code] ?? 0) > 0);
    if (manualCustomerName.trim().length < 2) { setNotice("Ingresá el nombre del cliente o comercio."); return; }
    if (!selected.length) { setNotice("Agregá al menos un producto al pedido."); return; }
    setSaving(true); setNotice("");
    try {
      const response = await authenticatedFetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName: manualCustomerName, customerPhone: manualCustomerPhone, deliveryAddress: manualDeliveryAddress, notes: manualNotes, items: selected.map((product) => ({ code: product.code, name: product.name, price: product.price, quantity: manualQuantities[product.code] })) }) });
      const data = await response.json() as { order?: Order; error?: string };
      if (!response.ok || !data.order) throw new Error(data.error || "No pudimos guardar el pedido.");
      setOrderList((current) => [data.order!, ...current]);
      setOrders((value) => value + 1);
      setSelectedOrder(data.order.id);
      closeManualOrder();
      setNotice(`Pedido #${String(data.order.id).padStart(4, "0")} cargado. Ya está listo para preparar.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos guardar el pedido."); }
    finally { setSaving(false); }
  }

  function openLegacyPrintWindow() {
    const order = selectedOrderData;
    if (!order) return;
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
    const itemRows = order.items.map((item) => `<tr><td>${item.quantity}×</td><td><b>${escapeHtml(item.productName)}</b><small>${escapeHtml(item.productCode)}</small></td><td>${money.format(item.unitPrice * item.quantity)}</td></tr>`).join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setNotice("El navegador bloqueó la ventana. Habilitá las ventanas emergentes y volvé a intentarlo."); return; }
    printWindow.document.open("text/html", "replace");
    printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pedido ${order.id} — ${escapeHtml(order.customerName)}</title><style>body{max-width:760px;margin:40px auto;padding:0 24px;color:#18211b;font:14px Arial,sans-serif}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #18211b;padding-bottom:20px}h1{margin:4px 0 0;font-size:26px}.brand{font-weight:800}.meta{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:24px 0;padding:18px;background:#f3f6f4}.meta span,small{display:block;color:#6e7972;font-size:11px;margin-bottom:4px}table{width:100%;border-collapse:collapse}td{padding:13px 8px;border-bottom:1px solid #e1e8e3}td:first-child{width:42px}td:last-child{text-align:right;font-weight:700}.total{display:flex;justify-content:space-between;margin-top:22px;font-size:22px;font-weight:800}.notes{margin-top:24px;padding-top:18px;border-top:1px solid #e1e8e3}.print{margin-bottom:24px;padding:10px 15px;border:0;border-radius:8px;background:#18211b;color:white;font-weight:700}@media print{body{margin:0;max-width:none}.print{display:none}}</style></head><body><button class="print" onclick="window.print()">Imprimir esta nota</button><header><div><span class="brand">RePedido · ${escapeHtml(businessName)}</span><h1>Preparación del pedido #${String(order.id).padStart(4,"0")}</h1></div><div>${new Intl.DateTimeFormat("es-AR", { dateStyle:"long", timeStyle:"short" }).format(new Date(order.createdAt.replace(" ","T") + "Z"))}</div></header><section class="meta"><div><span>Cliente</span><b>${escapeHtml(order.customerName)}</b></div><div><span>Teléfono</span><b>${escapeHtml(order.customerPhone || "No informado")}</b></div><div><span>Entrega</span><b>${escapeHtml(order.deliveryAddress || "A coordinar")}</b></div><div><span>Estado</span><b>${escapeHtml(order.status)}</b></div></section><table><tbody>${itemRows}</tbody></table><div class="total"><span>Total</span><span>${money.format(order.total)}</span></div>${order.notes ? `<div class="notes"><small>Observaciones</small><b>${escapeHtml(order.notes)}</b></div>` : ""}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  async function shareCatalog() {
    if (accountPaused) { setSection("billing"); setNotice("El enlace público está pausado. Elegí un plan para volver a compartirlo."); return; }
    const url = `${window.location.origin}/catalogo/${settings.slug}`;
    const text = `Mirá el catálogo actualizado de ${settings.name}`;
    if (navigator.share) {
      try { await navigator.share({ title: settings.name, text, url }); return; } catch { return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  async function startSubscription(plan: PaidPlan) {
    if (devScenario) {
      applyDevScenario(plan);
      setNotice(`Simulación activada: plan ${plan === "empresa" ? "Empresa" : plan === "negocio" ? "Negocio" : "Simple"}. No se realizó ningún cobro.`);
      return;
    }
    if (!isSignedIn) { setAuthMode("sign-up"); setScreen("auth"); return; }
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) { setNotice("Agregá un email a tu cuenta antes de elegir un plan."); return; }
    if (plan === "simple" && catalogs.length > 1 && !simpleCatalogId) { setNotice("Elegí cuál catálogo querés mantener publicado con Simple."); return; }
    setSaving(true); setNotice("");
    try {
      const response = await authenticatedFetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, cycle: annualPricing ? "annual" : "monthly", email, catalogId: plan === "simple" ? simpleCatalogId ?? activeCatalogId : undefined }) });
      const data = await response.json() as { checkoutUrl?: string; upgraded?: boolean; plan?: PaidPlan; billingCycle?: "monthly" | "annual"; error?: string };
      if (!response.ok) throw new Error(data.error || "No pudimos actualizar tu plan.");
      if (data.upgraded) {
        const upgradedPlan = data.plan || plan;
        setBilling((current) => ({ ...current, plan: upgradedPlan, billingCycle: data.billingCycle || current.billingCycle, subscriptionStatus: "authorized", isActive: true }));
        if (upgradedPlan !== "simple") setCatalogs((current) => current.map((catalog) => ({ ...catalog, isActive: true })));
        setNotice(`Ya tenés ${upgradedPlan === "empresa" ? "Empresa" : "Negocio"}. El nuevo importe se cobrará en tu próxima renovación.`);
        return;
      }
      if (!data.checkoutUrl) throw new Error("No pudimos abrir Mercado Pago.");
      window.location.href = data.checkoutUrl;
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos abrir Mercado Pago."); }
    finally { setSaving(false); }
  }

  function beginFreeTrial() {
    if (!isSignedIn) { setAuthMode("sign-up"); setScreen("auth"); return; }
    setScreen("app"); setView("business"); setSection("catalog");
  }

  function goToHome() {
    setScreen("landing");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function openUpgrade() {
    setManualOrderOpen(false);
    setSection("billing");
    setNotice("Esta función está incluida en Negocio. Elegí el plan para seguir usándola.");
  }

  function applyDevScenario(scenario: DevScenario | null) {
    if (scenario) window.localStorage.setItem("pasalista-dev-plan", scenario);
    else window.localStorage.removeItem("pasalista-dev-plan");
    setDevScenario(scenario);
    setManualOrderOpen(false);
    if (scenario === "expired") { setJustPublished(false); setPendingImport(null); setPendingMapping(null); }
    if (scenario === "simple" || scenario === "expired") setSection("catalog");
    setNotice(scenario ? `Vista de prueba: ${scenario === "trial" ? "prueba gratuita" : scenario === "simple" ? "plan Simple" : scenario === "negocio" ? "plan Negocio" : "prueba vencida"}.` : "Volviste al estado real de tu cuenta.");
  }

  function downloadCatalogQr() {
    if (!catalogQr) return;
    const anchor = document.createElement("a");
    anchor.href = catalogQr; anchor.download = `qr-${settings.slug}.png`; anchor.click();
  }

  async function printSelectedOrder() {
    const order = selectedOrderData;
    if (!order) return;
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageSize: [number, number] = [595.28, 841.89];
      const margin = 48;
      let page = pdf.addPage(pageSize);
      let y = 790;
      const ink = rgb(0.09, 0.13, 0.11);
      const muted = rgb(0.42, 0.48, 0.44);
      const line = rgb(0.88, 0.91, 0.89);
      const draw = (text: string, x: number, size = 10, font = regular, color = ink) => page.drawText(text, { x, y, size, font, color });
      const rule = () => page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 1, color: line });
      const newPage = () => { page = pdf.addPage(pageSize); y = 790; };
      const safe = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[–—]/g, "-");

      draw(`PasáLista - ${safe(businessName)}`, margin, 10, bold, muted); y -= 28;
      draw(`Preparacion del pedido #${String(order.id).padStart(4, "0")}`, margin, 22, bold); y -= 20;
      draw(new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(new Date(order.createdAt.replace(" ", "T") + "Z")), margin, 9, regular, muted); y -= 24; rule(); y -= 26;
      const details = [["Cliente", order.customerName], ["Telefono", order.customerPhone || "No informado"], ["Entrega", order.deliveryAddress || "A coordinar"], ["Estado", order.status]];
      details.forEach(([label, value], index) => { const x = margin + (index % 2) * 250; if (index === 2) y -= 40; page.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: muted }); page.drawText(safe(value), { x, y: y - 14, size: 10, font: bold, color: ink }); });
      y -= 48; rule(); y -= 22;
      draw("CANT.", margin, 8, bold, muted); draw("PRODUCTO", margin + 48, 8, bold, muted); draw("SUBTOTAL", 475, 8, bold, muted); y -= 18;
      for (const item of order.items) {
        if (y < 90) { newPage(); draw("Pedido - continuacion", margin, 9, bold, muted); y -= 25; }
        draw(`${item.quantity}x`, margin, 10, bold);
        draw(safe(item.productName).slice(0, 58), margin + 48, 10, bold);
        page.drawText(safe(item.productCode), { x: margin + 48, y: y - 14, size: 8, font: regular, color: muted });
        page.drawText(money.format(item.unitPrice * item.quantity), { x: 475, y, size: 9, font: bold, color: ink });
        y -= 32; rule(); y -= 10;
      }
      if (y < 130) newPage();
      y -= 8; draw("TOTAL", margin, 10, bold, muted); page.drawText(money.format(order.total), { x: 420, y, size: 19, font: bold, color: ink }); y -= 34;
      if (order.notes) { rule(); y -= 20; draw("OBSERVACIONES", margin, 8, bold, muted); y -= 16; draw(safe(order.notes).slice(0, 110), margin, 10); }
      const bytes = await pdf.save();
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `pedido-${String(order.id).padStart(4, "0")}-${normalize(order.customerName) || "cliente"}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setNotice("PDF generado. Ya podés abrirlo e imprimirlo.");
    } catch (error) {
      console.error("PDF generation failed", error);
      setNotice("No pudimos generar el PDF. Volvé a intentarlo.");
    }
  }

  if (screen === "landing") {
    return (
      <main className="landing-page">
        <aside className="consumer-shortcuts" aria-label="Accesos para consumidores"><a href="/baja">BOTÓN DE BAJA DE SERVICIO</a><a href="/arrepentimiento">BOTÓN DE ARREPENTIMIENTO</a></aside>
        <nav className="landing-nav"><button className="landing-brand" aria-label="Ir al inicio" onClick={goToHome}><LogoMark /> PasáLista</button><div className="landing-links"><a href="#como-funciona">Cómo funciona</a><a href="#beneficios">Beneficios</a><a href="#precios">Precios</a></div><div className="landing-actions">{isSignedIn ? <><button className="primary" onClick={() => setScreen("app")}>Ir a mi panel</button><UserButton /></> : <><button className="text-action" onClick={() => { setAuthMode("sign-in"); setScreen("auth"); }}>Ingresar</button><button className="primary" onClick={() => { setAuthMode("sign-up"); setScreen("auth"); }}>Probar 14 días</button></>}</div></nav>
        {notice && <div className="landing-notice" role="alert"><span>!</span><div><b>No pudimos abrir Mercado Pago</b><p>{notice}</p></div><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>Cerrar</button></div>}
        <section className="hero"><div className="hero-copy"><h1>Tu Excel ahora <em>toma pedidos solo.</em></h1><p>Publicá una lista de precios que tus clientes puedan buscar, recorrer y convertir en pedido. Vos seguís usando Excel y recibís todo ordenado por WhatsApp.</p><div className="hero-actions"><button className="primary hero-primary" onClick={() => { setAuthMode("sign-up"); setScreen("auth"); }}>Crear mi catálogo <span>→</span></button><button className="demo-action" onClick={() => { window.location.href = "/catalogo/demo"; }}>Explorar una demo</button></div><div className="hero-assurance"><span>Sin tarjeta</span><span>Sin comisión por venta</span><span>Listo en minutos</span></div></div>
          <div className="hero-product" aria-label="Vista previa de PasáLista"><div className="excel-float"><b>X</b><div><strong>lista-agosto.xlsx</strong><small>126 productos detectados</small></div><span>✓</span></div><div className="mini-browser"><div className="mini-browser-bar"><i></i><i></i><i></i><span>pasalista.com.ar/pet-one</span></div><div className="mini-store-head"><div><span>🍗</span><b>El Buen Sabor</b></div><small>Lista Comercios</small></div><div className="mini-search">Buscar productos…</div><div className="mini-products"><article><span>🍗</span><div><b>Pollo entero</b><small>Caja 12 kg</small><strong>$48.000</strong></div><button>+</button></article><article><span>🥚</span><div><b>Maple de huevos</b><small>30 unidades</small><strong>$4.800</strong></div><button>+</button></article><article><span>🧀</span><div><b>Queso cremoso</b><small>Precio por kg</small><strong>$7.200</strong></div><button>+</button></article></div><div className="mini-cart"><b>3 productos · $67.200</b><span>Enviar pedido →</span></div></div><div className="whatsapp-float"><span>✓</span><div><b>Pedido recibido</b><small>Almacén Don José · $184.800</small></div></div></div>
        </section>
        <section className="trust-line"><strong>Una herramienta nueva, sin cambiar cómo trabajás.</strong><span>Excel para actualizar</span><span>Un enlace para vender</span><span>WhatsApp para recibir</span></section>
        <section className="reveal"><div className="reveal-mark">✕</div><h2>No es un ecommerce.<br/>Es tu <span>Excel, vendiendo solo.</span></h2><p>Nada de plataformas nuevas ni comisión por venta. Tu lista de precios de siempre, convertida en un enlace que tus clientes recorren y arman su pedido — vos seguís al mando, como siempre.</p></section>
        <section className="how" id="como-funciona"><div className="section-heading"><h2>Del archivo al pedido, sin vueltas.</h2><p>PasáLista conecta las herramientas que tu negocio ya usa.</p></div><div className="steps"><article><div className="step-icon"><FlowIcon type="file"/></div><div><h3>Subí la lista que ya tenés</h3><p>Detectamos productos, precios, códigos, categorías y stock. No cargás el catálogo a mano.</p></div></article><article><div className="step-icon"><FlowIcon type="link"/></div><div><h3>Compartí un solo enlace</h3><p>Tu catálogo mantiene el nombre, los colores y la información de entrega de tu negocio.</p></div></article><article><div className="step-icon"><FlowIcon type="message"/></div><div><h3>Recibí el pedido completo</h3><p>El cliente arma el carrito y te llega el detalle listo para continuar por WhatsApp.</p></div></article></div></section>
        <section className="benefits" id="beneficios"><div className="benefits-copy"><h2>Menos mensajes para aclarar. Más tiempo para vender.</h2><p>No reemplazamos tu manera de trabajar. Ordenamos la parte que hoy te hace perder tiempo.</p><button className="primary" onClick={() => setScreen("auth")}>Empezar gratis</button></div><div className="benefit-list"><article><span><FlowIcon type="repeat"/></span><div><h3>Pedidos frecuentes, más simples</h3><p>Tus clientes encuentran la lista vigente y vuelven a pedir sin esperar una respuesta.</p></div></article><article><span><FlowIcon type="price"/></span><div><h3>El precio correcto, a la vista</h3><p>Cada actualización reemplaza la lista anterior en el mismo enlace.</p></div></article><article><span><FlowIcon type="refresh"/></span><div><h3>Tu Excel sigue mandando</h3><p>Cuando algo cambia, importás el archivo nuevo y seguís trabajando.</p></div></article></div></section>
        <section className="pricing" id="precios"><div className="pricing-intro"><h2>Empezá con tu lista.<br/>Crecé sin comisiones.</h2><div><p>Probá Negocio durante 14 días, sin tarjeta y con hasta 3 catálogos. Después elegís el plan que acompaña a tu operación.</p><div className="billing-toggle" aria-label="Período de facturación"><button className={!annualPricing ? "active" : ""} onClick={() => setAnnualPricing(false)}>Mensual</button><button className={annualPricing ? "active" : ""} onClick={() => setAnnualPricing(true)}>Anual <span>2 meses gratis</span></button></div></div><div className="pricing-promises"><span>Cancelás cuando querés</span><span>Sin comisión por venta</span></div></div><div className="pricing-plans"><article><div><h3>Simple</h3><p>Para empezar a recibir pedidos sin cambiar tu forma de trabajar.</p></div><div className="price"><strong>{annualPricing ? "$129.000" : "$12.900"}</strong><span>ARS / {annualPricing ? "año" : "mes"}</span></div><ul><li>1 catálogo y hasta 300 productos</li><li>Importación desde Excel</li><li>Catálogo con imágenes y colores</li><li>Pedidos por WhatsApp</li></ul><button onClick={beginFreeTrial}>Probar 14 días</button></article><article className="recommended"><span className="plan-label">Para negocios en movimiento</span><div><h3>Negocio</h3><p>Para ordenar pedidos, clientes y la preparación diaria.</p></div><div className="price"><strong>{annualPricing ? "$249.000" : "$24.900"}</strong><span>ARS / {annualPricing ? "año" : "mes"}</span></div><ul><li>Hasta 3 catálogos</li><li>Productos e importaciones ilimitadas</li><li>Panel de pedidos y clientes</li><li>PDF para preparar cada pedido</li></ul><button className="primary" onClick={beginFreeTrial}>Empezar gratis</button></article><article><div><h3>Empresa</h3><p>La misma operación de Negocio para marcas con más líneas o sucursales.</p></div><div className="price"><strong>{annualPricing ? "$449.000" : "$44.900"}</strong><span>ARS / {annualPricing ? "año" : "mes"}</span></div><ul><li>Hasta 20 catálogos</li><li>Todo lo incluido en Negocio</li></ul><button onClick={beginFreeTrial}>Empezar gratis</button></article></div><small>La prueba no pide tarjeta. Elegís y pagás el plan recién cuando quieras continuar.</small></section>
        <section className="final-cta"><h2>Si ya tenés un Excel,<br/>ya podés empezar.</h2><p>Creá tu cuenta y convertí tu lista en un catálogo compartible.</p><button className="primary hero-primary" onClick={() => setScreen("auth")}>Crear mi catálogo <span>→</span></button></section>
        <footer><div><button className="landing-brand" aria-label="Ir al inicio" onClick={goToHome}><LogoMark /> PasáLista</button><p>Tu Excel, listo para tomar pedidos.</p></div><nav className="legal-links" aria-label="Información legal"><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a><a href="/cancelacion">Cancelación</a><a href="/baja">BOTÓN DE BAJA DE SERVICIO</a><a href="/arrepentimiento">BOTÓN DE ARREPENTIMIENTO</a></nav></footer>
      </main>
    );
  }

  if (screen === "auth") {
    return (
      <main className="auth-page"><button className="landing-brand auth-logo" aria-label="Ir al inicio" onClick={goToHome}><LogoMark /> PasáLista</button><section className="auth-clerk-wrap">{authMode === "sign-up" ? <SignUp routing="hash" /> : <SignIn routing="hash" />}<button className="auth-switch" onClick={() => setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up")}>{authMode === "sign-up" ? "¿Ya tenés cuenta? Ingresar" : "¿Todavía no tenés cuenta? Crear una"}</button></section></main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">{view === "business" && <button type="button" className="mobile-nav-toggle" aria-label="Abrir menú" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><span></span><span></span><span></span></button>}<button className="brand brand-home" aria-label="Ir al inicio" onClick={goToHome}><LogoMark /><span className="brand-copy">PasáLista<small>Panel de gestión</small></span></button><div className="view-switch" aria-label="Cambiar vista"><button className={view === "business" ? "active" : ""} onClick={() => { if (isSignedIn) setView("business"); else { setAuthMode("sign-up"); setScreen("auth"); } }}>Mi negocio</button><button className={view === "customer" ? "active" : ""} onClick={() => setView("customer")}>Vista cliente</button></div>{isSignedIn && <UserButton />}</header>
      {view === "business" ? (
        <section className="business-layout">
          {mobileNavOpen && <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
          <aside className={mobileNavOpen ? "nav-open" : ""}>
            <div className="catalog-switcher"><label htmlFor="active-catalog">Catálogo activo</label><div><select id="active-catalog" value={activeCatalogId ?? ""} onChange={(event) => { setProducts([]); setOrderList([]); setBusinessSetupSaved(false); setCatalogLoading(true); setNotice(""); setPendingImport(null); setPendingMapping(null); setJustPublished(false); setOnboardingStep(1); setActiveCatalogId(Number(event.target.value)); }}>{catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}</select><button type="button" aria-label="Crear otro catálogo" disabled={catalogs.length >= 20} onClick={() => { if (!canUseNegocio) return openUpgrade(); if (catalogs.length >= catalogLimit) { setSection("billing"); setNotice("Llegaste al límite de 3 catálogos. Pasá a Empresa para crear hasta 20."); return; } setNewCatalogOpen((open) => !open); }}>+</button><button type="button" aria-label="Eliminar catálogo activo" disabled={catalogs.length <= 1 || saving} onClick={() => { const activeCatalog = catalogs.find((catalog) => catalog.id === activeCatalogId); if (activeCatalog) deleteCatalog(activeCatalog.id, activeCatalog.name); }}>×</button></div>{newCatalogOpen && <form onSubmit={createCatalog}><input maxLength={80} value={newCatalogName} onChange={(event) => setNewCatalogName(event.target.value)} placeholder="Nombre del nuevo catálogo" aria-label="Nombre del nuevo catálogo" /><div><button type="button" onClick={() => { setNewCatalogOpen(false); setNewCatalogName(""); }}>Cancelar</button><button className="primary" disabled={saving} type="submit">{saving ? "Creando…" : "Crear"}</button></div></form>}<small>{catalogs.length}/{catalogLimit} catálogos · {trialActive ? "Prueba" : `Plan ${activePlanName}`}</small></div>
            <small className="nav-label">GESTIÓN</small>
            <button data-icon="▦" className={section === "catalog" ? "active" : ""} onClick={() => { setSection("catalog"); setMobileNavOpen(false); }}>Catálogo</button>
            <button data-icon="↗︎" className={section === "orders" ? "active" : ""} onClick={() => { if (canUseNegocio) setSection("orders"); else openUpgrade(); setMobileNavOpen(false); }}>Pedidos {!canUseNegocio && <span className="nav-lock" aria-label="Requiere plan Negocio">Negocio</span>}{canUseNegocio && orders > 0 && <i>{orders}</i>}</button>
            <button data-icon="◎" className={section === "customers" ? "active" : ""} onClick={() => { if (canUseNegocio) setSection("customers"); else openUpgrade(); setMobileNavOpen(false); }}>Clientes {!canUseNegocio && <span className="nav-lock" aria-label="Requiere plan Negocio">Negocio</span>}</button>
            <small className="nav-label">NEGOCIO</small>
            <button data-icon="◇" className={section === "settings" ? "active" : ""} onClick={() => { setSection("settings"); setMobileNavOpen(false); }}>Configuración</button>
            <button data-icon="$" className={section === "billing" ? "active" : ""} onClick={() => { setSection("billing"); setNotice(""); setMobileNavOpen(false); }}>Plan y facturación</button>
            <div className="sidebar-help"><b>{trialActive ? `${trialDaysLeft} días de prueba` : paidPlanActive ? `Plan ${activePlanName}` : "Prueba finalizada"}</b><span>{trialActive ? "Tenés todas las funciones de Negocio." : paidPlanActive ? "Tu suscripción está activa." : "Elegí un plan para continuar."}</span><button onClick={() => setSection("billing")}>{trialActive ? "Ver planes" : "Elegir plan"}</button></div>
          </aside>
          <div className="business-main">
            {isLocalPreview && <section className="dev-plan-switcher" aria-label="Simular estado de la suscripción"><div><span>Solo en esta computadora</span><b>Probar planes</b></div><div role="group" aria-label="Estado simulado"><button className={devScenario === "trial" ? "active" : ""} onClick={() => applyDevScenario("trial")}>Prueba</button><button className={devScenario === "simple" ? "active" : ""} onClick={() => applyDevScenario("simple")}>Simple</button><button className={devScenario === "negocio" ? "active" : ""} onClick={() => applyDevScenario("negocio")}>Negocio</button><button className={devScenario === "empresa" ? "active" : ""} onClick={() => applyDevScenario("empresa")}>Empresa</button><button className={devScenario === "expired" ? "active" : ""} onClick={() => applyDevScenario("expired")}>Vencida</button>{devScenario && <button className="dev-plan-real" onClick={() => applyDevScenario(null)}>Volver a mi cuenta</button>}</div></section>}
            {trialActive && section !== "billing" && <div className="trial-strip"><span><b>Estás probando PasáLista completo</b> · te quedan {trialDaysLeft} días</span><button onClick={() => setSection("billing")}>Ver planes</button></div>}
            {accountPaused && section !== "billing" && <section className="account-paused-strip" role="status"><div><b>Tu catálogo está pausado</b><span>Conservamos tus productos y configuración. Elegí un plan para volver a publicarlo y recibir pedidos.</span></div><button onClick={() => setSection("billing")}>Reactivar catálogo</button></section>}
            {notice && <div className="notice" role="status">{notice}</div>}
            {justPublished && section === "catalog" && <section className="publish-success"><div className="success-mark">✓</div><div><h2>Tu catálogo ya está actualizado</h2><p>Este enlace siempre va a mostrar la última lista publicada.</p><div className="published-url"><span>{window.location.origin}/catalogo/</span><b>{settings.slug}</b></div><div className="publish-success-actions"><button className="primary" onClick={shareCatalog}>Compartir catálogo</button><button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/catalogo/${settings.slug}`).then(() => setNotice("Enlace copiado."))}>Copiar enlace</button><a href={`/catalogo/${settings.slug}`} target="_blank" rel="noreferrer">Abrir catálogo</a></div></div>{catalogQr && <div className="success-qr"><img src={catalogQr} alt="Código QR del catálogo"/><button onClick={downloadCatalogQr}>Descargar QR</button></div>}<button className="success-close" aria-label="Cerrar confirmación" onClick={() => setJustPublished(false)}>Cerrar</button></section>}
            {needsBusinessSetup && section !== "billing" ? <form className="business-onboarding" onSubmit={saveBusinessSetup}>
              <header><div><span>Paso {onboardingStep} de 3</span><h1>{onboardingStep === 1 ? "¿Cómo reciben los pedidos?" : onboardingStep === 2 ? "Personalizá tu catálogo" : "Definí cómo entregás"}</h1><p>{onboardingStep === 1 ? "Estos dos datos son necesarios para que cada pedido llegue al lugar correcto." : onboardingStep === 2 ? "Tus clientes van a ver este color, este logo y esta moneda en cada pedido. Podés cambiarlo cuando quieras desde Configuración." : "Esto ayuda a que tus clientes conozcan las condiciones antes de armar el carrito."}</p></div><div className="onboarding-steps" aria-label={`Paso ${onboardingStep} de 3`}><i className="active"></i><i className={onboardingStep >= 2 ? "active" : ""}></i><i className={onboardingStep === 3 ? "active" : ""}></i></div></header>
              {onboardingStep === 1 ? <section className="onboarding-fields"><label>Nombre del negocio<input required maxLength={80} value={settings.name === "Mi distribuidora" ? "" : settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value, slug: slugFrom(event.target.value) })} placeholder="Ej. Distribuidora El Buen Sabor" /><small>Es el nombre que van a ver tus clientes.</small></label><label>WhatsApp de pedidos<input required inputMode="tel" maxLength={24} value={settings.whatsapp} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} placeholder="Ej. +54 9 11 2345 6789" /><small>El pedido se prepara para enviarse a este número.</small></label></section> : onboardingStep === 2 ? <section className="onboarding-fields"><label>Color de marca<span className="color-field"><input type="color" value={settings.brandColor} onChange={(event) => setSettings({ ...settings, brandColor: event.target.value })} /><code>{settings.brandColor}</code></span></label><label>Logo <small>Opcional</small><span className="logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} /><span>{settings.logoKey ? "Cambiar imagen" : "Subir imagen"}</span><small>PNG, JPG o WebP · máximo 2 MB</small></span></label><label>Moneda<select value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })}><option value="ARS">Pesos argentinos (ARS)</option><option value="USD">Dólares (USD)</option></select><small>Así se muestran los precios en tu catálogo.</small></label></section> : <section className="onboarding-fields"><label>Pedido mínimo <small>Opcional</small><input type="number" inputMode="numeric" min="0" step="100" value={minimumOrderInput} onChange={(event) => { setMinimumOrderInput(event.target.value); setSettings({ ...settings, minimumOrder: event.target.value === "" ? 0 : Number(event.target.value) }); }} placeholder="0" /><small>Dejalo vacío o escribí 0 si no tenés mínimo.</small></label><label>Zonas de entrega <small>Opcional</small><input maxLength={240} value={settings.deliveryZones} onChange={(event) => setSettings({ ...settings, deliveryZones: event.target.value })} placeholder="Ej. Ituzaingó y alrededores" /></label><label>Días de entrega <small>Opcional</small><input maxLength={160} value={settings.deliveryDays} onChange={(event) => setSettings({ ...settings, deliveryDays: event.target.value })} placeholder="Ej. Martes y jueves" /></label></section>}
              <footer>{onboardingStep > 1 ? <button type="button" onClick={() => { setOnboardingStep((onboardingStep - 1) as 1 | 2 | 3); setNotice(""); }}>Volver</button> : <span>Te va a llevar menos de un minuto.</span>}<button className="primary" disabled={saving} type="submit">{saving ? "Guardando…" : onboardingStep < 3 ? "Continuar" : products.length ? "Guardar y continuar" : "Guardar y subir mi Excel"}</button></footer>
            </form> : section === "catalog" ? <>
              <div className="page-heading"><div><span className="page-kicker">CATÁLOGO</span><h1>{products.length ? "Tu lista, siempre al día" : "Creá tu primer catálogo"}</h1><p>{businessName}{products.length > 0 && <> · <b className={accountPaused ? "paused-status" : "live-status"}>{accountPaused ? "Pausado" : "Publicado"}</b></>}</p></div><input ref={fileRef} className="hidden-file" type="file" accept=".xlsx,.xls,.csv" onChange={readExcel}/>{products.length > 0 && (accountPaused ? <button className="primary upload-primary" onClick={() => setSection("billing")}>Elegir un plan</button> : <button className="primary upload-primary" onClick={() => fileRef.current?.click()}><span>↑</span> Subir lista nueva</button>)}</div>
              {pendingMapping && <section className="mapping-panel"><div className="mapping-intro"><span>Necesitamos una ayuda</span><h2>¿Qué información hay en cada columna?</h2><p>Tu archivo está bien. Solo indicá dónde están el producto y el precio; el resto es opcional.</p></div><div className="mapping-fields">
                {([['name','Producto'],['price','Precio'],['code','Código'],['stock','Stock'],['category','Categoría'],['detail','Presentación']] as Array<[MappingKey,string]>).map(([key, label]) => <label key={key}>{label}{key !== 'name' && key !== 'price' && <small>Opcional</small>}<select value={pendingMapping.mapping[key] ?? ""} onChange={(event) => setPendingMapping({ ...pendingMapping, mapping: { ...pendingMapping.mapping, [key]: event.target.value === "" ? null : Number(event.target.value) } })}><option value="">Elegir columna…</option>{pendingMapping.headers.map((header, index) => <option value={index} key={`${header}-${index}`}>{header}</option>)}</select></label>)}
              </div><div className="mapping-sample"><span>Así lo estamos leyendo</span>{pendingMapping.rows.slice(0,3).map((row,index) => <div key={index}>{pendingMapping.images[index] && <img src={pendingMapping.images[index]!} alt="" />}<b>{pendingMapping.mapping.name == null ? "Elegí la columna de producto" : String(row[pendingMapping.mapping.name] || "Sin nombre")}</b><strong>{pendingMapping.mapping.price == null ? "Elegí la columna de precio" : money.format(numberFrom(row[pendingMapping.mapping.price]))}</strong></div>)}</div><div className="mapping-actions"><button onClick={() => { setPendingMapping(null); setNotice(""); }}>Elegir otro archivo</button><button className="primary" disabled={pendingMapping.mapping.name == null || pendingMapping.mapping.price == null} onClick={() => prepareImport(pendingMapping.filename, pendingMapping.headers, pendingMapping.rows, pendingMapping.mapping, true, pendingMapping.images)}>Revisar productos</button></div></section>}
              {pendingImport && <section className="import-review"><div><span>Lista lista para publicar</span><h2>{pendingImport.filename}</h2><p>{pendingImport.products.length} productos incluidos · {pendingImport.updated} precios cambiaron · {pendingImport.added} nuevos · {pendingImport.removed} ya no aparecen</p>{pendingImport.products.some((product) => product.imageDataUrl) && <small className="import-note">También encontramos {pendingImport.products.filter((product) => product.imageDataUrl).length} fotos de productos.</small>}{pendingImport.adjustedCodes > 0 && <small className="import-note">Encontramos {pendingImport.adjustedCodes} {pendingImport.adjustedCodes === 1 ? "código repetido" : "códigos repetidos"}. Les agregamos una terminación para conservar todos los productos.</small>}</div><div className="import-actions"><button disabled={saving} onClick={() => { setPendingImport(null); setImportReviewSearch(""); }}>Cancelar</button>{!canUseNegocio && pendingImport.products.length > 300 ? <button className="primary" onClick={openUpgrade}>Pasar a Negocio</button> : <button disabled={saving || pendingImport.products.length === 0} className="primary" onClick={() => publishImport()}>{saving ? "Guardando…" : "Publicar mi catálogo"}</button>}</div>{!canUseNegocio && pendingImport.products.length > 300 && <div className="product-limit-block"><div><strong>Tu lista tiene {pendingImport.products.length} productos</strong><p>Simple incluye hasta 300. Tu catálogo actual no cambió y la lista queda preparada mientras elegís qué hacer.</p></div><div><button className="primary" onClick={openUpgrade}>Pasar a Negocio</button><button disabled={saving} onClick={() => publishImport(true)}>{saving ? "Publicando…" : "Publicar los primeros 300"}</button></div></div>}<div className="import-review-tools"><label>Revisar productos<input value={importReviewSearch} onChange={(event) => setImportReviewSearch(event.target.value)} placeholder="Buscar por nombre o código…" /></label><small>{!canUseNegocio && pendingImport.products.length > 300 ? `Excluí ${pendingImport.products.length - 300} productos para publicarla completa en Simple.` : "Podés excluir filas sin modificar el Excel."}</small></div><div className="import-preview import-preview-full">{pendingImport.products.filter((product) => normalize(`${product.name} ${product.code}`).includes(normalize(importReviewSearch))).map((product) => <div key={product.code}>{product.imageDataUrl ? <img src={product.imageDataUrl} alt="" /> : <span className="import-image-empty">{product.emoji}</span>}<span>{product.name}</span><code>{product.code}</code><b>{money.format(product.price)}</b><button type="button" aria-label={`Excluir ${product.name}`} onClick={() => setPendingImport((current) => current ? { ...current, products: current.products.filter((item) => item.code !== product.code) } : current)}>Excluir</button></div>)}</div></section>}
              {catalogLoading ? <section className="catalog-loading" aria-label="Cargando catálogo"><span></span><span></span><span></span></section> : products.length === 0 && !pendingImport && !pendingMapping ? <section className="first-catalog"><div className="first-catalog-copy"><span className="onboarding-progress">PRIMER PASO</span><h2>Convertí tu lista en un catálogo</h2><p>Subí el mismo archivo que ya usás para compartir precios. Vamos a detectar los productos y mostrarte una vista previa antes de publicar.</p><button className="primary" onClick={() => accountPaused ? setSection("billing") : fileRef.current?.click()}>{accountPaused ? "Elegir un plan" : "Elegir mi archivo Excel"}</button><small>{accountPaused ? "Tu cuenta y configuración siguen guardadas" : "Excel, XLS o CSV · el archivo original no se publica"}</small></div><div className="sheet-preview" aria-hidden="true"><div className="sheet-top"><b>X</b><span>mi-lista.xlsx</span></div><div className="sheet-grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div className="sheet-result"><span>RePedido detecta</span><b>Producto · Precio · Stock</b></div></div><div className="onboarding-next"><div><b>Después revisás</b><span>Confirmás que los datos estén bien.</span></div><div><b>Y publicás</b><span>Recibís el enlace para compartir.</span></div></div></section> : !pendingImport && !pendingMapping ? <><div className="metric-grid"><article><small>▦</small><div><span>Productos guardados</span><strong>{products.length}</strong></div></article><article><small>↻︎</small><div><span>Última actualización</span><strong>{lastUpdate}</strong></div></article><article><small>↗︎</small><div><span>Pedidos registrados</span><strong>{orders}</strong></div></article></div><section className="catalog-table"><div className="file-row"><div><b>{lastFile}</b><small>Fuente actual del catálogo</small></div><button onClick={() => setView("customer")}>Vista previa</button></div>{products.slice(0, 8).map((product) => <div className="table-row" key={product.code}><span>{product.name}</span><code>{product.code}</code><b>{money.format(product.price)}</b><em>{accountPaused ? "Pausado" : product.stock === 0 ? "Sin stock" : "Publicado"}</em></div>)}</section></> : null}
            </> : section === "orders" ? <>
              <div className="orders-heading"><div><h1>{manualOrderOpen ? "Cargar un pedido" : "Pedidos"}</h1><p>{manualOrderOpen ? "Tomalo por teléfono, WhatsApp o en el mostrador y guardalo junto al resto." : "Todo lo que entra desde tu catálogo, listo para preparar."}</p></div><div className="orders-heading-actions">{manualOrderOpen ? <button className="preview-link" onClick={closeManualOrder}>Cancelar</button> : <><button className="preview-link" onClick={() => setView("customer")}>Ver catálogo</button><button className="primary" onClick={() => { setManualOrderOpen(true); setNotice(""); }}>Nuevo pedido</button></>}</div></div>
              {manualOrderOpen ? <form className="manual-order" onSubmit={saveManualOrder}><section className="manual-order-products"><header><div><h2>Productos</h2><p>Buscá en la lista vigente y agregá cantidades.</p></div><label><span>Buscar</span><input autoFocus value={manualOrderSearch} onChange={(event) => setManualOrderSearch(event.target.value)} placeholder="Producto o código…" /></label></header><div className="manual-product-list">{manualProducts.map((product) => { const quantity = manualQuantities[product.code] ?? 0; return <article key={product.code} className={quantity > 0 ? "selected" : ""}><div><b>{product.name}</b><small>{product.detail || product.code} · {money.format(product.price)}</small></div><div className="manual-quantity"><button type="button" disabled={quantity === 0} aria-label={`Quitar ${product.name}`} onClick={() => updateManualQuantity(product.code, -1)}>−</button><span>{quantity}</span><button type="button" aria-label={`Agregar ${product.name}`} onClick={() => updateManualQuantity(product.code, 1)}>+</button></div></article>; })}{manualProducts.length === 0 && <div className="manual-products-empty">No encontramos productos con esa búsqueda.</div>}</div></section><section className="manual-order-customer"><div><h2>Cliente y entrega</h2><p>Solo el nombre es obligatorio.</p></div><div className="manual-fields"><label>Cliente o comercio *<input required minLength={2} maxLength={100} value={manualCustomerName} onChange={(event) => setManualCustomerName(event.target.value)} placeholder="Ej. Almacén Don José" /></label><label>Teléfono<input inputMode="tel" maxLength={30} value={manualCustomerPhone} onChange={(event) => setManualCustomerPhone(event.target.value)} placeholder="Ej. 11 2345 6789" /></label><label>Dirección de entrega<input maxLength={180} value={manualDeliveryAddress} onChange={(event) => setManualDeliveryAddress(event.target.value)} placeholder="Calle, número y localidad" /></label><label>Observaciones<textarea maxLength={500} value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} placeholder="Horario, forma de pago o indicaciones…" /></label></div><footer><div><span>{manualItemCount} {manualItemCount === 1 ? "unidad" : "unidades"}</span><strong>{money.format(manualTotal)}</strong></div><button className="primary" type="submit" disabled={saving || manualItemCount === 0 || manualCustomerName.trim().length < 2}>{saving ? "Guardando…" : "Guardar pedido"}</button></footer></section></form> : <>{selectedOrderData && <section className="order-actions"><div><span>Contacto y entrega</span><b>{selectedOrderData.customerPhone || "Sin teléfono"}</b><small>{selectedOrderData.deliveryAddress || "Entrega a coordinar"}</small>{selectedOrderData.notes && <p>“{selectedOrderData.notes}”</p>}</div><div>{selectedOrderData.customerPhone && <a href={`https://wa.me/${selectedOrderData.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Escribir por WhatsApp</a>}<button onClick={printSelectedOrder}>Imprimir preparación</button></div></section>}
              {ordersLoading ? <section className="orders-loading">Cargando pedidos…</section> : orderList.length === 0 ? <section className="orders-empty"><h2>Todavía no hay pedidos</h2><p>Los pedidos del catálogo y los que cargue tu equipo van a aparecer acá.</p><button className="primary" onClick={() => setManualOrderOpen(true)}>Cargar el primero</button></section> : <section className="orders-workspace"><div className="orders-list"><div className="orders-list-head"><b>{orderList.length} pedidos</b><span>{orderList.filter((order) => order.status === "new").length} nuevos</span></div>{orderList.map((order) => <button key={order.id} className={selectedOrder === order.id ? "selected" : ""} onClick={() => setSelectedOrder(order.id)}><span className={`order-dot ${order.status}`}></span><div><b>{order.customerName}</b><small>#{String(order.id).padStart(4,"0")} · {new Intl.DateTimeFormat("es-AR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(order.createdAt.replace(" ","T") + "Z"))}</small></div><strong>{money.format(order.total)}</strong></button>)}</div>{(() => { const order = orderList.find((item) => item.id === selectedOrder) ?? orderList[0]; if (!order) return null; const labels = { new:"Nuevo", confirmed:"Confirmado", prepared:"Preparado", delivered:"Entregado" }; return <article className="order-detail"><header><div><span>Pedido #{String(order.id).padStart(4,"0")}</span><h2>{order.customerName}</h2></div><select aria-label="Estado del pedido" value={order.status} disabled={saving} onChange={(event) => changeOrderStatus(order.id, event.target.value as Order["status"])}><option value="new">Nuevo</option><option value="confirmed">Confirmado</option><option value="prepared">Preparado</option><option value="delivered">Entregado</option></select></header><div className="order-status-line"><span className={`order-dot ${order.status}`}></span>{labels[order.status]} · {order.items.reduce((sum,item) => sum + item.quantity,0)} unidades</div><div className="order-items">{order.items.map((item) => <div key={item.id}><span>{item.quantity}×</span><div><b>{item.productName}</b><small>{item.productCode} · {money.format(item.unitPrice)} c/u</small></div><strong>{money.format(item.unitPrice * item.quantity)}</strong></div>)}</div><footer><span>Total del pedido</span><strong>{money.format(order.total)}</strong></footer></article>; })()}</section>}</>}
            </> : section === "customers" ? <>
              <div className="customers-heading"><div><h1>Clientes</h1><p>Se actualiza automáticamente con cada pedido recibido.</p></div><label><span>Buscar cliente</span><input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Nombre del comercio…" /></label></div>
              {ordersLoading ? <section className="orders-loading">Cargando clientes…</section> : customers.length === 0 ? <section className="orders-empty"><h2>{customerSearch ? "No encontramos ese cliente" : "Todavía no hay clientes"}</h2><p>{customerSearch ? "Probá buscando con otro nombre." : "Los clientes van a aparecer solos cuando hagan su primer pedido."}</p></section> : <section className="customers-workspace"><div className="customers-list"><div className="customers-list-head"><b>{customers.length} clientes</b><span>Ordenados por actividad</span></div>{customers.map((customer) => <button key={normalize(customer.name)} className={selectedCustomer === customer.name ? "selected" : ""} onClick={() => setSelectedCustomer(customer.name)}><span className="customer-avatar">{customer.name.charAt(0).toUpperCase()}</span><div><b>{customer.name}</b><small>{customer.orders.length} {customer.orders.length === 1 ? "pedido" : "pedidos"} · última compra {new Intl.DateTimeFormat("es-AR", { day:"2-digit", month:"short" }).format(new Date(customer.lastOrder.replace(" ","T") + "Z"))}</small></div><strong>{money.format(customer.total)}</strong></button>)}</div>{(() => { const customer = customers.find((item) => item.name === selectedCustomer) ?? customers[0]; if (!customer) return null; const average = customer.total / customer.orders.length; return <article className="customer-detail"><header><span className="customer-avatar large">{customer.name.charAt(0).toUpperCase()}</span><div><h2>{customer.name}</h2><p>Cliente desde {new Intl.DateTimeFormat("es-AR", { month:"long", year:"numeric" }).format(new Date(customer.orders[customer.orders.length - 1].createdAt.replace(" ","T") + "Z"))}</p></div></header><div className="customer-summary"><div><span>Compras acumuladas</span><strong>{money.format(customer.total)}</strong></div><div><span>Ticket promedio</span><strong>{money.format(average)}</strong></div><div><span>Pedidos</span><strong>{customer.orders.length}</strong></div></div><h3>Historial de pedidos</h3><div className="customer-orders">{customer.orders.map((order) => <button key={order.id} onClick={() => { setSelectedOrder(order.id); setSection("orders"); }}><div><b>Pedido #{String(order.id).padStart(4,"0")}</b><small>{new Intl.DateTimeFormat("es-AR", { day:"2-digit", month:"long", year:"numeric" }).format(new Date(order.createdAt.replace(" ","T") + "Z"))} · {order.items.reduce((sum,item) => sum + item.quantity,0)} unidades</small></div><strong>{money.format(order.total)}</strong><span>Ver detalle</span></button>)}</div></article>; })()}</section>}
            </> : section === "billing" ? <>
              <div className="billing-heading"><div><h1>Plan y facturación</h1><p>Tu prueba y tu suscripción, en un solo lugar.</p></div><div className="billing-toggle" aria-label="Período de facturación"><button disabled={paidPlanActive} className={!billingAnnual ? "active" : ""} onClick={() => setAnnualPricing(false)}>Mensual</button><button disabled={paidPlanActive} className={billingAnnual ? "active" : ""} onClick={() => setAnnualPricing(true)}>Anual <span>2 meses gratis</span></button></div></div>
              <form className="promo-redeem" onSubmit={redeemPromoCode}><label>¿Tenés un código de regalo?<input value={promoCodeInput} onChange={(event) => setPromoCodeInput(event.target.value)} placeholder="Ej. PASALISTA-XXXX" maxLength={40} /></label><button className="primary" type="submit" disabled={redeemingPromo || !promoCodeInput.trim()}>{redeemingPromo ? "Canjeando…" : "Canjear"}</button></form>
              <section className={`billing-status ${trialActive ? "trial" : paidPlanActive ? "paid" : "expired"}`}><div><span>{trialActive ? "Prueba de Negocio" : paidPlanActive ? `Plan ${activePlanName}` : "Prueba finalizada"}</span><h2>{trialActive ? `Te quedan ${trialDaysLeft} días con las funciones de Negocio` : paidPlanActive ? "Tu suscripción está activa" : "Elegí cómo querés continuar"}</h2><p>{trialActive ? "Podés usar hasta 3 catálogos. Al terminar, elegís Simple, Negocio o Empresa; no borramos nada." : paidPlanActive ? `Facturación ${activeBilling.billingCycle === "annual" ? "anual" : "mensual"}${activeBilling.currentPeriodEnd ? ` · próximo período ${new Intl.DateTimeFormat("es-AR", { day:"numeric", month:"long" }).format(new Date(activeBilling.currentPeriodEnd))}` : ""}.` : "Tus catálogos siguen guardados pero pausados. Elegí un plan para volver a publicarlos."}</p></div><strong>{trialActive ? "Sin tarjeta" : paidPlanActive ? "Activo" : "En pausa"}</strong></section>
              <section className="billing-compare"><header><div><h2>Elegí el plan que acompaña tu operación</h2><p>{paidPlanActive ? "Tu ciclo actual se conserva al cambiar de plan. No cobramos comisión por venta." : "Podés cambiar de plan más adelante. No cobramos comisión por venta."}</p></div></header>
                <div className="billing-plan-row"><div><h3>Simple</h3><p>El catálogo esencial para recibir pedidos.</p>{!paidPlanActive && catalogs.length > 1 && <label className="simple-catalog-choice">Catálogo que seguirá publicado<select value={simpleCatalogId ?? ""} onChange={(event) => setSimpleCatalogId(Number(event.target.value))}><option value="" disabled>Elegir catálogo…</option>{catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}</select><small>Los demás quedan pausados y guardados.</small></label>}</div><div className="billing-plan-price"><strong>{billingAnnual ? "$129.000" : "$12.900"}</strong><span>ARS / {billingAnnual ? "año" : "mes"}</span></div><ul><li>1 catálogo y hasta 300 productos</li><li>Excel y catálogo compartible</li><li>Pedidos por WhatsApp</li></ul><button disabled={saving || paidPlanActive} onClick={() => startSubscription("simple")}>{paidPlanActive && activeBilling.plan === "simple" ? "Plan actual" : paidPlanActive ? "Disponible al renovar" : saving ? "Abriendo…" : "Elegir Simple"}</button></div>
                <div className="billing-plan-row featured"><div><span>Más completo</span><h3>Negocio</h3><p>Para que el equipo venda, prepare y siga cada pedido.</p></div><div className="billing-plan-price"><strong>{billingAnnual ? "$249.000" : "$24.900"}</strong><span>ARS / {billingAnnual ? "año" : "mes"}</span></div><ul><li>Hasta 3 catálogos</li><li>Productos ilimitados</li><li>Pedidos y clientes en el panel</li><li>PDF de preparación</li></ul><button className="primary" disabled={saving || (paidPlanActive && activeBilling.plan !== "simple")} onClick={() => startSubscription("negocio")}>{paidPlanActive && activeBilling.plan === "negocio" ? "Plan actual" : paidPlanActive && activeBilling.plan === "empresa" ? "Disponible al renovar" : saving ? "Actualizando…" : paidPlanActive ? "Pasar a Negocio" : "Elegir Negocio"}</button></div>
                <div className="billing-plan-row"><div><h3>Empresa</h3><p>Todo Negocio, para operar más marcas, líneas o sucursales.</p></div><div className="billing-plan-price"><strong>{billingAnnual ? "$449.000" : "$44.900"}</strong><span>ARS / {billingAnnual ? "año" : "mes"}</span></div><ul><li>Hasta 20 catálogos</li><li>Todo lo incluido en Negocio</li></ul><button disabled={saving || (paidPlanActive && activeBilling.plan === "empresa")} onClick={() => startSubscription("empresa")}>{paidPlanActive && activeBilling.plan === "empresa" ? "Plan actual" : saving ? "Actualizando…" : paidPlanActive ? "Pasar a Empresa" : "Elegir Empresa"}</button></div>
              </section>
              <p className="billing-footnote">Mercado Pago se abre únicamente al contratar. La prueba gratuita no genera cobros automáticos. <a href="/baja">Solicitar la baja</a></p>
            </> : <>
              <div className="settings-heading"><div><h1>Configuración</h1><p>Lo que ven tus clientes y cómo recibís sus pedidos.</p></div><button className="preview-link" onClick={() => setView("customer")}>Ver catálogo</button></div>
              <div className="settings-layout">
                <form className={`settings-form ${accountPaused ? "settings-paused" : ""}`} aria-disabled={accountPaused} onSubmit={saveSettings}>
                  <section><h2>Identidad del negocio</h2><p>Usá el nombre y los colores que tus clientes ya reconocen.</p><div className="settings-fields"><label className="wide">Nombre del negocio<input required maxLength={80} value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value, slug: slugFrom(event.target.value) })} /></label><label>Color de marca<span className="color-field"><input type="color" value={settings.brandColor} onChange={(event) => setSettings({ ...settings, brandColor: event.target.value })} /><code>{settings.brandColor}</code></span></label><label>Logo<span className="logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} /><span>{settings.logoKey ? "Cambiar imagen" : "Subir imagen"}</span><small>PNG, JPG o WebP · máximo 2 MB</small></span></label><label>Moneda<select value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })}><option value="ARS">Pesos argentinos (ARS)</option><option value="USD">Dólares (USD)</option></select></label></div></section>
                  <section><h2>Pedidos y entrega</h2><p>Esta información aparece en el catálogo y en el resumen del carrito.</p><div className="settings-fields"><label>WhatsApp<input inputMode="tel" placeholder="Ej. +54 9 11 2345 6789" value={settings.whatsapp} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} /></label><label>Pedido mínimo<input type="number" inputMode="numeric" min="0" step="100" value={minimumOrderInput} onChange={(event) => { setMinimumOrderInput(event.target.value); setSettings({ ...settings, minimumOrder: event.target.value === "" ? 0 : Number(event.target.value) }); }} placeholder="0" /></label><label className="wide">Zonas de entrega<input placeholder="Ej. Zona Norte, San Martín y alrededores" value={settings.deliveryZones} onChange={(event) => setSettings({ ...settings, deliveryZones: event.target.value })} /></label><label className="wide">Días de entrega<input placeholder="Ej. Martes y jueves" value={settings.deliveryDays} onChange={(event) => setSettings({ ...settings, deliveryDays: event.target.value })} /></label></div></section>
                  <section><h2>Compartí tu catálogo</h2><p>El enlace se crea a partir del nombre del negocio y siempre muestra la lista vigente.</p><div className="share-catalog"><div><div className="catalog-link share-link"><span>…/catalogo/</span><strong>{settings.slug}</strong></div><div className="share-buttons"><button type="button" className="primary" onClick={shareCatalog}>Compartir catálogo</button><a href={`/catalogo/${settings.slug}`} target="_blank" rel="noreferrer">Abrir catálogo</a><button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/catalogo/${settings.slug}`).then(() => setNotice("Enlace copiado."))}>Copiar enlace</button></div><small className="share-hint">Ideal para mandarlo por WhatsApp o compartirlo desde el celular.</small></div><div className="qr-card">{catalogQr ? <img src={catalogQr} alt={`Código QR del catálogo de ${settings.name}`} /> : <span>Generando QR…</span>}<button type="button" disabled={!catalogQr} onClick={downloadCatalogQr}>Descargar QR</button></div></div></section>
                  <div className="settings-actions"><span>{saving ? "Guardando cambios…" : "Los cambios se aplican al catálogo."}</span><button className="primary" disabled={saving} type="submit">{saving ? "Guardando…" : "Guardar configuración"}</button></div>
                </form>
                <aside className="catalog-preview" aria-label="Vista previa del catálogo"><span>Vista previa</span><div className="preview-phone" style={{ "--brand-preview": settings.brandColor } as React.CSSProperties}><div className="preview-store">{settings.logoKey ? <img src={`/api/logo?slug=${encodeURIComponent(settings.slug)}&v=${logoVersion}`} alt="Logo del negocio" /> : <b>{settings.name.charAt(0) || "R"}</b>}<div><strong>{settings.name || "Tu negocio"}</strong><small>Lista Comercios</small></div></div><div className="preview-search">Buscar productos…</div><div className="preview-item"><span></span><div><b>Producto de ejemplo</b><small>Presentación · código</small></div><strong>$12.500</strong></div><div className="preview-order"><span>Pedido mínimo</span><b>{money.format(settings.minimumOrder)}</b></div></div></aside>
              </div>
            </>}
          </div>
        </section>
      ) : (
        <section className="customer-view" style={{ "--customer-brand": settings.brandColor } as React.CSSProperties}><div className="store-header"><div className="store-identity">{settings.logoKey ? <img src={`/api/logo?slug=${encodeURIComponent(settings.slug)}&v=${logoVersion}`} alt={`Logo de ${businessName}`} /> : <span>{businessName.charAt(0) || "R"}</span>}<div><b>{businessName}</b><small>Lista Comercios · actualizada {lastUpdate.toLowerCase()}</small></div></div><small>Pedido mínimo {money.format(settings.minimumOrder)}</small></div><div className="customer-main">
          <div className={`welcome ${accountPaused ? "preview-paused" : ""}`}><div><b>{accountPaused ? "Vista previa del catálogo" : "Así ven tus clientes el catálogo"}</b><small>{accountPaused ? "Tus clientes ven un aviso de catálogo pausado." : "Vista previa · botón de ejemplo para repetir un pedido"}</small></div><button className="primary" onClick={() => { if (accountPaused) { setView("business"); setSection("billing"); } else repeatOrder(); }}>{accountPaused ? "Reactivar catálogo" : "Repetir último pedido"}</button></div>
          {notice && <div className="notice" role="status">{notice}</div>}
          <input value={search} onChange={(event) => { setSearch(event.target.value); setProductPage(1); }} aria-label="Buscar productos" placeholder="Buscar por producto o código…" />
          <div className="category-row">{categories.map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => { setCategory(item); setProductPage(1); }}>{item}</button>)}</div>
          <div className="product-grid">{pagedProducts.map((product) => { const qty = quantities[product.code] ?? 0; const image = productImage(product); return <article className={`product ${accountPaused ? "preview-product" : ""}`} key={product.code}><span className="product-emoji">{image ? <img src={image} alt={product.name} /> : productEmoji(product.name, product.category, product.emoji)}</span><div><b>{product.name}</b><small>{product.detail}{product.detail ? " · " : ""}{product.code}</small><strong>{money.format(product.price)}</strong></div><div className="quantity"><button disabled={accountPaused} onClick={() => updateQuantity(product.code, -1)} aria-label={`Quitar ${product.name}`}>−</button><span>{qty}</span><button disabled={accountPaused} onClick={() => updateQuantity(product.code, 1)} aria-label={`Agregar ${product.name}`}>+</button></div></article>; })}</div>
          {visibleProducts.length > productsPerPage && <nav className="catalog-pagination" aria-label="Páginas del catálogo"><span>Mostrando {(productPage - 1) * productsPerPage + 1}–{Math.min(productPage * productsPerPage, visibleProducts.length)} de {visibleProducts.length}</span><div><button disabled={productPage === 1} onClick={() => setProductPage((page) => Math.max(1, page - 1))}>Anterior</button><b>{productPage} de {productPageCount}</b><button disabled={productPage === productPageCount} onClick={() => setProductPage((page) => Math.min(productPageCount, page + 1))}>Siguiente</button></div></nav>}
          {!visibleProducts.length && <div className="empty">No encontramos productos con esa búsqueda.</div>}
          {checkoutOpen && itemCount > 0 && <section className="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><header><div><h2 id="checkout-title">Revisá tu pedido</h2><p>Podés cambiar cantidades antes de enviarlo.</p></div><button onClick={() => { setCheckoutOpen(false); setCheckoutError(""); }} aria-label="Cerrar revisión">Cerrar</button></header><div className="checkout-items">{products.filter((product) => (quantities[product.code] ?? 0) > 0).map((product) => <div key={product.code}><span>{quantities[product.code]}×</span><div><b>{product.name}</b><small>{product.code}</small></div><strong>{money.format(product.price * quantities[product.code])}</strong></div>)}</div><div className="checkout-fields"><label>Nombre o comercio *<input ref={checkoutNameRef} required minLength={2} maxLength={100} aria-invalid={Boolean(checkoutError)} aria-describedby={checkoutError ? "checkout-error" : undefined} value={checkoutName} onChange={(event) => { setCheckoutName(event.target.value); if (checkoutError) setCheckoutError(""); }} placeholder="Ej. Almacén Don José" /></label><label>Teléfono<input inputMode="tel" maxLength={30} value={checkoutPhone} onChange={(event) => setCheckoutPhone(event.target.value)} placeholder="Ej. 11 2345 6789" /></label><label className="wide">Dirección de entrega<input maxLength={180} value={checkoutAddress} onChange={(event) => setCheckoutAddress(event.target.value)} placeholder="Calle, número y localidad" /></label><label className="wide">Observaciones<textarea maxLength={500} value={checkoutNotes} onChange={(event) => setCheckoutNotes(event.target.value)} placeholder="Horario, indicaciones o productos a reemplazar…" /></label>{checkoutError && <p className="checkout-error wide" id="checkout-error" role="alert">{checkoutError}</p>}</div><footer><span>Total</span><strong>{money.format(total)}</strong><button disabled={saving} onClick={sendOrder}>{saving ? "Preparando…" : "Confirmar y abrir WhatsApp"}</button></footer></section>}
          <div className={`cart-bar ${accountPaused ? "preview-cart" : ""}`}><div><b>{accountPaused ? "Catálogo pausado" : `${itemCount} productos · ${money.format(total)}`}</b><small>{accountPaused ? "Solo vos podés ver esta vista previa" : `Entrega: ${deliverySummary}`}</small></div><button disabled={saving || itemCount === 0 || accountPaused} onClick={() => { setCheckoutError(""); setCheckoutOpen(true); }}>Revisar pedido</button></div>
        </div></section>
      )}
    </main>
  );
}
