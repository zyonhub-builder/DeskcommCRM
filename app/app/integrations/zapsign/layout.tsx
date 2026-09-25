import { notFound } from "next/navigation";

import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ZapSign é módulo opcional da instalação, desligado por padrão. Desligado, a
 * rota some para todo tenant; ligado, a página ainda exige admin da empresa.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!(await moduloLigado(createAdminClient(), "zapsign"))) notFound();
  return children;
}
