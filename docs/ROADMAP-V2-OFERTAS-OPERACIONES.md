# Roadmap v2: ofertas, analítica, gastos, incidencias y WhatsApp

28 de septiembre de 2026. Cinco bloques implementados para revisión en staging. Producción, Stripe LIVE, sus bases de datos, variables y DNS no se han modificado. No se ha hecho merge a main ni se han enviado mensajes a clientes.

## Resultado funcional

| Bloque | Disponible |
| --- | --- |
| Ofertas | Campañas mensuales, porcentaje, duración, vigencia y producto; asignación desde CRM, cupones Stripe y atribución de clientes, ventas, cobros y descuentos confirmados. |
| Analítica | Cobros del día/mes/año/acumulado, ventas, conversión, clientes con acceso pagado, altas pagadas, webs publicadas, categorías, estilos y consumo de IA. Totales conjuntos obtenidos mediante bridge autenticado, conservando bases separadas. |
| Gastos y rentabilidad | Gastos puntuales/mensuales, fecha de inicio, cierre con historial, categorías, comisiones registradas y resultado operativo estimado. Las comisiones devengadas se restan una sola vez. |
| Incidencias | Monitor cada cinco minutos, ejecución manual, historial de comprobaciones, notas de revisión y resolución automática cuando desaparece la causa. Detecta pagos sin publicación, cobros fallidos, checkout antiguo, acceso vencido, errores de publicación/IA, bridge y DNS. |
| WhatsApp | Seis plantillas editables: preview, pago, recordatorio, publicación, seguimiento y cancelación. Desde cada ficha se prepara texto revisable y enlace wa.me; el usuario decide enviarlo en WhatsApp. |

La campaña queda bloqueada al reservar un checkout o cobrar. Reintentos simultáneos reutilizan el mismo checkout; desactivar una campaña no altera suscripciones existentes. El descuento se aplica a la cuota mensual y conserva el precio de creación del Catálogo. TuNegocio admite descuentos del 1 al 99%, porque su flujo exige un primer cobro positivo.

El CRM distingue cobros confirmados, gastos registrados, estimaciones y datos no disponibles. Un producto inaccesible no se representa como cero. Una web de Catálogo sin origen configurado no cuenta como publicada aunque tenga un pago confirmado.

## Ramas y staging

- Catálogo: `agent/catalog-roadmap-v2-safe`, base de este bloque `0560eef`, código final `d5cd4f2`.
- TuNegocio: `agent/roadmap-v2-safe`, base de este bloque `89a412c`, código final `d1919f8`.
- CRM: https://catalogo-staging-v2-production.up.railway.app/crm
- TuNegocio: https://tunegocio-staging-v2-production.up.railway.app
- Catálogo: proyecto Railway `e536099e-7546-4108-b827-18a4d49f748d`, servicio `2b7b78ca-0cb9-43ae-b6cc-4ee77b1015a1`, entorno `c3ade4fb-e8b3-4560-bcc8-46759c1f3c19`.
- TuNegocio: proyecto `887d03a6-70bd-42ce-afdf-590aa52c07d0`, servicio exclusivo `4c284048-05fd-4e4e-87a5-4dbe0a386b2c`, entorno `95a50f16-f21a-40ea-be33-210fa1ee7e99`.
- Estos entornos Railway se llaman `production`, pero los IDs anteriores identifican exclusivamente staging. Bases, claves TEST y datos sintéticos separados por producto.
- Las evidencias finales de despliegue y CI están en `evidence/operations-release.json`.
- TuNegocio conserva la configuración Git anterior del servicio de staging (`agent/mvp-preview-publish`). Esta entrega se subió explícitamente desde la rama de trabajo; un futuro despliegue de aquella rama podría sustituirla.

## Archivos

