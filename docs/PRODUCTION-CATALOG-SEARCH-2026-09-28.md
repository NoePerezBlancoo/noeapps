# Catálogo: publicación de la búsqueda comercial

Autorización del propietario recibida el 28/09/2026: **SUBE A PRODUCCIÓN**.

## Versión publicada

- URL: https://catalogo.noeapps.com/#biblioteca
- PR: https://github.com/NoePerezBlancoo/noeapps/pull/4, integrada en main.
- Código verificado en staging: `c90921e8c2637604c50ddd7a303f5f694ae8d299`.
- Commit de integración publicado: `4dd95a1c9cb345275a22e9adfb0be1e69d746c54`.
- Railway: proyecto `7bce8c48-c5af-4682-add2-8402a959373e`, entorno `4abf1d82-e865-4aaf-a250-0280e0ac3c05`, servicio `3b94ba57-4e1e-4715-8aef-d53d696b0b87`.
- Despliegue `adf75ddf-07ed-4bcc-b468-2e5008d1cd00`: **SUCCESS**.

## Alcance y configuración

Publicados la búsqueda con plurales y equivalencias, filtros combinados, tres recomendaciones, ordenación y métricas por diseño. Cambios y archivos de aplicación detallados en `ROADMAP-V2-FASE-2.md` y `ROADMAP-V2-SEARCH-FIX.md`.

Se añadió únicamente `CATALOG_SEARCH_V2=true` a las variables del servicio productivo. Las credenciales y conexiones productivas existentes se conservaron. `CATALOG_SUBSCRIPTIONS_V2` continúa sin activar: los controles de cancelación de la fase 1 y el despliegue de TuNegocio no forman parte de esta publicación de búsqueda.

El ejecutor transaccional de la aplicación incorpora las migraciones aditivas `001_subscription_management.sql` y `002_catalog_discovery.sql`, previamente validadas en staging. Añaden columnas nullable, auditoría, registro de migraciones y registro de diseños; no se reescribió ninguna migración aplicada. El control de salud, que espera a ese ejecutor, pasó. El inventario de 571 diseños está disponible, con las fechas históricas desconocidas conservadas como tales.

Endpoints habilitados: `GET /api/catalog/discovery`, `GET /api/crm/design-stats` con sesión y los tres recursos `/assets/catalog-search*`. Las rutas existentes de catálogo, demo, solicitud y CRM mantienen sus URLs.

No se crearon solicitudes sintéticas, pagos ni campañas en producción, ni se ejecutaron cancelaciones o cambios en Stripe LIVE. No se modificaron DNS, dominios o servicios de TuNegocio.

## Verificaciones

- Antes de publicar: 12 tests y build de aplicación aprobados; CI de la rama aprobado.
- CI del commit de main: https://github.com/NoePerezBlancoo/noeapps/actions/runs/36464943920, **SUCCESS** en ambos trabajos.
- Salud del servicio Railway y del dominio público: HTTP 200.
- Logs de arranque: sin errores observados; bridge de TuNegocio disponible y configuración Stripe productiva conservada.
- Navegador en el dominio público: COCHES, vehículos y automóviles devuelven 8 diseños cada uno. Recomendaciones: 3. Categoría incompatible y consulta inexistente: 0.
- Bufetes sobrios: 2 resultados; cafeterías modernas: 11. Sin etiqueta de staging en producción.
- Escritorio y móvil de 390 px: sin desbordamiento horizontal. Captura de escritorio revisada.
- Enlaces de la primera tarjeta: demo y formulario de solicitud responden HTTP 200. No se envió el formulario ni se generó un checkout LIVE.
- Métricas públicas: habilitadas y disponibles, modo live, campos limitados a solicitudes, ventas y conversión.
- Métricas privadas: HTTP 401 sin sesión. Login administrativo HTTP 200 y consulta autenticada correcta con 571 diseños. Sesión de comprobación cerrada.
- Evidencias: `evidence/production-search-browser.json` y `evidence/production-search-coches.png`.

## Riesgos y recuperación

La búsqueda depende del vocabulario y los metadatos del catálogo; no interpreta cualquier expresión o errata. El proveedor de demos sigue siendo una dependencia externa. Las métricas reflejan el ledger disponible, no reconstruyen cobros anteriores. Las pestañas ya abiertas deben recargarse.

Versión anterior recuperable: despliegue `79d8a05d-5f26-4b73-9d03-73fb174e341c`, commit `99ae78d1f5611c476c9011f4b58c0f63acd86b19`. Para retirar la búsqueda nueva, desactivar `CATALOG_SEARCH_V2` y redesplegar este servicio; si es necesario recuperar toda la versión anterior, restaurar aquel despliegue. Conservar tablas, columnas y checksums adicionales: no se requiere borrar datos ni ejecutar una migración destructiva.

Publicación completada. La siguiente fase del roadmap continúa pendiente para una nueva iteración en rama y staging.
