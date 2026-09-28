ALTER TABLE catalog_revenue_events ADD COLUMN discount_cents integer CHECK (discount_cents >= 0);
ALTER TABLE catalog_revenue_events ADD COLUMN campaign_id uuid;
ALTER TABLE crm_expenses ADD COLUMN ended_on date;
ALTER TABLE crm_expenses ADD COLUMN provider text;
ALTER TABLE crm_expenses ADD COLUMN external_id text;
CREATE UNIQUE INDEX crm_expenses_provider_external_idx ON crm_expenses(provider,external_id) WHERE external_id IS NOT NULL;
CREATE TABLE crm_action_audit (
  id bigserial PRIMARY KEY,
  actor text NOT NULL DEFAULT 'admin',
  action text NOT NULL,
  source text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_campaign_assignments (
  campaign_id uuid NOT NULL REFERENCES crm_offers(id),
  source text NOT NULL CHECK (source IN ('catalog','tunegocio')),
  entity_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id,source,entity_id)
);
CREATE TABLE crm_incidents (
  key text PRIMARY KEY,
  source text NOT NULL,
  entity_id text NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  business_name text NOT NULL DEFAULT '',
  recommendation text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','resolved')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  acknowledged_at timestamptz,
  note text NOT NULL DEFAULT ''
);
CREATE INDEX crm_incidents_state_idx ON crm_incidents(state,last_seen_at DESC);
CREATE TABLE crm_whatsapp_templates (
  kind text PRIMARY KEY CHECK (kind IN ('preview','payment','reminder','published','followup','cancellation')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1600),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm_monitor_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'running',
  checked_count integer NOT NULL DEFAULT 0,
  open_count integer,
  detail text NOT NULL DEFAULT ''
);
