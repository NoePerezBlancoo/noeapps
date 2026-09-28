# Fase 2 — búsqueda comercial del Catálogo

Revisión del 28/09/2026. Rama: `agent/catalog-roadmap-v2-safe`. Código: `c2371a3`, ajuste de legibilidad `926e684`.

## Cambios

La biblioteca permite combinar texto, categoría, sector, tipo de negocio, estilo visual y rango de precio de creación. Normaliza acentos, mayúsculas y equivalencias: peluquería/barbería, abogado/bufete, taller/automoción, elegante/premium y serio/sobrio, entre otras. El tipo de negocio agrupa afinidades editoriales a partir de la categoría existente; no representa una clasificación nueva basada en inspeccionar cada demo.

Ordena por adecuación, solicitudes, ventas, conversión, incorporación registrada y precio ascendente/descendente. El botón de recomendación devuelve hasta tres coincidencias respetando todos los filtros. Si solo hay dos, explica que no existen tres. Las consultas sin coincidencias no se rellenan con resultados inventados. Conserva los criterios existentes de selección de demos y los enlaces a demo y solicitud.

Las estadísticas públicas solo contienen agregados de solicitudes, ventas y conversión. La facturación por diseño se consulta con sesión administrativa en CRM → Analítica → Rendimiento por diseño. Hay buscador, ordenación y paginación visual de la tabla.

Las métricas se calculan sobre registros existentes de Catálogo, sin mezclarlos con TuNegocio:

- Popularidad: número de solicitudes, incluidos sus distintos estados; no son visitas ni usuarios únicos.
- Venta: una solicitud con al menos un cobro positivo en `catalog_revenue_events`. Una renovación no añade otra venta.
- Conversión: solicitudes vendidas / solicitudes. Se muestra el denominador. Sin solicitudes, la conversión es desconocida, no 0%.
- Facturación: suma de cobros brutos registrados en el ledger, incluidas renovaciones. No equivale al neto después de devoluciones ni reconstruye cobros anteriores al ledger.
- Sin actividad se muestran ceros registrados o ausencia de solicitudes. Si falla la consulta, se informa de indisponibilidad; no se inventan ceros. Cuando no hay ventas entre los resultados, se explica que todavía no hay un ranking respaldado por ventas.

Los precios no cambian. El buscador y las tarjetas comparten la función que calcula los tramos existentes: 39/79/149/299 € de creación; la cuota mostrada sigue siendo 19,90 €/mes.

## Migración y fechas

Nueva migración aditiva `catalogo/migrations/002_catalog_discovery.sql`: crea `catalog_design_registry` con ID, nombre, categoría, primera observación y fecha de incorporación nullable. La carga inicial registra los 571 diseños del inventario remoto con incorporación desconocida. No se asigna la fecha actual como si todos fueran nuevos. Los diseños observados después de esa carga reciben fecha de incorporación al seguimiento.

Se amplió el ejecutor para recorrer migraciones incrementales conservando el bloqueo, las transacciones y los checksums. `001_subscription_management.sql` permanece intacta. La nueva migración solo se aplicó a Postgres aislado de staging. No altera tablas de clientes, cobros o comisiones.

## Archivos

- Nuevos: `catalogo/search-engine.js`, `catalogo/search-ui.js`, `catalogo/search.css`, `catalogo/catalog-discovery.js`.
- Interfaz: `catalogo/index.html`, `catalogo/crm.html`.
- Servidor y migraciones: `catalogo/server.js`, `catalogo/subscriptions.js`, `catalogo/migrations/002_catalog_discovery.sql`.
- Validación: `catalogo/package.json`, `catalogo/scripts/check-build.js`, `catalogo/tests/search.test.js`, `catalogo/tests/staging-discovery.mjs`.
- Documentación: este informe y `docs/evidence/phase2-*`.

## Endpoints y variables

- `GET /api/catalog/discovery`: activación, fechas disponibles y agregados públicos por diseño. No entrega ingresos, nombres de clientes, contactos ni IDs de pedidos.
- `GET /api/crm/design-stats`: detalle de métricas e ingresos con autenticación CRM. Devuelve 401 sin sesión.
- Assets nuevos: `/assets/catalog-search.js`, `/assets/catalog-search-ui.js`, `/assets/catalog-search.css`.
- Variable nueva: `CATALOG_SEARCH_V2=true`, configurada solo en el servicio de staging. Si falta o vale `false`, se conserva la búsqueda anterior y se oculta el panel nuevo del CRM.

