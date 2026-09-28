# Roadmap v2: mandatory production protection

Work only on `agent/catalog-roadmap-v2-safe` in this isolated checkout. The original NoeApps checkout and production are in use.

- No commits/pushes to production branches, merge to main, production deploys/variables/migrations, Stripe LIVE operations, existing customer-data transformations, or operative DNS/domain changes.
- Only the owner's literal `SUBE A PRODUCCIÓN` authorizes production. End each improvement at staging review with an explicit changes/files/migrations/endpoints/variables/tests/risks/rollback report.
- Catálogo staging is a separate Railway project `e536099e-7546-4108-b827-18a4d49f748d` (NoeApps Catalog Staging v2), environment `c3ade4fb-e8b3-4560-bcc8-46759c1f3c19`, app `2b7b78ca-0cb9-43ae-b6cc-4ee77b1015a1`, PostgreSQL `69814f1b-5677-43c2-b29d-85d5d34247f0`. The default environment's name `production` does not refer to the real production project. Use the exact IDs.
- Staging URL: `https://catalogo-staging-v2-production.up.railway.app`. Only synthetic data and the separate Catálogo Stripe TEST sandbox are allowed here.
- Never copy production database URLs, Stripe credentials, bridge secret, or customer records into staging. Do not set LEGACY_DATABASE_URL/NEON_DATABASE_URL in staging.
- Do not edit applied migrations. Keep the existing schema initialization compatible; add checksummed migrations for new functionality.
- TuNegocio remains a separate product. Use only its staging bridge origin `https://tunegocio-staging-v2-production.up.railway.app` for staging CRM.
- Never print credentials or add `.env*` artifacts to commits.
- No delegation or new chats is authorized by this file.
