# Runbook — VPS 2 como ensaio de producao

Objetivo: levar o estado aprovado do DEV da VPS 1 para uma VPS 2 nova, com banco
novo, sem copiar `.env`, banco, certificados ou sessao de WhatsApp. A VPS 2 e o
ensaio da producao real; se algo exigir ajuste manual nela, o ajuste volta para
codigo ou script antes da VPS 3.

Este runbook complementa [`canal-proprio-vps.md`](canal-proprio-vps.md). A regra
continua a mesma: VPS de teste e producao instalam pelo fork
`zyonhub-builder/DeskcommCRM`, nunca direto do upstream original.

## Mapa do fluxo

```text
VPS 1 DEV
  -> commit/tag/release no fork zyonhub-builder
  -> imagens GHCR publicadas pelo CI
  -> VPS 2 teste com dominio e banco novos
  -> validacao completa
  -> VPS 3 producao repetindo o mesmo caminho
```

## 0. Coisas que preciso ter em maos

- Dominio ou subdominio da VPS 2, exemplo `crm-teste.seudominio.com`.
- IP publico da VPS 2.
- Tipo de proxy que ja roda na VPS 2: nenhum, CloudPanel/Nginx, Traefik, NPM,
  Coolify, Dokploy ou outro.
- Decisao do banco novo: Supabase gerenciado novo ou Postgres/Supabase local
  single-server do kit.
- E-mail administrador inicial.
- Chaves novas ou de teste para IA, e-mail transacional e provedores externos.
- A versao/tag do fork que sera instalada, exemplo `vX.Y.Z`.

Nao use segredo da VPS 1 por copia cega. Para teste, pode repetir credenciais de
provedor quando fizer sentido, mas digitadas conscientemente no instalador ou na
tela.

## 1. Preparar a versao na VPS 1

1. Confirme os remotes.

```bash
git remote -v
```

Esperado:

- `origin` aponta para `zyonhub-builder/DeskcommCRM`.
- `upstream` aponta para `melgarafael/DeskcommCRM`.

2. Confirme que nada sera enviado ao upstream original.

```bash
git status --short
git branch --show-current
```

3. Rode os gates proporcionais.

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:shell      # se tocou kit, Dockerfile ou compose
pnpm test:db         # se tocou schema/RLS/baseline
```

4. Faça commit no fork e publique.

```bash
git add .
git commit -m "chore(vps): prepara canal proprio para ensaio"
git push origin HEAD
```

5. Corte uma tag/release propria do fork.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Espere o workflow de publicacao das imagens terminar verde. Depois crie a GitHub
Release no fork. Sem Release publicada, o botao "Atualizar" da VPS nao tem uma
versao nova para enxergar.

```bash
gh release create vX.Y.Z \
  --repo zyonhub-builder/DeskcommCRM \
  --title "vX.Y.Z" \
  --generate-notes
