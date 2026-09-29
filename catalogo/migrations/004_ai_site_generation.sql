BEGIN;

ALTER TABLE catalog_requests
  ADD COLUMN IF NOT EXISTS generation_state text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS generation_brief text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS generation_research_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_last_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latest_generation_id bigint,
  ADD COLUMN IF NOT EXISTS validated_generation_id bigint,
  ADD COLUMN IF NOT EXISTS published_generation_id bigint;

CREATE TABLE IF NOT EXISTS catalog_site_generations(
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES catalog_requests(id) ON DELETE CASCADE,
  version integer NOT NULL,
  state text NOT NULL DEFAULT 'draft',
  feedback text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  input_tokens bigint NOT NULL DEFAULT 0,
  cached_input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  search_calls integer NOT NULL DEFAULT 0,
  response_id text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  UNIQUE(request_id,version)
);

CREATE INDEX IF NOT EXISTS catalog_site_generations_request_created_idx
  ON catalog_site_generations(request_id,created_at DESC);

COMMIT;
