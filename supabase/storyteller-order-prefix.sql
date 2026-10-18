-- New orders use The StoryTeller Frames branding. Existing order references are preserved.
alter table public.orders alter column order_number set default
  ('STF-'::text || upper(substr(replace(gen_random_uuid()::text, '-'::text, ''::text), 1, 10)));
