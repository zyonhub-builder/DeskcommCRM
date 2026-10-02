"use client";

import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { aiAccessUpdateSchema, type AiAccessMode } from "@/lib/ai/elegibilidade/pre-go-live";
import type { WhatsappVoiceMode, WhatsappVoiceSource } from "@/lib/voice/whatsapp-elevenlabs";
import {
  OPENAI_TTS_DEFAULT_VOICE,
  OPENAI_TTS_VOICE_LABELS,
  OPENAI_TTS_VOICE_TONE_LABELS,
  OPENAI_TTS_VOICES,
  type OpenAITtsVoice,
  type WhatsappVoiceProvider,
} from "@/lib/voice/whatsapp-voice-options";

const SEM_CREDENCIAL = "__sem_credencial__";

interface Access {
  mode: AiAccessMode;
  test_phone_numbers: string[];
  campaign_phrases: string[];
  voice: {
    mode: WhatsappVoiceMode;
    provider: WhatsappVoiceProvider;
    credential_id: string | null;
    voice_id: string;
    voice_label: string;
    voice_source: WhatsappVoiceSource;
    cloned_voice_consent: boolean;
    speaker_name: string;
    updated_at: string | null;
  };
  elevenlabs_credentials: {
    id: string;
    provider?: "elevenlabs";
    label: string;
    validated_at: string | null;
    is_active: boolean;
  }[];
  voice_credentials?: {
    id: string;
    provider: WhatsappVoiceProvider;
    label: string;
    validated_at: string | null;
    is_active: boolean;
  }[];
}

