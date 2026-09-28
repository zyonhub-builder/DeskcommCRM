-- 0417: Laboratorio simulado sem envio real no WhatsApp.
--
-- O laboratorio deixa de ser apenas uma esteira de mensagens reais: o admin
-- escolhe um agente publicado, salva criterios esperados e decide se a rodada
-- intercepta a saida do WhatsApp. As colunas sao aditivas e nascem com defaults
-- para nao quebrar cenarios/rodadas ja existentes.

alter table public.ai_lab_scenarios
  add column if not exists agent_id uuid,
  add column if not exists execution_mode text not null default 'simulated',
  add column if not exists expected_events jsonb not null default '{"sign_contract": true, "create_calendar_event": true}'::jsonb;

alter table public.ai_lab_runs
  add column if not exists agent_id uuid,
  add column if not exists execution_mode text not null default 'simulated',
  add column if not exists expected_events jsonb not null default '{"sign_contract": true, "create_calendar_event": true}'::jsonb;

create unique index if not exists ai_agents_org_id_idx
  on public.ai_agents (organization_id, id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ai_lab_scenarios'::regclass
       and conname = 'ai_lab_scenarios_agent_fk'
  ) then
    alter table public.ai_lab_scenarios
      add constraint ai_lab_scenarios_agent_fk
      foreign key (organization_id, agent_id)
      references public.ai_agents (organization_id, id)
      on delete set null (agent_id);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.ai_lab_runs'::regclass
       and conname = 'ai_lab_runs_agent_fk'
  ) then
    alter table public.ai_lab_runs
      add constraint ai_lab_runs_agent_fk
      foreign key (organization_id, agent_id)
      references public.ai_agents (organization_id, id)
      on delete set null (agent_id);
  end if;
end $$;

alter table public.ai_lab_scenarios
  drop constraint if exists ai_lab_scenarios_execution_mode_check;
alter table public.ai_lab_scenarios
  add constraint ai_lab_scenarios_execution_mode_check
  check (execution_mode in ('simulated', 'real_whatsapp'));

alter table public.ai_lab_runs
  drop constraint if exists ai_lab_runs_execution_mode_check;
alter table public.ai_lab_runs
  add constraint ai_lab_runs_execution_mode_check
  check (execution_mode in ('simulated', 'real_whatsapp'));

alter table public.ai_lab_scenarios
  drop constraint if exists ai_lab_scenarios_expected_events_shape;
alter table public.ai_lab_scenarios
  add constraint ai_lab_scenarios_expected_events_shape
  check (jsonb_typeof(expected_events) = 'object');

alter table public.ai_lab_runs
  drop constraint if exists ai_lab_runs_expected_events_shape;
alter table public.ai_lab_runs
  add constraint ai_lab_runs_expected_events_shape
  check (jsonb_typeof(expected_events) = 'object');

alter table public.ai_lab_run_events
  drop constraint if exists ai_lab_run_events_kind_check;
alter table public.ai_lab_run_events
  add constraint ai_lab_run_events_kind_check
  check (kind in (
    'run_started',
    'customer_message_sent',
    'step_failed',
    'observing_started',
    'run_completed',
    'run_failed',
    'run_cancelled',
    'report_generated',
    'zapsign_signed_simulated',
    'analysis_generated'
  ));

comment on column public.ai_lab_scenarios.execution_mode is
  'simulated intercepta saidas automaticas do WhatsApp e grava no historico; real_whatsapp envia pelo canal.';
comment on column public.ai_lab_scenarios.agent_id is
  'Agente publicado que a rodada deve grudar na conversa de teste. Nulo usa a resolucao normal do canal/roteador.';
comment on column public.ai_lab_scenarios.expected_events is
  'Criterios esperados da bateria: assinatura simulada, agenda e outros efeitos observaveis.';
comment on column public.ai_lab_runs.execution_mode is
  'Snapshot do modo do cenario no inicio da rodada.';
comment on column public.ai_lab_runs.agent_id is
  'Snapshot do agente escolhido no inicio da rodada.';
comment on column public.ai_lab_runs.expected_events is
  'Snapshot dos criterios esperados no inicio da rodada.';

create index if not exists ai_lab_scenarios_org_agent_idx
  on public.ai_lab_scenarios (organization_id, agent_id)
  where agent_id is not null;
create index if not exists ai_lab_runs_org_agent_idx
  on public.ai_lab_runs (organization_id, agent_id)
  where agent_id is not null;
