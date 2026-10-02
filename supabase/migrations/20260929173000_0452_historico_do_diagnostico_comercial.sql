-- 0452 — Historico das analises do diagnostico comercial.
--
-- A analise paga deixou de existir so no estado da tela. O relatorio gerado
-- fica salvo por organizacao com janela, autor, prompt usado, custo e payload
-- final, para reabrir depois e baixar PDF sem chamar IA de novo. Nao guarda
-- corpo de mensagens: a fonte continua sendo o agregado do diagnostico.

create table if not exists public.commercial_diagnosis_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  from_at timestamptz not null,
  to_at timestamptz not null,
  period_days integer not null,
  analysis jsonb not null,
  prompt jsonb,
  llm_call_id uuid references public.llm_calls(id) on delete set null,
  provider text not null,
  model text not null,
  cost_cents numeric,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  constraint commercial_diagnosis_reports_window_order
    check (from_at < to_at),
  constraint commercial_diagnosis_reports_period_days
    check (period_days > 0 and period_days <= 90),
  constraint commercial_diagnosis_reports_json_shape
    check (
      jsonb_typeof(analysis) = 'object'
      and (prompt is null or jsonb_typeof(prompt) = 'object')
    ),
  constraint commercial_diagnosis_reports_usage_nonnegative
    check (
      (cost_cents is null or cost_cents >= 0)
      and input_tokens >= 0
      and output_tokens >= 0
      and latency_ms >= 0
    )
);

comment on table public.commercial_diagnosis_reports is
  'Historico das analises com IA do diagnostico comercial. Guarda agregados, prompt, custo e resultado, sem corpo de mensagens.';
comment on column public.commercial_diagnosis_reports.analysis is
  'Payload validado pela aplicacao para reabrir a analise e gerar PDF sem chamar IA novamente.';
comment on column public.commercial_diagnosis_reports.prompt is
  'Prompt enviado ao modelo na geracao do relatorio; duplicado fora de analysis para auditoria e evolucao futura.';

create index if not exists commercial_diagnosis_reports_org_created_idx
  on public.commercial_diagnosis_reports (organization_id, created_at desc);
create index if not exists commercial_diagnosis_reports_org_window_idx
  on public.commercial_diagnosis_reports (organization_id, from_at desc, to_at desc);
create index if not exists commercial_diagnosis_reports_llm_call_idx
  on public.commercial_diagnosis_reports (llm_call_id)
  where llm_call_id is not null;

alter table public.commercial_diagnosis_reports enable row level security;

drop policy if exists commercial_diagnosis_reports_select on public.commercial_diagnosis_reports;
create policy commercial_diagnosis_reports_select on public.commercial_diagnosis_reports
  for select
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

revoke all on public.commercial_diagnosis_reports from anon, authenticated;
grant select on public.commercial_diagnosis_reports to authenticated;
grant select, insert, update, delete on public.commercial_diagnosis_reports to service_role;

notify pgrst, 'reload schema';