No se modificaron rutas públicas existentes, precios, comisiones, claves productivas, DNS ni Stripe LIVE.

## Pruebas

- Build y comprobación sintáctica de servidor, módulos y scripts HTML: PASS. El proyecto es JavaScript; `typecheck` comprueba sintaxis, no tipos estáticos TypeScript.
- 10 tests unitarios PASS, 0 fallos: incluye los cinco tests previos de cancelaciones y cinco nuevos de semántica, filtros, ordenación, privacidad e indisponibilidad.
- Integración de staging PASS: pago real Stripe TEST para una solicitud sintética, webhook firmado y duplicado, una sola venta, total de ingresos coincidente con SQL, autenticación del CRM y ausencia de facturación/datos personales en el endpoint público.
- Agregados probados también con tablas temporales privadas y rollback: dos solicitudes, un pago inicial y una renovación del mismo cliente producen dos solicitudes, una venta, conversión del 50% y suma correcta; un pago cero no genera venta.
- Navegador: los cinco ejemplos solicitados funcionan. Peluquería/restaurante/taller pueden recomendar tres; abogado e inmobiliaria devuelven las dos coincidencias disponibles en la selección actual. Consulta desconocida: cero resultados.
- Filtros combinados: cinco coincidencias de Belleza/Premium con tipo y sector correspondientes y precio exacto 149 €. Rango mínimo superior al máximo: cero resultados y mensaje explícito.
- Vista móvil de 390 px y escritorio comprobadas sin desbordamiento horizontal. CRM verificado con Velvet Atelier: una solicitud, una venta y 19,90 € TEST, con su denominador visible.
- `git diff --check` PASS. CI de la implementación en GitHub: [ejecución aprobada](https://github.com/NoePerezBlancoo/noeapps/actions/runs/36461986821).

## Staging

Servicio: `catalogo-staging-v2`, ID `2b7b78ca-0cb9-43ae-b6cc-4ee77b1015a1`, proyecto aislado `e536099e-7546-4108-b827-18a4d49f748d`.

- [Búsqueda de staging](https://catalogo-staging-v2-production.up.railway.app/#biblioteca).
- [CRM de staging](https://catalogo-staging-v2-production.up.railway.app/crm), con su contraseña propia en Railway (`CATALOG_CRM_PASSWORD`).
- Despliegue funcional revisado `65e2a708-af77-49e9-8069-2707b2227e13`: SUCCESS, healthcheck aprobado, Stripe `sandbox_test`, bridge listo.
- Último despliegue `c1c44c50-14c6-42f7-bbd2-c4acf1ef893d`: SUCCESS. Health HTTP 200, 571 diseños registrados, endpoint privado HTTP 401 sin sesión y logs de arranque sin errores. El CRM muestra el porcentaje y su denominador en líneas separadas.
- Checksums de `001_subscription_management.sql` y `002_catalog_discovery.sql` contrastados contra la base de staging: PASS. Inventario inicial: 571 diseños y 0 fechas históricas inventadas.

Las pruebas utilizaron exclusivamente la base separada, clientes sintéticos y Stripe TEST. TuNegocio y sus cancelaciones no han requerido cambios en esta fase. El checkout original de NoeApps sigue limpio en main.

## Límites y recuperación

La búsqueda usa reglas y sinónimos mantenibles, no embeddings ni llamadas de IA. La afinidad depende de los metadatos del inventario. “Más nuevas” solo conoce incorporaciones observadas desde que empezó el seguimiento; las anteriores van al final sin fecha. El inventario se refresca cada cinco minutos cuando hay una consulta; la fecha es de observación, no de autoría original.

La biblioteca sigue dependiendo de su proveedor público de demos. Las estadísticas solo cubren el ledger disponible. Una conversión alta con una sola solicitud no demuestra una tendencia; por eso se muestra siempre la muestra. Staging señala expresamente que sus cifras son de prueba.

Rollback: poner `CATALOG_SEARCH_V2=false` únicamente en el servicio aislado y desplegarlo; esto devuelve los controles anteriores y oculta el nuevo informe. Mantener `CATALOG_SUBSCRIPTIONS_V2=true` para preservar cancelaciones y acceso pagado. También puede restaurarse el código de fase 1 (`8648c33`) conservando la tabla adicional. No borrar el registro, datos o migraciones, ni cambiar checksums. No conectar staging a la base productiva.

Punto de parada: revisión en staging, sin merge ni producción. Siguiente punto del roadmap: importación desde redes y webs en TuNegocio.
