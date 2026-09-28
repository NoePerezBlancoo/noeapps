# Publicación del CRM: campañas, analítica, gastos, incidencias y WhatsApp

Autorización del propietario: **SUBE A PRODUCCIÓN Y PRUEBA**, recibida después de la revisión de staging de los cinco bloques. Fecha: 28 de septiembre de 2026.

## Versiones y alcance

| Producto | Integración | Commit | Despliegue Railway |
| --- | --- | --- | --- |
| TuNegocio | [PR 45](https://github.com/NoePerezBlancoo/TuNegocio/pull/45), base `agent/mvp-preview-publish` | `9522d800617d95988d8cd0b4bc4272a2314aeb00` | `5d220eaa-f2de-4afb-b7b8-467c34bb8413` |
| Catálogo | [PR 5](https://github.com/NoePerezBlancoo/noeapps/pull/5) y [PR 6](https://github.com/NoePerezBlancoo/noeapps/pull/6), base `main` | `ef520ab92b425a8dd2a3bfb4e6c77451b5823180` | `39a4392c-13b4-4b2d-b151-a42f4371d68d` |

URLs: [CRM](https://catalogo.noeapps.com/crm), [Catálogo](https://catalogo.noeapps.com/#biblioteca) y [creador TuNegocio](https://tunegocio-beta-production.up.railway.app/crear).

El código funcional de Catálogo entró mediante PR 5 (`a69fec436d6993dcf32f74983e20bbb096727a64`, despliegue `fcd947ce-6c16-4f2f-bde8-0e5c5d221e8b`). PR 6 corrige únicamente el script de comprobación: las listas de ofertas y gastos se leen del bundle existente del CRM. No cambia comportamiento de la aplicación.

Los cambios funcionales, archivos, endpoints y límites están detallados en `ROADMAP-V2-OFERTAS-OPERACIONES.md`. Esta publicación activa esos cinco bloques. La importación ampliada y los botones nuevos de gestión de suscripciones de fases anteriores siguen deshabilitados. El código de soporte permanece compatible y se conserva el acceso durante el periodo pagado.

Se añadieron dos ajustes antes de publicar, con pruebas en staging:

- Lectura de snapshots de suscripciones para analítica/incidencias sin habilitar cancelaciones, reactivaciones ni creación de portal. La prueba confirmó que la suscripción Stripe TEST no cambió.
- Compatibilidad de las solicitudes antiguas de oferta sin `campaignId`, con los mismos bloqueos de pedidos. Las nuevas asignaciones del CRM sí incluyen identificador de campaña.

## Configuración y migraciones

- Única variable funcional añadida: `CRM_ROADMAP_V2=true` en los dos servicios productivos. Se conservaron claves, conexiones de base de datos, dominios, URLs públicas y precios existentes.
- TuNegocio: servicio `e9dd3ef4-f404-44c7-b5d2-f723e8a0490e`, proyecto `887d03a6-70bd-42ce-afdf-590aa52c07d0`, entorno `95a50f16-f21a-40ea-be33-210fa1ee7e99`.
- Catálogo: servicio `3b94ba57-4e1e-4715-8aef-d53d696b0b87`, proyecto `7bce8c48-c5af-4682-add2-8402a959373e`, entorno `4abf1d82-e865-4aaf-a250-0280e0ac3c05`.
- TuNegocio incorporó `024_subscription_management.sql` y `025_crm_roadmap.sql`; Catálogo incorpora `003_crm_operations.sql`. Son aditivas y se probaron previamente en staging. No se modificó ninguna migración aplicada ni se borraron o reescribieron registros de clientes.
- Antes del despliegue se verificaron los checksums previos de Catálogo mediante transacción de solo lectura. TuNegocio comprobó los checksums mediante su ejecutor transaccional antes de arrancar.
- El predespliegue productivo de TuNegocio queda en `npm run db:migrate && npx tsx scripts/check-publication-stripe.ts --mode=live`. Se retiró `npm run db:check` de producción porque crea un esquema y datos sintéticos: esas comprobaciones se mantienen en staging.
- La base de TuNegocio sigue siendo privada; no se abrió ningún puerto para inspeccionarla ni se crearon claves SSH.

## Validación

Validación de código y staging:

- TuNegocio: 399 pruebas aprobadas, cero fallidas y una integración opt-in omitida en la suite general; comprobaciones PostgreSQL aisladas en staging, typecheck/build y CI correctos. Siete pruebas focalizadas de ofertas y separación entre lectura de suscripciones y acciones de modificación también aprobadas.
- Catálogo: 15/15 pruebas, build/typecheck y CI correctos.
- Staging adicional `feb06de3-f8c4-474f-a7d6-bf56ed3cc1c1`: SUCCESS. Lectura pasiva con botones de modificación deshabilitados, cancelación rechazada y payload anterior de oferta aceptado hasta validar que el proyecto sintético no existe.
- Se conservan las evidencias del checkout TEST y de los cinco ciclos: 995, 995, 995, 995 y 1990 céntimos.

CI de los commits integrados:

- [TuNegocio](https://github.com/NoePerezBlancoo/TuNegocio/actions/runs/36477536634): success.
- [Catálogo](https://github.com/NoePerezBlancoo/noeapps/actions/runs/36477790159): success.
- [Catálogo, corrección del script de comprobación](https://github.com/NoePerezBlancoo/noeapps/actions/runs/36478392379): success.

Comprobaciones productivas y resultado final: ver `evidence/operations-production-smoke.json` y `evidence/operations-production-release.json`.

En navegador: las cinco secciones cargan, la analítica muestra 22 tarjetas sin error de carga, las seis plantillas están disponibles y el monitor ha terminado con cero incidencias abiertas. A 390 px no hay desbordamiento horizontal. La búsqueda pública COCHES conserva ocho coincidencias y las recomendaciones muestran tres demos de esas ocho. El creador de TuNegocio conserva su flujo de siete pasos; no se inició generación, checkout ni publicación de prueba.

Las comprobaciones productivas son de salud, autenticación, lectura de informes, monitor, ofertas/gastos existentes, plantillas e interfaz. No crean cobros, campañas, solicitudes sintéticas, gastos ni mensajes en LIVE. No se ha efectuado un pago LIVE de prueba; los flujos de pago y mutaciones se ejercitaron en staging.

## Riesgos y rollback

Los importes siguen representando cobros brutos del ledger disponible. IA y rentabilidad son estimaciones; no hay conciliación completa de devoluciones, cohorte histórica de churn ni atribución de IA por web. Los snapshots reflejan los eventos observados y no reconstruyen retrospectivamente toda la historia de Stripe. WhatsApp necesita envío manual y los datos/enlaces ausentes deben completarse.

Versiones recuperables previas a esta publicación:

- TuNegocio: despliegue `d3cf34bc-4d03-4962-a0af-5812a0f65e7d`, commit `9890e9d380a40c249fec3f0cbfcf956a0a4d71df`.
- Catálogo: despliegue `adf75ddf-07ed-4bcc-b468-2e5008d1cd00`, commit `4dd95a1c9cb345275a22e9adfb0be1e69d746c54`.

Para retirar primero la interfaz nueva, deshabilitar `CRM_ROADMAP_V2` en Catálogo y redesplegar ese servicio. Para una regresión de backend, restaurar la versión previa del servicio afectado, manteniendo los webhooks y las condiciones de pedidos/suscripciones ya aceptados. Conservar las tablas y columnas nuevas; no hacer rollback SQL destructivo ni cancelar descuentos Stripe en bloque. Verificar salud y bridge tras cualquier recuperación.

Los checkouts locales originales del propietario se han preservado. Los commits se realizaron en ramas de trabajo y se promovieron mediante los PR autorizados.
