import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { decidirElegibilidadeDaConversa } from "../../lib/ai/elegibilidade/consulta-pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Rode via pnpm test:db");
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
});
const org = randomUUID(),
  outraOrg = randomUUID(),
  canal = randomUUID();
const contato = randomUUID(),
  conversa = randomUUID();
const telefone = "+5511987654321";
const configurar = async (modo: string | null, numeros: (string | null)[] | null, tenant = org) =>
  pool.query("select fn_configurar_pre_go_live_canal($1,$2,$3,$4) as n", [
    tenant,
    canal,
    modo,
    numeros,
  ]);
const configurarComCampanhas = async (
  modo: string,
  numeros: string[],
  frases: string[],
  tenant = org,
) =>
  pool.query("select fn_configurar_pre_go_live_canal($1,$2,$3,$4,$5) as n", [
    tenant,
    canal,
    modo,
    numeros,
    frases,
  ]);
const decidir = () =>
  decidirElegibilidadeDaConversa(pool, {
    organizationId: org,
    conversationId: conversa,
    agora: new Date(),
    ttlMs: 86400000,
  });

beforeAll(async () => {
  for (const id of [org, outraOrg])
    await pool.query(
      "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Teste','Teste')",
      [id],
    );
  await pool.query(
    "insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted,metadata) values($1::uuid,$2,$1::text,'\\x00','{\"transport\":{\"keep\":true}}')",
    [canal, org],
  );
  // A lista existe ANTES do primeiro contato enviar uma mensagem.
  await configurar("pre_go_live", [telefone]);
  await pool.query(
    "insert into contacts(id,organization_id,phone_number,ai_authorized_at) values($1,$2,$3,now())",
    [contato, org, telefone],
  );
  await pool.query(
    "insert into conversations(id,organization_id,contact_id,channel_session_id) values($1,$2,$3,$4)",
    [conversa, org, contato, canal],
  );
});
afterAll(async () => {
  await pool.end();
});

