-- In-app notifications: what to tell the person, and a key so a reminder is only ever created once.
-- No patient information: the message names an RT number, a stage and a person's staff name only.
ALTER TABLE notifications
  ADD COLUMN message text NOT NULL DEFAULT '' CHECK (length(message) <= 1000),
  ADD COLUMN dedupe_key text CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 200);

-- A reminder (stalled chart, Saturday updates due) is created at most once per person for the same key.
CREATE UNIQUE INDEX notifications_dedupe ON notifications(recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- The inbox lists everything newest first, read or not.
CREATE INDEX notifications_inbox ON notifications(recipient_id, created_at DESC);
