alter table public.stores
  add column if not exists slogan text,
  add column if not exists primary_color text not null default '#F4C400',
  add column if not exists secondary_color text not null default '#111111',
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists address_line text,
  add column if not exists neighborhood text,
  add column if not exists postal_code text,
  add column if not exists address_complement text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='stores_primary_color_hex') then
    alter table public.stores add constraint stores_primary_color_hex check (primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='stores_secondary_color_hex') then
    alter table public.stores add constraint stores_secondary_color_hex check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
