# Guia de funcionalidades do app Dev

> Rascunho-fonte para PDF, roteiro de apresentação e planejamento de tutoriais.
> Levantado em 2026-09-29 a partir da árvore local do app Dev, principalmente
> `lib/navigation/catalogo.ts`, `components/admin/AdminSidebar.tsx`,
> `docs/features/`, PRDs e páginas em `app/app/**` e `app/admin/**`.
>
> Este documento descreve o que o produto expõe ou prepara no app. Antes de
> virar PDF público, valide os fluxos prioritários em tela e marque evidências
> reais: uma tela existente não é, sozinha, prova de uma jornada didática.

## Como usar este guia

Este arquivo não é só um mapa de telas. Ele cruza duas perguntas:

1. **Que necessidade do cliente o produto resolve?**
2. **Qual funcionalidade entrega essa necessidade, onde fica e como demonstrar?**

Para transformar em PDF, mantenha este Markdown como fonte. Depois, escolha as
seções que vão para cada saída:

- **PDF comercial:** use visão geral, necessidades, roteiro de demonstração e
  funcionalidades prioritárias.
- **PDF de treinamento:** use catálogo detalhado, papéis, caminhos no app e
  tutoriais sugeridos.
- **Página/help center:** gere uma página depois que a taxonomia estiver estável.
  A página deve nascer do conteúdo já validado aqui, não antes.

### Legenda de status

| Status                  | Significado                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| **Visível no app**      | Existe rota ou entrada de navegação no app do tenant ou no admin de plataforma.         |
| **Módulo opcional**     | Só aparece quando o dono da instalação liga o módulo correspondente.                    |
| **Admin da instalação** | Funcionalidade transversal da VPS/instalação, fora da organização do cliente.           |
| **Backstage técnico**   | Funcionalidade de base: API, worker, auditoria, cron, RLS, webhook ou contrato técnico. |
| **Validar em tela**     | Existe evidência de código, mas o roteiro final precisa ser provado por navegação real. |

## Visão curta

O app Dev é um sistema operacional de vendas para negócios que vendem
conversando, principalmente pelo WhatsApp. Ele combina:

- atendimento humano e IA no mesmo histórico;
- CRM com funis, contatos, tarefas, campanhas e produtos;
- agentes de IA configuráveis com conhecimento, ferramentas, roteadores,
  follow-ups, testes, orçamento e observabilidade;
- canais e integrações, incluindo WhatsApp por QR, canal oficial da Meta,
  Nuvemshop, ZapSign, webhooks, API tokens e dados externos;
- análise comercial, métricas, atividades, faturamento, Meta Ads e evolução da
  IA;
- governança de equipe, papéis, auditoria, LGPD, multi-tenant e admin de
  plataforma;
- operação self-host com marca própria, módulos opcionais e configuração da
  instalação.

## Necessidades do cliente -> funcionalidades

| Necessidade                                       | Funcionalidades que resolvem                                                                                                       | Como demonstrar                                                                                | Tutorial prioritário                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Atender leads no WhatsApp sem perder histórico    | Inbox, mensagens rápidas, conexões WhatsApp, contatos, notas, anexos, pausa/retomada da IA, transferência e fechamento de conversa | Abrir uma conversa, responder, adicionar nota, transferir ou pausar IA, abrir ficha do contato | **Como atender um lead no Inbox**             |
| Ter IA respondendo, qualificando e operando o CRM | Agentes, conhecimento, memória, skills, ferramentas, roteadores, handoff, painel de segurança, testes e execuções                  | Criar ou abrir agente, mostrar prompt, ferramentas, base, teste e histórico de execução        | **Como criar e publicar um agente de IA**     |
| Ensinar o agente sobre o negócio                  | Conhecimento, memória, skills, produtos, dados externos, Nuvemshop, fontes RAG                                                     | Subir uma fonte, reindexar, testar pergunta e comparar resposta                                | **Como subir a base de conhecimento**         |
| Nenhum lead morrer no silêncio                    | Radar, follow-ups, fila de follow-up, snooze, tarefas, alertas da IA                                                               | Mostrar conversa fria, criar follow-up, pausar/retomar inscrição, revisar fila                 | **Como configurar follow-up automático**      |
| Organizar oportunidades em funis                  | Funis, quadro do funil, etapas, motivos de perda, vocabulário por negócio, contatos e leads                                        | Abrir funil, mover lead, editar etapas e mostrar histórico no contato                          | **Como montar e operar um funil**             |
| Prospectar novos clientes                         | Prospecção nativa, enriquecimento comercial, campanha com IA, criação de agente por conversa                                       | Buscar empresas, revisar candidatos, preparar abordagem e iniciar fila com limites             | **Como fazer uma campanha de prospecção**     |
| Disparar campanhas com controle                   | Campanhas, templates, conexões, supressões, ritmo do número, métricas da campanha                                                  | Criar campanha, selecionar público, pré-visualizar mensagem, iniciar e acompanhar              | **Como criar campanha sem ferir o canal**     |
| Agendar serviços e acompanhar agenda              | Agenda, tipos de agendamento, disponibilidade da equipe, Google Agenda, avisos                                                     | Mostrar calendário, criar tipo de atendimento e vincular agenda Google                         | **Como configurar a agenda da empresa**       |
| Medir vendas, equipe e canais                     | Desempenho, diagnóstico comercial, atividades, Meta Ads, faturamento, atrito, perdas e previsão                                    | Abrir Análise, cruzar origem, atendimento, funil, custo e faturamento                          | **Como ler os indicadores de vendas**         |
| Saber de onde veio cada lead                      | Conversões, Meta Ads, trackeamento por campanha/conjunto/anúncio, ficha do contato                                                 | Configurar captura, abrir contato e ver origem/campanha/anúncio                                | **Como rastrear origem de leads do WhatsApp** |
| Integrar outros sistemas                          | Webhooks, API tokens, dados externos, MCP interno, Nuvemshop, ZapSign                                                              | Criar token, configurar webhook, consultar dado externo pelo agente                            | **Como conectar o CRM a outro sistema**       |
| Controlar acesso e operação da equipe             | Equipe, convites, papéis, capacidade, distribuição de atendimento, tags, auditoria                                                 | Convidar usuário, ajustar papel/capacidade e demonstrar visibilidade                           | **Como configurar equipe e permissões**       |
| Cumprir LGPD e auditoria                          | LGPD, exportação, anonimização/redact, consentimento, audit log, retenção                                                          | Abrir pedido LGPD, acompanhar status e mostrar trilha auditável                                | **Como responder solicitação LGPD**           |
| Operar uma instalação self-host                   | Admin plataforma, tenants, instâncias, incidentes, uso, marca, e-mail, cadastro, módulos e saúde                                   | Abrir admin, mostrar tenant, saúde, sessão de suporte e configuração da instalação             | **Como administrar a VPS/instalação**         |
| Vender com marca própria                          | Marca da organização, marca da instalação, white-label, e-mails, favicon, identidade visual                                        | Alterar nome/cor/logo em ambiente de teste e mostrar reflexo no app                            | **Como configurar marca própria**             |

