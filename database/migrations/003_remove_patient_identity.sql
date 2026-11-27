-- Scope decision, 28 November 2026: OncoTrack is an internal work-status tracker. It holds no patient
-- names or other patient information. A chart is identified only by its RT number (display_number).
-- Dropping the column also drops its foreign key and index. Superseded: ADR-002 (separate patient
-- identity and RT charts). A repeat course receives a new RT number, so earlier charts are never overwritten.
ALTER TABLE rt_charts DROP COLUMN patient_id;
DROP TABLE patients;
