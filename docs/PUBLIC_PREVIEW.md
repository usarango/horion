# Prévia pública do Horion

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

O projeto de hospedagem é `appgprj_6aee7ac648588191b59bc6edc9f687fb`. A URL de destino fornecida pelo serviço é `https://horion-watch-club-preview.victortb12.chatgpt.site`; a publicação só é considerada concluída após o retorno de sucesso da ferramenta nativa de deploy. O resultado efetivo deve ser registrado abaixo após confirmação.

## Verificações

TypeScript, 69 testes locais e build da prévia passaram. A inspeção do artefato confirmou os caminhos, referências de JS/CSS/imagens/fontes e ausência de backend ou arquivos de ambiente. Esses checks não substituem teste visual no navegador.

O helper de source/build do Sites e `cua_repl.js` não estavam disponíveis neste executor. Por isso, a preparação usa o contrato nativo de fonte Git e arquivo tar de artefato estático. Não foi iniciado servidor de preview nem improvisado controle de navegador. A publicação será verificada pelo resultado nativo do serviço e por requisições HTTP quando disponíveis.
