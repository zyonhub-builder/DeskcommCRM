import type { Metadata } from "next";

import { carregarPaginaDeTeste } from "./_dados";
import { PortalDeTesteDeAgentes } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Testar agentes" };

export default async function TestesDeAgentePage() {
  const dados = await carregarPaginaDeTeste();
  return <PortalDeTesteDeAgentes {...dados} />;
}
