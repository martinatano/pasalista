export const legalConfig = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || "Titular de PasáLista",
  taxId: process.env.NEXT_PUBLIC_LEGAL_TAX_ID || "CUIT pendiente de informar",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "República Argentina",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "soporte@pasalista.com.ar",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "privacidad@pasalista.com.ar",
  updatedAt: "27 de agosto de 2026",
};

