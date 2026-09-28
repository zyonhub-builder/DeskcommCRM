---
impacto: nada_mudou
secao: corrigido
titulo: No faturamento, cada moeda tem o seu bloco em vez de uma soma entre moedas
---

Quando o período tinha comandas ou lançamentos em moedas diferentes, a tela de
Faturamento somava tudo e escrevia o resultado em real: R$ 150,00 e 200,00 €
apareciam como "R$ 350,00" nos cartões Entrou e Saldo, no faturado e nas listas
por forma de pagamento, serviço, cliente e comissão, e o ticket médio misturava
as duas moedas. Agora cada moeda tem o seu bloco, com os seus cartões, o seu
ticket médio e as suas listas, sem conversão, e a moeda da organização vem
primeiro. Os lançamentos do período e os lançamentos recorrentes
(Configurações › Financeiro) passam a mostrar cada valor na moeda da própria
linha, em vez de sempre em real. A separação é preventiva: as comandas, os
lançamentos e as recorrências criados pela tela ainda nascem em real, então no
uso normal os valores continuam saindo em real, como antes; a mistura só
aparece com dado gravado em outra moeda por fora das telas. Numa organização
configurada em outra moeda, o período sem movimento mostra o zero na moeda
dela. O relatório que a tela lê (/api/v1/reports/financeiro) ganha o campo
por_moeda, com os mesmos totais separados por moeda, e os campos que já
existiam não mudam. Não exige ação de quem opera a instalação.

Levantamento de @franceschini-lucas (#1531).

Contribuição de @in100tiva (#1839).
