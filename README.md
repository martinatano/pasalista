# PasáLista

Catálogo web para mayoristas: importa una lista de Excel, recibe pedidos y los prepara desde un panel.

## Desarrollo local

Requiere Node.js 22.13 o posterior.

```bash
npm install
npm run dev
```

La configuración privada vive en `.env.local`. Usá `.env.example` como guía y nunca subas credenciales al repositorio.

## Producción

El proyecto declara sus recursos persistentes en `.openai/hosting.json`:

- `DB`: base D1 para negocios, productos, pedidos, clientes, suscripciones y solicitudes legales.
- `FILES`: almacenamiento R2 para logos e imágenes de productos.

Sites crea y vincula ambos recursos al desplegar. Las migraciones de `drizzle/` se aplican a la base de producción como parte del despliegue; no se deben editar a mano luego de publicadas.

Variables obligatorias:

- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- Mercado Pago: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`.
- URL: `NEXT_PUBLIC_APP_URL`.
- Legales: `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_TAX_ID`, `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL`.

El webhook de Mercado Pago debe apuntar a `https://DOMINIO/api/billing/webhook` y usar la misma clave secreta configurada en `MERCADOPAGO_WEBHOOK_SECRET`.

Antes de publicar:

```bash
npm run db:generate
npm run lint
npm test
```

## Operación y recuperación

- D1 y R2 son la fuente de verdad; el navegador no guarda el catálogo real.
- Una importación fallida no reemplaza el catálogo vigente.
- Los webhooks se validan antes de modificar una suscripción.
- Revisar diariamente `cancellation_requests` y responder cada solicitud con su código de confirmación.
- Antes de una migración sensible, exportar D1 y conservar una copia de los objetos R2. Probar primero la restauración en un entorno separado.
- Rotar inmediatamente cualquier secreto que haya sido publicado o enviado por un canal inseguro.

## Comandos

- `npm run dev`: servidor local.
- `npm run build`: compilación de producción.
- `npm test`: compilación más verificación básica.
- `npm run lint`: controles de código.
- `npm run db:generate`: genera la siguiente migración desde `db/schema.ts`.
