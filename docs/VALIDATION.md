# Validação desta iteração

Atualizado em 7 de novembro de 2026. Ambiente: Node.js 24.22.1, npm 11.9.0.

## Verificações locais

| Verificação         | Resultado observado                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | Passou, sem erros TypeScript                                                                                               |
| `npm test`          | **65/65 testes passaram**, zero falhas, cancelados ou ignorados                                                            |
| `npm run build`     | Passou com Webpack e `.env.local` explicitamente carregado; compilação, TypeScript, geração de páginas e traces concluídos |

A última execução completa passou com o ambiente configurado. A exposição da Data API foi posteriormente aplicada com autorização explícita e verificada diretamente por HTTP, como detalhado abaixo.

Os testes usam `node --no-wasm-tier-up --no-wasm-async-compilation --import tsx --test --test-isolation=none tests/*.test.ts`, sem serviços externos ou segredos. A contagem inclui domínio, internacionalização, handlers, configuração de Auth, RLS e proteção da migração compartilhada. O helper PGlite executa a cadeia ativa completa das duas migrações de schema. A operação de ambiente da Data API tem testes locais separados de preservação da lista exposta; esses testes não substituem a evidência HTTP remota.

## Cobertura local

- Domínio: associação a comunidades, autoria, votos, respostas, privacidade padrão, duplicidades, Passport, datas, ranking e recuperação de estado local.
- PostgreSQL/PGlite: RLS e isolamento visitante/A/B/admin, séries/documentos, negação de autoatribuição de papéis e pontos, propriedade imutável, bloqueios, comentários, moderação/auditoria, votos e limite de publicação.
- Compatibilidade compartilhada: preservação das definições e comportamento existentes simulados, ausência de hook global de adesão, colisões com rollback, proteção dos buckets Horion contra policies permissivas e privilégios padrão legados.
- API/Auth: validação dos handlers reais com `NextRequest`, Origin, payload estrito, limites, callback, assinatura de arquivos, signup desativado por padrão e cookies exclusivos.
- Internacionalização: correspondência dos dicionários e formatação localizada.

PGlite usa representações mínimas de Auth/Storage. Não substitui testes HTTP de Supabase Auth, Storage, PostgREST ou SMTP. Testes de handlers sem rede não demonstram cadastro, sessão ou acesso multiusuário real.

## Aplicação remota e preservação

A migration **`20261107003648_horion_shared_foundation`** foi aplicada ao projeto Rango **`bkjjzujujedqbsrppvpt`**. A inspeção remota confirmou os schemas `horion`/`horion_private`, 37 tabelas com RLS, dois buckets próprios e 12 novas policies de Storage.

A migration **`20261107004514_horion_shared_performance`** também foi aplicada: cinco índices compostos de FK e consolidação de duas policies de UPDATE de posts em uma, preservando a combinação OR de `USING` e `WITH CHECK`. O ajuste se restringiu ao Horion e seus testes verificam a cadeia completa.

O fingerprint dos metadados protegidos existentes foi idêntico antes e após as duas migrações e a configuração da API: **`4577a6a52b5e12c77a187d75b01282b0`**. O escopo incluiu tabelas, colunas, índices, funções, constraints e RLS do `public`, hooks Auth existentes, buckets/policies e privilégios padrão. Essa comparação confirma a preservação dessas definições observadas; não representa checksum de todas as linhas de clientes nem homologação funcional completa do Rango. Evidências: [SHARED_DATABASE_VERIFICATION.json](SHARED_DATABASE_VERIFICATION.json).

Os advisors de segurança retornaram **quatro avisos informativos de ausência de policy**, correspondentes a tabelas cujo acesso direto permanece intencionalmente negado, incluindo billing e estruturas privadas. Não houve aviso Horion de nível WARN/ERROR. Os de performance retornaram **51 avisos informativos de índices ainda sem uso**, compatíveis com a ausência de atividade da aplicação; não houve aviso Horion de FK sem índice nem de múltiplas policies permissivas. Avisos preexistentes no `public` permanecem fora do escopo desta mudança.

A checagem SQL remota do papel `anon` confirmou leitura permitida em comunidades públicas, `SELECT` negado em documentos e papéis e `EXECUTE` negado no onboarding. Essa checagem de permissões não substitui cenários com duas sessões reais.

## Configuração autorizada e verificação da Data API

A revisão automática inicialmente rejeitou a alteração persistente de `authenticator.pgrst.db_schemas`, por substituir o controle do Dashboard em projeto compartilhado sem aprovação explícita dessa abrangência. O proprietário autorizou em seguida a configuração SQL descrita e esse efeito operacional. A operação reenviada foi aprovada e aplicada como **`20261107004936_horion_shared_api_exposure`**. O registro inicial continua arquivado; o SQL executado está em [../supabase/operations/20261107004936_horion_shared_api_exposure.sql](../supabase/operations/20261107004936_horion_shared_api_exposure.sql).

A lista efetiva agora é **`public,graphql_public,horion`**, preservando o schema padrão e excluindo `horion_private`. As verificações HTTP após a aplicação observaram:

