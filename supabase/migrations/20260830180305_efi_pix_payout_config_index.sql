create index if not exists payout_provider_configs_updated_by_idx
  on public.payout_provider_configs(updated_by)
  where updated_by is not null;
