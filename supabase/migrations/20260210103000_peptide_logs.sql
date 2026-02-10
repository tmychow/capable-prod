-- Add a free-form logs field for peptide backfill diagnostics.
-- Sequence and notes backfills overwrite this as new runs happen.
alter table if exists public.peptides
add column if not exists logs text;

comment on column public.peptides.logs is
'Latest backfill diagnostics for a peptide (status, explanation/error, and raw model output).';
