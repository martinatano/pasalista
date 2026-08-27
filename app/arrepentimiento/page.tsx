import type { Metadata } from "next";
import LegalPage from "../legal/legal-page";
import LegalRequestForm from "../legal/request-form";

export const metadata: Metadata = { title: "Derecho de arrepentimiento — PasáLista", description: "Solicitá la revocación de una contratación realizada a distancia." };

export default function WithdrawalPage() {
  return <LegalPage title="Derecho de arrepentimiento" summary="Si la normativa de consumo resulta aplicable, podés solicitar la revocación de la contratación dentro del plazo legal."><LegalRequestForm type="withdrawal" /></LegalPage>;
}
