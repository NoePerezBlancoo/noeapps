CREATE TABLE catalog_design_registry (
  design_id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  added_at timestamptz
);
COMMENT ON COLUMN catalog_design_registry.added_at IS
  'First observation after the initial catalog inventory. NULL for baseline designs whose addition date is unknown.';
REVOKE ALL ON catalog_design_registry FROM PUBLIC;
