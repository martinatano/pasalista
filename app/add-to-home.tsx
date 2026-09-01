"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const STORAGE_KEY = "pl_a2hs_seen";

export function AddToHomeScreen() {
  const [mode, setMode] = useState<"none" | "ios" | "android">("none");
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    if (isIos) { setMode("ios"); return; }
    const isAndroid = /android/i.test(ua);
    if (!isAndroid) return;
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallPromptEvent); setMode("android"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setMode("none");
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    dismiss();
  }

  if (mode === "none") return null;

  return (
    <div className="a2hs-banner" role="status">
      <span className="a2hs-icon">→</span>
      <div>
        <b>Agregá PasáLista a tu pantalla de inicio</b>
        <p>{mode === "ios" ? "Tocá el botón Compartir y elegí \"Agregar a pantalla de inicio\"." : "Instalala como una app para acceder más rápido, sin buscarla en el navegador."}</p>
      </div>
      {mode === "android" && <button className="primary" onClick={install}>Instalar</button>}
      <button className="a2hs-close" aria-label="Cerrar" onClick={dismiss}>×</button>
    </div>
  );
}
