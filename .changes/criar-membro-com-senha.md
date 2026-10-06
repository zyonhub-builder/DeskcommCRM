---
impacto: capacidade_nova
secao: adicionado
titulo: Admin pode criar membro com senha inicial
---

Na tela Equipe › Adicionar membros, admins agora podem escolher entre enviar o
convite por e-mail ou criar uma conta já confirmada com e-mail e senha inicial.
O usuário nasce vinculado à organização, aparece imediatamente em Membros e a
criação fica registrada na auditoria. O fluxo usa a service role do Supabase e,
se o vínculo no tenant falhar depois da criação da conta, a conta recém-criada é
apagada para não deixar acesso órfão.
