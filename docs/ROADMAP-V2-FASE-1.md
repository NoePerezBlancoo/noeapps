# Roadmap v2 — revisión de fase 1: cancelaciones

Fecha: 28 de septiembre de 2026. Alcance: Catálogo y TuNegocio, exclusivamente staging.

La fase implementa la cancelación al final del periodo desde el CRM central, reactivación cuando Stripe la permite, acceso al portal Stripe y consulta del estado canónico. El servicio conserva el periodo ya pagado. El roadmap completo no está terminado: búsqueda, importación y fases posteriores quedan pendientes.

## Protección de producción

- TuNegocio: rama `agent/roadmap-v2-safe`, base `9890e9d`; código funcional `37a72b5`.
- Catálogo: rama `agent/catalog-roadmap-v2-safe`, base `99ae78d`; código funcional `ba63eea`, protección de caché `a821008`.
- No hay merge a main, despliegue a producción, cambio de variables productivas, migración productiva, operación Stripe LIVE, modificación DNS ni transformación de datos reales.
- Los checkouts originales y sus cambios locales se han conservado. Los artefactos `dist` generados durante la comprobación del build se excluyeron del cambio.
- Cualquier paso hacia producción requiere la instrucción literal del propietario **SUBE A PRODUCCIÓN**. Este informe no autoriza ese paso.

## Cambios de comportamiento

El CRM muestra estado Stripe, cuota base y periodicidad, vigencia pagada, próxima renovación y cancelación programada. Expone actualizar, portal, cancelar al final del periodo y reactivar según el estado permitido. La cuota base no se presenta como cálculo del próximo cargo con impuestos o descuentos.

Las operaciones exigen sesión administrativa y mismo origen en Catálogo; el bridge de TuNegocio exige secreto de servidor. Se validan identidad de pedido/solicitud, cliente y entorno Stripe. Bloqueos por suscripción serializan operaciones; se registran intentos y resultados sin secretos. Los portales dedicados permiten cancelar al final del periodo y no modificar el plan.

Los webhooks consultan Stripe y mantienen la fecha respaldada por pagos. Una cancelación o impago no borra un periodo ya pagado. TuNegocio vuelve a comprobar esa fecha bajo el bloqueo usado por el proceso de pago para impedir que una renovación concurrente pierda acceso. Los reembolsos/disputas conservan su tratamiento explícito existente.

Catálogo obtiene el periodo de una factura recurrente pagada y vinculada, conserva la mayor fecha pagada y comprueba el vencimiento al atender peticiones. La web vencida queda suspendida y devuelve 402. La respuesta de las webs sujetas a este control impide caché para que no eluda el vencimiento. No se ha instalado un proceso que borre webs ni datos.

Se corrigió un error SQL previo de Catálogo en `invoice.paid`: el parámetro de suscripción podía carecer de tipo al localizar la solicitud por ID. También se corrigieron tests antiguos de TuNegocio que trataban una comprobación asíncrona como síncrona y accedían a almacenamiento real desde pruebas unitarias.

## Archivos de TuNegocio

- `AGENTS.md`, `.gitattributes`: restricciones operativas y finales de línea estables para el checksum nuevo.
- `db/migrations/024_subscription_management.sql`: tablas aditivas de estado y auditoría.
- `lib/subscription-state.ts`, `lib/subscription-management.server.ts`: estado, vínculo Stripe, acciones, portal y auditoría.
- `app/api/internal/crm-subscription/route.ts`: nuevo endpoint administrativo interno.
- `app/api/internal/crm-summary/route.ts`: estado adicional y selección TEST/LIVE del pedido según configuración.
- `lib/publication-webhook.server.ts`, `lib/publication-store.server.ts`: conservación del periodo pagado y bloqueo ante renovación concurrente.
- `tests/subscription-management.test.ts`, `tests/publication-webhook.test.ts`, `tests/publication-store.test.ts`: pruebas de estados, autenticación, vinculación y acceso.
- `scripts/prepare-staging-cancellation.ts`: fixture sintético con guardas del staging concreto.
- `docs/ROADMAP-V2-FASE-1.md`: este informe.

## Archivos de Catálogo

- `AGENTS.md`, `.gitattributes`: aislamiento y estabilidad del checksum.
- `.github/workflows/validate.yml`: validación de ramas `agent/**` y aplicación Catálogo; sin despliegues.
- `catalogo/subscriptions.js`, `catalogo/migrations/001_subscription_management.sql`: integración Stripe, migración con checksum, periodo pagado y auditoría.
- `catalogo/server.js`: endpoints, webhooks, portal seguro y suspensión por vencimiento.
- `catalogo/crm.html`: panel de suscripción para ambos productos.
- `catalogo/package.json`, `catalogo/package-lock.json`, `catalogo/scripts/check-build.js`: instalación reproducible y comprobaciones de servidor/scripts del navegador.
- `catalogo/tests/subscriptions.test.js`, `catalogo/tests/staging-subscriptions.mjs`, `catalogo/tests/staging-tunegocio.mjs`: pruebas unitarias e integración real TEST, opt-in.
- `docs/ROADMAP-V2-FASE-1.md`, `docs/evidence/phase1-*`: informe y evidencias sanitizadas.

