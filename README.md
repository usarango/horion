# HORION WATCH CLUB

Aplicação **Next.js 16, React, TypeScript e Tailwind CSS**, com identidade editorial, inglês/português e dados de produto no **Supabase/PostgreSQL**, protegidos por autorização e RLS.

**A interface atual está conectada ao banco e começa sem conteúdo semeado.** Não carrega perfis, comunidades, fotografias de catálogo ou publicações fictícias; não usa registros locais como alternativa ao backend. Acesso de conta, cadastro e adesão ao perfil Horion usam o Supabase real. O cadastro agora estabelece sessão sem etapa de confirmação de e-mail. A homologação autenticada completa do MVP continua pendente; os limites de QA estão documentados.

A **versão pública 5, com acesso explicado**, foi publicada com sucesso em [Horion Watch Club](https://horion-watch-club-preview.victortb12.chatgpt.site). O build Next.js e o artefato estático conectado passaram. Estado, evidências e limites desta iteração: [LIVE_RELEASE.md](docs/LIVE_RELEASE.md).

## Executar

Requer Node.js 24 LTS e npm:

```bash
npm ci
npm run dev
```

Configure as variáveis públicas do Supabase conforme `.env.example`, em um arquivo local ignorado pelo Git ou no ambiente de execução. Sem conexão válida, a interface informa a indisponibilidade; não cria uma demonstração substituta. O cadastro depende do controle explícito `HORION_ALLOW_SHARED_SIGNUP`; o build live verificado nesta iteração o habilitou.

Abra `http://localhost:3000/en` ou `http://localhost:3000/pt-BR`. A rota raiz considera a preferência de idioma e o idioma do navegador. A seleção manual usa o prefixo da URL.

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm start` requer o build anterior. Os comandos Next.js usam Webpack porque o Turbopack encontrou uma restrição de socket no sandbox. Dependências têm versões exatas e lockfile.

Para o adaptador de hospedagem estática conectado:

```bash
npm run build:preview
```

O nome do comando é histórico. O manifesto gerado em `dist/` identifica o modo `live-supabase`; o build exige URL HTTPS e chave pública válidas e não inclui rotas de servidor, arquivos de ambiente ou chaves privilegiadas. URL e chave pública são os únicos valores de ambiente Supabase incorporados ao navegador. O controle de cadastro é compilado como booleano.

## Funcionalidades conectadas

- Feed público, ordenações, filtros e busca usam registros reais; listas vazias apresentam estados vazios.
- Membros podem criar/participar de comunidades, publicar texto/fotografia, comentar, responder, votar, salvar e denunciar, sujeitos às regras do banco.
- A coleção aceita referências do catálogo e cadastro manual de relógios; notas e estados pertencem ao membro autenticado; os registros permanecem privados nesta versão.
- O Passport registra eventos declarados pelo proprietário. O upload de documentos ainda não está disponível na interface desta versão.
- O perfil permite escolher membro ou loja. Informações de loja são autodeclaradas e não conferem verificação ou autoridade de moderação.
- Notificações, exportação dos registros carregados e configurações usam a identidade real. A exportação oferecida não substitui o processo completo de atendimento a solicitações legais de dados.
- A área de moderação exige autorização no servidor/banco. Ser loja não concede esse acesso.
- Journal e Society apresentam o estado real de disponibilidade, sem artigos, conquistas, assinaturas ou benefícios fictícios. Não há cobrança ou marketplace ativo.

Essas funcionalidades estão ligadas ao backend no código; a validação do produto combina consultas públicas reais e cenários autenticados com rede simulada. Não foi realizado um percurso autenticado completo com publicação, interação entre duas contas ou armazenamento de documentos.

## Identidade e segurança

O projeto Supabase é compartilhado com o Rango. Horion usa schemas `horion`/`horion_private` e cookies próprios `horion-auth`; o diretório Auth, SMTP, cotas e configurações de identidade continuam compartilhados. Uma conta de acesso só recebe perfil Horion por adesão explícita.

Se o e-mail já possui uma conta no Rango/Horion, use **Entrar** com a senha existente. O cadastro não define uma nova senha para essa identidade. Quando as credenciais são recusadas, a tela oferece **Entrar com este e-mail**, preservando o endereço e limpando o campo de senha. Falhas de serviço e conexão têm mensagens próprias. Detalhes: [SIGNIN_ERRORS.md](docs/SIGNIN_ERRORS.md).

O Horion não exige confirmação de e-mail. A Edge Function `horion-register` cria a conta e autentica a senha no servidor; contas pendentes só são liberadas depois de validar a senha existente. O cliente verifica a identidade com `getUser` antes de prosseguir. A configuração global de e-mail do Rango permanece igual. Chaves privilegiadas não entram no navegador. Arquitetura e limites: [NO_EMAIL_AUTH.md](docs/NO_EMAIL_AUTH.md).

A Data API expõe `public,graphql_public,horion`; o schema privado fica fora dela. A lista é controlada por override SQL autorizado do papel `authenticator`. Alterações no Dashboard não a controlarão enquanto ele existir; para devolver o controle, conferir a lista necessária antes de `RESET pgrst.db_schemas` e recarga.

O fingerprint dos metadados protegidos do Rango permaneceu igual após a migração live. Isso comprova as definições observadas, não um checksum de todos os dados de clientes ou homologação de todos os fluxos do Rango. Detalhes: [INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) e [LIVE_RELEASE.md](docs/LIVE_RELEASE.md).

A concessão administrativa inicial foi vinculada privadamente à identidade existente confirmada indicada pelo proprietário e será ativada na adesão real. Nenhum perfil foi criado para simular esse acesso. A inspeção remota final observou zero perfis Horion, comunidades, publicações e referências de catálogo.

## Arquivos principais

| Área                               | Arquivos                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| Navegação e feed                   | `components/club-app.tsx`, `app/[locale]/[[...path]]/page.tsx`     |
| Páginas do produto                 | `components/club-pages.tsx`                                        |
| Dados, sessão e operações reais    | `lib/store.tsx`, `lib/live/`, `lib/supabase/`                      |
| Traduções                          | `lib/live-i18n.ts`, `lib/messages/live-en.json`, `live-pt-BR.json` |
| Estilos                            | `app/globals.css`, `components/pages.css`, `components/live.css`   |
| Cadastro sem e-mail                | `supabase/functions/horion-register/`, `lib/live/auth.ts`          |
| Modelo e autorização               | `supabase/migrations/`                                             |
| Configuração da API deste ambiente | `supabase/operations/`                                             |
| Build estático conectado           | `preview/entry.tsx`, `scripts/build-public-preview.mjs`            |
| Testes                             | `tests/`                                                           |

O dataset anterior permanece apenas como fixture de testes legados e não entra no grafo do build live. As cinco fotografias antigas foram removidas do projeto e do artefato público.

## Validação e continuidade

Passaram **155/155 testes automatizados**, incluindo 61 cenários SQL. TypeScript, build Next.js de produção e build estático conectado também passaram. A suíte inclui recusa de privilégios públicos, limites, senha incorreta, conta pendente e a aceitação do refresh token opaco de 12 caracteres emitido pelo GoTrue.

Quatro cenários de navegador EN/PT × desktop/mobile, com toda a rede Supabase simulada, verificaram cadastro direto, criação da sessão, onboarding sem e-mail e saída com limpeza do cookie. O teste real criou uma identidade temporária confirmada, sem perfil público Horion; encontrou uma validação excessiva do token no frontend, corrigida na versão 4. A repetição real completa e a remoção da identidade temporária aguardam autorização explícita após bloqueio da revisão automática à exclusão no Auth compartilhado.

As verificações públicas anteriores da versão 2 são históricas e não substituem a homologação autenticada da versão atual. Evidências e limites: [LIVE_RELEASE.md](docs/LIVE_RELEASE.md). A suíte local não substitui isolamento entre membros no navegador, upload/download de documentos ou auditoria integral de acessibilidade.

Próximas etapas: concluir o QA controlado e sua limpeza após autorização, homologar a adesão e publicações reais, moderação e uploads. Documentos, atendimento a solicitações de dados e políticas operacionais continuam em desenvolvimento. Society e Exchange permanecem sem pagamentos ou transações.

Repositório: [usarango/horion](https://github.com/usarango/horion). [PUBLIC_PREVIEW.md](docs/PUBLIC_PREVIEW.md) é o registro histórico da versão pública 1; o código e o build atuais seguem a configuração live descrita acima.
