BEGIN;

ALTER TABLE catalog_requests
  ADD COLUMN IF NOT EXISTS chatgpt_state text NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS chatgpt_review_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chatgpt_latest_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chatgpt_validated_version integer,
  ADD COLUMN IF NOT EXISTS chatgpt_published_version integer,
  ADD COLUMN IF NOT EXISTS chatgpt_manifest_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chatgpt_prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS chatgpt_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS chatgpt_last_error text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS catalog_requests_chatgpt_state_idx
  ON catalog_requests(chatgpt_state, COALESCE(chatgpt_prepared_at, updated_at));

COMMIT;
