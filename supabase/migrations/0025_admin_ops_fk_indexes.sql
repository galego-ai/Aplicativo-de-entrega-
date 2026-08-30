create index if not exists idx_billing_policy_updated_by on public.billing_policy(updated_by) where updated_by is not null;
create index if not exists idx_notification_broadcasts_created_by on public.notification_broadcasts(created_by);
create index if not exists idx_notification_broadcasts_store_id on public.notification_broadcasts(store_id) where store_id is not null;
create index if not exists idx_notification_broadcasts_user_id on public.notification_broadcasts(user_id) where user_id is not null;
create index if not exists idx_store_billing_locks_invoice_id on public.store_billing_locks(invoice_id);
