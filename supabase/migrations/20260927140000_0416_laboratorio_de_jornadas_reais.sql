-- Laboratorio de jornadas reais: cenarios, rodadas e eventos.
-- Executa mensagens de teste pelo mesmo ingest WAHA, em tempo cadenciado,
-- e guarda relatorio observavel da rodada.

create table if not exists public.ai_lab_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  channel_session_id uuid,
  phone_number text not null,
  contact_name text,
  steps jsonb not null default '[]'::jsonb,
  default_delay_seconds integer not null default 120,
  observation_seconds integer not null default 1800,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_lab_scenarios_channel_fk
    foreign key (organization_id, channel_session_id)
    references public.channel_sessions (organization_id, id)
    on delete set null (channel_session_id),
  constraint ai_lab_scenarios_name_not_blank check (length(btrim(name)) > 0),
  constraint ai_lab_scenarios_phone_shape check (phone_number ~ '^\+[1-9][0-9]{9,14}$'),
  constraint ai_lab_scenarios_steps_shape check (
    jsonb_typeof(steps) = 'array'
    and jsonb_array_length(steps) between 1 and 60
  ),
  constraint ai_lab_scenarios_delay_range check (default_delay_seconds between 10 and 86400),
  constraint ai_lab_scenarios_observation_range check (observation_seconds between 0 and 604800)
);

comment on table public.ai_lab_scenarios is
  'Cenarios reutilizaveis de laboratorio: mensagens de cliente e cadencia natural para testar uma jornada real no ambiente DEV.';
comment on column public.ai_lab_scenarios.steps is
  'Array de passos {body, delay_seconds?, note?}. O cron injeta cada body como inbound WAHA sintetico.';

create unique index if not exists ai_lab_scenarios_org_id_idx
  on public.ai_lab_scenarios (organization_id, id);
create unique index if not exists ai_lab_scenarios_org_name_idx
  on public.ai_lab_scenarios (organization_id, lower(name));
create index if not exists ai_lab_scenarios_org_active_idx
  on public.ai_lab_scenarios (organization_id, is_active, updated_at desc);

alter table public.ai_lab_scenarios enable row level security;

drop policy if exists ai_lab_scenarios_select on public.ai_lab_scenarios;
create policy ai_lab_scenarios_select on public.ai_lab_scenarios
  for select
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );
drop policy if exists ai_lab_scenarios_write on public.ai_lab_scenarios;
create policy ai_lab_scenarios_write on public.ai_lab_scenarios
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

revoke all on public.ai_lab_scenarios from anon;
grant select, insert, update, delete on public.ai_lab_scenarios to authenticated;
grant all on public.ai_lab_scenarios to service_role;

drop trigger if exists trg_ai_lab_scenarios_updated_at on public.ai_lab_scenarios;
create trigger trg_ai_lab_scenarios_updated_at
  before update on public.ai_lab_scenarios
  for each row execute function public.fn_set_updated_at();

create table if not exists public.ai_lab_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scenario_id uuid,
  channel_session_id uuid,
  contact_id uuid,
  phone_number text not null,
  contact_name text,
  script jsonb not null default '[]'::jsonb,
  status text not null default 'queued',
  current_step_index integer not null default 0,
  next_step_at timestamptz,
  observation_seconds integer not null default 1800,
  observation_until timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_sent_at timestamptz,
  report jsonb,
  report_generated_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_lab_runs_scenario_fk
    foreign key (organization_id, scenario_id)
    references public.ai_lab_scenarios (organization_id, id)
    on delete set null (scenario_id),
  constraint ai_lab_runs_channel_fk
    foreign key (organization_id, channel_session_id)
    references public.channel_sessions (organization_id, id)
    on delete set null (channel_session_id),
  constraint ai_lab_runs_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id)
    on delete set null (contact_id),
  constraint ai_lab_runs_status_check
    check (status in ('queued', 'running', 'observing', 'completed', 'failed', 'cancelled')),
  constraint ai_lab_runs_phone_shape check (phone_number ~ '^\+[1-9][0-9]{9,14}$'),
  constraint ai_lab_runs_script_shape check (
    jsonb_typeof(script) = 'array'
    and jsonb_array_length(script) between 1 and 60
  ),
  constraint ai_lab_runs_step_range check (current_step_index >= 0),
  constraint ai_lab_runs_observation_range check (observation_seconds between 0 and 604800),
  constraint ai_lab_runs_report_shape check (report is null or jsonb_typeof(report) = 'object')
);

comment on table public.ai_lab_runs is
  'Rodadas reais de laboratorio. Cada rodada injeta mensagens cadenciadas pelo ingest WAHA e observa efeitos do agente, contrato e agenda.';
comment on column public.ai_lab_runs.report is
  'Relatorio consolidado da rodada: transcript, tempos, efeitos reais observados e pontos de melhoria.';

create unique index if not exists ai_lab_runs_org_id_idx
  on public.ai_lab_runs (organization_id, id);
create index if not exists ai_lab_runs_org_status_next_idx
  on public.ai_lab_runs (organization_id, status, next_step_at)
  where status in ('queued', 'running');
create index if not exists ai_lab_runs_observing_until_idx
  on public.ai_lab_runs (organization_id, observation_until)
  where status = 'observing';
create index if not exists ai_lab_runs_org_created_idx
  on public.ai_lab_runs (organization_id, created_at desc);

alter table public.ai_lab_runs enable row level security;

drop policy if exists ai_lab_runs_select on public.ai_lab_runs;
create policy ai_lab_runs_select on public.ai_lab_runs
  for select
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );
drop policy if exists ai_lab_runs_write on public.ai_lab_runs;
create policy ai_lab_runs_write on public.ai_lab_runs
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

revoke all on public.ai_lab_runs from anon;
grant select, insert, update, delete on public.ai_lab_runs to authenticated;
grant all on public.ai_lab_runs to service_role;

drop trigger if exists trg_ai_lab_runs_updated_at on public.ai_lab_runs;
create trigger trg_ai_lab_runs_updated_at
  before update on public.ai_lab_runs
  for each row execute function public.fn_set_updated_at();

create table if not exists public.ai_lab_run_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  kind text not null,
  step_index integer,
  body text,
  details jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ai_lab_run_events_run_fk
    foreign key (organization_id, run_id)
    references public.ai_lab_runs (organization_id, id)
    on delete cascade,
  constraint ai_lab_run_events_kind_check
    check (kind in ('run_started', 'customer_message_sent', 'step_failed', 'observing_started', 'run_completed', 'run_failed', 'run_cancelled', 'report_generated')),
  constraint ai_lab_run_events_step_range check (step_index is null or step_index >= 0),
  constraint ai_lab_run_events_details_shape check (jsonb_typeof(details) = 'object')
);

comment on table public.ai_lab_run_events is
  'Linha do tempo tecnica e visivel de uma rodada de laboratorio.';

create index if not exists ai_lab_run_events_run_time_idx
  on public.ai_lab_run_events (organization_id, run_id, happened_at);

alter table public.ai_lab_run_events enable row level security;

drop policy if exists ai_lab_run_events_select on public.ai_lab_run_events;
create policy ai_lab_run_events_select on public.ai_lab_run_events
  for select
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
    )
  );
drop policy if exists ai_lab_run_events_write on public.ai_lab_run_events;
create policy ai_lab_run_events_write on public.ai_lab_run_events
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

revoke all on public.ai_lab_run_events from anon;
grant select, insert, update, delete on public.ai_lab_run_events to authenticated;
grant all on public.ai_lab_run_events to service_role;
