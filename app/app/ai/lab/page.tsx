import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { ambientePermiteResetDeTeste } from "@/lib/lab/ambiente-de-teste";

import { LaboratorioDeJornadasClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Laboratório" };

export default async function LaboratorioDeJornadasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) redirect("/403");

  return (
    <LaboratorioDeJornadasClient
      habilitado={ambientePermiteResetDeTeste(env.NEXT_PUBLIC_APP_URL, env.NODE_ENV)}
    />
  );
}
