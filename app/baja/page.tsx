import type { Metadata } from "next";
import LegalPage from "../legal/legal-page";
import LegalRequestForm from "../legal/request-form";

export const metadata: Metadata = { title: "Baja del servicio — PasáLista", description: "Solicitá la baja de tu suscripción a PasáLista." };

export default function CancellationRequestPage() {
  return <LegalPage title="Baja del servicio" summary="No necesitás iniciar sesión. Ingresá el email con el que contrataste y te damos una constancia inmediata."><LegalRequestForm type="cancellation" /></LegalPage>;
}