## Trilhas recomendadas de tutorial

### Trilha 1 — Primeira venda operada pelo sistema

1. Conectar WhatsApp em **Canais -> Conexões**.
2. Criar ou revisar um agente em **Agente de IA -> Agentes**.
3. Subir conhecimento em **Agente de IA -> Conhecimento**.
4. Receber conversa no **Inbox**.
5. Criar ou vincular contato.
6. Mover lead no **Funil**.
7. Criar tarefa ou follow-up.
8. Ler resultado em **Análise -> Desempenho**.

### Trilha 2 — Montagem de um cliente novo

1. Configurar organização, marca, equipe e papéis.
2. Configurar WhatsApp, agenda e canais.
3. Criar funil e etapas com vocabulário do nicho.
4. Criar agente, ferramentas, roteador e handoff.
5. Subir conhecimento e testar perguntas reais.
6. Criar follow-up e respostas rápidas.
7. Provar uma jornada completa de lead.

### Trilha 3 — Gestão e otimização

1. Ver **Diagnóstico comercial** para separar origem, atendimento, funil e custo.
2. Ver **Desempenho**, **Atividades**, **Meta Ads** e **Faturamento**.
3. Revisar **Execuções**, **Uso e orçamento** e **Evolução da IA**.
4. Decidir melhorias em **Propostas** ou no prompt do agente.
5. Revisar **Audit Log**, **LGPD** e incidentes quando houver risco.

### Trilha 4 — Instalação e operação da plataforma

1. Criar tenant no admin de plataforma.
2. Definir cadastro, e-mail, marca e comportamento da instalação.
3. Configurar credenciais globais: Google, Meta, SMTP e destinos internos.
4. Ligar módulos opcionais quando fizer sentido.
5. Acompanhar saúde, uso, incidentes e auditoria.

## Catálogo detalhado por área

### Atendimento

#### Inbox

- **O que faz:** centraliza conversas, mensagens, notas, anexos, rascunhos,
  transferência, encerramento, pausa/retomada da IA e histórico do contato.
- **Onde fica:** `/app/inbox`.
- **Para quem serve:** atendente, vendedor, gerente e dono que querem operar a
  conversa real.
- **Valor:** mostra que o produto não é só cadastro; é onde a venda acontece.
- **Demonstração ideal:** abrir conversa recebida, responder, adicionar nota,
  consultar histórico e transferir/pausar IA.
- **Tutorial sugerido:** "Como atender uma conversa do WhatsApp no Inbox".
- **Status:** Visível no app.

#### Mensagens rápidas flutuantes

- **O que faz:** botão de mensagens acompanha a navegação autenticada, permite
  buscar contato, ler e responder sem sair da tela atual.
- **Onde fica:** shell autenticado, como painel flutuante.
- **Valor:** reduz troca de contexto para atendente que está em funil,
  configurações ou análise.
- **Demonstração ideal:** abrir painel em outra tela, responder, minimizar e
  ampliar para o Inbox completo.
- **Tutorial sugerido:** "Como responder sem sair da tela em que você está".
- **Status:** Visível no app; usa as mesmas APIs e limites do Inbox.

#### Radar

- **O que faz:** mostra conversas ou oportunidades abertas que esfriaram e
  correm risco de morrer sem resposta.
- **Onde fica:** `/app/radar`.
- **Valor:** transforma silêncio em fila de trabalho.
- **Demonstração ideal:** filtrar itens em risco e abrir uma conversa para ação.
- **Tutorial sugerido:** "Como recuperar atendimentos parados".
- **Status:** Visível no app.

#### Agenda

- **O que faz:** mostra o que está marcado, com quem, quem atende e a agenda da
  equipe.
- **Onde fica:** `/app/agenda`.
- **Funcionalidades relacionadas:** tipos de agendamento, disponibilidade de
  atendentes, endereços, exceções, Google Agenda e lembretes.
- **Valor:** atende clínicas, serviços e qualquer operação que venda horário.
- **Demonstração ideal:** criar compromisso, mostrar agenda da equipe e vínculo
  com tipo de atendimento.
- **Tutorial sugerido:** "Como usar a agenda no atendimento".
- **Status:** Visível no app.

#### Respostas rápidas

- **O que faz:** scripts salvos para acelerar respostas, individuais ou da
  equipe, consumidos pelo compositor do Inbox.
- **Onde fica:** `/app/templates`.
- **Valor:** padroniza atendimento sem depender de copiar e colar fora do app.
- **Demonstração ideal:** criar resposta, buscar no Inbox e inserir no texto.
- **Tutorial sugerido:** "Como criar respostas rápidas para a equipe".
- **Status:** Visível no app.

### CRM e venda

#### CRM Hub

- **O que faz:** inventário das telas de venda: uso diário, preparação da venda
  e guias de extensões.
- **Onde fica:** `/app/crm`.
- **Valor:** ajuda o usuário a descobrir o que existe sem inflar o menu lateral.
- **Demonstração ideal:** abrir o hub e explicar a diferença entre operar o dia e
  preparar o sistema.
- **Status:** Visível no app.

#### Prospecção nativa

