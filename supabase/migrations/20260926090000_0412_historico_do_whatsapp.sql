-- ============================================================================
-- 0412: Histórico do WhatsApp para análise posterior
--
-- Importação isolada do atendimento: a sessão WAHA é temporária/descartável,
-- criada com store NOWEB ligado, e os dados entram em tabelas próprias. Nada
-- daqui alimenta Inbox, IA, follow-up ou event_log de mensagem.
--
-- O conteúdo textual importado fica cifrado e com retenção curta. A POC não
-- baixa mídia; só conta o que foi pulado.
-- ============================================================================

create table if not exists public.whatsapp_history_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'qr_pending',
  transport_session_name text not null unique,
  full_sync boolean not null default false,
  scope_days integer,
  max_chats integer not null default 200,
  max_messages_per_chat integer not null default 500,
  consent_version text not null default 'whatsapp_history_v1',
  consent_accepted_at timestamptz not null default now(),
  full_sync_acknowledged_at timestamptz,
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz,
  retention_until timestamptz not null default (now() + interval '30 days'),
  lease_until timestamptz,
  attempts integer not null default 0,
  chats_total integer not null default 0,
  chats_imported integer not null default 0,
  messages_seen integer not null default 0,
  messages_imported integer not null default 0,
  media_skipped integer not null default 0,
  groups_skipped integer not null default 0,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_history_imports_status_check
    check (status in ('qr_pending', 'importing', 'ready', 'failed', 'cancelled', 'deleted', 'expired')),
  constraint whatsapp_history_imports_limits_check
    check (
      (scope_days is null or (scope_days between 1 and 3650))
      and max_chats between 1 and 5000
      and max_messages_per_chat between 1 and 5000
    ),
  constraint whatsapp_history_imports_full_sync_ack_check
    check (not full_sync or full_sync_acknowledged_at is not null),
  constraint whatsapp_history_imports_retention_check
    check (retention_until >= created_at)
);

comment on table public.whatsapp_history_imports is
  'Jobs de importacao temporaria do historico do WhatsApp, isolados do atendimento. A sessao WAHA associada e descartavel.';
comment on column public.whatsapp_history_imports.full_sync is
  'false por padrao. true exige aceite explicito porque aumenta tempo, custo e volume.';
comment on column public.whatsapp_history_imports.retention_until is
  'Data-limite para expurgo dos dados importados. O usuario tambem pode apagar antes.';

create unique index if not exists whatsapp_history_imports_org_id_idx
  on public.whatsapp_history_imports (organization_id, id);

create table if not exists public.whatsapp_history_chats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_id uuid not null references public.whatsapp_history_imports(id) on delete cascade,
  chat_id_hash text not null,
  chat_id_encrypted bytea,
  kind text not null default 'direct',
  status text not null default 'queued',
  next_offset integer not null default 0,
  messages_seen integer not null default 0,
  messages_imported integer not null default 0,
  media_skipped integer not null default 0,
  last_message_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_history_chats_kind_check
    check (kind in ('direct', 'group', 'unknown')),
  constraint whatsapp_history_chats_status_check
    check (status in ('queued', 'importing', 'done', 'failed', 'skipped')),
  constraint whatsapp_history_chats_offsets_check
    check (next_offset >= 0 and messages_seen >= 0 and messages_imported >= 0 and media_skipped >= 0),
  constraint whatsapp_history_chats_import_org_fk
    foreign key (organization_id, import_id)
    references public.whatsapp_history_imports (organization_id, id)
    on delete cascade
);

comment on table public.whatsapp_history_chats is
  'Chats descobertos na importacao de historico. O identificador remoto fica cifrado e hasheado para retomada sem expor telefone.';

create unique index if not exists whatsapp_history_chats_org_import_id_idx
  on public.whatsapp_history_chats (organization_id, import_id, id);

