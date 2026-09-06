-- CLICK-FOOD: avaliações detalhadas e índices para leitura global da Matriz.
alter table public.reviews add column if not exists delivery_rating smallint check (delivery_rating is null or delivery_rating between 1 and 5);
alter table public.reviews add column if not exists delivery_time_rating smallint check (delivery_time_rating is null or delivery_time_rating between 1 and 5);
alter table public.reviews add column if not exists taste_rating smallint check (taste_rating is null or taste_rating between 1 and 5);
alter table public.reviews add column if not exists temperature_rating smallint check (temperature_rating is null or temperature_rating between 1 and 5);

update public.reviews
set delivery_rating = driver_rating
where delivery_rating is null and driver_rating is not null;

create index if not exists idx_reviews_created_at on public.reviews(created_at desc);
create index if not exists idx_reviews_store_created_at on public.reviews(store_id, created_at desc);
create index if not exists idx_reviews_driver_created_at on public.reviews(driver_id, created_at desc) where driver_id is not null;
