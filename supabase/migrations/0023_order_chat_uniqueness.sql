create unique index if not exists idx_conversations_order_type_unique on public.conversations(order_id, conversation_type) where order_id is not null;
