# HORION WATCH CLUB

Base de produto e desenvolvimento — novembro de 2026.

Aplicação **Next.js 16 / React / TypeScript / Tailwind CSS**, com identidade editorial, navegação em inglês e português, demonstração interativa persistida no navegador e fundação **Supabase / PostgreSQL** com autorização no servidor e RLS.

**Esta entrega não encerra o MVP multiusuário.** A interface usa dados fictícios locais. Em 7 de novembro de 2026, a fundação foi aplicada ao projeto Supabase compartilhado do Rango, em schemas próprios, com preservação verificada dos metadados protegidos existentes. A Data API ainda não expõe o schema `horion`: a alteração por override de papel foi rejeitada pela revisão automática e não foi executada. O onboarding remoto e o acesso aos dados Horion pela API dependem dessa configuração. Nenhum site foi publicado, projeto pago foi criado ou pagamento foi ativado.

## Executar

Requer Node.js 24 LTS e npm. No diretório deste projeto:

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000/en` ou `http://localhost:3000/pt-BR`. A rota `/` escolhe inicialmente português quando o idioma preferencial enviado pelo navegador começa com `pt`; nos demais casos escolhe inglês. A seleção manual permanece no prefixo da URL e é lembrada por um cookie de preferência de idioma.

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm start` requer o build anterior. O projeto usa Webpack nas tarefas Next.js: o Turbopack tentou abrir uma porta interna não permitida pelo sandbox deste ambiente. Webpack compilou com sucesso. As dependências têm versões exatas e `package-lock.json`.

Repositório: [usarango/horion](https://github.com/usarango/horion). A escolha de infraestrutura, o projeto compartilhado e os valores de referência do Supabase estão em [INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md). A migração atual isola o Horion em `horion` e `horion_private`; a baseline antiga para projeto dedicado foi arquivada e não deve ser aplicada ao Rango.

Não são necessárias credenciais para a demonstração. Consulte `.env.example` e [DATABASE.md](docs/DATABASE.md) antes de configurar Supabase. Os clientes usam cookies `horion-auth`, mas a identidade Auth é compartilhada pelo projeto. A criação de contas permanece desativada por padrão (`HORION_ALLOW_SHARED_SIGNUP=false`); usuários existentes precisam aderir explicitamente ao Horion. Preencher variáveis **não converte os registros demonstrativos em dados remotos** nem resolve a exposição pendente do schema.

## O que é possível experimentar

- Explorar o feed público, ordenar, filtrar idioma e formato, salvar histórias e pesquisar referências, publicações e comunidades.
- Participar de comunidades, publicar texto/fotografia própria, editar/excluir publicações próprias, votar, comentar e responder.
- Denunciar uma publicação e experimentar sua revisão na **simulação local** em `/en/admin` ou `/pt-BR/admin`.
- Adicionar referências à coleção ou wishlist, editar notas/data/estado/visibilidade e criar um Passport para relógios possuídos.
- Registrar eventos no Passport e visualizar sua timeline, sempre com nível “declarado pelo proprietário”.
- Editar o perfil fictício, consultar notificações, alternar tema/idioma, exportar JSON e restaurar a demonstração com confirmação.
- Ler rascunhos editoriais originais e conhecer o planejamento Society sem pagamentos.

A fotografia local aceita JPEG, PNG e WebP até 2 MB. Não envie documentos pessoais, séries, preços ou informações sensíveis à demonstração. A preferência local “privado” é um campo de apresentação, não isolamento entre contas. Limpar os dados do navegador remove o estado local. Falhas de armazenamento são informadas e a exportação continua disponível em memória.

As imagens do catálogo são **ilustrativas e não identificam a referência exata**. Especificações desconhecidas foram omitidas. Atividade social, proprietários e contagens são fictícios. Referências, fontes e licenças estão documentadas em [ASSETS.md](docs/ASSETS.md).

## Estrutura principal

| Arquivo/pasta                                                      | Finalidade                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `app/[locale]/[[...path]]/page.tsx`                                | Rotas públicas bilíngues e metadados                                                                                       |
| `components/club-app.tsx`                                          | Shell, navegação, home editorial, feed, publicação e acesso de conta                                                       |
| `components/club-pages.tsx`                                        | Explore, comunidades, catálogo, coleção, Passport, Journal, Society, perfil, notificações, configurações e moderação local |
| `app/globals.css`, `components/pages.css`                          | Tokens claros/escuros, tipografia local, responsividade e movimento reduzido                                               |
| `lib/domain.ts`, `lib/store.tsx`                                   | Invariantes, ranking determinístico, validação do estado e persistência demonstrativa                                      |
| `lib/demo-data.ts`                                                 | Dados fictícios e referências de demonstração                                                                              |
| `lib/i18n.ts`, `lib/messages/`                                     | Dicionários e funções de internacionalização                                                                               |
| `lib/supabase/`, `proxy.ts`                                        | Clientes SSR, renovação de sessão, validação e autorização                                                                 |
| `app/api/`, `app/auth/callback/`                                   | Endpoints reais de Auth, comunidade, imagens e documentos privados                                                         |
| `supabase/migrations/20261107003648_horion_shared_foundation.sql`  | Fundação compartilhada aplicada: schemas próprios, constraints, índices, privilégios, RLS, Storage e auditoria             |
| `supabase/migrations/20261107004514_horion_shared_performance.sql` | Ajuste aplicado somente no Horion: cinco índices compostos de FK e consolidação de policy de edição de posts               |
| `tests/`                                                           | Testes do domínio, da migration e dos handlers reais                                                                       |

## Relatório das fases

| Fase             | Entrega desta iteração                                                                                             | Banco                                                                                                 | Pendência para encerramento                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1 — Fundação     | Arquitetura modular; design system; rotas bilíngues; Auth SSR com cookies próprios; onboarding explícito preparado | Fundação aplicada ao Rango: 37 tabelas com RLS e schemas exclusivos                                   | Aprovar/configurar exposição de `horion`; validar identidade, adesão e sessões reais           |
| 2 — Comunidade   | Publicar/foto, editar/excluir, comentários/respostas, votos, comunidades, busca e revisão na demonstração          | Posts, memberships, comentários, votos, mídias, denúncias, bloqueios e auditoria aplicados com RLS    | Expor schema, conectar a UI aos endpoints e validar duas contas e moderador                    |
| 3 — Colecionismo | Catálogo ilustrativo, coleção/wishlist, edição e Passport com eventos na demonstração                              | Catálogo, dados pessoais separados, passaportes/eventos/documentos e buckets Horion aplicados         | Catálogo revisado; integração remota; testes reais de upload e expiração de links              |
| 4 — Clube        | Apresentação Society; reputação separada de assinatura na modelagem                                                | Ledger, regras/níveis/insígnias, planos/entitlements/assinaturas; gravação de mérito negada ao membro | Fluxo confiável de concessão/reversão, antifraude e benefícios; nenhum pagamento ativo         |
| 5 — Conteúdo     | Journal navegável com rascunhos originais bilíngues                                                                | Conteúdo editorial e estados de publicação preparados                                                 | Editor administrativo, artigos públicos individuais, SEO de produção e integrações autorizadas |
| 6 — Comercial    | Limites e plano do Exchange documentados                                                                           | Marketplace e transações não ativados                                                                 | Modelagem detalhada, KYC, disputas, políticas e avaliação regulatória/provedores               |

Decisões e plano de continuidade: [ARCHITECTURE.md](docs/ARCHITECTURE.md) e [ROADMAP.md](docs/ROADMAP.md). Detalhes de schema, permissões, testes e configuração: [DATABASE.md](docs/DATABASE.md).

## Validação e limites

Verificação final: **65/65 testes passaram**, sem casos ignorados, falhas ou cancelamentos; `npm run typecheck` e `npm run build` passaram, com `.env.local` carregado no build. Os detalhes estão em [VALIDATION.md](docs/VALIDATION.md). Testes SQL executam a cadeia completa das duas migrações em PostgreSQL embarcado via PGlite, com representações mínimas dos schemas Auth/Storage. Testes de API invocam os handlers reais com `NextRequest`, sem servidor HTTP ou credenciais. Isso verifica regras e falhas explícitas, mas não substitui a homologação de Supabase Auth, Storage e PostgREST.

A inspeção remota preservou o fingerprint dos metadados protegidos do Rango. A rota HTTP padrão consultada continuou respondendo `200`; requisições ao schema `horion` retornaram `406/PGRST106`, confirmando a exposição ainda pendente. Evidências: [SHARED_DATABASE_VERIFICATION.json](docs/SHARED_DATABASE_VERIFICATION.json).

A inspeção visual em navegador e os testes ponta a ponta com contas reais **não foram executados**. O ambiente de Sites estava marcado como gerenciado, mas não disponibilizava o recurso `cua_repl.js` exigido pelo fluxo de QA; a verificação ficou restrita ao build, TypeScript e testes automatizados locais. Não há afirmação de acessibilidade, responsividade ou performance homologadas em dispositivos reais.

## Configuração pendente da Data API

A revisão automática rejeitou o SQL `ALTER ROLE authenticator SET pgrst.db_schemas`, pois ele alteraria persistentemente a configuração de exposição do projeto compartilhado e passaria a sobrepor o Dashboard. **Esse SQL não foi executado e não integra as migrações aplicáveis.** A proposta está arquivada em [docs/operations/proposed_api_role_override.sql.txt](docs/operations/proposed_api_role_override.sql.txt), apenas para registro.

O caminho recomendado é adicionar `horion` em **Data API → Settings → Exposed schemas**, preservando `public` e `graphql_public`. Essa mudança de configuração compartilhada permanece pendente de aprovação explícita. A API observada continua expondo somente `public,graphql_public`.

## Próxima etapa

Após a aprovação da configuração da Data API, validar a exposição, a adesão explícita de usuários existentes e o isolamento remoto; então conectar a interface e homologar os 15 critérios do MVP com sessões reais. SMTP, políticas legais, processamento de exportação/exclusão, tratamento completo de imagens/documentos e testes ponta a ponta são dependências de lançamento. Publicação em produção, despesas e ativação de pagamentos continuam sujeitos à aprovação solicitada no briefing.
