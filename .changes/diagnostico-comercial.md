---
impacto: capacidade_nova
secao: adicionado
titulo: Diagnóstico comercial separa origem de execução
---

Gestores agora têm uma tela em Análise › Diagnóstico comercial para cruzar
origem dos leads, funil, atendimento, atividades e custo de IA em uma leitura
objetiva. A abertura da tela não chama modelo: ela usa metadados e agregados do
banco, mostra o custo de IA já registrado no período e deixa explícito o que
ainda exige análise semântica das conversas.

A tela também ganhou uma análise com IA sob demanda. Ela não roda ao abrir a
página: quando acionada, usa os mesmos agregados do diagnóstico, registra a
chamada em `llm_calls`, audita quem pediu e mostra o custo exato daquela análise.

As análises geradas agora ficam salvas no histórico da organização, com prompt,
custo, modelo, tokens e janela analisada. O gestor pode reabrir uma análise
antiga e baixar o PDF pelo relatório salvo, sem chamar a IA novamente.