/** Mesma porta em todos os tipos de conexão; telefones acessíveis só a administradores. */
export function ChannelAiAccess({
  channelId,
  phoneTesting = true,
}: {
  channelId: string;
  phoneTesting?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["channel-ai-access", channelId],
    queryFn: () =>
      apiClient.get<{ data: Access }>(`/api/v1/channel-sessions/${channelId}/ai-access`),
    refetchOnWindowFocus: !open,
  });
  const mode = query.data?.data.mode;
  return (
    <div className="flex flex-col items-start gap-2">
      {mode && (
        <Badge variant={mode === "open" ? "neutral" : "warning"}>
          {mode === "pre_go_live"
            ? phoneTesting
              ? t("IA em modo de teste")
              : t("IA pausada")
            : mode === "open"
              ? t("IA aberta ao público")
              : t("IA só para campanhas")}
        </Badge>
      )}
      {/* A frase inteira por número, e não `${n} ${t("números…")}` montado por
          pedaços: com um único testador o cartão dizia "1 números de teste
          autorizados" — achado olhando a tela, que é o único jeito de achar
          concordância. E montar por pedaços não sobrevive à tradução: em
          espanhol a forma muda junto. Lista vazia é o estado inicial de todo
          canal novo e merece a frase que diz o que fazer, não um "0". */}
      {mode === "pre_go_live" && (
        <p className="text-xs text-muted-foreground">
          {(() => {
            if (!phoneTesting)
              return t(
                "As mensagens chegam para atendimento humano. A IA está pausada neste canal.",
              );
            const n = query.data?.data.test_phone_numbers.length ?? 0;
            if (n === 0)
              return t("Nenhum número autorizado — a IA não responde ninguém neste canal.");
            if (n === 1) return t("1 número de teste autorizado");
            return `${n} ${t("números de teste autorizados")}`;
          })()}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          void query.refetch();
        }}
      >
        {t("Configurar acesso da IA")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {phoneTesting ? t("Acesso da IA no WhatsApp") : t("Acesso da IA nesta rede")}
            </SheetTitle>
            <SheetDescription>
              {phoneTesting
                ? t("Teste com pessoas de confiança antes de liberar o atendimento automático.")
                : t(
                    "Pause a IA para manter o atendimento humano ou libere as respostas automáticas neste canal.",
                  )}
            </SheetDescription>
          </SheetHeader>
          {query.isFetching ? (
            <p role="status">{t("Carregando…")}</p>
          ) : query.isError ? (
            <div className="flex flex-col gap-3" role="alert">
              <p>{t("Não foi possível carregar o acesso da IA.")}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                {t("Tentar novamente")}
              </Button>
            </div>
          ) : open && query.data ? (
            <AccessForm
              phoneTesting={phoneTesting}
              channelId={channelId}
              initial={query.data.data}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AccessForm({
  channelId,
  initial,
  onClose,
  phoneTesting,
}: {
  channelId: string;
  initial: Access;
  onClose: () => void;
  phoneTesting: boolean;
}) {
  const t = useT();
  const id = useId();
  const qc = useQueryClient();
  const voiceCredentials =
    initial.voice_credentials ??
    initial.elevenlabs_credentials.map((cred) => ({ ...cred, provider: "elevenlabs" as const }));
  const initialVoiceProvider: WhatsappVoiceProvider =
    initial.voice.mode === "off" && voiceCredentials.some((cred) => cred.provider === "openai")
      ? "openai"
      : (initial.voice.provider ?? "elevenlabs");
  const [numbers, setNumbers] = useState(initial.test_phone_numbers.join("\n"));
  const [phrases, setPhrases] = useState(initial.campaign_phrases.join("\n"));
  const [voiceMode, setVoiceMode] = useState<WhatsappVoiceMode>(initial.voice.mode);
  const [voiceProvider, setVoiceProvider] = useState<WhatsappVoiceProvider>(initialVoiceProvider);
  const [voiceCredentialId, setVoiceCredentialId] = useState(
    initial.voice.credential_id ?? SEM_CREDENCIAL,
  );
  const [voiceId, setVoiceId] = useState(
    initialVoiceProvider === "openai" && !initial.voice.voice_id
      ? OPENAI_TTS_DEFAULT_VOICE
      : initial.voice.voice_id,
  );
  const [voiceLabel, setVoiceLabel] = useState(initial.voice.voice_label);
  const [voiceSource, setVoiceSource] = useState<WhatsappVoiceSource>(initial.voice.voice_source);
  const [speakerName, setSpeakerName] = useState(initial.voice.speaker_name);
  const [voiceConsent, setVoiceConsent] = useState(initial.voice.cloned_voice_consent);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const credentialsForProvider = voiceCredentials.filter((cred) => cred.provider === voiceProvider);
  const openAiVoice = OPENAI_TTS_VOICES.includes(voiceId as OpenAITtsVoice)
    ? (voiceId as OpenAITtsVoice)
    : OPENAI_TTS_DEFAULT_VOICE;
  const labelDaVozOpenAI = (voz: OpenAITtsVoice) =>
    `${OPENAI_TTS_VOICE_LABELS[voz]} · ${t(OPENAI_TTS_VOICE_TONE_LABELS[voz])}`;
  const saveCurrentLabel =
    initial.mode === "pre_go_live"
      ? t("Salvar lista de teste")
      : initial.mode === "allowlist"
        ? t("Salvar campanhas")
        : t("Salvar edições");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    setPreviewUrl(null);
  }, [voiceProvider, voiceCredentialId, voiceId]);

  async function save(mode: AiAccessMode) {
    const voiceIdForPayload = voiceProvider === "openai" ? openAiVoice : voiceId;
    const voicePayload = {
      mode: voiceMode,
      provider: voiceProvider,
      credential_id: voiceCredentialId === SEM_CREDENCIAL ? null : voiceCredentialId,
      voice_id: voiceIdForPayload,
      voice_label: voiceProvider === "openai" ? OPENAI_TTS_VOICE_LABELS[openAiVoice] : voiceLabel,
      voice_source: voiceProvider === "openai" ? "library" : voiceSource,
      cloned_voice_consent: voiceProvider === "elevenlabs" && voiceConsent,
      speaker_name: voiceProvider === "elevenlabs" ? speakerName : "",
    };
    if (phoneTesting && voiceMode !== "off") {
      if (!voicePayload.credential_id) {
        setError(t("Escolha a credencial de voz e a voz que será usada."));
        return;
      }
      if (
        voiceProvider === "openai" &&
        !OPENAI_TTS_VOICES.includes(voicePayload.voice_id as OpenAITtsVoice)
      ) {
        setError(t("Escolha uma voz da OpenAI."));
        return;
      }
      if (voiceProvider === "elevenlabs" && voicePayload.voice_id.trim().length < 3) {
        setError(t("Escolha a credencial ElevenLabs e informe o voice_id."));
        return;
      }
      if (
        voiceProvider === "elevenlabs" &&
        voiceSource === "cloned_authorized" &&
        (!voiceConsent || speakerName.trim().length < 2)
      ) {
        setError(t("Confirme a autorização da voz clonada e informe de quem é a voz."));
        return;
      }
    }
    const parsed = aiAccessUpdateSchema.safeParse({
      mode,
      test_phone_numbers: phoneTesting
        ? numbers
            .split("\n")
            .map((n) => n.trim())
            .filter(Boolean)
        : [],
      campaign_phrases: phoneTesting
        ? phrases
            .split("\n")
            .map((frase) => frase.trim())
            .filter(Boolean)
        : [],
    });
    if (!parsed.success) {
      setError(t("Confira os telefones e as frases de campanha."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await apiClient.patch<{ data: Access }>(
        `/api/v1/channel-sessions/${channelId}/ai-access`,
        phoneTesting ? { ...parsed.data, voice: voicePayload } : parsed.data,
      );
      qc.setQueryData(["channel-ai-access", channelId], saved);
      toast.success(t("Acesso da IA atualizado."));
      onClose();
    } catch {
      setError(
        t(
          "Não foi possível confirmar o salvamento. Reabra este painel para conferir a configuração.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function previewVoice() {
    const credentialId = voiceCredentialId === SEM_CREDENCIAL ? null : voiceCredentialId;
    const voiceIdForPreview = voiceProvider === "openai" ? openAiVoice : voiceId.trim();
    if (!credentialId) {
      setError(t("Escolha a credencial de voz e a voz que será usada."));
      return;
    }
    if (voiceProvider === "elevenlabs" && voiceIdForPreview.length < 3) {
      setError(t("Escolha a credencial ElevenLabs e informe o voice_id."));
      return;
    }
    setPreviewBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/channel-sessions/${encodeURIComponent(channelId)}/ai-access/voice-preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: voiceProvider,
            credential_id: credentialId,
            voice_id: voiceIdForPreview,
          }),
        },
      );
      if (!res.ok) throw new Error("preview_failed");
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError(t("Não foi possível gerar a prévia da voz."));
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Badge variant={initial.mode === "open" ? "neutral" : "warning"}>
          {initial.mode === "pre_go_live"
            ? phoneTesting
              ? t("IA em modo de teste")
              : t("IA pausada")
            : initial.mode === "open"
              ? t("IA aberta ao público")
              : t("IA só para campanhas")}
        </Badge>
        <p className="text-sm text-muted-foreground">
          {!phoneTesting
            ? t(
                "Pause a IA para manter o atendimento humano ou libere as respostas automáticas neste canal.",
              )
            : initial.mode === "pre_go_live"
              ? t("Somente os números desta lista podem receber respostas automáticas neste canal.")
              : initial.mode === "open"
                ? t(
                    "A lista de teste não restringe o atendimento enquanto a IA está aberta ao público.",
                  )
                : t(
                    "A IA responde apenas contatos com origem rastreada ou primeira mensagem iniciada por uma frase de campanha.",
                  )}
        </p>
      </div>
      {phoneTesting && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id}>{t("Números autorizados para teste")}</Label>
          <Textarea
            id={id}
            rows={6}
            value={numbers}
            disabled={busy}
            onChange={(e) => {
              setNumbers(e.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-help`}
            placeholder="+5511999998888"
          />
          <p id={`${id}-help`} className="text-sm text-muted-foreground">
            {t(
              "Um telefone com DDI por linha. Lista vazia no modo de teste bloqueia todas as respostas automáticas.",
            )}
          </p>
        </div>
      )}
      {phoneTesting && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-phrases`}>{t("Frases de campanha")}</Label>
          <Textarea
            id={`${id}-phrases`}
            rows={5}
            value={phrases}
            disabled={busy}
            onChange={(e) => {
              setPhrases(e.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
            placeholder={t("Quero falar sobre aposentadoria - campanha setembro")}
          />
          <p className="text-sm text-muted-foreground">
            {t(
              "Uma frase por linha. No modo de campanhas, a primeira mensagem precisa começar com uma delas ou vir de um link rastreável.",
            )}
          </p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {phoneTesting
          ? t(
              "As mensagens continuam chegando ao Inbox, e sua equipe pode responder manualmente. Os testes são mensagens reais no WhatsApp, com os custos normais de uso.",
            )
          : t(
              "As mensagens continuam chegando à caixa de entrada para sua equipe responder. Confira outras automações da conta antes de liberar a IA aqui.",
            )}
      </p>
      <p className="text-sm text-muted-foreground">
        {t(
          "O agente precisa estar publicado e vinculado a este canal. Bloqueios do contato e atendimento humano continuam sendo respeitados.",
        )}
      </p>
      {phoneTesting && (
        <div className="flex flex-col gap-4 border-t pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="font-medium">{t("Atendimento por voz")}</h3>
            <p className="text-sm text-muted-foreground">
              {t(
                "Quando esta opção entra, o agente continua escrevendo a resposta, mas o cliente recebe um áudio no WhatsApp.",
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-voice-mode`}>{t("Quando responder em áudio")}</Label>
            <Select
              value={voiceMode}
              onValueChange={(v) => {
                setVoiceMode(v as WhatsappVoiceMode);
                setError(null);
              }}
              disabled={busy}
            >
              <SelectTrigger id={`${id}-voice-mode`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t("Não responder em áudio")}</SelectItem>
                <SelectItem value="audio_only">{t("Quando o cliente mandar áudio")}</SelectItem>
                <SelectItem value="audio_or_request">
                  {t("Quando o cliente mandar áudio ou pedir áudio")}
                </SelectItem>
                <SelectItem value="literacy_assist">
                  {t("Quando o cliente disser que não sabe ler, manter em áudio")}
                </SelectItem>
                <SelectItem value="always">{t("Sempre nas respostas ao cliente")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {voiceMode !== "off" && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-voice-provider`}>{t("Provedor de voz")}</Label>
                <Select
                  value={voiceProvider}
                  onValueChange={(v) => {
                    const provider = v as WhatsappVoiceProvider;
                    setVoiceProvider(provider);
                    setVoiceCredentialId(SEM_CREDENCIAL);
                    setVoiceSource("library");
                    setVoiceConsent(false);
                    setSpeakerName("");
                    if (provider === "openai") {
                      setVoiceId(OPENAI_TTS_DEFAULT_VOICE);
                      setVoiceLabel(OPENAI_TTS_VOICE_LABELS[OPENAI_TTS_DEFAULT_VOICE]);
                    } else {
                      setVoiceId("");
                      setVoiceLabel("");
                    }
                    setError(null);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id={`${id}-voice-provider`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">{t("OpenAI - vozes prontas")}</SelectItem>
                    <SelectItem value="elevenlabs">{t("ElevenLabs - voz da conta")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-voice-credential`}>{t("Credencial de voz")}</Label>
                <Select
                  value={voiceCredentialId}
                  onValueChange={(v) => {
                    setVoiceCredentialId(v);
                    setError(null);
                  }}
                  disabled={busy || credentialsForProvider.length === 0}
                >
                  <SelectTrigger id={`${id}-voice-credential`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CREDENCIAL}>{t("Escolha uma credencial")}</SelectItem>
                    {credentialsForProvider.map((cred) => (
                      <SelectItem key={cred.id} value={cred.id}>
                        {cred.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {credentialsForProvider.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    <a className="underline underline-offset-4" href="/app/ai/credentials">
                      {voiceProvider === "openai"
                        ? t("Cadastre uma credencial OpenAI em Chaves de acesso à IA.")
                        : t("Cadastre uma credencial ElevenLabs em Chaves de acesso à IA.")}
                    </a>
                  </p>
                )}
              </div>

              {voiceProvider === "openai" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-openai-voice`}>{t("Voz da OpenAI")}</Label>
                  <Select
                    value={openAiVoice}
                    onValueChange={(v) => {
                      const voz = v as OpenAITtsVoice;
                      setVoiceId(voz);
                      setVoiceLabel(OPENAI_TTS_VOICE_LABELS[voz]);
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger id={`${id}-openai-voice`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPENAI_TTS_VOICES.map((voz) => (
                        <SelectItem key={voz} value={voz}>
                          {labelDaVozOpenAI(voz)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${id}-voice-id`}>{t("Voice ID")}</Label>
                      <Input
                        id={`${id}-voice-id`}
                        value={voiceId}
                        disabled={busy}
                        onChange={(e) => {
                          setVoiceId(e.target.value);
                          setError(null);
                        }}
                        placeholder="21m00Tcm4TlvDq8ikWAM"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${id}-voice-label`}>{t("Nome da voz")}</Label>
                      <Input
                        id={`${id}-voice-label`}
                        value={voiceLabel}
                        disabled={busy}
                        onChange={(e) => setVoiceLabel(e.target.value)}
                        placeholder={t("Voz do advogado")}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`${id}-voice-source`}>{t("Origem da voz")}</Label>
                    <Select
                      value={voiceSource}
                      onValueChange={(v) => {
                        setVoiceSource(v as WhatsappVoiceSource);
                        setError(null);
                      }}
                      disabled={busy}
                    >
                      <SelectTrigger id={`${id}-voice-source`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="library">
                          {t("Voz da biblioteca ou conta ElevenLabs")}
                        </SelectItem>
                        <SelectItem value="cloned_authorized">
                          {t("Voz clonada autorizada")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {voiceSource === "cloned_authorized" && (
                    <div className="flex flex-col gap-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-4">
                        <Label htmlFor={`${id}-voice-consent`} className="text-sm">
                          {t("Tenho autorização para usar esta voz")}
                        </Label>
                        <Switch
                          id={`${id}-voice-consent`}
                          checked={voiceConsent}
                          disabled={busy}
                          onCheckedChange={(checked) => {
                            setVoiceConsent(checked);
                            setError(null);
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`${id}-speaker-name`}>{t("De quem é a voz")}</Label>
                        <Input
                          id={`${id}-speaker-name`}
                          value={speakerName}
                          disabled={busy}
                          onChange={(e) => {
                            setSpeakerName(e.target.value);
                            setError(null);
                          }}
                          placeholder={t("Dr. Rafael")}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-2">
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || previewBusy || credentialsForProvider.length === 0}
                    onClick={() => void previewVoice()}
                  >
                    {previewBusy ? t("Gerando prévia…") : t("Ouvir prévia")}
                  </Button>
                </div>
                {previewUrl && <audio className="w-full" controls src={previewUrl} />}
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {phoneTesting && (
          <Button disabled={busy} onClick={() => void save(initial.mode)}>
            {busy ? t("Salvando…") : saveCurrentLabel}
          </Button>
        )}
        {initial.mode !== "pre_go_live" && (
          <Button
            variant={phoneTesting ? "outline" : "default"}
            disabled={busy}
            onClick={() => void save("pre_go_live")}
          >
            {busy
              ? t("Salvando…")
              : !phoneTesting
                ? t("Pausar respostas da IA")
                : t("Ativar modo de teste")}
          </Button>
        )}
        {phoneTesting && initial.mode !== "allowlist" && (
          <Button variant="outline" disabled={busy} onClick={() => void save("allowlist")}>
            {busy ? t("Salvando…") : t("Atender só campanhas")}
          </Button>
        )}
        {initial.mode !== "open" && (
          <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(true)}>
            {t("Liberar atendimento ao público")}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          {t("Cancelar")}
        </Button>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Liberar a IA para o público?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A lista de teste deixará de limitar as respostas. A IA poderá atender qualquer pessoa que enviar mensagem neste canal, respeitando os demais bloqueios.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {phoneTesting ? t("Continuar em teste") : t("Manter IA pausada")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void save("open")}>
              {t("Confirmar liberação")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