```

## 2. Conferir a VPS 2 antes de instalar

Entre na VPS 2 por SSH e confira o basico.

```bash
hostname
whoami
pwd
free -h
df -h
docker --version
docker compose version
curl -4 ifconfig.me
```

Regras:

- Docker e Docker Compose precisam existir.
- Tenha folga de disco antes de baixar imagens.
- Em VPS pequena, crie swap antes de qualquer build local. O caminho normal nao
  builda na VPS, mas swap evita travas de dependencia.
- Se ja existir proxy usando 80/443, nao deixe o compose base tentar tomar essas
  portas. Use o modo de proxy correto no instalador.

Confira portas e proxy:

```bash
ss -ltnp | grep -E ':80|:443'
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
```

Se aparecer CloudPanel/Nginx/Traefik/NPM/Coolify/Dokploy, anote. A escolha do
proxy e parte da instalacao.

## 3. DNS da VPS 2

No painel DNS, crie:

```text
Tipo: A
Nome: crm-teste
Valor: <IP_PUBLICO_DA_VPS_2>
TTL: 300, se puder escolher
```

Na VPS 2 ou na sua maquina:

```bash
dig +short crm-teste.seudominio.com A
curl -I http://crm-teste.seudominio.com
```

Esperado:

- `dig` devolve o IP da VPS 2.
- HTTP pode dar erro antes da instalacao, mas precisa chegar na VPS certa.

Nao avance para SSL/app se o DNS ainda aponta para outro IP.

## 4. Banco novo

Escolha um dos caminhos.

### Opcao A: Supabase gerenciado novo

1. Crie um projeto Supabase novo.
2. Guarde para o instalador:
   - Project URL.
   - Anon key.
   - Service role key.
   - Connection string do Postgres/pooler.
3. Nao rode SQL manual antes do instalador. O kit aplica `supabase/baseline.sql`.

### Opcao B: banco local single-server

Use quando a VPS 2 for o ensaio do modo "tudo na mesma VPS". O kit sobe o
Supabase local junto do app. A regra e a mesma: banco novo, volume novo, sem
restaurar dump da VPS 1.

## 5. Instalar na VPS 2

Clone o fork.

```bash
cd /var/www
git clone --depth 1 https://github.com/zyonhub-builder/DeskcommCRM.git deskcommcrm
cd deskcommcrm
```

Se precisar instalar uma tag especifica:

```bash
git fetch --tags origin
git checkout vX.Y.Z
```

Rode o instalador.

```bash
bash hostgator-setup-kit/install.sh
```

Durante as perguntas:

- Use o dominio da VPS 2.
- Use banco novo.
- Escolha o proxy correto para a VPS. Se ja existe proxy externo, nao use o modo
  que tenta ocupar 80/443 diretamente.
- Configure e-mail e IA com credenciais de teste ou reais de forma consciente.

Se for modo nao interativo, preencha `.env` a partir de `.env.example` e rode:

```bash
bash hostgator-setup-kit/install.sh --yes
```

## 6. Conferencia tecnica depois da instalacao

Rode:

```bash
bash hostgator-setup-kit/healthcheck.sh
bash hostgator-setup-kit/diagnostico.sh
docker compose -f docker-compose.prod.yml ps
```

Se a VPS usa Traefik, o `up -d` e qualquer conferencia manual precisam carregar
os dois compose files:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env ps
```

Confira o dominio:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://crm-teste.seudominio.com/
```

Esperado comum:

- `307` para login, ou `200` se a rota publica responder direto.
- `404` de Traefik geralmente significa compose sem labels ou proxy apontando
  para container errado.
- Erro de certificado significa DNS/proxy/SSL, nao banco.

## 7. Conferencia pela tela

Na VPS 2, validar como pessoa usuaria:

1. Abrir `https://crm-teste.seudominio.com`.
2. Criar/entrar com o admin inicial.
3. Completar onboarding.
4. Verificar Configuracoes da empresa.
5. Configurar credenciais de IA.
6. Conectar WhatsApp em sessao nova. Nao copie sessao WAHA da VPS 1.
7. Enviar e receber uma mensagem de teste.
8. Abrir Inbox, Funis, Agentes, Follow-ups, Roteadores, Analise e Canais.
9. Rodar um teste de agente pela tela.
10. Validar que logs e jobs nao ficam presos:

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 app
docker compose -f docker-compose.prod.yml logs --tail=200 worker
```

## 8. Conferir atualizacao pelo canal proprio

O botao "Atualizar" depende da ultima GitHub Release publicada no fork.

Para testar sem esperar outra versao publica, rode manualmente na VPS 2:

```bash
bash hostgator-setup-kit/update.sh --to vX.Y.Z --force
```

Depois:

```bash
bash hostgator-setup-kit/healthcheck.sh
git describe --tags --exact-match HEAD
```

Quando existir uma release posterior no fork, o app deve oferecer "Atualizar" e
o `update.sh` deve:

- fazer backup antes;
- trocar para a release do fork;
- aplicar baseline/migrations;
- puxar as imagens do fork;
- subir app, worker e scheduler saudaveis.

## 9. Criterio para promover para VPS 3

So avance quando a VPS 2 passar:

- DNS e SSL ok.
- Login e onboarding ok.
- Banco novo criado e app usando esse banco.
- WhatsApp conectado com sessao nova.
- Mensagem enviada e recebida.
- Agente testado pela tela.
- `healthcheck.sh` verde.
- Atualizacao manual ou botao de atualizacao validado.
- Nenhum ajuste manual ficou apenas na VPS.

Se precisou editar `.env`, compose, banco ou arquivo na mao para funcionar,
pare. Transforme isso em script, doc ou codigo na VPS 1, publique nova release e
reinstale/atualize a VPS 2 antes de pensar na VPS 3.

## 10. Promocao para producao

Na VPS 3, repita o mesmo roteiro da VPS 2 com:

- dominio real;
- banco novo real;
- credenciais reais;
- WhatsApp real;
- backups ligados;
- release do fork ja validada na VPS 2.

Nao pule a VPS 2. A VPS 3 deve ser repeticao, nao descoberta.
