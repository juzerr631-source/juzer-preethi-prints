drop policy if exists "Public and artists read artworks" on public.artworks;
drop policy if exists "Public read published artworks" on public.artworks;
drop policy if exists "Artists read artworks" on public.artworks;

create policy "Public read published artworks"
on public.artworks
for select
to anon
using (is_published);

create policy "Artists read artworks"
on public.artworks
for select
to authenticated
using (
  is_published
  or exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  )
);
