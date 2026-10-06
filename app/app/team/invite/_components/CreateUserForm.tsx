"use client";

import { useState } from "react";
import { toast } from "sonner";

import { InterfaceEditor } from "@/components/team/InterfaceEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { useCreateTeamUser } from "@/hooks/team/useCreateTeamUser";
import {
  INTERFACE_COMPLETA,
  interfaceSettingsSchema,
  interfaceTemDestino,
} from "@/lib/navigation/interface";
import { ROLES, type Role } from "@/lib/schemas/team";

export function CreateUserForm() {
  const t = useT();
  const createUser = useCreateTeamUser();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [settings, setSettings] = useState(INTERFACE_COMPLETA);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  const settingsOk =
    interfaceSettingsSchema.safeParse(settings).success && interfaceTemDestino(settings, role);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error(t("Informe o email."));
      return;
    }
    if (password.length < 8) {
      toast.error(t("A senha precisa ter pelo menos 8 caracteres."));
      return;
    }
    if (password !== passwordConfirm) {
      toast.error(t("As senhas não conferem."));
      return;
    }

    try {
      const res = await createUser.mutateAsync({
        email: normalizedEmail,
        full_name: fullName.trim() || undefined,
        password,
        role,
        interface_settings: settings,
      });
      setCreatedEmail(res.data.email);
      toast.success(t("Usuário criado com acesso liberado."));
      setEmail("");
      setFullName("");
      setPassword("");
      setPasswordConfirm("");
    } catch {
      /* showApiError handled */
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,2fr]">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="create-user-name">{t("Nome")}</Label>
          <Input
            id="create-user-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("Maria Silva")}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-user-email">Email</Label>
          <Input
            id="create-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@empresa.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-user-password">{t("Senha inicial")}</Label>
          <Input
            id="create-user-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-user-password-confirm">{t("Confirmar senha")}</Label>
          <Input
            id="create-user-password-confirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-user-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="create-user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <InterfaceEditor
          value={settings}
          onChange={setSettings}
          role={role}
          disabled={createUser.isPending}
        />
        <Button type="submit" disabled={createUser.isPending || !settingsOk}>
          {createUser.isPending ? t("Criando…") : t("Criar usuário")}
        </Button>
      </form>

      <div className="space-y-4">
        {createdEmail ? (
          <section>
            <h2 className="text-sm font-semibold">{t("Criado")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {createdEmail} {t("já pode entrar com a senha definida.")}
            </p>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("O usuário aparece em Membros assim que for criado.")}
          </p>
        )}
      </div>
    </div>
  );
}
