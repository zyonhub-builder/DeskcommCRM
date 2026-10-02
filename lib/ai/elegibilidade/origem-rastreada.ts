const CHAVES_DE_ORIGEM_RASTREADA = [
  "ad_platform",
  "ad_source_id",
  "ad_id",
  "campaign_id",
  "campaign_name",
  "source",
  "source_name",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_adset",
  "utm_ad",
  "utm_placement",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
] as const;

export function temOrigemRastreada(meta: unknown): boolean {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return false;
  const obj = meta as Record<string, unknown>;
  return CHAVES_DE_ORIGEM_RASTREADA.some((chave) => {
    const valor = obj[chave];
    return typeof valor === "string" && valor.trim() !== "";
  });
}
