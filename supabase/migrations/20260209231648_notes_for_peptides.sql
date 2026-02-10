-- Add a free-form notes field for peptide-level scientific context.
-- This is used for Codex-populated summaries and manual curation.
alter table if exists public.peptides
add column if not exists notes text;

comment on column public.peptides.notes is
'Free-form scientific notes for a peptide (sequence context, rationale, references, caveats).';
