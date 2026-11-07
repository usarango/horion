# Registro histórico — prévia pública 1 do Horion

> Este documento descreve somente a versão pública 1, uma demonstração anterior. O código e o build atuais foram substituídos pela aplicação conectada ao Supabase, sem conteúdo semeado. Consulte [LIVE_RELEASE.md](LIVE_RELEASE.md) para a iteração atual. A versão antiga e seus resultados abaixo não descrevem os recursos live.

A publicação de avaliação utiliza o mesmo componente `ClubApp`, estilos, fontes, fotografias e fluxos demonstrativos do projeto Next.js. Um adaptador estático separado permite hospedar essa experiência no Sites sem substituir a aplicação principal.

## Escopo da publicação

- Feed, comunidades, catálogo, coleção, Passport, Journal, Society, perfil, notificações, configurações e simulação de moderação em inglês e português.
- Texto, fotos de demonstração, votos, comentários e registros persistem somente no navegador do visitante.
- Acesso de conta abre uma mensagem explícita sobre o escopo da prévia. Nenhum login, onboarding, upload privado ou chamada ao Supabase é executado nesse destino.
- A política de conteúdo bloqueia conexões de backend e envio de formulários (`connect-src 'none'`, `form-action 'none'`). As interações locais usam os manipuladores React.
- A aplicação Next.js, APIs e configuração Supabase continuam no repositório para a integração posterior. Publicar esta prévia não publica essas APIs.

## Build e artefato

```bash
npm ci
npm run build:preview
```

O comando produz `dist/` com HTML para a raiz, 404 e 26 caminhos de idiomas/páginas, bundles com hash e ativos locais. `.openai/hosting.json` declara a identidade Sites e `static.directory: dist`. `npm run build` continua sendo o build Next.js principal; ele não é o artefato usado nesta publicação estática.

O build valida que seu grafo não contém `app/api`, `lib/supabase` ou arquivos de ambiente. Não copiar `.env.local`, chaves, `node_modules`, `.next` ou dados pessoais para o pacote publicado. A publicação usa o commit enviado ao repositório de fonte vinculado ao Sites e um arquivo tar de `.openai/hosting.json` mais `dist/` daquele estado.

O projeto de hospedagem é `appgprj_6aee7ac648588191b59bc6edc9f687fb`. A URL de destino fornecida pelo serviço é `https://horion-watch-club-preview.victortb12.chatgpt.site`; a publicação foi confirmada com sucesso pela ferramenta nativa de deploy e o acesso público foi verificado por HTTP, sem credenciais.

## Verificações

TypeScript, 69 testes locais e build da prévia passaram. A inspeção do artefato confirmou os caminhos, referências de JS/CSS/imagens/fontes e ausência de backend ou arquivos de ambiente. Esses checks não substituem teste visual no navegador.

O helper de source/build do Sites e `cua_repl.js` não estavam disponíveis neste executor. Por isso, a preparação usa o contrato nativo de fonte Git e arquivo tar de artefato estático. Não foi iniciado servidor de preview nem improvisado controle de navegador. A publicação será verificada pelo resultado nativo do serviço e por requisições HTTP quando disponíveis.

## Publicação confirmada

Versão pública 1: https://horion-watch-club-preview.victortb12.chatgpt.site

Fonte Sites: `62afb0956a2f0b13a5d3be5bce19fbbfd554b93c`. Deployment: `appgdep_6aee7cd60bc08191a2ae2d73bafdd064`. O pacote contém somente o manifesto e `dist/`, e seu conteúdo corresponde ao estado de fonte enviado ao Sites. As páginas principais, bundles e ativos responderam 200. Evidência: [PUBLICATION.json](PUBLICATION.json).
