-- CLICK-FOOD: hardening de segurança após revisão do schema inicial.

-- A função apenas retorna false quando auth.uid() é null; liberar EXECUTE ao anon
-- evita falhas de permissão nas policies públicas que a consultam.
grant execute on function private.is_store_member(uuid) to anon, authenticated;

-- Usuários podem editar dados básicos do próprio perfil, mas nunca o status da conta.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, updated_at) on public.profiles to authenticated;

-- Usuários de uma loja podem visualizar os demais membros da mesma loja.
drop policy if exists memberships_self_or_admin on public.store_memberships;
create policy memberships_store_scope on public.store_memberships
for select to authenticated
using (
  (select auth.uid()) = user_id
  or private.is_store_member(store_id)
  or private.is_admin()
);
