import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { InviteForm } from "./_components/InviteForm";
import { CreateUserForm } from "./_components/CreateUserForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function TeamInvitePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Adicionar membros")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Convide por e-mail ou crie um acesso com senha inicial.")}
        </p>
      </header>
      <Tabs defaultValue="invite" className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="invite">{t("Enviar convite")}</TabsTrigger>
          <TabsTrigger value="password">{t("Criar com senha")}</TabsTrigger>
        </TabsList>
        <TabsContent value="invite" className="mt-6">
          <InviteForm />
        </TabsContent>
        <TabsContent value="password" className="mt-6">
          <CreateUserForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
