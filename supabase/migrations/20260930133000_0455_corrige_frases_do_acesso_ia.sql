-- 0455 · Corrige gravação das frases do acesso da IA.
-- A 0453 agrupava por lower(limpa), mas selecionava limpa fora do GROUP BY.
-- A função só quebrava quando a tela enviava frases de campanha; aqui mantemos
-- a primeira ocorrência de cada frase normalizada sem depender de agregação inválida.

create or replace function public.fn_configurar_pre_go_live_canal(
  p_org uuid,
  p_canal uuid,
  p_modo text,
  p_numeros text[],
  p_frases_campanha text[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linhas integer;
  v_gate text;
begin
  if p_modo is null or p_modo not in ('open', 'allowlist', 'pre_go_live') then
    raise exception 'modo de acesso da IA inválido' using errcode = '22023';
  end if;

  if p_numeros is null or exists (
    select 1
      from unnest(p_numeros) as n(numero)
     where numero is null or numero !~ '^\+[1-9][0-9]{7,14}$'
  ) then
    raise exception 'lista de telefones de teste inválida' using errcode = '22023';
  end if;

  if p_frases_campanha is null
     or coalesce(array_length(p_frases_campanha, 1), 0) > 50
     or exists (
       select 1
         from unnest(p_frases_campanha) as f(frase)
        where frase is null
           or char_length(btrim(regexp_replace(frase, '[[:space:]]+', ' ', 'g'))) not between 3 and 400
     ) then
    raise exception 'lista de frases de campanha inválida' using errcode = '22023';
  end if;

  v_gate := case when p_modo in ('allowlist', 'pre_go_live') then 'allowlist' else 'open' end;

  update public.channel_sessions
     set metadata = jsonb_set(
       jsonb_set(
         jsonb_set(coalesce(metadata, '{}'::jsonb), '{ai_gate}', to_jsonb(v_gate), true),
         '{ai_gate_mode}', to_jsonb(p_modo), true
       ),
       '{ai_test_phone_numbers}', to_jsonb(p_numeros), true
     )
   where organization_id = p_org
     and id = p_canal
     and archived_at is null;

  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    return v_linhas;
  end if;

  with frases_limpas as (
    select distinct on (chave) ordem, limpa
      from (
        select
          ordem,
          btrim(regexp_replace(frase, '[[:space:]]+', ' ', 'g')) as limpa,
          lower(btrim(regexp_replace(frase, '[[:space:]]+', ' ', 'g'))) as chave
        from unnest(p_frases_campanha) with ordinality as f(frase, ordem)
      ) f
     order by chave, ordem
  ),
  frases_numeradas as (
    select row_number() over (order by ordem) as pos, limpa
      from frases_limpas
  )
  update public.organizations as o
     set settings = (
       case when jsonb_typeof(o.settings) = 'object' then o.settings else '{}'::jsonb end
     ) || jsonb_build_object(
       'campanhas_whatsapp',
       (
         select coalesce(jsonb_agg(item), '[]'::jsonb)
           from jsonb_array_elements(
             case
               when jsonb_typeof(o.settings->'campanhas_whatsapp') = 'array'
                 then o.settings->'campanhas_whatsapp'
               else '[]'::jsonb
             end
           ) as antigos(item)
          where item->>'channel_session_id' is distinct from p_canal::text
       ) ||
       (
         select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', 'canal-' || left(replace(p_canal::text, '-', ''), 12) || '-' || pos::text,
               'label', 'Frase ' || pos::text,
               'match', jsonb_build_object('tipo', 'starts_with', 'valor', limpa),
               'channel_session_id', p_canal::text
             )
             order by pos
           ),
           '[]'::jsonb
         )
         from frases_numeradas
       )
     )
   where o.id = p_org;

  return v_linhas;
end;
$$;

revoke execute on function public.fn_configurar_pre_go_live_canal(uuid, uuid, text, text[], text[])
  from public, anon, authenticated;
grant execute on function public.fn_configurar_pre_go_live_canal(uuid, uuid, text, text[], text[])
  to service_role;

notify pgrst, 'reload schema';
