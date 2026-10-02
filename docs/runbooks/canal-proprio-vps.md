# Canal proprio de VPS: DEV -> teste -> producao

Este runbook e o fluxo operacional do fork `zyonhub-builder/DeskcommCRM`.
O repositorio original continua sendo a fonte das novidades, mas nenhuma VPS de teste
ou producao atualiza direto dele.

```text
upstream/melgarafael
        -> VPS 1 DEV
        -> release do fork zyonhub-builder
        -> VPS 2 teste
        -> VPS 3 producao
```

## Regra de ouro

A VPS de cliente sempre instala e atualiza pelo fork:

- codigo: `https://github.com/zyonhub-builder/DeskcommCRM.git`
- imagens: `ghcr.io/zyonhub-builder/{deskcommcrm,deskcomm-worker,deskcomm-scheduler,deskcomm-voice-agent}`

O upstream entra somente na VPS 1, por merge controlado. Depois de testar, publique uma
release propria no fork.

## VPS 1: preparar uma versao

1. Traga novidades do upstream e do fork.

```bash
git fetch upstream --tags
git fetch origin --tags
```

2. Mescle o upstream no ambiente DEV.

```bash
git switch main
git merge upstream/main
```

Resolva conflitos aqui. Nao resolva conflito em VPS 2 nem em VPS 3.

3. Rode os gates proporcionais ao que mudou.

```bash
pnpm gov:verify
pnpm test:shell      # se tocou kit, Dockerfile ou compose
pnpm test:db         # se tocou schema/RLS/RBAC
pnpm build           # se vai publicar imagem
```

4. Gere a release do fork.

Se houver fragmentos em `.changes/`, use o fluxo do repositorio:

```bash
pnpm release:conferir
pnpm release:cortar
git add CHANGELOG.md .changes
git commit -m "release(X.Y.Z): prepara versao do canal zyonhub"
```

Se nao houver fragmento e for apenas um corte operacional, escolha uma versao maior que a
ultima release do fork e registre isso no commit.

5. Publique commit e tag.

```bash
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

O push da tag dispara `.github/workflows/publish-image.yml` e publica as quatro imagens.
Espere o workflow terminar verde antes de criar a GitHub Release.

6. Crie a GitHub Release somente depois das imagens.

```bash
gh release create vX.Y.Z \
  --repo zyonhub-builder/DeskcommCRM \
  --title "vX.Y.Z" \
  --generate-notes
```

O `agent.sh` das VPS consulta a ultima GitHub Release publicada, nao a maior tag solta.
Tag sem release nao aparece no botao "Atualizar".

## VPS 2: instalar como ensaio de producao

Use VPS nova, banco novo e dominio/subdominio de teste. Nao copie `.env`, banco,
certificados ou sessao WhatsApp da VPS 1.

```bash
git clone --depth 1 https://github.com/zyonhub-builder/DeskcommCRM.git deskcommcrm
cd deskcommcrm
bash hostgator-setup-kit/install.sh
```

No fim, confira:

```bash
bash hostgator-setup-kit/healthcheck.sh
curl -s -o /dev/null -w "%{http_code}\n" "https://<dominio-da-vps-2>/"
```

Depois valide pela tela: login, onboarding, credenciais de IA, conexao WhatsApp, envio de
mensagem e o aviso de nova versao quando uma release posterior existir.

## VPS 3: producao

Repita exatamente o caminho da VPS 2, trocando dominio, banco e credenciais para os reais.
Se a VPS 2 exigiu qualquer ajuste manual fora do instalador, pare: transforme o ajuste em
codigo ou script antes de seguir para a VPS 3.

## Atualizacoes futuras

O ciclo normal fica:

```bash
git fetch upstream --tags
git merge upstream/main
# resolver, testar, publicar release do fork
```

So depois disso a VPS 2 e a VPS 3 recebem a atualizacao pelo botao "Atualizar".
Isso preserva o melhor dos dois mundos: novidades do projeto original com as customizacoes
testadas do canal `zyonhub-builder`.