describe("pré-go-live no banco que o self-host instala", () => {
  it("autoriza o primeiro inbound, remove o número e abre sem alterar o histórico", async () => {
    expect((await decidir())?.permite).toBe(true);
    await configurar("pre_go_live", []);
    expect(await decidir()).toMatchObject({ permite: false, motivo: "fora_da_lista_de_teste" });
    await configurar("open", [telefone]);
    expect((await decidir())?.permite).toBe(true);
    const { rows } = await pool.query("select metadata from channel_sessions where id=$1", [canal]);
    // O modo REAL, não o literal 'pre_go_live' (issue #602): abrir ao público
    // tira o canal do pré-go-live. O marcador que ficava para trás devolvia o
    // canal ao modo de teste na ativação seguinte do allowlist por origem.
    expect(rows[0].metadata.ai_gate_mode).toBe("open");
    expect(rows[0].metadata).toMatchObject({
      transport: { keep: true },
      ai_gate: "open",
      ai_test_phone_numbers: [telefone],
    });
  });
  it("modo allowlist restringe por origem autorizada, sem virar pré-go-live", async () => {
    await configurar("allowlist", []);
    expect(await decidir()).toMatchObject({ permite: true, motivo: "autorizado" });
    const { rows } = await pool.query("select metadata from channel_sessions where id=$1", [canal]);
    expect(rows[0].metadata).toMatchObject({ ai_gate: "allowlist", ai_gate_mode: "allowlist" });

    await pool.query("update contacts set ai_authorized_at=null where id=$1", [contato]);
    expect(await decidir()).toMatchObject({ permite: false, motivo: "sem_autorizacao" });
    await pool.query("update contacts set ai_authorized_at=now() where id=$1", [contato]);
  });
  it("sobrecarga com campanhas grava modo e frases de forma atômica", async () => {
    const outroCanal = randomUUID();
    await pool.query(
      `update organizations
          set settings = $2::jsonb
        where id = $1`,
      [
        org,
        JSON.stringify({
          tema: "preservar",
          campanhas_whatsapp: [
            {
              id: "velha",
              match: { tipo: "starts_with", valor: "Frase antiga" },
              channel_session_id: canal,
            },
            {
              id: "outro",
              match: { tipo: "starts_with", valor: "Outro canal" },
              channel_session_id: outroCanal,
            },
            { id: "global", match: { tipo: "contains", valor: "Global" } },
          ],
        }),
      ],
    );

    const result = await configurarComCampanhas(
      "allowlist",
      [],
      [" Quero   BPC ", "Quero BPC", "Campanha previdenciária"],
    );
    expect(result.rows[0].n).toBe(1);

    const { rows } = await pool.query(
      "select metadata, settings from channel_sessions join organizations on organizations.id = channel_sessions.organization_id where channel_sessions.id=$1",
      [canal],
    );
    expect(rows[0].metadata).toMatchObject({ ai_gate: "allowlist", ai_gate_mode: "allowlist" });
    expect(rows[0].settings.tema).toBe("preservar");
    expect(rows[0].settings.campanhas_whatsapp).toEqual([
      expect.objectContaining({ id: "outro", channel_session_id: outroCanal }),
      expect.objectContaining({ id: "global" }),
      expect.objectContaining({
        match: { tipo: "starts_with", valor: "Quero BPC" },
        channel_session_id: canal,
      }),
      expect.objectContaining({
        match: { tipo: "starts_with", valor: "Campanha previdenciária" },
        channel_session_id: canal,
      }),
    ]);
  });
  it("não altera canal de outra organização", async () => {
    expect((await configurar("pre_go_live", [], outraOrg)).rows[0].n).toBe(0);
    expect(
      await decidirElegibilidadeDaConversa(pool, {
        organizationId: outraOrg,
        conversationId: conversa,
        agora: new Date(),
        ttlMs: 1,
      }),
    ).toBeNull();
  });
  it("não expõe a RPC a anon nem a membros; somente service_role", async () => {
    const { rows } = await pool.query(`select
      has_function_privilege('anon','fn_configurar_pre_go_live_canal(uuid,uuid,text,text[])','execute') as anon,
      has_function_privilege('authenticated','fn_configurar_pre_go_live_canal(uuid,uuid,text,text[])','execute') as membro,
      has_function_privilege('service_role','fn_configurar_pre_go_live_canal(uuid,uuid,text,text[])','execute') as servidor,
      has_function_privilege('anon','fn_configurar_pre_go_live_canal(uuid,uuid,text,text[],text[])','execute') as anon_campanhas,
      has_function_privilege('authenticated','fn_configurar_pre_go_live_canal(uuid,uuid,text,text[],text[])','execute') as membro_campanhas,
      has_function_privilege('service_role','fn_configurar_pre_go_live_canal(uuid,uuid,text,text[],text[])','execute') as servidor_campanhas`);
    expect(rows[0]).toEqual({
      anon: false,
      membro: false,
      servidor: true,
      anon_campanhas: false,
      membro_campanhas: false,
      servidor_campanhas: true,
    });
  });
  it("recusa entradas nulas ou inválidas sem abrir o canal", async () => {
    await configurar("pre_go_live", []);
    for (const [modo, numeros] of [
      [null, []],
      ["invalido", []],
      ["open", null],
      ["open", [null]],
      ["open", ["telefone"]],
    ] as const) {
      await expect(configurar(modo, numeros === null ? null : [...numeros])).rejects.toMatchObject({
        code: "22023",
      });
    }
    expect((await decidir())?.permite).toBe(false);
  });
  it("preserva a restrição em reconexão e ignora canais arquivados", async () => {
    await pool.query("update channel_sessions set status='STOPPED' where id=$1", [canal]);
    expect((await decidir())?.permite).toBe(false);
    await pool.query("update channel_sessions set archived_at=now() where id=$1", [canal]);
    expect((await configurar("open", [])).rows[0].n).toBe(0);
  });
});
