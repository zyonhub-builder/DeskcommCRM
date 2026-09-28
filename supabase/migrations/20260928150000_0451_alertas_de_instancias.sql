-- 0451 — Alertas de instâncias da instalação.
--
-- O problema operacional é de PLATAFORMA: quem hospeda várias empresas precisa
-- saber quando qualquer número caiu, antes do cliente reclamar. A configuração
-- não pertence a um tenant; ela escolhe uma conexão existente para enviar os
-- avisos e um destino interno (telefone ou grupo).

create table if not exists public.platform_instance_alert_settings (
  id                              smallint    primary key default 1,
  enabled                         boolean     not null default false,
  channel_organization_id          uuid,
  channel_session_id               uuid,
  recipient_kind                   text        not null default 'phone',
  recipient                        text,
  recipient_label                  text,
  notify_on_down                   boolean     not null default true,
  notify_on_recovered              boolean     not null default true,
  updated_at                       timestamptz not null default now(),
  updated_by                       uuid,
  constraint platform_instance_alert_settings_singleton check (id = 1),
  constraint platform_instance_alert_settings_recipient_kind
    check (recipient_kind in ('phone', 'group')),
  constraint platform_instance_alert_settings_recipient_shape check (
    recipient is null
    or (recipient_kind = 'phone' and recipient ~ '^\+[1-9][0-9]{7,14}$')
    or (recipient_kind = 'group' and recipient ~ '^[0-9]{6,}@g\.us$')
  ),
  constraint platform_instance_alert_settings_enabled_ready check (
    enabled = false
    or (
      channel_organization_id is not null
      and channel_session_id is not null
      and recipient is not null
    )
  ),
  foreign key (channel_organization_id, channel_session_id)
    references public.channel_sessions (organization_id, id)
    on delete set null
);

comment on table public.platform_instance_alert_settings is
  'Configuração da INSTALAÇÃO para avisos de instância desconectada. Linha única id=1, lida/escrita só pelo servidor no painel admin.';

comment on column public.platform_instance_alert_settings.channel_session_id is
  'Conexão que envia os avisos da plataforma. Deve ser preferencialmente um número dedicado, não o número de atendimento de uma empresa.';

comment on column public.platform_instance_alert_settings.recipient is
  'Destino interno dos avisos: E.164 quando recipient_kind=phone, ou JID de grupo @g.us quando recipient_kind=group.';

create table if not exists public.platform_instance_alert_deliveries (
  id                              uuid        primary key default gen_random_uuid(),
  event_kind                      text        not null,
  affected_organization_id         uuid        references public.organizations(id) on delete set null,
  affected_channel_session_id      uuid        references public.channel_sessions(id) on delete set null,
  sender_organization_id           uuid        references public.organizations(id) on delete set null,
  sender_channel_session_id        uuid        references public.channel_sessions(id) on delete set null,
  recipient_kind                   text,
  recipient_mask                   text,
  status                          text        not null,
  reason                          text,
  external_id                     text,
  message_hash                    text,
  sent_at                         timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint platform_instance_alert_deliveries_event_kind
    check (event_kind in ('down', 'recovered', 'test')),
  constraint platform_instance_alert_deliveries_status
    check (status in ('sent', 'skipped', 'failed')),
  constraint platform_instance_alert_deliveries_recipient_kind
    check (recipient_kind is null or recipient_kind in ('phone', 'group'))
);

comment on table public.platform_instance_alert_deliveries is
  'Histórico dos avisos de instância enviados pela plataforma. Não guarda o texto inteiro nem o destino completo; usa hash e máscara.';

create index if not exists platform_instance_alert_deliveries_created_idx
  on public.platform_instance_alert_deliveries (created_at desc);

create index if not exists platform_instance_alert_deliveries_affected_idx
  on public.platform_instance_alert_deliveries (affected_organization_id, created_at desc);

drop trigger if exists trg_platform_instance_alert_settings_touch
  on public.platform_instance_alert_settings;
create trigger trg_platform_instance_alert_settings_touch
  before update on public.platform_instance_alert_settings
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_platform_instance_alert_deliveries_touch
  on public.platform_instance_alert_deliveries;
create trigger trg_platform_instance_alert_deliveries_touch
  before update on public.platform_instance_alert_deliveries
  for each row execute function public.fn_touch_updated_at();

alter table public.platform_instance_alert_settings   enable row level security;
alter table public.platform_instance_alert_deliveries enable row level security;

-- ZERO POLICIES, de propósito: são dados da instalação, não de uma organização.
-- Só rotas server-side com `requirePlatformAdmin()` e workers com service_role
-- alcançam estas tabelas.
revoke all on public.platform_instance_alert_settings   from anon, authenticated;
revoke all on public.platform_instance_alert_deliveries from anon, authenticated;
grant select, insert, update on public.platform_instance_alert_settings   to service_role;
grant select, insert, update on public.platform_instance_alert_deliveries to service_role;

notify pgrst, 'reload schema';
