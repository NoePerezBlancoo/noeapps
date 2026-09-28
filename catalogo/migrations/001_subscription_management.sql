ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS subscription_state jsonb;
ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS subscription_paid_until timestamptz;
ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS subscription_synced_at timestamptz;
CREATE TABLE catalog_subscription_audit (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES catalog_requests(id),
  operation_id uuid NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('requested','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_subscription_audit_request_idx ON catalog_subscription_audit(request_id,created_at);
REVOKE ALL ON catalog_subscription_audit FROM PUBLIC;
