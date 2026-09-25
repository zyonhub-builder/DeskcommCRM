-- ============================================================================
-- 0411: ZapSign nativo
--
-- Integração de assinatura eletrônica como módulo opcional da instalação. A
-- credencial da organização fica em tenant_integrations (cifrada por
-- fn_encrypt_oauth, mesmo cofre de Nuvemshop), o webhook chega por token de path
-- + header configurável, e os documentos ficam em tabela própria para a IA e a
-- operação consultarem sem bater na API externa a cada turno.
--
-- A tabela é tenant-aware desde o nascimento. Escrita pelo PostgREST exige
-- manager+; a IA e as rotas usam service_role e filtram organization_id no
-- serviço. O provider entra também em webhook_events_log para arquivar as
-- entregas recebidas.
-- ============================================================================

alter table public.tenant_integrations
  drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations
  add constraint tenant_integrations_provider_check
  check (provider in ('nuvemshop', 'vtex', 'shopify', 'zapsign'));

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy', 'zapsign'
  ));

create unique index if not exists tenant_integrations_org_id_id_idx
  on public.tenant_integrations (organization_id, id);
create unique index if not exists crm_leads_org_id_idx
  on public.crm_leads (organization_id, id);
create unique index if not exists contacts_org_id_idx
  on public.contacts (organization_id, id);

create table if not exists public.zapsign_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid,
  lead_id uuid,
  contact_id uuid,
  external_token text not null,
  external_open_id text,
  external_id text,
  name text not null,
  status text not null default 'pending',
  source text not null default 'api',
  created_by_kind text not null default 'system',
  created_by_ref text,
  signers jsonb not null default '[]'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  last_event_type text,
  last_event_at timestamptz,
  signed_at timestamptz,
  refused_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zapsign_documents_integration_fk
    foreign key (organization_id, integration_id)
    references public.tenant_integrations (organization_id, id),
  constraint zapsign_documents_lead_fk
    foreign key (organization_id, lead_id)
    references public.crm_leads (organization_id, id)
    on delete set null (lead_id),
  constraint zapsign_documents_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id)
    on delete set null (contact_id),
  constraint zapsign_documents_created_by_kind_check
    check (created_by_kind in ('user', 'ai', 'system')),
  constraint zapsign_documents_source_check
    check (source in ('api', 'mcp', 'webhook'))
);

comment on table public.zapsign_documents is
  'Documentos criados/observados via ZapSign por organização. Guarda o token do documento, status e payload mínimo para a IA consultar sem depender de lista remota.';
comment on column public.zapsign_documents.external_token is
  'Doc Token da ZapSign. Usado para detalhar o documento na API externa e reconciliar webhooks.';
comment on column public.zapsign_documents.provider_payload is
  'Recorte da resposta/evento da ZapSign. URLs de arquivo são temporárias no provedor; consumidores devem consultar novamente quando precisarem baixar.';

create unique index if not exists zapsign_documents_org_token_idx
  on public.zapsign_documents (organization_id, external_token);
create unique index if not exists zapsign_documents_org_external_id_idx
  on public.zapsign_documents (organization_id, external_id)
  where external_id is not null;
create index if not exists zapsign_documents_org_status_idx
  on public.zapsign_documents (organization_id, status, updated_at desc);
create index if not exists zapsign_documents_org_lead_idx
  on public.zapsign_documents (organization_id, lead_id)
  where lead_id is not null;
create index if not exists zapsign_documents_org_contact_idx
  on public.zapsign_documents (organization_id, contact_id)
  where contact_id is not null;

alter table public.zapsign_documents enable row level security;

drop policy if exists zapsign_documents_select on public.zapsign_documents;
create policy zapsign_documents_select on public.zapsign_documents
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists zapsign_documents_write on public.zapsign_documents;
create policy zapsign_documents_write on public.zapsign_documents
  for all
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

revoke all on public.zapsign_documents from anon;
grant select, insert, update, delete on public.zapsign_documents to authenticated;
grant all on public.zapsign_documents to service_role;

drop trigger if exists trg_zapsign_documents_updated_at on public.zapsign_documents;
create trigger trg_zapsign_documents_updated_at
  before update on public.zapsign_documents
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_zapsign_documents_audit on public.zapsign_documents;
create trigger trg_zapsign_documents_audit
  after insert or update or delete on public.zapsign_documents
  for each row execute function public.fn_audit_log_row();
