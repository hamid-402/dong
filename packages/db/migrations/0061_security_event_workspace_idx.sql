-- W1: index workspace-scoped security event listings.

CREATE INDEX IF NOT EXISTS "ops_security_event_workspace_idx"
  ON "ops"."security_event" ("workspace_id");