| Repositorio | Archivos modificados o nuevos |
| --- | --- |
| Catálogo: implementación | `catalogo/server.js`, `catalogo/crm.html`, `catalogo/crm-roadmap.js`, `catalogo/crm-roadmap-ui.js` |
| Catálogo: esquema y verificación | `catalogo/migrations/003_crm_operations.sql`, `catalogo/scripts/check-build.js`, `catalogo/tests/crm-roadmap.test.js`, `catalogo/tests/staging-roadmap.mjs`, `catalogo/tests/staging-roadmap-final.mjs` |
| TuNegocio: bridge | `app/api/internal/crm-insights/route.ts`, `app/api/internal/crm-offer/route.ts`, `lib/crm-offers-v2.server.ts` |
| TuNegocio: pagos y atribución | `lib/crm-commercial.server.ts`, `lib/publication-payments.server.ts`, `lib/publication-store.server.ts`, `lib/publication-webhook.server.ts` |
| TuNegocio: esquema y pruebas | `db/migrations/025_crm_roadmap.sql`, `.gitattributes`, `tests/crm-offers-v2.test.ts`, `tests/publication-store.test.ts`, `scripts/prepare-staging-campaign.ts`, `scripts/test-staging-campaign-clock.mjs`, `scripts/verify-staging-campaign.mjs` |
| Documentación | Este informe, informe específico de TuNegocio y evidencias `docs/evidence/operations-*` en ambos repositorios. |

## Migraciones y compatibilidad

Dos migraciones nuevas, aplicadas únicamente a las bases aisladas de staging. Ninguna migración previamente aplicada se ha editado.

- **Catálogo 003**: columnas nullable de descuento/campaña en el ledger; fecha de cierre y referencia opcional de gastos; tablas nuevas de auditoría, asignaciones, incidencias, ejecuciones del monitor y plantillas WhatsApp.
- **TuNegocio 025**: campaña y caducidad nullable en ofertas, campaña nullable en pedidos, descuento nullable en ingresos y tabla de auditoría de ofertas.
- Se conservan columnas, registros y contratos públicos existentes. Los datos históricos sin desglose de descuento no se reconstruyen artificialmente. La migración no cambia suscripciones Stripe.
- Recuperación: conservar las columnas/tablas aditivas y sus registros. No ejecutar una migración destructiva para volver al código anterior.

## Endpoints y variables

Catálogo añade rutas privadas autenticadas:

- `GET /api/crm/roadmap`: informe consolidado.
- `GET /api/crm/roadmap/campaign?id=UUID`: clientes de una campaña.
- `GET /api/crm/roadmap/incidents` y `POST /api/crm/roadmap/scan`.
- `PATCH /api/crm/roadmap/incident`: nota y revisión; no permite fingir resolución.
- `GET|PUT /api/crm/roadmap/templates`.
- `POST /api/crm/roadmap/message`: prepara texto/enlace, sin envío.
- `/assets/crm-roadmap.js`: código de interfaz, sin datos privados.

TuNegocio añade `GET /api/internal/crm-insights` con bearer del bridge. `POST|DELETE /api/internal/crm-offer` amplía el comportamiento bajo flag para campañas con `campaignId`, nombre, porcentaje, duración y caducidad; conserva el flujo anterior cuando el flag está deshabilitado.

Variable nueva en ambos servicios: **`CRM_ROADMAP_V2=true`**, configurada solamente en staging. Se reutilizan las conexiones, autenticación y credenciales TEST existentes. No hacen falta credenciales WhatsApp porque se preparan enlaces revisables.

## Pruebas y evidencia

