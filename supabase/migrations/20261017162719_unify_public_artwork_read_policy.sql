drop policy if exists "Artists read all artworks" on public.artworks;
drop policy if exists "Public reads published artworks" on public.artworks;
create policy "Public and artists read artworks"
on public.artworks for select to anon, authenticated
using (
  is_published or exists (
    select 1 from public.admin_users where admin_users.user_id = auth.uid()
  )
);
