# HORION WATCH CLUB

Base de produto e desenvolvimento — novembro de 2026.

Aplicação **Next.js 16 / React / TypeScript / Tailwind CSS**, com identidade editorial, navegação em inglês e português, demonstração interativa persistida no navegador e fundação **Supabase / PostgreSQL** com autorização no servidor e RLS.

**Esta entrega não encerra o MVP multiusuário.** A interface usa dados fictícios locais. O backend está preparado e testado em PostgreSQL embarcado, mas não foi aplicado a um projeto Supabase nem conectado ao estado de produto da interface. Nenhum banco existente foi alterado, nenhum site foi publicado e nenhuma cobrança foi ativada.

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

Repositório: [usarango/horion](https://github.com/usarango/horion). A escolha de infraestrutura e os valores de referência do Supabase estão em [INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md). A migração atual exige um projeto dedicado; não deve ser aplicada ao banco em uso do Rango.

Não são necessárias credenciais para a demonstração. Consulte `.env.example` e [DATABASE.md](docs/DATABASE.md) antes de configurar Supabase. Preencher variáveis habilita o acesso de conta independente; **não converte automaticamente os registros demonstrativos em dados remotos**.

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

| Arquivo/pasta                                              | Finalidade                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app/[locale]/[[...path]]/page.tsx`                        | Rotas públicas bilíngues e metadados                                                                                       |
| `components/club-app.tsx`                                  | Shell, navegação, home editorial, feed, publicação e acesso de conta                                                       |
| `components/club-pages.tsx`                                | Explore, comunidades, catálogo, coleção, Passport, Journal, Society, perfil, notificações, configurações e moderação local |
| `app/globals.css`, `components/pages.css`                  | Tokens claros/escuros, tipografia local, responsividade e movimento reduzido                                               |
| `lib/domain.ts`, `lib/store.tsx`                           | Invariantes, ranking determinístico, validação do estado e persistência demonstrativa                                      |
| `lib/demo-data.ts`                                         | Dados fictícios e referências de demonstração                                                                              |
| `lib/i18n.ts`, `lib/messages/`                             | Dicionários e funções de internacionalização                                                                               |
| `lib/supabase/`, `proxy.ts`                                | Clientes SSR, renovação de sessão, validação e autorização                                                                 |
| `app/api/`, `app/auth/callback/`                           | Endpoints reais de Auth, comunidade, imagens e documentos privados                                                         |
| `supabase/migrations/20261106233423_horion_foundation.sql` | Modelo relacional, constraints, índices, privilégios, RLS, Storage e auditoria                                             |
| `tests/`                                                   | Testes do domínio, da migration e dos handlers reais                                                                       |

## Relatório das fases

| Fase             | Entrega desta iteração                                                                                                            | Banco                                                                                                 | Pendência para encerramento                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 — Fundação     | Inspeção do diretório vazio; arquitetura modular; design system; rotas bilíngues; estados de erro; Auth SSR e APIs preparados     | Migration local versionada; sem aplicação remota                                                      | Escolher ambiente de desenvolvimento, aplicar/revisar schema, validar confirmação de e-mail e sessões reais |
| 2 — Comunidade   | Fluxos completos na demonstração: publicar/foto, editar/excluir, comentários/respostas, votos, comunidades, busca e revisão local | Posts, memberships, comentários, votos, mídias, denúncias, bloqueios e auditoria com RLS              | Conectar a UI aos endpoints, revisar uploads e abuso; validar duas contas e moderador no Supabase           |
| 3 — Colecionismo | Catálogo ilustrativo, coleção/wishlist, edição e Passport com eventos na demonstração                                             | Catálogo normalizado, dados pessoais separados, passaportes/eventos/documentos e buckets privados     | Catálogo revisado; integração remota; testes reais de upload e expiração de links                           |
| 4 — Clube        | Apresentação Society; reputação separada de assinatura na modelagem                                                               | Ledger, regras/níveis/insígnias, planos/entitlements/assinaturas; gravação de mérito negada ao membro | Fluxo confiável de concessão/reversão, antifraude e benefícios; nenhum pagamento ativo                      |
| 5 — Conteúdo     | Journal navegável com rascunhos originais bilíngues                                                                               | Conteúdo editorial e estados de publicação preparados                                                 | Editor administrativo, artigos públicos individuais, SEO de produção e integrações autorizadas              |
| 6 — Comercial    | Limites e plano do Exchange documentados                                                                                          | Marketplace e transações não ativados                                                                 | Modelagem detalhada, KYC, disputas, políticas e avaliação regulatória/provedores                            |

Decisões e plano de continuidade: [ARCHITECTURE.md](docs/ARCHITECTURE.md) e [ROADMAP.md](docs/ROADMAP.md). Detalhes de schema, permissões, testes e configuração: [DATABASE.md](docs/DATABASE.md).

## Validação e limites

Os comandos e resultados finais desta iteração estão em [VALIDATION.md](docs/VALIDATION.md). Testes de SQL usam PostgreSQL embarcado via PGlite com representações mínimas dos schemas Auth/Storage. Testes de API invocam os handlers reais com `NextRequest`, sem servidor HTTP ou credenciais. Isso verifica regras e falhas explícitas, mas não substitui serviços reais de Supabase Auth, Storage e PostgREST.

A inspeção visual em navegador e os testes ponta a ponta com contas reais **não foram executados**. O ambiente de Sites estava marcado como gerenciado, mas não disponibilizava o recurso `cua_repl.js` exigido pelo fluxo de QA; a verificação ficou restrita ao build, TypeScript e testes automatizados locais. Não há afirmação de acessibilidade, responsividade ou performance homologadas em dispositivos reais.

## Próxima etapa

Vincular um **projeto de desenvolvimento explicitamente escolhido para o Horion**, revisar e aplicar a migration nesse destino, executar advisors e gerar tipos, conectar o repositório da interface e validar os 15 critérios do MVP com sessões reais. SMTP, políticas legais, processamento de exportação/exclusão, tratamento completo de imagens/documentos e testes ponta a ponta são dependências de lançamento. Publicação em produção, despesas e ativação de pagamentos continuam sujeitos à aprovação solicitada no briefing.
