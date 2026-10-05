import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER ?? "";
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — run via `pnpm test:db`");
}

const ORG_A = "04570000-0000-4000-8000-000000000001";
const ORG_B = "04570000-0000-4000-8000-000000000002";
const USER_A = "04570000-1111-4000-8000-000000000001";
const USER_B = "04570000-1111-4000-8000-000000000002";
const SESS_A = "04570000-2222-4000-8000-000000000001";
const SESS_B = "04570000-2222-4000-8000-000000000002";
const CONTACT_A = "04570000-3333-4000-8000-000000000001";
const CONTACT_B = "04570000-3333-4000-8000-000000000002";
const SCENARIO_A = "04570000-4444-4000-8000-000000000001";
const SCENARIO_B = "04570000-4444-4000-8000-000000000002";
const RUN_A = "04570000-5555-4000-8000-000000000001";
const RUN_B = "04570000-5555-4000-8000-000000000002";
const EVENT_A = "04570000-6666-4000-8000-000000000001";
const EVENT_B = "04570000-6666-4000-8000-000000000002";
const TEMPLATE_A = "04570000-7777-4000-8000-000000000001";
const TEMPLATE_B = "04570000-7777-4000-8000-000000000002";

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-f",
      "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

function countAs(userId: string, query: string): number {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${query}
  `);
  const last = out.split("\n").at(-1);
  if (!last || !/^\d+$/.test(last)) throw new Error(`unexpected psql output: ${out}`);
  return Number(last);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'ai-lab-rls-a@invariant.test'),
      ('${USER_B}', 'ai-lab-rls-b@invariant.test')
    on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'ai-lab-rls-a', 'AI Lab RLS A', 'AI Lab RLS A'),
      ('${ORG_B}', 'ai-lab-rls-b', 'AI Lab RLS B', 'AI Lab RLS B')
    on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'admin', now()),
      ('${USER_B}', '${ORG_B}', 'admin', now())
    on conflict do nothing;

    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted) values
      ('${SESS_A}', '${ORG_A}', 'ai_lab_rls_a', '\\x00'::bytea),
      ('${SESS_B}', '${ORG_B}', 'ai_lab_rls_b', '\\x00'::bytea)
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTACT_A}', '${ORG_A}', 'Contato AI Lab A'),
      ('${CONTACT_B}', '${ORG_B}', 'Contato AI Lab B')
    on conflict (id) do nothing;

    insert into public.ai_lab_scenarios
      (id, organization_id, name, channel_session_id, phone_number, contact_name, steps)
    values
      ('${SCENARIO_A}', '${ORG_A}', 'Cenario A', '${SESS_A}', '+15550000001', 'Contato AI Lab A', '[{"body":"oi"}]'::jsonb),
      ('${SCENARIO_B}', '${ORG_B}', 'Cenario B', '${SESS_B}', '+15550000002', 'Contato AI Lab B', '[{"body":"oi"}]'::jsonb)
    on conflict (id) do nothing;

    insert into public.ai_lab_runs
      (id, organization_id, scenario_id, channel_session_id, contact_id, phone_number, contact_name, script)
    values
      ('${RUN_A}', '${ORG_A}', '${SCENARIO_A}', '${SESS_A}', '${CONTACT_A}', '+15550000001', 'Contato AI Lab A', '[{"body":"oi"}]'::jsonb),
      ('${RUN_B}', '${ORG_B}', '${SCENARIO_B}', '${SESS_B}', '${CONTACT_B}', '+15550000002', 'Contato AI Lab B', '[{"body":"oi"}]'::jsonb)
    on conflict (id) do nothing;

    insert into public.ai_lab_run_events (id, organization_id, run_id, kind, body, details) values
      ('${EVENT_A}', '${ORG_A}', '${RUN_A}', 'run_started', 'inicio A', '{"org":"a"}'::jsonb),
      ('${EVENT_B}', '${ORG_B}', '${RUN_B}', 'run_started', 'inicio B', '{"org":"b"}'::jsonb)
    on conflict (id) do nothing;

    insert into public.zapsign_document_templates
      (id, organization_id, template_key, name, zapsign_template_id)
    values
      ('${TEMPLATE_A}', '${ORG_A}', 'rls-a', 'Modelo A', 'tpl-a'),
      ('${TEMPLATE_B}', '${ORG_B}', 'rls-b', 'Modelo B', 'tpl-b')
    on conflict (id) do nothing;
  `);
});

const TABLES = [
  "ai_lab_scenarios",
  "ai_lab_runs",
  "ai_lab_run_events",
  "zapsign_document_templates",
] as const;

describe("RLS do laboratório e dos modelos ZapSign", () => {
  it.each(TABLES)("admin A não lê linhas da org B em %s", (table) => {
    expect(countAs(USER_A, `select count(*) from public.${table} where organization_id='${ORG_B}';`)).toBe(0);
  });

  it.each(TABLES)("admin A mantém controle positivo da própria org em %s", (table) => {
    expect(countAs(USER_A, `select count(*) from public.${table} where organization_id='${ORG_A}';`)).toBeGreaterThanOrEqual(1);
  });
});
