import { describe, expect, it } from "vitest";

import { temOrigemRastreada } from "./origem-rastreada";

describe("origem rastreável para autorizar IA por campanha", () => {
  it("aceita sinais fortes de anúncio, UTM e clique", () => {
    for (const meta of [
      { ad_platform: "meta_ads" },
      { campaign_id: "camp-1" },
      { campaign_name: "Aposentadoria setembro" },
      { utm_campaign: "previdenciario-setembro" },
      { utm_medium: "cpc" },
      { utm_content: "criativo-a" },
      { gclid: "Cj0KCQjw" },
      { fbclid: "IwAR" },
    ]) {
      expect(temOrigemRastreada(meta)).toBe(true);
    }
  });

  it("recusa metadata vazia, malformada ou de outra origem", () => {
    for (const meta of [null, {}, [], { origem: "importacao" }, { utm_campaign: "   " }]) {
      expect(temOrigemRastreada(meta)).toBe(false);
    }
  });
});
