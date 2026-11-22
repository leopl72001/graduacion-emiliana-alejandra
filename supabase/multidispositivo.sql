-- Extensión para usar el mismo panel desde computadores y celulares.
-- Ejecútalo DESPUÉS de supabase/schema.sql. No reemplaza las invitaciones anteriores.
-- En esta instalación ya se ejecutó en Supabase.
-- Las contraseñas no se comparten: cada nuevo dispositivo tiene su propio usuario anónimo,
-- y obtiene permiso por un enlace de un solo uso (10 minutos).

create table if not exists public.sisters_event_editors(
  event_id uuid not null references public.sisters_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
create index if not exists sisters_event_editors_user_idx on public.sisters_event_editors(user_id);
alter table public.sisters_event_editors enable row level security;
revoke all on public.sisters_event_editors from anon,authenticated,public;

create table if not exists public.sisters_pairing_links(
  token_hash text primary key,
  event_id uuid not null references public.sisters_events(id) on delete cascade,
  issued_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sisters_pairing_links_event_idx on public.sisters_pairing_links(event_id);
alter table public.sisters_pairing_links enable row level security;
revoke all on public.sisters_pairing_links from anon,authenticated,public;

create or replace function public.sisters_has_access(p_event_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.sisters_events e where e.id=p_event_id and e.owner_id=(select auth.uid()))
    or exists(select 1 from public.sisters_event_editors x where x.event_id=p_event_id and x.user_id=(select auth.uid()))
  );
$$;
revoke all on function public.sisters_has_access(uuid) from public,anon;
grant execute on function public.sisters_has_access(uuid) to authenticated;

drop policy if exists sisters_event_owner on public.sisters_events;
drop policy if exists sisters_event_admin on public.sisters_events;
create policy sisters_event_admin on public.sisters_events for all to authenticated
using(public.sisters_has_access(id)) with check(public.sisters_has_access(id));
drop policy if exists sisters_groups_owner on public.sisters_groups;
drop policy if exists sisters_groups_admin on public.sisters_groups;
create policy sisters_groups_admin on public.sisters_groups for all to authenticated
using(public.sisters_has_access(event_id)) with check(public.sisters_has_access(event_id));
drop policy if exists sisters_guests_owner on public.sisters_guests;
drop policy if exists sisters_guests_admin on public.sisters_guests;
create policy sisters_guests_admin on public.sisters_guests for all to authenticated
using(public.sisters_has_access(event_id)) with check(public.sisters_has_access(event_id));

create or replace function public.sisters_lock_event_owner() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'El propietario del evento no se puede modificar';
  end if;
  return new;
end; $$;
drop trigger if exists sisters_event_owner_lock on public.sisters_events;
create trigger sisters_event_owner_lock before update on public.sisters_events
for each row execute function public.sisters_lock_event_owner();

-- Evita acceso no autorizado a un grupo de otro evento y permite crear grupos
-- (no intenta leer NEW.group_id en una fila de sisters_groups).
create or replace function public.sisters_validate_owner() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(
    select 1 from public.sisters_events e where e.id=new.event_id and e.owner_id=new.owner_id
  ) then raise exception 'El evento no pertenece al usuario'; end if;
  if tg_table_name='sisters_guests' then
    if new.group_id is not null and not exists(
      select 1 from public.sisters_groups g
      where g.id=new.group_id and g.event_id=new.event_id and g.owner_id=new.owner_id
    ) then raise exception 'El grupo no pertenece al evento'; end if;
  end if;
  return new;
end; $$;

create or replace function public.sisters_issue_pairing() returns text
language plpgsql security definer set search_path='' as $$
declare v_event_id uuid;v_code text;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida';end if;
  select e.id into v_event_id from public.sisters_events e
  where e.owner_id=(select auth.uid())
     or exists(select 1 from public.sisters_event_editors x where x.event_id=e.id and x.user_id=(select auth.uid()))
  order by e.created_at asc limit 1;
  if not found then raise exception 'Este dispositivo no tiene permiso de administración';end if;
  delete from public.sisters_pairing_links where event_id=v_event_id and claimed_at is null;
  v_code := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.sisters_pairing_links(token_hash,event_id,issued_by,expires_at)
    values(md5(v_code),v_event_id,(select auth.uid()),now()+interval '10 minutes');
  return v_code;
end; $$;
revoke all on function public.sisters_issue_pairing() from public,anon;
grant execute on function public.sisters_issue_pairing() to authenticated;

create or replace function public.sisters_claim_pairing(p_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_event_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sesión requerida';end if;
  if p_code is null or p_code !~ '^[a-fA-F0-9]{64}$' then raise exception 'Código no válido';end if;
  update public.sisters_pairing_links set claimed_at=now()
  where token_hash=md5(lower(p_code)) and claimed_at is null and expires_at>now()
  returning event_id into v_event_id;
  if not found then raise exception 'El enlace venció o ya fue utilizado';end if;
  insert into public.sisters_event_editors(event_id,user_id) values(v_event_id,(select auth.uid()))
  on conflict(event_id,user_id) do nothing;
  return v_event_id;
end; $$;
revoke all on function public.sisters_claim_pairing(text) from public,anon;
grant execute on function public.sisters_claim_pairing(text) to authenticated;

create or replace function public.sisters_list_editors() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_event_id uuid;v_result jsonb;
begin
  select e.id into v_event_id from public.sisters_events e
    where e.owner_id=(select auth.uid()) or exists(
      select 1 from public.sisters_event_editors x where x.event_id=e.id and x.user_id=(select auth.uid()))
    order by e.created_at asc limit 1;
  if not found then return '[]'::jsonb;end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'created_at',x.created_at)
    order by x.created_at),'[]'::jsonb) into v_result
  from public.sisters_event_editors x where x.event_id=v_event_id;
  return v_result;
end; $$;
revoke all on function public.sisters_list_editors() from public,anon;
grant execute on function public.sisters_list_editors() to authenticated;

create or replace function public.sisters_remove_editor(p_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_event_id uuid;
begin
  select id into v_event_id from public.sisters_events
    where owner_id=(select auth.uid()) order by created_at asc limit 1;
  if not found then raise exception 'Solo el dispositivo propietario puede revocar acceso';end if;
  delete from public.sisters_event_editors where event_id=v_event_id and user_id=p_user_id;
  return found;
end; $$;
revoke all on function public.sisters_remove_editor(uuid) from public,anon;
grant execute on function public.sisters_remove_editor(uuid) to authenticated;
