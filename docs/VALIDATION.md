# Validação desta iteração

Atualizado em 7 de novembro de 2026. Ambiente: Node.js 24.22.1, npm 11.9.0.

## Verificações locais

| Verificação         | Resultado observado                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` | Passou, sem erros TypeScript                                                                                               |
| `npm test`          | **65/65 testes passaram**, zero falhas, cancelados ou ignorados                                                            |
| `npm run build`     | Passou com Webpack e `.env.local` explicitamente carregado; compilação, TypeScript, geração de páginas e traces concluídos |

Esta é a rodada final após a configuração de ambiente e o arquivamento da proposta rejeitada de exposição da API.

Os testes usam `node --no-wasm-tier-up --no-wasm-async-compilation --import tsx --test --test-isolation=none tests/*.test.ts`, sem serviços externos ou segredos. A contagem inclui domínio, internacionalização, handlers, configuração de Auth, RLS e proteção da migração compartilhada. O helper PGlite executa a cadeia ativa completa das duas migrações. Os casos que exercitam o SQL proposto de exposição são evidência local da proposta; não comprovam sua execução remota.

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

O fingerprint dos metadados protegidos existentes foi idêntico antes e após ambas as migrações: **`4577a6a52b5e12c77a187d75b01282b0`**. O escopo incluiu tabelas, colunas, índices, funções, constraints e RLS do `public`, hooks Auth existentes, buckets/policies e privilégios padrão. Essa comparação confirma a preservação dessas definições observadas; não representa checksum de todas as linhas de clientes nem homologação funcional completa do Rango. Evidências: [SHARED_DATABASE_VERIFICATION.json](SHARED_DATABASE_VERIFICATION.json).

Os advisors de segurança retornaram **quatro avisos informativos de ausência de policy**, correspondentes a tabelas cujo acesso direto permanece intencionalmente negado, incluindo billing e estruturas privadas. Não houve aviso Horion de nível WARN/ERROR. Os de performance retornaram **51 avisos informativos de índices ainda sem uso**, compatíveis com a ausência de atividade da aplicação; não houve aviso Horion de FK sem índice nem de múltiplas policies permissivas. Avisos preexistentes no `public` permanecem fora do escopo desta mudança.

A checagem SQL remota do papel `anon` confirmou leitura permitida em comunidades públicas, `SELECT` negado em documentos e papéis e `EXECUTE` negado no onboarding. Essa checagem de permissões não substitui cenários com duas sessões reais.

## Revisão automática e Data API

A revisão automática rejeitou a proposta de alteração persistente de `authenticator.pgrst.db_schemas`, pois ela substituiria o controle do Dashboard em um projeto compartilhado sem aprovação explícita dessa abrangência. **A proposta não foi executada.** Seu SQL foi retirado das migrações aplicáveis e arquivado em [operations/proposed_api_role_override.sql.txt](operations/proposed_api_role_override.sql.txt).

A prova HTTP de configuração continua indicando apenas **`public,graphql_public`** como schemas expostos. A rota padrão consultada do Rango, com `limit=0`, respondeu **`200` e `[]`**; as requisições com `Accept-Profile: horion` e com o schema privado receberam **`406/PGRST106`**. Isso demonstra que a rota consultada do `public` continua acessível e que os schemas Horion não foram expostos; não é homologação completa do Rango. Onboarding e CRUD remotos do Horion ainda não estão ativos pela Data API. O próximo passo recomendado é adicionar `horion` no Dashboard, mantendo os schemas existentes, após aprovação explícita.

## Revisão da interface

A revisão de código corrigiu links profundos de posts e comunidades, seleção de Passport, tema salvo, ações antes da recuperação de estado e dados locais inválidos. A navegação mobile recebeu `inert`, contenção/restauração de foco e fechamento por Escape. Essas alterações passaram pelas verificações locais pertinentes; ainda precisam de homologação em navegador.

O ambiente gerenciado não disponibilizou `cua_repl.js`, exigido pelo fluxo de QA de Sites. Não houve navegador instalado/controlado por alternativa improvisada nem servidor de preview para QA. Não há captura de tela, Lighthouse, teste visual em dispositivos ou teste ponta a ponta afirmado.

## Limites e pendências

- Aprovação e configuração da exposição de `horion`, seguidas de prova HTTP e testes remotos de isolamento.
- Login, adesão, confirmação, renovação e encerramento de sessões com identidades reais do projeto compartilhado.
- Upload/download e expiração de URLs assinadas no Storage real.
- Integração da interface com os dados remotos; produto continua demonstrativo no navegador.
- Acessibilidade, contraste e reflow homologados em navegador e tecnologia assistiva.
- Antiabuso completo, antimalware, remoção de EXIF e limpeza de objetos órfãos.
- Exportação/exclusão de dados pessoais com retenção definida; exclusão sem apagar indevidamente identidade e dados Rango.
- Concessão/reversão de mérito, assinaturas, pagamentos e marketplace completos.
- Deploy e publicação em produção.

Uma execução isolada dos testes de segurança do PGlite apresentou falha nativa do V8/WASM no Node.js 24. A execução foi estabilizada com as flags V8 verificadas `--no-wasm-tier-up --no-wasm-async-compilation`, agora presentes em `scripts.test`. Nenhum teste foi ignorado e nenhum SQL foi contornado; a rodada final passou integralmente.

O Turbopack tentou abrir uma porta interna bloqueada pelo sandbox; os comandos usam Webpack. Caches npm usam `/tmp/horion-npm-cache`, pois o diretório de usuário é somente leitura. Nenhum novo projeto pago, mudança de plano, deploy ou transação financeira foi realizado.