- **O que faz:** pesquisa empresas por segmento/região, consulta dados
  comerciais, prepara campanha, cria contato/negócio e permite abordagem com IA.
- **Onde fica:** `/app/prospecting`.
- **Recursos importantes:** chave Apify por organização, limite de custo por
  execução, enriquecimento sem buscar pessoa física, criação de agente por
  conversa, teste como cliente e fila com limites de envio.
- **Valor:** substitui fluxos externos com n8n/Airtable por uma operação nativa
  no CRM.
- **Demonstração ideal:** buscar empresas, revisar candidatos, configurar agente,
  publicar e iniciar primeira abordagem.
- **Tutorial sugerido:** "Como rodar uma campanha de prospecção com IA".
- **Status:** Visível no app; validar em tela antes de PDF.

#### Funis

- **O que faz:** lista funis de venda, abre o quadro de clientes/oportunidades e
  permite importar planilha conforme papel.
- **Onde fica:** `/app/kanban` e `/app/pipelines/[id]`.
- **Recursos importantes:** funis ativos/arquivados, leitura ampla, gestão por
  gerente, quadro com etapas e movimentação.
- **Valor:** traduz conversa em oportunidade acompanhável.
- **Demonstração ideal:** abrir funil, arrastar lead entre etapas, arquivar ou
  criar funil se permitido.
- **Tutorial sugerido:** "Como organizar oportunidades no funil".
- **Status:** Visível no app.

#### Etapas do funil

- **O que faz:** configura colunas de cada funil, vocabulário do negócio e
  motivos de perda.
- **Onde fica:** `/app/settings/tenant/pipelines`, exposta no hub de CRM.
- **Valor:** adapta o mesmo CRM para clínica, imobiliária, agência, serviço ou
  e-commerce.
- **Demonstração ideal:** renomear etapas e mostrar como isso aparece no quadro.
- **Tutorial sugerido:** "Como montar o funil do seu nicho".
- **Status:** Visível no app.

#### Contatos e Customer 360

- **O que faz:** lista pessoas atendidas, histórico, dados de contato, origem,
  propostas, roteiros, timeline e resumo CRM.
- **Onde fica:** `/app/contacts` e `/app/contacts/[id]`.
- **Valor:** preserva relacionamento mesmo quando troca atendente ou canal.
- **Demonstração ideal:** abrir contato vindo do Inbox, ver timeline, origem e
  vínculos com conversas/leads.
- **Tutorial sugerido:** "Como usar a ficha do cliente".
- **Status:** Visível no app.

#### Tarefas

- **O que faz:** registra combinados com prazo, responsáveis e itens vencidos.
- **Onde fica:** `/app/tasks`.
- **Valor:** evita que promessas feitas no atendimento morram fora do sistema.
- **Demonstração ideal:** criar tarefa a partir de um contato ou conversa e
  mostrar vencimentos.
- **Tutorial sugerido:** "Como criar tarefas de pós-atendimento".
- **Status:** Visível no app.

#### Produtos

- **O que faz:** mantém catálogo e preços que a IA consulta para responder sobre
  o que a empresa vende.
- **Onde fica:** `/app/products`, no hub de CRM.
- **Valor:** torna respostas de preço/produto rastreáveis e editáveis pelo
  negócio.
- **Demonstração ideal:** cadastrar produto, testar pergunta no agente.
- **Tutorial sugerido:** "Como ensinar produtos e preços para a IA".
- **Status:** Visível no app.

#### Campanhas

- **O que faz:** cria abordagens para listas de contatos, usando conexão,
  templates, público, ritmo, métricas e supressões.
- **Onde fica:** `/app/campaigns`, `/app/campaigns/new`,
  `/app/campaigns/[id]`, `/app/campaigns/settings`.
- **Valor:** permite comunicação ativa sem confundir campanha com atendimento
  individual.
- **Demonstração ideal:** criar campanha, pré-visualizar, iniciar, pausar e ver
  métricas.
- **Tutorial sugerido:** "Como criar uma campanha com segurança".
- **Status:** Visível no app.

#### Comandas

- **O que faz:** registra o que foi feito, por quem e quanto o cliente paga.
- **Onde fica:** `/app/comandas`.
- **Valor:** útil para balcão, clínica, serviços e operações em que atendimento
  vira lançamento financeiro.
- **Demonstração ideal:** abrir comanda, lançar item e mostrar vínculo com
  faturamento.
- **Tutorial sugerido:** "Como usar comandas no atendimento".
- **Status:** Visível no app.

#### Chamadas

- **O que faz:** histórico de ligações com transcrição, ligado ao módulo de voz.
- **Onde fica:** `/app/calls`.
- **Valor:** amplia o histórico do cliente para além de texto.
- **Demonstração ideal:** abrir ligação, ver transcrição e vínculo com contato.
- **Tutorial sugerido:** "Como consultar ligações e transcrições".
- **Status:** Visível no app; depende da configuração de voz/telefonia.

### Agente de IA

#### Hub de IA

- **O que faz:** reúne montagem, ensino e acompanhamento do agente.
- **Onde fica:** `/app/ai`.
- **Valor:** deixa claro que IA não é uma tela isolada; é um ciclo de configurar,
  ensinar, testar, operar e melhorar.
- **Demonstração ideal:** abrir o hub e percorrer as seções.
- **Status:** Visível no app.

#### Agentes

- **O que faz:** cria e edita atendentes de IA: instruções, estilo, modelo,
  credencial, ferramentas, funis, bases, handoff, segurança, publicação e
  histórico de versões.
- **Onde fica:** `/app/ai/agents`, `/app/ai/agents/new`,
  `/app/ai/agents/[id]`.
- **Recursos importantes:** painel do operador, ferramentas, uso de capacidades,
  prompts versionados, teste, execução, diffs, publicação e recuperação de legado.
- **Valor:** coloca a IA como operador configurável, não chatbot genérico.
- **Demonstração ideal:** abrir agente publicado, mostrar abas principais, rodar
  teste e ver trace.
- **Tutorial sugerido:** "Como criar, testar e publicar um agente".
- **Status:** Visível no app.

#### Roteadores

