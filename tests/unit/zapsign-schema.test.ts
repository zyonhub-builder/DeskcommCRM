import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260925130000_0411_zapsign_integracao.sql";
const ORIGIN_MIGRATION =
  "supabase/migrations/20260926200000_0414_zapsign_assinatura_preserva_origem.sql";
const TEMPLATES_MIGRATION = "supabase/migrations/20260927090000_0415_zapsign_modelos_documento.sql";

describe("schema ZapSign", () => {
  it("migration e baseline carregam provider, tabela e FKs compostas por organização", () => {
    const migration = readFileSync(MIGRATION, "utf8");
    const baseline = readFileSync("supabase/baseline.sql", "utf8");

    for (const sql of [migration, baseline]) {
      expect(sql).toContain("check (provider in ('nuvemshop', 'vtex', 'shopify', 'zapsign'))");
      expect(sql).toMatch(
        /webhook_events_log_provider_check check \(provider in \([\s\S]*'zapsign'/,
      );
      expect(sql).toContain("create table if not exists public.zapsign_documents");
      expect(sql).toContain("on public.tenant_integrations (organization_id, id)");
      expect(sql).toContain("on public.crm_leads (organization_id, id)");
      expect(sql).toContain("on public.contacts (organization_id, id)");
      expect(sql).toContain("foreign key (organization_id, integration_id)");
      expect(sql).toContain("foreign key (organization_id, lead_id)");
      expect(sql).toContain("foreign key (organization_id, contact_id)");
      expect(sql).toContain("alter table public.zapsign_documents enable row level security");
      expect(sql).toContain(
        "grant select, insert, update, delete on public.zapsign_documents to authenticated",
      );
    }
  });

  it("contrato assinado preserva a origem do atendimento para automações com WhatsApp", () => {
    const migration = readFileSync(ORIGIN_MIGRATION, "utf8");
    const baseline = readFileSync("supabase/baseline.sql", "utf8");

    for (const sql of [migration, baseline]) {
      expect(sql).toContain(
        "p_event_type='zapsign.document_signed' and p_entity_kind='zapsign_document'",
      );
      expect(sql).toContain(
        "e.event_type='zapsign.document_signed' and e.entity_kind='zapsign_document'",
      );
      expect(sql).toContain("from public.zapsign_documents d");
      expect(sql).toContain("public.fn_service_observe_command(v_org_id, v_contact)");
      expect(sql).toContain(
        "public.fn_service_observe_command(e.organization_id, coalesce(d.contact_id,l.contact_id))",
      );
      expect(sql).toContain("not (coalesce(e.payload, '{}'::jsonb) ? 'service_origin')");
    }
  });

  it("modelos de documento têm RLS e vínculo composto com agente da organização", () => {
    const migration = readFileSync(TEMPLATES_MIGRATION, "utf8");
    const baseline = readFileSync("supabase/baseline.sql", "utf8");

    for (const sql of [migration, baseline]) {
      expect(sql).toContain("create table if not exists public.zapsign_document_templates");
      expect(sql).toContain("foreign key (organization_id, agent_id)");
      expect(sql).toContain("references public.ai_agents (organization_id, id)");
      expect(sql).toContain("zapsign_document_templates_org_key_idx");
      expect(sql).toContain("zapsign_document_templates_one_agent_default_idx");
      expect(sql).toContain(
        "alter table public.zapsign_document_templates enable row level security",
      );
      expect(sql).toContain(
        "grant select, insert, update, delete on public.zapsign_document_templates to authenticated",
      );
    }
  });
});
