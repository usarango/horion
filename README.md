# HORION WATCH CLUB

Aplicação **Next.js 16, React, TypeScript e Tailwind CSS**, com identidade editorial, inglês/português e dados de produto no **Supabase/PostgreSQL**, protegidos por autorização e RLS.

**A interface atual está conectada ao banco e começa sem conteúdo semeado.** Não carrega perfis, comunidades, fotografias de catálogo ou publicações fictícias; não usa registros locais como alternativa ao backend. Acesso de conta, cadastro e adesão ao perfil Horion usam o Supabase real. A rodada de navegador verificou os fluxos públicos e a apresentação dos formulários, sem criar contas ou enviar e-mails. A homologação autenticada completa do MVP continua pendente.

O build Next.js e o artefato estático conectado passaram. A publicação anterior foi a versão pública 1 de avaliação; ela não descreve a implementação live atual. O resultado de uma nova publicação será registrado separadamente após confirmação do serviço. Estado, evidências e limites desta iteração: [LIVE_RELEASE.md](docs/LIVE_RELEASE.md).

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

Essas funcionalidades estão ligadas ao backend no código; a validação em navegador desta rodada foi anônima. Não foi realizado um percurso autenticado completo com publicação, interação entre duas contas ou armazenamento de documentos.

## Identidade e segurança

O projeto Supabase é compartilhado com o Rango. Horion usa schemas `horion`/`horion_private` e cookies próprios `horion-auth`; o diretório Auth, SMTP, cotas e configurações de identidade continuam compartilhados. Uma conta de acesso só recebe perfil Horion por adesão explícita.

A confirmação de e-mail é necessária. A interface aceita o link recebido por e-mail e o valida contra a origem Supabase configurada, sem alterar o redirect global do projeto. A entrega de mensagens, templates/SMTP e criação de contas reais ainda precisam de homologação. Nenhum endereço de teste foi cadastrado nesta rodada.

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
| Modelo e autorização               | `supabase/migrations/`                                             |
| Configuração da API deste ambiente | `supabase/operations/`                                             |
| Build estático conectado           | `preview/entry.tsx`, `scripts/build-public-preview.mjs`            |
| Testes                             | `tests/`                                                           |

O dataset anterior permanece apenas como fixture de testes legados e não entra no grafo do build live. As cinco fotografias antigas foram removidas do projeto e do artefato público.

## Validação e continuidade

Passaram **116/116 testes automatizados**, incluindo 50 casos SQL e nove testes de concessão administrativa diferida. `npm run typecheck`, build Next.js de produção e build estático conectado também passaram.

Passaram **26 cenários de navegador**: quatro combinações EN/PT × desktop/mobile na home/acesso e 22 visitas às páginas secundárias. Não houve erros de console, exceções de página, violações de CSP, requisições falhas ou overflow nas larguras verificadas. As capturas foram inspecionadas. O build também recusou URL insegura, chave ausente e chave secreta antes de alterar o artefato existente.

Outros **quatro cenários de onboarding de loja** passaram com todas as chamadas Supabase interceptadas: validaram argumentos enviados, preservação de campos em falha e atualização do perfil após resposta simulada. Eles não criaram contas/lojas reais nem substituem a homologação autenticada no backend.

A suíte local verifica domínio, operações, handlers, internacionalização e PostgreSQL/RLS com PGlite. Ela não substitui e-mail real, sessão confirmada, isolamento entre membros em navegador, upload/download ou auditoria completa de acessibilidade. Os registros detalhados do QA atual estão em [LIVE_RELEASE.md](docs/LIVE_RELEASE.md); [VALIDATION.md](docs/VALIDATION.md) preserva a rodada histórica da fundação.

As próximas etapas são homologar confirmação e adesão com contas reais, isolamento entre membros, moderação autorizada e uploads; concluir documentos privados, processamento de dados pessoais e políticas operacionais. Reputação, Society, Journal editorial e Exchange continuam seguindo o roteiro em [ROADMAP.md](docs/ROADMAP.md), sem antecipar pagamentos.

Repositório: [usarango/horion](https://github.com/usarango/horion). [PUBLIC_PREVIEW.md](docs/PUBLIC_PREVIEW.md) é o registro histórico da versão pública 1; o código e o build atuais seguem a configuração live descrita acima.
