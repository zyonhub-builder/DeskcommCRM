---
impacto: capacidade_nova
secao: adicionado
titulo: Portal simples para testar agentes
---

O CRM ganhou o portal `/app/ai/testes`, com link direto por agente em
`/app/ai/testes/[id]`, para que pessoas leigas testem uma versão publicada sem
abrir a configuração do agente.

A prévia agora pode ser usada por qualquer papel vinculado à empresa
(`viewer+`) e mantém o histórico da conversa enquanto a página está aberta.
Assim, triagens em várias perguntas usam o contexto completo em vez de tratar
cada mensagem como um teste isolado.

No portal simples, a conversa fica em uma área com rolagem própria e a resposta
é devolvida assim que o agente propõe a mensagem, sem esperar a chamada extra de
checkpoint usada pelo dry-run completo da tela de configuração.
