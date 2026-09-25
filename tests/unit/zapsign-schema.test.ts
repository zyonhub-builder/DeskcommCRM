import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260925130000_0411_zapsign_integracao.sql";

describe("schema ZapSign", () => {
  it("migration e baseline carregam provider, tabela e FKs compostas por organização", () => {
    const migration = readFileSync(MIGRATION, "utf8");
    const baseline = readFileSync("supabase/baseline.sql", "utf8");

    for (const sql of [migration, baseline]) {
      expect(sql).toContain("check (provider in ('nuvemshop', 'vtex', 'shopify', 'zapsign'))");
      expect(sql).toMatch(/webhook_events_log_provider_check check \(provider in \([\s\S]*'zapsign'/);
      expect(sql).toContain("create table if not exists public.zapsign_documents");
      expect(sql).toContain("on public.tenant_integrations (organization_id, id)");
      expect(sql).toContain("on public.crm_leads (organization_id, id)");
      expect(sql).toContain("on public.contacts (organization_id, id)");
      expect(sql).toContain("foreign key (organization_id, integration_id)");
      expect(sql).toContain("foreign key (organization_id, lead_id)");
      expect(sql).toContain("foreign key (organization_id, contact_id)");
      expect(sql).toContain("alter table public.zapsign_documents enable row level security");
      expect(sql).toContain("grant select, insert, update, delete on public.zapsign_documents to authenticated");
    }
  });
});
