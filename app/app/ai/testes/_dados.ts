import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

import type { AgenteDeTeste } from "./_client";

const AGENT_COLUMNS =
  "id, organization_id, name, description, is_active, published_version_id, archived_at, updated_at";
const VERSION_COLUMNS =
  "id, organization_id, agent_id, version_number, status, published_at, created_at";

type AgentRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
  published_version_id: string | null;
  archived_at: string | null;
  updated_at: string | null;
};

type VersionRow = {
  id: string;
  organization_id: string;
  agent_id: string;
  version_number: number;
  status: string;
  published_at: string | null;
  created_at: string | null;
};

export type DadosDaPaginaDeTeste = {
  agentes: AgenteDeTeste[];
  selectedAgentId: string | null;
  titulo: string;
  subtitulo: string;
};

export async function carregarPaginaDeTeste(agentId?: string): Promise<DadosDaPaginaDeTeste> {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data: agentRows, error: agentError } = await supabase
    .from("ai_agents")
    .select(AGENT_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (agentError) {
    logger.error("[ai/testes] não consegui listar os agentes", {
      organization_id: activeOrg.orgId,
      detail: agentError.message.slice(0, 200),
    });
    throw new Error("nao_foi_possivel_listar_agentes_de_teste");
  }

  const agents = (agentRows ?? []) as AgentRow[];
  const publishedIds = agents
    .map((agent) => agent.published_version_id)
    .filter((id): id is string => !!id);

  let versions: VersionRow[] = [];
  if (publishedIds.length > 0) {
    const { data: versionRows, error: versionError } = await supabase
      .from("ai_agent_versions")
      .select(VERSION_COLUMNS)
      .eq("organization_id", activeOrg.orgId)
      .eq("status", "published")
      .in("id", publishedIds);

    if (versionError) {
      logger.error("[ai/testes] não consegui listar versões publicadas", {
        organization_id: activeOrg.orgId,
        detail: versionError.message.slice(0, 200),
      });
      throw new Error("nao_foi_possivel_listar_versoes_de_teste");
    }
    versions = (versionRows ?? []) as VersionRow[];
  }

  const versionsById = new Map(versions.map((version) => [version.id, version]));
  const agentes: AgenteDeTeste[] = agents.map((agent) => {
    const version = agent.published_version_id
      ? versionsById.get(agent.published_version_id)
      : null;
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      is_active: agent.is_active ?? true,
      published_version: version
        ? {
            id: version.id,
            version_number: version.version_number,
          }
        : null,
    };
  });

  const selected =
    agentId === undefined
      ? (agentes.find((agent) => agent.published_version)?.id ?? agentes[0]?.id ?? null)
      : (agentes.find((agent) => agent.id === agentId)?.id ?? null);

  if (agentId !== undefined && !selected) notFound();

  return {
    agentes,
    selectedAgentId: selected,
    titulo: traduzir("Testar agentes", user.idioma),
    subtitulo: traduzir("Converse com uma versão publicada sem abrir a configuração.", user.idioma),
  };
}