## Migraciones y endpoints

TuNegocio añade `publication_subscription_states` y `publication_subscription_audit`. Catálogo añade tres columnas nullable en `catalog_requests` (`subscription_state`, `subscription_paid_until`, `subscription_synced_at`), `catalog_subscription_audit` y el registro `catalog_migrations` con checksum.

Las migraciones nuevas se aplicaron exclusivamente a las bases separadas de staging. No se editaron migraciones ya aplicadas. TuNegocio ya contiene `024_normalize_offer_terms.sql`: su ejecutor ordena y registra por nombre completo, por lo que ambas migraciones 024 son diferentes. La nueva conserva su nombre después de haberse aplicado; la siguiente deberá usar 025 o superior. `.gitattributes` evita diferencias de checksum por CRLF/LF.

Endpoints nuevos, todos POST:

- TuNegocio: `/api/internal/crm-subscription`, con `orderId` y `action`.
- Catálogo: `/api/crm/requests/:id/subscription`.
- CRM hacia TuNegocio: `/api/crm/tunegocio/:projectId/subscription`.

Acciones: `refresh`, `cancel`, `reactivate`, `portal`. El endpoint de portal previo y las rutas públicas conservan sus URLs. El resumen del bridge incorpora campos adicionales, manteniendo los anteriores.

## Staging e infraestructura

TuNegocio conserva el servicio `tunegocio-staging-v2` (`4c284048-05fd-4e4e-87a5-4dbe0a386b2c`) en el proyecto existente. Aunque Railway llama `production` a ese entorno compartido de servicios, todas las acciones se dirigieron al ID de staging.

Se detectó que su conexión anterior compartía la base de producción mediante otro schema. Se creó el proyecto **TuNegocio Staging Data v2** (`45cac728-45bf-49e9-9d3d-a24ab7452a37`) y Postgres separado, sin copiar registros reales. Se sustituyó únicamente la conexión del servicio staging. El schema anterior y la conexión de producción no se tocaron.

Catálogo dispone ahora de **NoeApps Catalog Staging v2**, proyecto `e536099e-7546-4108-b827-18a4d49f748d`, aplicación `2b7b78ca-0cb9-43ae-b6cc-4ee77b1015a1`, Postgres independiente y sandbox Stripe TEST propio, separado de TuNegocio. Se crearon productos, precio y endpoint webhook exclusivamente TEST. Su bridge apunta únicamente al staging de TuNegocio.

- TuNegocio: https://tunegocio-staging-v2-production.up.railway.app
- CRM: https://catalogo-staging-v2-production.up.railway.app/crm

El acceso al CRM de pruebas usa su contraseña propia, disponible en la variable `CATALOG_CRM_PASSWORD` del servicio staging; no se ha reutilizado la contraseña productiva.

Se desplegó mediante subida explícita a esos servicios. La asociación Git preexistente del servicio staging de TuNegocio no se modificó: futuros despliegues de su rama anterior pueden sustituir esta versión de revisión. Las ramas de trabajo no son ramas de producción.

## Variables nuevas o configuradas

TuNegocio: `PUBLICATION_SUBSCRIPTION_CONTROLS_ENABLED=true`; nueva `DATABASE_URL` aislada; nuevo `STRIPE_TEST_WEBHOOK_SECRET`; `NOEAPPS_CRM_BRIDGE_SECRET` independiente. Se mantiene `PUBLICATION_MODE=test`, `PUBLICATION_LIVE_ENABLED=false` y schema de staging. No se incluyen valores secretos en el repositorio ni en este informe.