create table if not exists public.whatsapp_history_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_id uuid not null references public.whatsapp_history_imports(id) on delete cascade,
  chat_id uuid not null references public.whatsapp_history_chats(id) on delete cascade,
  external_id_hash text,
  body_hash text,
  direction text not null default 'unknown',
  message_type text not null default 'text',
  body_encrypted bytea,
  body_length integer not null default 0,
  has_media boolean not null default false,
  media_mime text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint whatsapp_history_messages_direction_check
    check (direction in ('inbound', 'outbound', 'unknown')),
  constraint whatsapp_history_messages_body_length_check
    check (body_length >= 0),
  constraint whatsapp_history_messages_import_org_fk
    foreign key (organization_id, import_id)
    references public.whatsapp_history_imports (organization_id, id)
    on delete cascade,
  constraint whatsapp_history_messages_chat_org_fk
    foreign key (organization_id, import_id, chat_id)
    references public.whatsapp_history_chats (organization_id, import_id, id)
    on delete cascade
);

comment on table public.whatsapp_history_messages is
  'Mensagens importadas para analise posterior. Conteudo textual fica cifrado; midia nao e baixada nesta POC.';

create index if not exists whatsapp_history_imports_org_status_idx
  on public.whatsapp_history_imports (organization_id, status, updated_at desc);
create index if not exists whatsapp_history_imports_retention_idx
  on public.whatsapp_history_imports (retention_until)
  where status in ('ready', 'failed', 'cancelled', 'expired');

create unique index if not exists whatsapp_history_chats_org_import_hash_idx
  on public.whatsapp_history_chats (organization_id, import_id, chat_id_hash);
create index if not exists whatsapp_history_chats_work_idx
  on public.whatsapp_history_chats (organization_id, import_id, status, updated_at);

create index if not exists whatsapp_history_messages_org_import_idx
  on public.whatsapp_history_messages (organization_id, import_id, sent_at desc);
create unique index if not exists whatsapp_history_messages_external_idx
  on public.whatsapp_history_messages (organization_id, import_id, external_id_hash)
  where external_id_hash is not null;

alter table public.whatsapp_history_imports enable row level security;
alter table public.whatsapp_history_chats enable row level security;
alter table public.whatsapp_history_messages enable row level security;

drop policy if exists whatsapp_history_imports_select on public.whatsapp_history_imports;
create policy whatsapp_history_imports_select on public.whatsapp_history_imports
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists whatsapp_history_imports_write on public.whatsapp_history_imports;
create policy whatsapp_history_imports_write on public.whatsapp_history_imports
  for all
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );

drop policy if exists whatsapp_history_chats_select on public.whatsapp_history_chats;
create policy whatsapp_history_chats_select on public.whatsapp_history_chats
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists whatsapp_history_chats_write on public.whatsapp_history_chats;
create policy whatsapp_history_chats_write on public.whatsapp_history_chats
  for all
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );

drop policy if exists whatsapp_history_messages_select on public.whatsapp_history_messages;
create policy whatsapp_history_messages_select on public.whatsapp_history_messages
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists whatsapp_history_messages_write on public.whatsapp_history_messages;
create policy whatsapp_history_messages_write on public.whatsapp_history_messages
  for all
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );

revoke all on public.whatsapp_history_imports from anon;
revoke all on public.whatsapp_history_chats from anon;
revoke all on public.whatsapp_history_messages from anon;
grant select, insert, update, delete on public.whatsapp_history_imports to authenticated;
grant select, insert, update, delete on public.whatsapp_history_chats to authenticated;
grant select, insert, update, delete on public.whatsapp_history_messages to authenticated;
grant all on public.whatsapp_history_imports to service_role;
grant all on public.whatsapp_history_chats to service_role;
grant all on public.whatsapp_history_messages to service_role;

drop trigger if exists trg_whatsapp_history_imports_updated_at on public.whatsapp_history_imports;
create trigger trg_whatsapp_history_imports_updated_at
  before update on public.whatsapp_history_imports
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_whatsapp_history_chats_updated_at on public.whatsapp_history_chats;
create trigger trg_whatsapp_history_chats_updated_at
  before update on public.whatsapp_history_chats
  for each row execute function public.fn_set_updated_at();