- **O que faz:** decide qual agente pega qual conversa e quando humano assume.
- **Onde fica:** `/app/ai/routers` e `/app/ai/routers/[id]`.
- **Valor:** permite vários agentes especializados sem quebrar continuidade.
- **Demonstração ideal:** criar regra, testar roteamento e mostrar membros.
- **Tutorial sugerido:** "Como rotear conversas entre agentes".
- **Status:** Visível no app.

#### Follow-ups

- **O que faz:** fluxos para retomar conversas frias: espera, condição, coleta,
  classificação, ação, skill, repetição, match de resposta, fim e publicação.
- **Onde fica:** `/app/ai/followups`, `/app/ai/followups/[id]`,
  `/app/ai/followups/enrollments/[id]`.
- **Valor:** fecha o laço de continuidade: lead sem resposta vira próximo passo.
- **Demonstração ideal:** criar fluxo simples de silêncio, publicar, abrir uma
  inscrição e pausar/retomar.
- **Tutorial sugerido:** "Como criar um follow-up automático".
- **Status:** Visível no app.

#### Fluxos de atendimento

- **O que faz:** roteiros de perguntas que a IA conduz durante a conversa,
  salvando respostas na ficha do cliente.
- **Onde fica:** `/app/ai/atendimento`.
- **Valor:** útil para qualificação estruturada por nicho.
- **Demonstração ideal:** montar roteiro de clínica/imobiliária e mostrar dados
  preenchidos.
- **Tutorial sugerido:** "Como criar roteiro de atendimento da IA".
- **Status:** Módulo opcional.

#### Conhecimento

- **O que faz:** gerencia materiais que o agente consulta antes de responder.
- **Onde fica:** `/app/ai/knowledge/sources`.
- **Recursos importantes:** upload, fontes, trechos, reindexação e chave de
  conhecimento.
- **Valor:** reduz alucinação e centraliza FAQ, políticas e documentos.
- **Demonstração ideal:** subir material, reindexar, ver trechos e testar pergunta.
- **Tutorial sugerido:** "Como subir uma base de conhecimento".
- **Status:** Visível no app.

#### Memória

- **O que faz:** mostra e versiona aprendizados que o agente reaproveita sobre a
  operação.
- **Onde fica:** `/app/ai/memory`.
- **Valor:** dá visibilidade ao que a IA aprendeu e permite revisão.
- **Demonstração ideal:** abrir entradas e versões, explicar de onde veio o
  aprendizado.
- **Tutorial sugerido:** "Como revisar a memória do agente".
- **Status:** Visível no app.

#### Skills

- **O que faz:** lista, importa, instala, restaura e versiona ações que o agente
  pode executar sozinho.
- **Onde fica:** `/app/ai/skills`.
- **Valor:** transforma IA em operador com ferramentas controladas.
- **Demonstração ideal:** abrir skill, explicar permissão e mostrar versão.
- **Tutorial sugerido:** "Como escolher o que o agente pode fazer".
- **Status:** Visível no app.

#### Testar agentes

- **O que faz:** permite conversar com agentes publicados sem abrir o editor de
  configuração.
- **Onde fica:** `/app/ai/testes`.
- **Valor:** dá teste rápido para dono/gestor sem mexer na configuração.
- **Demonstração ideal:** selecionar agente, enviar pergunta real e revisar
  resposta.
- **Tutorial sugerido:** "Como testar o agente como cliente".
- **Status:** Visível no app Dev local.

#### Casos

- **O que faz:** lista atendimentos conduzidos pelo agente, do início ao desfecho.
- **Onde fica:** `/app/ai/cases`.
- **Valor:** torna a operação da IA auditável pelo gestor.
- **Demonstração ideal:** abrir caso, ver conversa, decisão e desfecho.
- **Tutorial sugerido:** "Como revisar casos conduzidos pela IA".
- **Status:** Visível no app.

#### Alertas da IA

- **O que faz:** centraliza o que a IA encontrou e precisa de decisão humana.
- **Onde fica:** `/app/ai/inbox`.
- **Valor:** impede que o agente abra uma pendência sem dono.
- **Demonstração ideal:** abrir alerta, decidir, resolver todos quando aplicável.
- **Tutorial sugerido:** "Como tratar alertas da IA".
- **Status:** Visível no app.

#### Aviso no WhatsApp

- **O que faz:** envia aviso no WhatsApp quando o assistente abre um caso.
- **Onde fica:** `/app/ai/cases/avisos`.
- **Valor:** leva pendências críticas para o canal onde o operador está.
- **Demonstração ideal:** configurar número, testar aviso.
- **Tutorial sugerido:** "Como receber alertas da IA no WhatsApp".
- **Status:** Visível no app; admin da organização.

#### Propostas de melhoria

- **O que faz:** mostra melhorias que a IA sugere para si mesma, aguardando
  decisão humana.
- **Onde fica:** `/app/ai/proposals`.
- **Valor:** materializa o flywheel de melhoria com gate humano.
- **Demonstração ideal:** abrir proposta, aplicar ou rejeitar.
- **Tutorial sugerido:** "Como aprovar melhorias sugeridas pela IA".
- **Status:** Visível no app.

#### Execuções

- **O que faz:** mostra o que a IA fez e, quando falhou, o que aconteceu e o que
  fazer.
- **Onde fica:** `/app/ai/runs`.
- **Valor:** responde "por que o agente parou ou errou?".
- **Demonstração ideal:** abrir execução, ver falha, trace e ação recomendada.
- **Tutorial sugerido:** "Como diagnosticar erro do agente".
- **Status:** Visível no app.

#### Laboratório

- **O que faz:** roda conversas reais de teste no ritmo humano e compara o que
  aconteceu.
- **Onde fica:** `/app/ai/lab`.
- **Valor:** serve para simular atendimento antes de expor cliente real.
- **Demonstração ideal:** criar cenário, rodar e analisar.
- **Tutorial sugerido:** "Como simular conversa antes de publicar".
- **Status:** Visível no app.

#### Uso e orçamento