| Requisição                                 | Resultado                          |
| ------------------------------------------ | ---------------------------------- |
| Rota padrão consultada do Rango, `limit=0` | `200` com `[]`                     |
| Perfis públicos Horion                     | `200` com `[]`                     |
| Comunidades Horion                         | `200` com `[]`                     |
| Schema `horion_private`                    | `406/PGRST106`, schema não exposto |
| Documentos privados, visitante anônimo     | `401/42501`, acesso negado         |
| Onboarding, visitante anônimo              | `401/42501`, execução negada       |

A contagem de membros permaneceu **zero**. Essas provas demonstram exposição e recusas de acesso específicas; não simulam adesão autenticada, sessão completa ou upload/download real. A rota consultada do `public` continuou acessível, mas isso não é homologação funcional completa do Rango.

O override SQL passa a controlar a lista; mudanças futuras no Dashboard não a controlarão enquanto ele existir. Para devolver esse controle, revisar a lista necessária no Dashboard antes de `RESET pgrst.db_schemas` e recarga. Essa consequência foi autorizada explicitamente e não há aprovação pendente da operação aplicada.

## Revisão da interface

A revisão de código corrigiu links profundos de posts e comunidades, seleção de Passport, tema salvo, ações antes da recuperação de estado e dados locais inválidos. A navegação mobile recebeu `inert`, contenção/restauração de foco e fechamento por Escape. Essas alterações passaram pelas verificações locais pertinentes; ainda precisam de homologação em navegador.

O ambiente gerenciado não disponibilizou `cua_repl.js`, exigido pelo fluxo de QA de Sites. Não houve navegador instalado/controlado por alternativa improvisada nem servidor de preview para QA. Não há captura de tela, Lighthouse, teste visual em dispositivos ou teste ponta a ponta afirmado.

## Limites e pendências

- Testes remotos de isolamento com duas identidades autenticadas e adesão explícita por ação do usuário.
- Login, adesão, confirmação, renovação e encerramento de sessões com identidades reais do projeto compartilhado.
- Upload/download e expiração de URLs assinadas no Storage real.
- Integração da interface com os dados remotos; produto continua demonstrativo no navegador.
- Acessibilidade, contraste e reflow homologados em navegador e tecnologia assistiva.
- Antiabuso completo, antimalware, remoção de EXIF e limpeza de objetos órfãos.
- Exportação/exclusão de dados pessoais com retenção definida; exclusão sem apagar indevidamente identidade e dados Rango.
- Concessão/reversão de mérito, assinaturas, pagamentos e marketplace completos.
- Deploy da aplicação multiusuário integrada; a prévia estática pública já foi publicada.

Uma execução isolada dos testes de segurança do PGlite apresentou falha nativa do V8/WASM no Node.js 24. A execução foi estabilizada com as flags V8 verificadas `--no-wasm-tier-up --no-wasm-async-compilation`, agora presentes em `scripts.test`. Nenhum teste foi ignorado e nenhum SQL foi contornado; a rodada final passou integralmente.

O Turbopack tentou abrir uma porta interna bloqueada pelo sandbox; os comandos usam Webpack. Caches npm usam `/tmp/horion-npm-cache`, pois o diretório de usuário é somente leitura. Foi publicada somente a prévia estática pública. Nenhum novo projeto Supabase pago, mudança de plano ou transação financeira foi realizado.

As projeções públicas utilizadas pelos endpoints de posts (autor/comunidade/mídias), catálogo (modelo/coleção/marca/fontes) e comunidades também foram executadas por HTTP no schema `horion`: todas responderam 200 com zero registros. Isso verifica os relacionamentos publicados na API, sem representar conteúdo real ou fluxo autenticado. Após versionar a operação de ambiente aplicada, seus três testes locais existentes foram executados novamente e passaram; TypeScript também passou.

## Publicação da prévia interativa

A rodada desta publicação passou em 69 testes locais, sem falhas ou casos ignorados, além de TypeScript, build Next.js e build da prévia. O adaptador reutiliza o componente do produto e emite 26 caminhos de idiomas/páginas com ativos locais, sem backend ou arquivos de ambiente.

O Sites confirmou sucesso da versão pública 1 em https://horion-watch-club-preview.victortb12.chatgpt.site. As provas HTTP sem credenciais retornaram 200 para raiz, inglês, português, coleção, Passport, configurações, JavaScript, CSS, ícone, fotografia e fonte. A primeira requisição com o agente padrão de Python recebeu 403; requisições com agente de navegador retornaram 200. Não se alterou a política de rede nem se usou token de bypass para a verificação. O teste HTTP não substitui a inspeção visual em navegador, que permanece não realizada por indisponibilidade do helper gerenciado.

Os registros de versão, deployment e checks estão em [PUBLICATION.json](PUBLICATION.json). A publicação usa dados fictícios por navegador e não habilita contas ou documentos privados reais; a aplicação Next.js e o Supabase compartilhado ficam preservados para a integração posterior.
