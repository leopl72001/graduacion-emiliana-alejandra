-- Emiliana & Alejandra · Esquema independiente de GradoPro.
-- Ejecutar en Supabase > SQL Editor. No modifica tablas ni datos existentes de GradoPro.
create extension if not exists pgcrypto;

create table if not exists public.sisters_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Dos sueños, una celebración',
  message text not null default '',
  date text not null default '',
  venue text not null default 'Por confirmar',
  address text not null default '',
  arrival_note text not null default '',
  maps_url text not null default '',
  rsvp_deadline text not null default '',
  galleries jsonb not null default '{"juntas":[],"emiliana":[],"alejandra":[],"familia":[]}'::jsonb,
  music_general_url text not null default '',
  music_general_start numeric not null default 0,
  music_special_url text not null default '',
  music_special_start numeric not null default 0,
  closing text not null default '',
  created_at timestamptz not null default now(),
  unique(owner_id)
);

create table if not exists public.sisters_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.sisters_events(id) on delete cascade,
  name text not null,
  track text not null default 'general' check(track in ('general','especial')),
  default_seats integer not null default 2 check(default_seats between 1 and 50)
);
create index if not exists sisters_groups_event_idx on public.sisters_groups(event_id);

create table if not exists public.sisters_guests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.sisters_events(id) on delete cascade,
  group_id uuid references public.sisters_groups(id) on delete set null,
  name text not null,
  seats integer not null default 1 check(seats between 1 and 50),
  phone text not null default '',
  share_token text not null unique check(length(share_token)=64),
  sent boolean not null default false,
  sent_at timestamptz,
  status text not null default 'pendiente' check(status in ('pendiente','confirmada','no_asistira')),
  attending_count integer not null default 0 check(attending_count between 0 and 50),
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sisters_guests_event_idx on public.sisters_guests(event_id);
create index if not exists sisters_guests_group_idx on public.sisters_guests(group_id);

alter table public.sisters_events enable row level security;
alter table public.sisters_groups enable row level security;
alter table public.sisters_guests enable row level security;

-- Permisos de Data API, además de las políticas RLS.
grant select,insert,update,delete on public.sisters_events to authenticated;
grant select,insert,update,delete on public.sisters_groups to authenticated;
grant select,insert,update,delete on public.sisters_guests to authenticated;
revoke all on public.sisters_events,public.sisters_groups,public.sisters_guests from anon;

drop policy if exists sisters_event_owner on public.sisters_events;
create policy sisters_event_owner on public.sisters_events for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists sisters_groups_owner on public.sisters_groups;
create policy sisters_groups_owner on public.sisters_groups for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists sisters_guests_owner on public.sisters_guests;
create policy sisters_guests_owner on public.sisters_guests for all to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

-- Garantizar que las filas asociadas a un evento/grupo pertenecen al mismo usuario.
create or replace function public.sisters_validate_owner() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.sisters_events e where e.id=new.event_id and e.owner_id=new.owner_id) then
    raise exception 'El evento no pertenece al usuario';
  end if;
  if tg_table_name='sisters_guests' then
    if new.group_id is not null and not exists(
      select 1 from public.sisters_groups g
      where g.id=new.group_id and g.event_id=new.event_id and g.owner_id=new.owner_id
    ) then
      raise exception 'Grupo no pertenece al evento';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists sisters_group_owner_trigger on public.sisters_groups;
create trigger sisters_group_owner_trigger before insert or update on public.sisters_groups
  for each row execute function public.sisters_validate_owner();
drop trigger if exists sisters_guest_owner_trigger on public.sisters_guests;
create trigger sisters_guest_owner_trigger before insert or update on public.sisters_guests
  for each row execute function public.sisters_validate_owner();

-- RPC pública devuelve SOLO la invitación solicitada por su token impredecible.
create or replace function public.sisters_get_invite(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.sisters_guests%rowtype;
declare e public.sisters_events%rowtype;
declare gr public.sisters_groups%rowtype;
begin
  if p_token is null or length(p_token)<>64 then return null; end if;
  select * into g from public.sisters_guests where share_token=p_token;
  if not found then return null; end if;
  select * into e from public.sisters_events where id=g.event_id;
  if not found then return null; end if;
  if g.group_id is not null then select * into gr from public.sisters_groups where id=g.group_id; end if;
  return jsonb_build_object(
    'event',to_jsonb(e)-'owner_id'-'created_at',
    'guest',jsonb_build_object('id',g.id,'event_id',g.event_id,'group_id',g.group_id,
      'name',g.name,'seats',g.seats,'share_token',g.share_token,'status',g.status,
      'attending_count',g.attending_count,'message',g.message,'sent',g.sent,
      'sent_at',g.sent_at,'created_at',g.created_at,'phone',''),
    'group_name',coalesce(gr.name,''),
    'track',coalesce(gr.track,'general')
  );
end; $$;
revoke all on function public.sisters_get_invite(text) from public;
grant execute on function public.sisters_get_invite(text) to anon,authenticated;

create or replace function public.sisters_reply_invite(
  p_token text,p_status text,p_count integer,p_message text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.sisters_guests%rowtype;
begin
  if p_token is null or length(p_token)<>64 then raise exception 'Invitación inválida'; end if;
  select * into g from public.sisters_guests where share_token=p_token for update;
  if not found then raise exception 'No se encontró la invitación'; end if;
  if p_status not in ('confirmada','no_asistira') then raise exception 'Estado no permitido'; end if;
  if p_status='confirmada' and (p_count<1 or p_count>g.seats) then raise exception 'La cantidad supera los cupos'; end if;
  update public.sisters_guests set status=p_status,
    attending_count=case when p_status='confirmada' then p_count else 0 end,
    message=left(coalesce(p_message,''),1000) where id=g.id;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.sisters_reply_invite(text,text,integer,text) from public;
grant execute on function public.sisters_reply_invite(text,text,integer,text) to anon,authenticated;

-- Bucket público para fotos y pistas musicales. Los nombres incluyen UUID del dueño.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values('sisters-assets','sisters-assets',true,16777216,
  array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/ogg','audio/wav','audio/x-wav'])
on conflict (id) do update set public=true,file_size_limit=16777216,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sisters_storage_upload on storage.objects;
create policy sisters_storage_upload on storage.objects for insert to authenticated
with check(bucket_id='sisters-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists sisters_storage_update on storage.objects;
create policy sisters_storage_update on storage.objects for update to authenticated
using(bucket_id='sisters-assets' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='sisters-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists sisters_storage_delete on storage.objects;
create policy sisters_storage_delete on storage.objects for delete to authenticated
using(bucket_id='sisters-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Para instalaciones existentes:
ALTER TABLE public.sisters_events ADD COLUMN IF NOT EXISTS arrival_note text NOT NULL DEFAULT '';