- **O que faz:** mostra consumo de IA e teto de gasto mensal.
- **Onde fica:** `/app/ai/usage`.
- **Valor:** protege instalação self-host de custo invisível.
- **Demonstração ideal:** mostrar consumo por período e teto.
- **Tutorial sugerido:** "Como controlar gasto de IA".
- **Status:** Visível no app.

#### Credenciais e provedores

- **O que faz:** cadastra chaves de provedores, valida credenciais, escolhe
  provedor/modelos e permite provedor personalizado compatível com OpenAI.
- **Onde fica:** `/app/ai/credentials` e `/app/ai/providers`.
- **Valor:** separa chave, provedor, modelo e uso por parte do sistema.
- **Demonstração ideal:** cadastrar credencial de teste, validar, escolher no
  agente e explicar fallback.
- **Tutorial sugerido:** "Como conectar uma IA ao CRM".
- **Status:** Visível no app.

#### Assistente de voz

- **O que faz:** configura integração opcional com ElevenLabs Agents no editor do
  agente, com teste por microfone e áudio do navegador.
- **Onde fica:** editor de agente, painel de assistente de voz.
- **Valor:** prepara atendimento por voz sem misturar publicação do agente de
  texto.
- **Demonstração ideal:** configurar voz, idioma e primeira mensagem; testar no
  navegador.
- **Tutorial sugerido:** "Como testar assistente de voz".
- **Status:** Validar em tela; integração opcional.

### Canais e integrações

#### Conexões

- **O que faz:** conecta números de WhatsApp por QR, canal oficial da Meta,
  templates, saúde, reconexão e, quando disponível, chamada/voz.
- **Onde fica:** `/app/connections`.
- **Valor:** é a porta principal de entrada e saída das conversas.
- **Demonstração ideal:** conectar número, ver QR/status, abrir aba oficial e
  templates.
- **Tutorial sugerido:** "Como conectar WhatsApp".
- **Status:** Visível no app.

#### Canal oficial da Meta

- **O que faz:** configura canal oficial, templates e webhook da Meta usando
  credenciais da instalação.
- **Onde fica:** subabas de `/app/connections`; rotas antigas redirecionam para
  Conexões.
- **Valor:** oferece caminho oficial além do QR.
- **Demonstração ideal:** mostrar que templates ficam junto do canal oficial.
- **Tutorial sugerido:** "Como usar o canal oficial da Meta".
- **Status:** Visível no app; parte da configuração global fica no admin.

#### Nuvemshop

- **O que faz:** conecta loja para trazer pedidos e clientes para dentro do CRM.
- **Onde fica:** `/app/integrations/nuvemshop`.
- **Valor:** mantém e-commerce como vertical de primeira classe.
- **Demonstração ideal:** conectar OAuth, explicar sync inicial e vínculos com
  contatos/leads.
- **Tutorial sugerido:** "Como conectar Nuvemshop".
- **Status:** Visível por comando/busca; validar jornada em tela.

#### ZapSign

- **O que faz:** conecta assinatura eletrônica para contratos e propostas do
  atendimento.
- **Onde fica:** `/app/integrations/zapsign`.
- **Valor:** fecha ciclo de proposta/contrato em nichos de serviço, imobiliária
  e B2B.
- **Demonstração ideal:** conectar credencial, gerar proposta/contrato e mostrar
  retorno.
- **Tutorial sugerido:** "Como usar ZapSign no atendimento".
- **Status:** Módulo opcional.

#### Webhooks

- **O que faz:** cria fontes, regras, atividades e capturas para avisar outros
  sistemas quando algo acontece.
- **Onde fica:** `/app/webhooks`.
- **Valor:** integra o CRM a sistemas externos sem depender de acesso ao banco.
- **Demonstração ideal:** criar fonte, regra e ver entrega/atividade.
- **Tutorial sugerido:** "Como criar webhook de saída".
- **Status:** Visível no app.

#### Dados externos

- **O que faz:** conecta um banco de dados externo para o agente consultar em
  tempo real.
- **Onde fica:** `/app/integracao-dados`.
- **Valor:** permite respostas com dado operacional que não mora no CRM.
- **Demonstração ideal:** criar conexão, explorar schema/tabela e consultar via
  agente.
- **Tutorial sugerido:** "Como conectar dados externos para a IA".
- **Status:** Módulo opcional.

#### API Tokens

- **O que faz:** cria chaves para outro sistema conversar com o CRM.
- **Onde fica:** `/app/settings/api-tokens`.
- **Valor:** habilita integrações servidor-servidor e MCP/API sem cookie de
  sessão.
- **Demonstração ideal:** criar token, copiar uma vez e explicar rotação.
- **Tutorial sugerido:** "Como criar token de API".
- **Status:** Visível no app.

#### Conversões e origem do lead

- **O que faz:** devolve vendas ao anúncio que trouxe o lead e captura origem de
  página/botão WhatsApp por UTM, `ref` ou código auto-contido.
- **Onde fica:** `/app/settings/conversoes` e ficha do contato.
- **Valor:** responde campanha, conjunto, anúncio e posicionamento quando a
  origem atravessa até o CRM.
- **Demonstração ideal:** configurar endereço de captura e abrir contato com
  origem preenchida.
- **Tutorial sugerido:** "Como rastrear leads do WhatsApp".
- **Status:** Visível no app.

#### Meta Ads

- **O que faz:** conecta conta de anúncios e exibe custo/performance de campanhas.
- **Onde fica:** configuração em `/app/settings/meta-ads`; análise em
  `/app/ads/meta`.
- **Valor:** junta custo de aquisição com resultado comercial.
- **Demonstração ideal:** conectar conta, abrir análise e cruzar com funil.
- **Tutorial sugerido:** "Como ligar Meta Ads ao resultado de vendas".
- **Status:** Visível no app.

### Análise, gestão e relatórios

#### Análise Hub

- **O que faz:** inventário das telas de números e histórico.
- **Onde fica:** `/app/analise`.
- **Valor:** separa perguntas recorrentes de visitas deliberadas.
- **Status:** Visível no app.

#### Desempenho

- **O que faz:** mostra funil e performance por atendente nos últimos 30 dias,
  incluindo painéis de atrito, perdas e previsão.
