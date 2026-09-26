-- ============================================================================
-- 0413: Relatório acionável do histórico do WhatsApp
--
-- Resultado agregado da importação temporária. Não guarda corpo de mensagem nem
-- identificadores remotos: só métricas, achados e limitações para leitura na
-- própria tela do histórico.
-- ============================================================================

create table if not exists public.whatsapp_history_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_id uuid not null references public.whatsapp_history_imports(id) on delete cascade,
  generated_by uuid references auth.users(id) on delete set null,
  report_version text not null default 'whatsapp_history_report_v1',
  summary text not null,
  metrics jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_history_reports_import_org_fk
    foreign key (organization_id, import_id)
    references public.whatsapp_history_imports (organization_id, id)
    on delete cascade,
  constraint whatsapp_history_reports_unique_import
    unique (organization_id, import_id),
  constraint whatsapp_history_reports_json_shape
    check (
      jsonb_typeof(metrics) = 'object'
      and jsonb_typeof(findings) = 'array'
      and jsonb_typeof(limitations) = 'array'
    )
);

comment on table public.whatsapp_history_reports is
  'Relatorios agregados e acionaveis gerados a partir do historico temporario do WhatsApp. Nao guarda conteudo cru de mensagens.';

create index if not exists whatsapp_history_reports_org_generated_idx
  on public.whatsapp_history_reports (organization_id, generated_at desc);

alter table public.whatsapp_history_reports enable row level security;

drop policy if exists whatsapp_history_reports_select on public.whatsapp_history_reports;
create policy whatsapp_history_reports_select on public.whatsapp_history_reports
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists whatsapp_history_reports_write on public.whatsapp_history_reports;
create policy whatsapp_history_reports_write on public.whatsapp_history_reports
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

revoke all on public.whatsapp_history_reports from anon;
grant select, insert, update, delete on public.whatsapp_history_reports to authenticated;
grant all on public.whatsapp_history_reports to service_role;

drop trigger if exists trg_whatsapp_history_reports_updated_at on public.whatsapp_history_reports;
create trigger trg_whatsapp_history_reports_updated_at
  before update on public.whatsapp_history_reports
  for each row execute function public.fn_set_updated_at();
