-- Órbita: one private, versioned planner document per account.
-- Focus timers remain device-local; passwords are managed only by Supabase Auth.
create table public.planner_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint planner_document_shape check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['subjects','tasks','sessions','courses','notes']
    and jsonb_typeof(payload->'subjects') = 'array'
    and jsonb_typeof(payload->'tasks') = 'array'
    and jsonb_typeof(payload->'sessions') = 'array'
    and jsonb_typeof(payload->'courses') = 'array'
    and jsonb_typeof(payload->'notes') = 'array'
    and octet_length(payload::text) <= 5242880
  )
);
alter table public.planner_documents enable row level security;

revoke all on public.planner_documents from public, anon, authenticated;
grant select, insert, update on public.planner_documents to authenticated;

create policy "Read own planner" on public.planner_documents
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own planner" on public.planner_documents
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own planner" on public.planner_documents
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.orbita_document_revision()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.orbita_document_revision() from public, anon, authenticated;
create trigger planner_document_revision
before insert or update on public.planner_documents
for each row execute function public.orbita_document_revision();

comment on table public.planner_documents is
'Private planner snapshots with RLS ownership and optimistic concurrency via revision.';