- **Onde fica:** `/app/metrics`.
- **Valor:** coloca equipe, funil e conversão no mesmo quadro.
- **Demonstração ideal:** filtrar período, olhar conversão e perdas.
- **Tutorial sugerido:** "Como ler o desempenho comercial".
- **Status:** Visível no app.

#### Diagnóstico comercial

- **O que faz:** separa origem, atendimento, funil e custo antes de culpar o lead
  ou o comercial.
- **Onde fica:** `/app/analise/diagnostico-comercial`.
- **Valor:** ajuda o gestor a encontrar onde o funil trava.
- **Demonstração ideal:** abrir diagnóstico e explicar cada eixo de causa.
- **Tutorial sugerido:** "Como diagnosticar queda de conversão".
- **Status:** Visível no app Dev local; validar em tela antes de PDF público.

#### Atividades

- **O que faz:** relatório do que equipe e agentes fizeram no período: quanto,
  quem e de que tipo.
- **Onde fica:** `/app/activities`.
- **Valor:** mostra trabalho realizado, não só resultado final.
- **Demonstração ideal:** filtrar período e comparar humano/IA.
- **Tutorial sugerido:** "Como auditar atividade da equipe".
- **Status:** Visível no app.

#### Faturamento

- **O que faz:** mostra quanto entrou, por forma de pagamento, e quanto cada
  pessoa tem a receber.
- **Onde fica:** `/app/faturamento`.
- **Valor:** fecha a conta financeira das comandas/atendimentos.
- **Demonstração ideal:** abrir período, ver contas e comissões.
- **Tutorial sugerido:** "Como acompanhar faturamento".
- **Status:** Visível no app.

#### Histórico do WhatsApp

- **O que faz:** importa histórico temporário para analisar conversas antigas sem
  tocar no atendimento.
- **Onde fica:** `/app/whatsapp-history`.
- **Valor:** permite diagnóstico histórico sem poluir operação atual.
- **Demonstração ideal:** abrir importação e explicar escopo temporário.
- **Tutorial sugerido:** "Como analisar histórico antigo do WhatsApp".
- **Status:** Visível no app.

#### Evolução da IA

- **O que faz:** mostra se o agente está melhorando, onde erra e o que falta
  ensinar.
- **Onde fica:** `/app/ai/evolution`, dentro do grupo Análise.
- **Valor:** gestão contínua da qualidade do agente.
- **Demonstração ideal:** abrir painel e ligar achados a conhecimento/propostas.
- **Tutorial sugerido:** "Como melhorar a IA usando dados".
- **Status:** Visível no app.

#### Audit Log

- **O que faz:** registra quem fez o quê e quando.
- **Onde fica:** `/app/audit` no tenant; `/admin/audit` na plataforma.
- **Valor:** governança, suporte, investigação e LGPD.
- **Demonstração ideal:** filtrar ação, abrir detalhe e mostrar request/ator.
- **Tutorial sugerido:** "Como consultar o histórico de auditoria".
- **Status:** Visível no app e no admin.

### Organização, equipe e governança do tenant

#### Configurações Hub

- **O que faz:** reúne conta, empresa, acesso, dados e integrações da organização.
- **Onde fica:** `/app/settings`.
- **Valor:** porta única para organização sem misturar CRM/canais/análise.
- **Status:** Visível no app.

#### Perfil, segurança e notificações

- **O que faz:** configura nome, idioma, fuso, avatar, MFA, códigos de
  recuperação, sessões e preferências de notificação.
- **Onde fica:** `/app/settings/profile`, `/app/settings/security`,
  `/app/settings/notifications`.
- **Valor:** autonomia de conta e segurança operacional.
- **Demonstração ideal:** alterar idioma/fuso, ligar MFA e revisar notificações.
- **Tutorial sugerido:** "Como configurar sua conta".
- **Status:** Visível no app.

#### Equipe

- **O que faz:** gerencia membros, convites, papéis, atendentes, capacidade e
  disponibilidade.
- **Onde fica:** `/app/team` e `/app/team/invite`.
- **Valor:** define quem trabalha, o que pode fazer e quanto atendimento aguenta.
- **Demonstração ideal:** convidar usuário, mudar papel e ajustar janelas de
  atendimento.
- **Tutorial sugerido:** "Como convidar e configurar atendentes".
- **Status:** Visível no app.

#### Distribuição de atendimento

- **O que faz:** define quem recebe cada cliente novo e o que cada atendente
  enxerga.
- **Onde fica:** `/app/settings/atendimento`.
- **Valor:** governa fila, rodízio e visibilidade.
- **Demonstração ideal:** alternar regra e mostrar impacto na atribuição.
- **Tutorial sugerido:** "Como distribuir conversas para a equipe".
- **Status:** Visível no app.

#### Tags

- **O que faz:** gerencia vocabulário de etiquetas: onde cada uma é usada, como
  renomear, juntar ou excluir.
- **Onde fica:** `/app/settings/tags`.
- **Valor:** evita bagunça de etiquetas criadas por humanos ou agentes.
- **Demonstração ideal:** renomear/mesclar tag e ver impacto.
- **Tutorial sugerido:** "Como organizar etiquetas".
- **Status:** Visível no app.

#### Organização

- **O que faz:** configura dados da empresa, retenção de dados e encarregado de
  LGPD.
- **Onde fica:** `/app/settings/tenant`.
- **Valor:** base legal e operacional da organização.
- **Demonstração ideal:** revisar dados legais e política de retenção.
- **Tutorial sugerido:** "Como configurar dados da empresa".
- **Status:** Visível no app.

#### Tipos de agendamento

- **O que faz:** define o que pode ser marcado, duração, local, buffers,
  antecedência e responsáveis.
- **Onde fica:** `/app/settings/tenant/agenda`.
- **Valor:** transforma agenda genérica em agenda do negócio.
- **Demonstração ideal:** criar tipo "Avaliação" ou "Consulta" e usar no
  agendamento.
- **Tutorial sugerido:** "Como criar tipos de atendimento".
- **Status:** Visível no app.

#### Financeiro