- Catálogo: build/typecheck de scripts y **15/15 pruebas** aprobadas; CI también valida el catálogo completo.
- TuNegocio: **398 aprobadas, cero fallidas, una integración opt-in omitida** en la suite general; typecheck y build aprobados. Integración PostgreSQL ejecutada explícitamente: **29/29**. Predespliegue de staging: **35/35**, con esquema aislado temporal.
- Checkout Catálogo: tres solicitudes concurrentes producen una sola sesión TEST; importe 995 céntimos, descuento 995. Cambios de oferta/precio posteriores: 409. Notas editables con campaña desactivada.
- TuNegocio: asignación desde el CRM → cupón TEST → Checkout alojado pagado con tarjeta de prueba → evento Stripe canónico → un único ingreso atribuido, incluso al repetir el webhook. Cambiar la oferta después del pago: 409. El pago TEST no publica en LIVE.
- Stripe TEST con reloj: **meses 1–4: 9,95 € cada uno; mes 5: 19,90 € sin descuento**. Se comprobaron facturas pagadas, no solo el texto del checkout.
- El sandbox claimable de Catálogo no concede permisos para relojes. Allí se verificó su primer cobro y webhook reales TEST; los cinco ciclos se verificaron con la cuenta TEST independiente de TuNegocio y la oferta creada por el CRM. No se han compartido claves entre productos.
- Campaña conjunta de prueba: **dos clientes, dos ventas, 19,90 € cobrados y 19,90 € de descuentos**, con ambos clientes visibles en el selector.
- Gastos: fecha inválida rechazada, gasto futuro excluido, cierre mensual conserva el mes y reactivación exige un registro nuevo. No se duplica el coste de comisiones.
- Incidencias: fallo sintético detectado, nota conservada mientras falla y resolución automática al recuperarse. Tras pagar un fixture sin origen web, se detecta de nuevo la causa real. Los avisos abiertos de staging corresponden a fixtures deliberadamente incompletos, no a una caída del monitor.
- WhatsApp: plantillas guardadas/restauradas, sustitución y codificación exacta, bloqueo de enlaces/datos ausentes, publicación inexistente o cancelación no confirmada. Preparación comprobada también en navegador; ningún mensaje enviado.
- Acceso anónimo al informe: 401; escritura desde otro origen: 403. Auditoría de acciones administrativas y mensajes preparados.
- Revisión visual escritorio/móvil; ancho del documento 390 px a viewport 390 px. Tablas anchas tienen desplazamiento interno.
- La primera prueba de integración ocurrió durante un despliegue de TuNegocio y registró bridge no disponible. `operations-final.json` documenta la comprobación posterior satisfactoria con ambos productos conectados.

Evidencias: `operations-catalog.json`, `operations-checkout.json`, `operations-clock.json`, `operations-final.json`, `operations-release.json` y capturas de pantalla. Contienen exclusivamente fixtures y resultados sintéticos; no incluyen claves, contraseñas ni cookies.

## Límites y riesgos

- Cobros **brutos**, sin conciliación completa de devoluciones ni recuperación de facturas anteriores al ledger. El resultado operativo depende de los gastos introducidos y no equivale a beneficio contable auditado.
- IA: estimación de telemetría en USD, con cobertura de eventos con/sin precio visible. No es la factura del proveedor, no se convierte silenciosamente a EUR y no se atribuye por web sin datos que lo permitan.
- Churn histórico no disponible sin cohorte inicial verificable. MRR es una estimación de cuota base, no una promesa de cobro. Los clientes de productos distintos se suman sin cruzar sus bases.
- En TuNegocio, previews protegidas o enlaces de pago ausentes deben aportarse como enlaces compartibles verificados al preparar el mensaje. No se reutiliza la sesión del administrador.
- Monitor diseñado para el servicio actual de una réplica, con exclusión de ejecuciones simultáneas dentro del proceso. Antes de múltiples réplicas conviene un coordinador distribuido. TuNegocio limita el listado de salud a 2.000 proyectos y 100 errores IA recientes; una lectura incompleta no resuelve silenciosamente las incidencias omitidas. DNS comprueba resolución, no toda la navegación TLS/HTTP de cada web.
- Desactivar una campaña impide nuevas asignaciones; no revoca ofertas ya concedidas ni descuentos de una suscripción. La caducidad guardada se comprueba antes de un nuevo checkout y los pedidos reservados conservan su oferta.

## Rollback preparado

1. Si falla la interfaz, deshabilitar `CRM_ROADMAP_V2` **en Catálogo staging** y redesplegar allí para volver a la interfaz previa. Mantener la integración de cobros y el flag de TuNegocio mientras existan checkouts TEST de campañas pendientes.
2. Para una regresión del backend, volver al último despliegue validado de cada servicio de staging; mantener el procesamiento de webhooks y las condiciones guardadas de pedidos/suscripciones ya aceptados. No cancelar ni cambiar descuentos Stripe en bloque.
3. Conservar las migraciones 003/025 y su información. No borrar ledgers, auditoría, gastos ni incidencias. Resolver cualquier ajuste posterior mediante una migración aditiva nueva.
4. Comprobar autenticación, health, bridge y recepción idempotente de webhooks después de cualquier rollback. Cualquier paso en producción requiere una autorización nueva para este bloque.

Entrega detenida en **REVISIÓN DE STAGING**. No se ejecuta merge ni producción hasta que el propietario autorice este bloque con **SUBE A PRODUCCIÓN**.
