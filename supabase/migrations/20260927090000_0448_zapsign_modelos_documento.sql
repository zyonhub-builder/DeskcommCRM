-- 0448_zapsign_modelos_documento
-- Catálogo tenant-aware de modelos ZapSign. A IA já sabia criar documentos por
-- template_id; esta tabela dá superfície administrativa para escolher o modelo
-- por área/agente sem colar o id bruto no prompt.

do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
     where t.relname = 'ai_agents'
       and t.relnamespace = 'public'::regnamespace
       and i.indisunique
       and i.indnatts = 2
       and (
         select array_agg(a.attname::text order by k.ord)
           from unnest(i.indkey) with ordinality as k(attnum, ord)
           join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
       ) = array['organization_id', 'id']
  ) then
    create unique index uq_ai_agents_org_id on public.ai_agents (organization_id, id);
  end if;
end $$;

create table if not exists public.zapsign_document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid,
  template_key text not null,
  name text not null,
  description text,
  zapsign_template_id text not null,
  required_fields text[] not null default '{}'::text[],
  template_data_defaults jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_default boolean not null default false,
  default_for_agent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zapsign_document_templates_agent_fk
    foreign key (organization_id, agent_id)
    references public.ai_agents (organization_id, id)
    on delete set null (agent_id),
  constraint zapsign_document_templates_key_check
    check (template_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  constraint zapsign_document_templates_name_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint zapsign_document_templates_provider_id_check
    check (char_length(btrim(zapsign_template_id)) between 1 and 255),
  constraint zapsign_document_templates_defaults_object_check
    check (jsonb_typeof(template_data_defaults) = 'object')
);

comment on table public.zapsign_document_templates is
  'Modelos ZapSign configuráveis por organização, área e agente. A IA resolve template_key/default em template_id antes de criar o documento.';
comment on column public.zapsign_document_templates.template_key is
  'Chave curta usada por prompt e roteador, ex.: previdenciario, criminal, trabalhista.';
comment on column public.zapsign_document_templates.zapsign_template_id is
  'ID do modelo na ZapSign. Não é segredo, mas fica tenant-aware para evitar configuração cruzada.';
comment on column public.zapsign_document_templates.required_fields is
  'Placeholders ou campos que o agente precisa coletar antes de criar o contrato.';
comment on column public.zapsign_document_templates.template_data_defaults is
  'Valores fixos enviados em data ao criar documento por modelo; template_data informado na chamada vence estes padrões.';

create unique index if not exists zapsign_document_templates_org_key_idx
  on public.zapsign_document_templates (organization_id, template_key);
create unique index if not exists zapsign_document_templates_one_default_idx
  on public.zapsign_document_templates (organization_id)
  where is_active and is_default;
create unique index if not exists zapsign_document_templates_one_agent_default_idx
  on public.zapsign_document_templates (organization_id, agent_id)
  where is_active and default_for_agent and agent_id is not null;
create index if not exists zapsign_document_templates_org_agent_idx
  on public.zapsign_document_templates (organization_id, agent_id)
  where agent_id is not null;
create index if not exists zapsign_document_templates_org_active_idx
  on public.zapsign_document_templates (organization_id, is_active, updated_at desc);

alter table public.zapsign_document_templates enable row level security;

drop policy if exists zapsign_document_templates_select on public.zapsign_document_templates;
create policy zapsign_document_templates_select on public.zapsign_document_templates
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists zapsign_document_templates_write on public.zapsign_document_templates;
create policy zapsign_document_templates_write on public.zapsign_document_templates
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

revoke all on public.zapsign_document_templates from anon;
grant select, insert, update, delete on public.zapsign_document_templates to authenticated;
grant all on public.zapsign_document_templates to service_role;

drop trigger if exists trg_zapsign_document_templates_updated_at on public.zapsign_document_templates;
create trigger trg_zapsign_document_templates_updated_at
  before update on public.zapsign_document_templates
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_zapsign_document_templates_audit on public.zapsign_document_templates;
create trigger trg_zapsign_document_templates_audit
  after insert or update or delete on public.zapsign_document_templates
  for each row execute function public.fn_audit_log_row();