- **O que faz:** configura contas, formas de pagamento e plano de contas.
- **Onde fica:** `/app/settings/tenant/financeiro`.
- **Valor:** dá destino e classificação para lançamentos e comandas.
- **Demonstração ideal:** criar forma de pagamento e ver reflexo no faturamento.
- **Tutorial sugerido:** "Como configurar o financeiro".
- **Status:** Visível no app.

#### Marca da organização

- **O que faz:** define nome e cor que a organização mostra dentro do sistema.
- **Onde fica:** `/app/settings/marca`.
- **Valor:** white-label por organização.
- **Demonstração ideal:** trocar nome/cor em ambiente de teste.
- **Tutorial sugerido:** "Como personalizar a marca da empresa".
- **Status:** Visível no app.

#### Billing

- **O que faz:** tela de plano e cobrança.
- **Onde fica:** `/app/settings/billing`.
- **Valor:** prepara operação comercial/cobrança da organização.
- **Demonstração ideal:** validar estado atual antes de incluir em PDF comercial.
- **Tutorial sugerido:** "Como consultar plano e cobrança".
- **Status:** Visível no app; validar em tela.

#### LGPD do tenant

- **O que faz:** pedidos de exportação e exclusão de dados feitos por clientes.
- **Onde fica:** `/app/lgpd/requests`.
- **Valor:** atende direitos do titular com trilha e SLA.
- **Demonstração ideal:** abrir pedido, revisar status e explicar anonimização.
- **Tutorial sugerido:** "Como responder pedido LGPD".
- **Status:** Visível no app.

#### Extensões

- **O que faz:** mostra guias instalados para orientar o trabalho no CRM, com
  permissões e estado visíveis.
- **Onde fica:** `/app/extensions`.
- **Valor:** entrega orientação de nicho sem enfiar tudo no núcleo do produto.
- **Demonstração ideal:** abrir extensão, ver guia e estado.
- **Tutorial sugerido:** "Como usar uma extensão no CRM".
- **Status:** Visível no app; depende de catálogo instalado.

#### Trunk SIP

- **O que faz:** guarda credenciais do provedor SIP para chamadas de voz por IA.
- **Onde fica:** `/app/settings/voip-trunk`.
- **Valor:** prepara telefonia/voz em instalações que usam esse módulo.
- **Demonstração ideal:** mostrar campos e relação com Chamadas.
- **Tutorial sugerido:** "Como configurar telefonia".
- **Status:** Visível no app; depende de módulo/infra.

#### Atualização do sistema

- **O que faz:** painel para dono do servidor acompanhar atualização do sistema.
- **Onde fica:** `/app/settings/atualizacao`.
- **Valor:** aproxima a operação self-host de um fluxo guiado.
- **Demonstração ideal:** abrir como platform admin e explicar o ciclo de update.
- **Tutorial sugerido:** "Como atualizar a instalação".
- **Status:** Visível apenas para admin da instalação.

### Admin de plataforma

O admin de plataforma é o produto do dono da instalação/VPS. Ele não é a mesma
coisa que o admin de uma organização.

| Tela              | Onde fica                    | O que faz                                                      | Status              |
| ----------------- | ---------------------------- | -------------------------------------------------------------- | ------------------- |
| Dashboard         | `/admin/dashboard`           | KPIs e alertas da plataforma.                                  | Admin da instalação |
| Instâncias        | `/admin/instancias`          | Configura alertas e estado da instalação.                      | Admin da instalação |
| Inbox plataforma  | `/admin/inbox`               | Observa conversas cross-tenant quando necessário.              | Admin da instalação |
| Tenants           | `/admin/tenants`             | Lista, cria, suspende, reativa e acompanha organizações.       | Admin da instalação |
| Detalhe do tenant | `/admin/tenants/[id]`        | Visão geral, ações, suporte e saúde da organização.            | Admin da instalação |
| Agente do tenant  | `/admin/tenants/[id]/agent`  | Acompanha configuração/estado de IA da organização.            | Admin da instalação |
| Saúde do tenant   | `/admin/tenants/[id]/health` | Verifica conexões, filas e sinais de operação.                 | Admin da instalação |
| Audit             | `/admin/audit`               | Auditoria transversal da instalação.                           | Admin da instalação |
| LGPD              | `/admin/lgpd`                | Observa pedidos LGPD e riscos por tenant.                      | Admin da instalação |
| Incidents         | `/admin/incidents`           | Lista e resolve incidentes operacionais.                       | Admin da instalação |
| Usage             | `/admin/usage`               | Consumo por tenant e uso da plataforma.                        | Admin da instalação |
| Users             | `/admin/users`               | Usuários e vínculos entre organizações.                        | Admin da instalação |
| Platform Admins   | `/admin/platform-admins`     | Lista administradores privilegiados.                           | Admin da instalação |
| Marca             | `/admin/marca`               | Marca da instalação: nome, cores, logo e favicon.              | Admin da instalação |
| Google Agenda     | `/admin/google`              | OAuth global do Google Calendar da instalação.                 | Admin da instalação |
| API Oficial Meta  | `/admin/meta`                | App/segredo/token da Meta para canal oficial.                  | Admin da instalação |
| Cadastro          | `/admin/cadastro`            | Política de cadastro: quem pode criar conta e fila de pedidos. | Admin da instalação |
| E-mail            | `/admin/email`               | SMTP/remetente usado pela instalação.                          | Admin da instalação |
| Comportamento     | `/admin/sistema`             | Módulos opcionais e políticas globais como budget/assinatura.  | Admin da instalação |
| Destinos internos | `/admin/destinos-internos`   | Libera destinos internos controlados para automações/IA.       | Admin da instalação |
| Credenciais       | `/admin/configuracao`        | Credenciais gerais da instalação.                              | Admin da instalação |
| Extensões         | `/admin/extensoes`           | Catálogos de extensões da instalação.                          | Admin da instalação |

### Backstage técnico que vira valor de produto

Estas capacidades não são necessariamente "telas de tutorial", mas precisam
aparecer em materiais técnicos, treinamento de implantação ou PDF para agência.

