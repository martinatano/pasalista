import type { Metadata } from "next";
import LegalPage from "../legal/legal-page";
import { legalConfig } from "../legal/legal-config";

export const metadata: Metadata = { title: "Política de cancelación — PasáLista", description: "Renovaciones, bajas y derecho de arrepentimiento en PasáLista." };

export default function CancellationPage() {
  return <LegalPage title="Política de cancelación" summary="Podés detener la renovación sin perder inmediatamente el período que ya pagaste.">
    <section><h2>Prueba gratuita</h2><p>La prueba dura 14 días, no requiere tarjeta y no genera un cobro automático por sí sola. Si no elegís un plan, el catálogo se pausa y la información queda guardada.</p></section>
    <section><h2>Renovaciones</h2><p>Los planes mensuales y anuales se renuevan automáticamente mediante Mercado Pago hasta que solicites la baja. Antes de contratar se informa el precio, la frecuencia y las funciones incluidas.</p></section>
    <section><h2>Baja del servicio</h2><p>Podés solicitarla mediante el <a href="/baja">BOTÓN DE BAJA DE SERVICIO</a>. Te entregaremos un código de identificación de la solicitud. La baja detiene futuras renovaciones y, salvo disposición legal distinta, el acceso continúa hasta finalizar el período abonado.</p></section>
    <section><h2>Derecho de arrepentimiento</h2><p>Cuando resulte aplicable la normativa de defensa del consumidor, podés solicitar la revocación dentro del plazo legal mediante el <a href="/arrepentimiento">BOTÓN DE ARREPENTIMIENTO</a>. Evaluaremos la solicitud según la fecha, el tipo de contratación y el uso del servicio, sin limitar derechos irrenunciables.</p></section>
    <section><h2>Reintegros</h2><p>Fuera de los casos exigidos por ley o de un cobro incorrecto, los períodos ya iniciados no se reintegran proporcionalmente. Si creés que hubo un error, escribí a <a href={`mailto:${legalConfig.email}`}>{legalConfig.email}</a> con el comprobante correspondiente.</p></section>
    <section><h2>Datos después de la baja</h2><p>El catálogo deja de estar disponible al finalizar el período activo. Conservamos temporalmente la cuenta y su información para permitir recuperación, atender reclamos y cumplir obligaciones legales. Podés solicitar la supresión conforme la Política de privacidad.</p></section>
  </LegalPage>;
}

