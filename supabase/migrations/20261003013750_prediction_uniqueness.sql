create unique index if not exists prediction_suggestions_unique_active
on public.prediction_suggestions(prefix,word)
where status in ('pending','approved');