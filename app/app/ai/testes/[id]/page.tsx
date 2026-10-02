import type { Metadata } from "next";

import { carregarPaginaDeTeste } from "../_dados";
import { PortalDeTesteDeAgentes } from "../_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Testar agente" };

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TesteDeAgentePage({ params }: Props) {
  const { id } = await params;
  const dados = await carregarPaginaDeTeste(id);
  return <PortalDeTesteDeAgentes {...dados} />;
}
