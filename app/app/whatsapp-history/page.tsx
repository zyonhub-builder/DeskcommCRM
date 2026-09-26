import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { historicoDeCanalConfigurado } from "@/lib/channels/history-transport";
import { traduzir } from "@/lib/i18n/dicionario";

import { WhatsappHistoryClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico do WhatsApp" };

export default async function WhatsappHistoryPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const idioma = user.idioma;
  const transportConfigured = historicoDeCanalConfigurado();
  const canStart =
    user.is_platform_admin && !user.support ? true : ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Histórico do WhatsApp", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Importe uma cópia temporária do histórico em uma sessão separada do atendimento.",
            idioma,
          )}
        </p>
      </header>

      <WhatsappHistoryClient canStart={canStart} transportConfigured={transportConfigured} />
    </div>
  );
}
