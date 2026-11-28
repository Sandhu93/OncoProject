-- Step data for the stage-change commands (docs/product/rt-workflow-proposal.md, prototype forms).
-- No patient information: dates, times, short notes, machine names and plan / contour / scan pointers only.

-- What each step recorded, kept with the history row it belongs to. History is append-only, so this
-- is the permanent record of what was entered, by whom and when.
ALTER TABLE chart_stage_history
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  ADD COLUMN summary text CHECK (summary IS NULL OR length(summary) <= 1000);

-- The chart's current facts (mould date, contouring approved on, LINAC slot ...), merged from its steps by
-- the same transaction that writes the history row. A "send back" removes the facts it invalidates.
ALTER TABLE rt_charts
  ADD COLUMN data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object');
