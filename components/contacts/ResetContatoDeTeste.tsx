"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { resetarContatoDeTeste } from "@/app/actions/contacts/resetarContatoDeTeste";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { CONFIRMACAO_RESET_CONTATO_DE_TESTE } from "@/lib/contacts/resetar-contato-de-teste-contrato";
import { Trash } from "@/lib/ui/icons";

const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Confirmação inválida.",
  unauthenticated: "Sua sessão expirou. Entre de novo para continuar.",
  forbidden_tenant: "Não consegui identificar sua empresa. Recarregue a página.",
  forbidden_role: "Só quem administra esta empresa pode resetar contatos de teste.",
  mfa_required: "Confirme o código do seu aplicativo de duas etapas e tente de novo.",
  ambiente_nao_laboratorio: "Este reset só fica disponível em ambiente de laboratório.",
  confirmacao_nao_confere: "O texto de confirmação não confere.",
  not_found: "Este contato não existe mais.",
  db_error: "Não consegui resetar este contato agora.",
};

interface Props {
  readonly contactId: string;
  readonly displayName: string;
}

export function ResetContatoDeTeste({ contactId, displayName }: Props) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [isPending, startTransition] = useTransition();

  const confirmado = confirmacao.trim() === CONFIRMACAO_RESET_CONTATO_DE_TESTE;

  function fechar(v: boolean) {
    setOpen(v);
    if (!v) setConfirmacao("");
  }

  function handleConfirm() {
    if (!confirmado) return;
    startTransition(async () => {
      const resultado = await resetarContatoDeTeste({
        contactId,
        confirmacao: confirmacao.trim(),
      });

      if (!resultado.ok) {
        toast.error(
          t(ERRO_EM_PORTUGUES[resultado.error] ?? "Não consegui resetar este contato agora."),
        );
        return;
      }

      const c = resultado.counts;
      toast.success(t("Contato de teste resetado."), {
        description: `${c.messages} ${t("mensagens")}, ${c.conversations} ${t("conversas")}, ${c.crm_leads} ${t("negócios")}, ${c.calendar_appointments} ${t("agendamentos")}.`,
      });
      if (c.google_calendar_events_failed > 0) {
        toast.warning(t("O CRM foi resetado, mas o Google recusou apagar um evento da agenda."));
      }

      fechar(false);
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["contact", contactId] });
      router.replace("/app/contacts");
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t("Reset de laboratório")}</CardTitle>
        <CardDescription>
          {t(
            "Apaga este contato e todo o atendimento dele para iniciar um novo teste com o mesmo número. Mantém empresa, funis, agente, WhatsApp, ZapSign e Google conectados.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={open} onOpenChange={fechar}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive">
              <Trash size={16} weight="bold" aria-hidden />
              <span>{t("Resetar contato de teste")}</span>
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Resetar este contato de teste?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("O contato")} <strong>{displayName}</strong>{" "}
                {t(
                  "será removido junto com mensagens, conversas, negócios, documentos ZapSign locais, agendamentos e memória operacional da IA. A auditoria permanece.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2 py-2">
              <Label htmlFor="confirmar-reset-contato-teste">
                {t("Digite")} <strong>{CONFIRMACAO_RESET_CONTATO_DE_TESTE}</strong>{" "}
                {t("para confirmar")}
              </Label>
              <Input
                id="confirmar-reset-contato-teste"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder={CONFIRMACAO_RESET_CONTATO_DE_TESTE}
                autoComplete="off"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirm();
                }}
                disabled={!confirmado || isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending ? t("Resetando…") : t("Resetar e voltar para contatos")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
