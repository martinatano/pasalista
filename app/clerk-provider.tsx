"use client";

import { ClerkProvider } from "@clerk/react";

export function PasaListaClerkProvider({ children, publishableKey }: { children: React.ReactNode; publishableKey: string }) {
  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
