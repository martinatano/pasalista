# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pequeñas y medianas distribuidoras y mayoristas que hoy mantienen precios y productos en Excel y reciben pedidos por WhatsApp. Sus compradores son comercios frecuentes que necesitan consultar la lista vigente y armar pedidos sin iniciar sesión.

## Product Purpose

PasáLista convierte una lista de Excel en un catálogo interactivo para reducir mensajes, errores de precio y trabajo manual. La empresa actualiza el catálogo importando un Excel; el cliente arma el carrito y envía el pedido ordenado por WhatsApp.

## Positioning

La empresa conserva Excel y WhatsApp como herramientas conocidas: PasáLista transforma el archivo existente en el canal de pedidos, sin exigir un ecommerce tradicional ni cobrar comisión por venta.

## Operating Context

La empresa inicia sesión desde cualquier dispositivo, administra su catálogo y comparte un enlace. Actualiza precios volviendo a importar Excel. El cliente navega el catálogo, busca productos, arma cantidades y prepara el pedido para WhatsApp.

## Capabilities and Constraints

- Autenticación real con Clerk y datos separados por empresa.
- Persistencia estructurada en Cloudflare D1.
- Importación de Excel, XLS y CSV con detección de producto, precio, código, presentación, categoría y stock.
- Catálogo, carrito, repetición de pedido y preparación del mensaje para WhatsApp.
- La carga debe sentirse mínima y no obligar a reconstruir manualmente el inventario.
- Los clientes del catálogo público no deben necesitar una cuenta.
- Una empresa puede administrar hasta tres catálogos en Negocio y hasta veinte en Empresa.
- La prueba de 14 días habilita las funciones y el límite de Negocio. Al pasar a Simple, el usuario elige un catálogo publicado y los demás quedan guardados pero pausados.
- El archivo original no se almacena en el MVP; se guardan los datos procesados y el historial de importación.

## Brand Commitments

El producto se llama PasáLista. La voz es directa, simple y rioplatense, dirigida a negocios reales sin jerga técnica. La promesa central es “Tu Excel, listo para tomar pedidos”.

## Evidence on Hand

Existe un prototipo funcional con una distribuidora de pollo, huevos y quesos como caso demostrativo. No hay todavía testimonios, métricas comerciales ni logos de clientes reales; no deben inventarse.

## Product Principles

- Mantener la forma de trabajo que la pyme ya conoce.
- Pedir la menor carga manual posible.
- Mostrar siempre qué precio y lista está viendo cada cliente.
- Evitar errores antes que sumar funciones complejas.
- Hacer que la configuración y actualización puedan resolverse sin ayuda técnica.
