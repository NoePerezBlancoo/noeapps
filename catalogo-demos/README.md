# NoeApps Catalog previews

Host estático ligero para las versiones que ChatGPT crea desde las solicitudes de Catálogo.

Cada solicitud vive en:
```
requests/<request-id>/<review-token>/
  manifest.json
  v1/index.html
  v2/index.html
```

El CRM decide qué versión está validada y cuál se publica. Este directorio queda fuera de `catalogo/**`, así que crear una nueva demo no redepliega el CRM principal.