Catálogo, servicio nuevo: `CATALOG_ENVIRONMENT=staging`, `CATALOG_SUBSCRIPTIONS_V2=true`, `DATABASE_URL` referenciada a su Postgres, `PUBLIC_ORIGIN`, `SITE_DOMAIN`, `PORT=3000`, `CATALOG_SESSION_SECRET`, `CATALOG_CRM_PASSWORD`, `NOEAPPS_CRM_BRIDGE_SECRET`, `TUNEGOCIO_CRM_ORIGIN`, `STRIPE_SECRET_KEY` TEST, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CREATION_PRODUCT_ID`, `STRIPE_MAINTENANCE_PRODUCT_ID`, `STRIPE_DEFAULT_MONTHLY_PRICE_ID`, `STRIPE_AUTOMATIC_TAX=false`. No se configuraron fuentes de importación de base legacy/producción.

## Validación

- TuNegocio: `npm test`: 389 PASS, 0 fallos, 1 prueba de integración omitida por requerir opt-in. Esa integración se ejecutó aparte contra Postgres aislado: 28 PASS; predeploy completo `db:check`: 34 PASS, 0 omitidos. `npm run typecheck` y `npm run build`: PASS.
- Catálogo: build de la raíz PASS; build de aplicación y scripts embebidos PASS; `npm run typecheck` PASS (comprobación sintáctica JavaScript, no un análisis TypeScript); 5 tests unitarios PASS.
- Migraciones: aplicadas y comprobadas por checksum en staging. Diff revisado y `git diff --check` PASS.
- TuNegocio: checkout real de Stripe TEST completado desde navegador, webhook real recibido y pedido pagado. Desde CRM: refresh, cancelación programada, reactivación y portal; auditoría persistida y `paid_until` idéntico antes/después. TEST no generó snapshot público.
- Catálogo: factura Stripe TEST, webhook firmado y replay duplicado, una sola entrada de ingreso, rechazo de mezcla LIVE/TEST, rechazo de sesión ausente/origen incorrecto, cancelación programada, reactivación, portal, conservación tras cancelar la suscripción sintética inmediatamente, rechazo de reactivación terminal y suspensión 402 al vencer el entitlement sintético.
- Se inspeccionó el CRM en navegador con datos sintéticos: CANCELACIÓN PROGRAMADA, 19,90 €/mes, pagado hasta 28/10/2026 y sin próxima renovación.
- TuNegocio: despliegue `f421adde-3382-41df-90ae-acbb0ea712a3` SUCCESS, health 200, arranque correcto y 34 checks de predeploy aprobados. Hubo un fallo de test corregido y un 504 del proveedor de build resuelto con reintento; no se consideran esos despliegues fallidos como validación.
- Catálogo: despliegue `93c50575-0a2b-4306-aed0-48e906a99dae` SUCCESS, healthcheck 200 y logs de arranque correctos, Stripe `sandbox_test` y bridge listo. Integración final PASS a las 17:37:02 UTC: 13 comprobaciones, incluida respuesta pagada 200 con `no-store` y posterior vencimiento 402. La fixture queda reconciliada con su factura TEST.
- Evidencias sanitizadas en el repositorio Catálogo: `docs/evidence/phase1-catalog.json`, `docs/evidence/phase1-tunegocio.json` y `docs/evidence/phase1-crm.png`. No contienen claves, contraseñas ni datos reales de clientes.

## Riesgos y límites

Los registros antiguos de Catálogo sin snapshot nuevo conservan el comportamiento previo hasta reconciliarse con Stripe; la activación futura necesitará revisar esa transición con datos autorizados. Los escenarios con varias partidas, facturas paginadas o suscripciones con schedule se tratan de forma conservadora; no se habilita una modificación del plan.

La suspensión se comprueba cuando se consulta o sirve la web; no se elimina físicamente el contenido al llegar la fecha. Una renovación depende de la recepción/reintento del webhook correspondiente. No se adelantó un mes real de reloj de Stripe: el vencimiento se ejercitó con el entitlement de una única fixture sintética y después se reconcilió con su factura TEST.

Las claves temporales del sandbox Stripe de Catálogo caducan el 27/12/2026 según la CLI; deberá mantenerse/renovarse el acceso del sandbox antes de esa fecha. Su configuración y datos de reclamación permanecen en un archivo local ignorado. El nuevo Postgres genera coste de staging. No se ha probado ni activado producción.

## Recuperación / rollback

1. Trabajar únicamente sobre los IDs de staging indicados. Conservar las bases nuevas; **nunca restaurar la conexión compartida con producción** para volver atrás.
2. Para un fallo de presentación o de la nueva acción, revertir el cambio afectado en la rama y desplegar una versión que mantenga la conservación del periodo pagado. Los commits funcionales y los despliegues verificados de este informe permiten recuperar la versión revisada.
3. Mantener tablas, columnas nullable, migraciones y auditoría: no ejecutar DROP, borrar historial ni modificar checksums. Las versiones anteriores pueden coexistir con las columnas/tablas nuevas.
4. No desactivar globalmente la lógica de Catálogo ni restaurar su semántica antigua de cancelación si existen cancelaciones con tiempo pagado pendiente: podría anticipar la suspensión. Revisar esas suscripciones y mantener el control por fecha pagada durante cualquier recuperación. En TuNegocio el flag deshabilita los controles nuevos sin retirar la corrección que conserva el periodo pagado.
5. Si una acción Stripe quedó confirmada pero la persistencia falló, actualizar desde Stripe y revisar el registro de intento antes de repetirla. No emitir reembolsos ni cambios LIVE como parte del rollback de código.

Punto de parada: revisión de staging. Sin merge ni producción.