| Capacidade               | O que entrega                                                   | Onde aparece para o usuário                         |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| Multi-tenant com RLS     | Cada organização vê só seus dados, mesmo no mesmo banco.        | Segurança, confiança e operação de várias empresas. |
| RBAC por papel           | Viewer, agent, manager, admin e platform admin controlam ações. | Equipe, rotas protegidas e navegação.               |
| Audit log                | Toda mutação relevante deixa trilha.                            | Audit Log e admin de plataforma.                    |
| Event log + workers      | Filas e efeitos assíncronos sem trigger HTTP no banco.          | IA, follow-ups, crons, campanhas, LGPD.             |
| Supabase Realtime        | Atualização de inbox, kanban e sinais leves.                    | Inbox, contadores e operação ao vivo.               |
| Storage privado          | Mídia de WhatsApp por URL assinada.                             | Anexos e histórico de atendimento.                  |
| Guardrails de IA         | Segurança antes de enviar resposta ou executar ferramenta.      | Agentes, execuções e handoff.                       |
| Orçamento de IA          | Controle de custo por organização/instalação.                   | Uso e orçamento, Admin Usage.                       |
| API REST `/api/v1`       | Integrações externas com wrappers e auth dual rota a rota.      | API tokens, webhooks, MCP.                          |
| MCP interno              | Tools para agentes operarem o CRM.                              | Skills, agentes e integrações futuras.              |
| Webhooks HMAC/path token | Entrada/saída segura para sistemas externos.                    | Webhooks, Nuvemshop, canal oficial.                 |
| STOP detection           | Bloqueio de opt-out no WhatsApp sem falso positivo trivial.     | Campanhas, atendimento e compliance.                |
| Anti-banimento           | Ritmo, janela, jitter e saúde de canal.                         | Conexões, campanhas e envio.                        |
| Self-host packaging      | App, worker e scheduler como imagens publicadas.                | Instalação e update em VPS.                         |
| Baseline auto-curativo   | Instalação nova e atualização aplicam schema esperado.          | Setup e operação self-host.                         |

## Priorização para apresentação e tutoriais

### Alta prioridade

| Tema                            | Por quê                                                   |
| ------------------------------- | --------------------------------------------------------- |
| Conectar WhatsApp               | Sem canal, o produto não demonstra o coração da operação. |
| Inbox e atendimento humano + IA | É a tela mais tangível para venda e treinamento.          |
| Criar/publicar agente           | Diferencial competitivo central.                          |
| Base de conhecimento            | Mostra como reduzir resposta errada.                      |
| Funil e contatos                | Conecta atendimento à venda.                              |
| Follow-up                       | Demonstra continuidade e evita lead morto.                |
| Métricas/diagnóstico            | Ajuda o gestor a enxergar valor.                          |
| Equipe e permissões             | Toda implantação precisa disso.                           |

### Média prioridade

| Tema                     | Por quê                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| Agenda                   | Forte para clínica e serviços.                                       |
| Campanhas                | Importante, mas precisa cuidado com canal e compliance.              |
| Prospecção               | Grande valor comercial, porém precisa contexto de custo/limites.     |
| Tags e respostas rápidas | Melhoram operação diária.                                            |
| Meta Ads/conversões      | Forte para operação com tráfego pago.                                |
| LGPD                     | Essencial para confiança, mas não é primeira demonstração comercial. |
| Webhooks/API tokens      | Importante para integradores e agências.                             |

### Avançada ou por público específico

| Tema                         | Público                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| Admin de plataforma          | Dono da VPS, agência, suporte e mantenedor.                           |
| Módulos opcionais            | Instalações com ZapSign, banco externo, voz ou fluxos de atendimento. |
| Provedor personalizado de IA | Usuário técnico ou agência com gateway próprio.                       |
| Laboratório e execuções      | Operação madura de IA.                                                |
| Extensões                    | Nichos, agências e empacotamento de orientação.                       |
| Packaging/self-host          | Instalador, operador da VPS e contribuidores.                         |

## Roteiro de demonstração sugerido

### Demo de 12 minutos

1. **Abertura:** "Tudo nasce da conversa." Abrir Inbox.
2. **WhatsApp:** mostrar Conexões e saúde do número.
3. **IA:** abrir agente publicado, mostrar conhecimento/ferramentas e rodar teste.
4. **Atendimento:** abrir conversa, pausar/retomar IA e transferir.
5. **CRM:** abrir contato e mover oportunidade no funil.
6. **Continuidade:** mostrar follow-up ou tarefa.
7. **Gestão:** abrir Desempenho ou Diagnóstico comercial.
8. **Confiança:** mostrar Audit Log/LGPD em uma frase.

### Demo de 30 minutos

1. Contexto do nicho e funil.
2. Conexões e canais.
3. Agente: prompt, base, ferramentas, roteador, teste.
4. Atendimento real no Inbox.
5. Funil, contato, tarefas e produtos.
6. Follow-up e campanhas.
7. Agenda ou comanda, se o nicho pedir.
8. Métricas, diagnóstico e evolução da IA.
9. Equipe, permissões e LGPD.
10. Admin de plataforma/self-host, se o público for agência ou operador da VPS.

## Lacunas e validações antes do PDF final

- Tirar screenshots reais dos fluxos de alta prioridade.
- Validar quais módulos opcionais estarão ligados no ambiente de demonstração.
- Marcar o que é **pronto para cliente** versus **Dev/local** em cada seção
  antes de PDF público.
- Revisar nomes finais de telas com o idioma do público do PDF.
- Conferir se `Diagnóstico comercial`, `Testar agentes` e eventuais telas novas
  da árvore local já estão no branch/release que será apresentado.
- Criar uma tabela de "tutoriais já gravados" quando os vídeos começarem.
- Separar versão comercial curta e versão operacional longa.

## Próximo passo recomendado

Use este arquivo como base para uma segunda passada de produto:

1. Escolher persona do PDF: dono de PME, agência que implanta, operador ou admin
   técnico.
2. Marcar 10 funcionalidades obrigatórias para a primeira apresentação.
3. Navegar em tela e capturar evidência visual dessas 10.
4. Transformar cada uma em tutorial curto.
5. Só então gerar PDF diagramado ou página estruturada.
