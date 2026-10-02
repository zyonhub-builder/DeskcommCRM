import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { DiagnosticoComercialClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Diagnóstico comercial" };

export default async function DiagnosticoComercialPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Diagnóstico comercial", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Aquisição, atendimento, funil e custo em uma leitura objetiva para separar origem ruim de processo comercial ruim.",
            idioma,
          )}
        </p>
      </header>

      <DiagnosticoComercialClient />
    </div>
  );
}
