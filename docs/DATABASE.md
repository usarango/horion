# Horion — banco, segurança e integração

> **Registro histórico — fundação, 7 de novembro de 2026.** Este documento detalha a fundação e as verificações da etapa anterior à iteração live. Os estados de interface/cadastro e contagens de testes dessa etapa não descrevem a versão conectada atual. Consulte [LIVE_RELEASE.md](LIVE_RELEASE.md) para o estado atual e seus limites.

O destino aprovado é o projeto Supabase já usado pelo Rango (`bkjjzujujedqbsrppvpt`), com isolamento aditivo. Identidades Auth, capacidade e administração do projeto são compartilhadas; tabelas, permissões da aplicação, cookies e buckets Horion têm namespaces próprios. Consulte também [INFRASTRUCTURE.md](INFRASTRUCTURE.md).

## Estado entregue

A baseline compartilhada foi **aplicada com sucesso em 7 de novembro de 2026** ao projeto `bkjjzujujedqbsrppvpt`. A história remota registra a versão **20261107003648**, nome **horion_shared_foundation**; a migration local é reconciliada com essa versão atribuída pelo servidor. A migration adicional `20261107004514_horion_shared_performance` também foi aplicada: cinco índices compostos e uma policy de UPDATE com as mesmas permissões de autor/moderador. A proposta original para banco dedicado, em `docs/archive/20261106233423_horion_foundation.sql.txt`, nunca foi aplicada e não deve ser executada.

O preflight somente leitura foi executado antes e depois. O fingerprint protegido foi idêntico nos dois resultados: **`4577a6a52b5e12c77a187d75b01282b0`**. A comparação cobriu DDL público, hooks de `auth.users`, privilégios e policies antigos de Storage, buckets existentes e privilégios padrão. Os novos objetos ficaram nos namespaces Horion; nenhuma configuração de Auth foi modificada, nenhuma identidade foi criada e signup continua desativado por padrão, com adesão explícita.

A URL e a chave **publishable** estão configuradas no `.env.local` ignorado pelo Git. **A Data API está ativa para `public, graphql_public, horion`**. O usuário aprovou explicitamente essa lista e o controle por SQL sobre a configuração do Dashboard; a operação remota **20261107004936_horion_shared_api_exposure** foi aplicada com sucesso. `horion_private` permanece fora da Data API. Não há fallback dos clientes Horion para tabelas `public` do Rango.

A tentativa inicial de exposição foi rejeitada pela revisão automática por falta de aprovação explícita. Esse bloqueio foi resolvido pelo consentimento posterior do usuário e pela aplicação autorizada; **não há aprovação pendente para a exposição atual**. A operação fica versionada separadamente em `supabase/operations/20261107004936_horion_shared_api_exposure.sql`, fora das duas migrations de schema executadas pela cadeia local.

Os advisors de segurança não apontaram WARN/ERROR atribuídos ao Horion. Os quatro INFO de tabelas com RLS sem policies correspondem às negações intencionais em `billing_events`, `horion_private.user_roles`, `horion_private.community_moderators` e `horion_private.audit_log`. Isso não representa validação de sessão autenticada, onboarding real ou aprovação para lançamento.

A interface atual usa um repositório de demonstração no navegador. O login real, quando configurado, cria uma sessão Supabase independente. Configurar credenciais **não muda automaticamente o feed ou a coleção demonstrativos para dados remotos**. Os endpoints abaixo são a fundação de persistência real; a troca do adaptador da interface e os testes integrados de múltiplas sessões são a próxima etapa.

## Modelo

| Domínio               | Tabelas e responsabilidades                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identidade            | `profiles` contém apenas dados públicos; `profile_private` mantém preferências e pedidos de exportação/exclusão; `follows`, `blocks`             |
| Comunidade            | `communities`, `memberships`, `posts`, `comments`, `votes`, `saved_posts`, `media`                                                               |
| Catálogo              | `brands` → `watch_collections` → `watch_models` → `watch_references`; `movements`, `catalog_sources`, `catalog_revisions`                        |
| Coleção               | `user_watches` contém apresentação pública opcional; `watch_private` separa número de série, preço, moeda, data e notas                          |
| Passport              | `passports`, `passport_events`, `passport_documents`; proprietário composto nas FKs impede associação a relógios de terceiros                    |
| Reputação             | `reputation_rules`, `reputation_events`, `reputation_levels`, `badges`, `user_badges`; nenhuma concessão por pagamentos ou número bruto de posts |
| Society               | `subscription_plans`, `entitlement_definitions`, `plan_entitlements`, `subscriptions`, `billing_events`; sem provedor ou cobrança ativa          |
| Conteúdo e operação   | `editorial_content`, `notifications`, `reports`, `moderation_actions`                                                                            |
| Autorizações internas | `horion_private.user_roles`, `horion_private.community_moderators`, `horion_private.audit_log`                                                   |

Os campos técnicos desconhecidos são `NULL`, nunca estimativas apresentadas como especificações. Referências pendentes não são públicas. Fontes e sugestões de revisão têm persistência própria. A revisão editorial do catálogo ainda precisa de um fluxo administrativo completo.

## Fronteiras de segurança

- Todas as tabelas Horion em `horion` têm RLS habilitado, com permissões explícitas. Módulos futuros sem políticas de escrita permanecem inacessíveis para gravação por visitantes/membros.
- O servidor usa a chave **publishable** e o JWT do próprio usuário; nenhuma chave `service_role` é necessária na aplicação web.
- `getClaims()` verifica a sessão no Proxy. Cada operação privada verifica novamente `getUser()` no servidor; as políticas do banco continuam sendo a autorização final.
- Papéis administrativos vêm de tabelas internas; `user_metadata`, nome de perfil, assinatura e reputação não concedem privilégios.
- Os helpers `SECURITY DEFINER` ficam no schema não exposto `horion_private`, têm `search_path` vazio e EXECUTE explicitamente limitado. **Nenhum trigger Horion é instalado em `auth.users`**. A adesão acontece por chamada explícita ao RPC `horion.onboard_member(p_username,p_display_name,p_locale)`, `SECURITY INVOKER`, somente para `auth.uid()`. Usuário Auth do Rango não recebe perfil Horion automaticamente. A chamada é idempotente, valida os campos antes de inserir e não sobrescreve perfil existente.
- `cast_vote` é uma função **SECURITY INVOKER**: aplica RLS e altera somente o valor do voto, sem permitir mudar usuário ou publicação.
- Documentos, números de série, preços e passaportes são exclusivamente do proprietário. Um administrador comunitário também não pode consultá-los. A publicação de um relógio depende da opção do item **e** da opção do perfil.
- Passaportes não têm UPDATE de proprietário nem endpoint de transferência. Eventos criados pelo usuário só aceitam `owner-declared`; anexar um documento não autentica o documento ou o relógio.
- Um bloqueio é consultado nos dois sentidos por um helper privado para impedir novos comentários, votos e relações de seguir. A lista privada de bloqueios não é revelada.
- Publicação exige participação na comunidade. O trigger serializa publicações por usuário e limita a cinco por minuto, usando a hora do banco, mesmo se o cliente tentar fornecer outra data. Isso é uma proteção inicial; comentários e outros fluxos ainda precisam de limites de abuso adicionais antes de abrir cadastro público.
- Mudanças em posts registram ator/identificador/operação; mudanças de estado/fixação também produzem um registro de moderação. Os logs não copiam documentos ou números de série.
- Foreign keys compostas garantem que respostas pertençam ao mesmo post do comentário pai e que passaporte/documento pertençam ao proprietário do relógio. Reversões de reputação só podem apontar para evento do mesmo membro. A remoção de um comentário promove suas respostas a comentários raiz, e a remoção de evento anula o ponteiro de reversão: essas referências não bloqueiam a exclusão coordenada de uma identidade Auth compartilhada.

## Storage

Os buckets **horion-passport-documents** (10 MB) e **horion-post-media** (8 MB) são privados. Ambos rejeitam tipos fora das listas configuradas. O servidor também verifica assinatura binária, não somente extensão ou MIME informado pelo navegador. SVG e HTML não são aceitos.

As policies existentes do Rango permanecem com as mesmas definições. Como policies permissivas se combinam por **OR**, o Horion também instala guards **RESTRICTIVE** de SELECT/INSERT/UPDATE/DELETE para `anon` e `authenticated`: eles exigem a autorização Horion para os dois buckets novos e retornam verdadeiro para qualquer outro bucket. Assim, uma policy legada ampla não abre os documentos Horion e o acesso dos outros buckets não é alterado. UPDATE/upsert e mudança de bucket de objetos Horion são negados.

Documentos seguem `userId/passportId/uuid`; somente o proprietário do passaporte pode inserir/ler o objeto e seus metadados. O download exige sessão no servidor e retorna URL assinada de **60 segundos**, com disposição de download. Mídias sociais têm URLs assinadas de **300 segundos** e só podem ser lidas quando os metadados estão associados a uma publicação pública acessível e publicada. Após moderação, novas assinaturas são negadas; uma URL já emitida pode funcionar até expirar.

Imagens de post seguem `userId/postId/uuid` e exigem post publicado do próprio autor. Uploads são append-only: sem sobrescrita/upsert. Se a gravação dos metadados falhar, o handler tenta remover o objeto recém-enviado. Há limite de tamanho antes e após leitura. O proxy de produção também deve impor o limite a corpos em streaming. Verificação de assinatura não substitui análise antimalware, decodificação completa da imagem ou remoção de EXIF: esses tratamentos e a limpeza programada de órfãos continuam pendentes.

## Endpoints preparados

Todas as respostas privadas usam `Cache-Control: private, no-store`. Escritas verificam Origin e aceitam JSON estrito via Zod, limitando corpos JSON a 32 KiB. Sem as variáveis Supabase, as operações persistentes retornam **503** explícito.

| Endpoint                           | Operação                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/auth`                    | Configuração e usuário autenticado atual, ou `{configured:false,user:null}`                                                                            |
| `POST /api/auth`                   | `{action:'login'\|'signup'\|'logout',email?,password?,displayName?,locale?}`; senha de cadastro com mínimo de 12 caracteres                            |
| `POST /api/onboarding`             | Adesão explícita do usuário autenticado ao Horion; não cria identidade Auth nem altera perfil Rango                                                    |
| `GET /auth/callback`               | Troca de código PKCE por sessão; destino restrito a `/en` ou `/pt-BR`                                                                                  |
| `GET /api/club?resource=…&page=0`  | `posts`, `communities`, `references` públicos; `watches`, `passports`, `profile`, `notifications`, `reports` com sessão e RLS; páginas de 24 registros |
| `POST /api/club`                   | Ações `profile`, `membership`, `post`, `comment`, `vote`, `save`, `watch`, `passport`, `event`, `report`, `moderate`, `notifications-read`             |
| `POST /api/passport-documents`     | Multipart `{passportId,file}`, somente proprietário                                                                                                    |
| `GET /api/passport-documents?id=…` | URL temporária de documento autorizado                                                                                                                 |
| `POST /api/post-media`             | Multipart `{postId,file,alt}`, somente autor                                                                                                           |
| `GET /api/post-media?id=…`         | URL temporária de imagem de post acessível                                                                                                             |

Os textos de usuário são dados, sem interpretação de HTML. A UI React usa escaping padrão. Conteúdo de terceiros não é automaticamente traduzido. A busca inicial usa título e paginação; há índice de busca textual disponível, mas busca global unificada/facetas ainda precisam de implementação.

## Projeto compartilhado: configuração e ativação

1. **Concluído — destino e preflight:** projeto `bkjjzujujedqbsrppvpt`, com resultados de [preflight_shared.sql](../supabase/preflight_shared.sql) comparados antes/depois e fingerprint protegido idêntico. A baseline recusa colisões nos nomes Horion e stacks onde `storage.objects` não existe ou está sem RLS; não altera o RLS existente para tentar corrigir esse ambiente.
2. **Concluído — baseline:** migration remota `20261107003648_horion_shared_foundation`. Ela criou tabelas/functions/grants/policies nos schemas Horion, dois buckets privados e guards Storage de escopo restrito. A preservação do DDL público, hooks de Auth e objetos antigos de Storage foi verificada pelo preflight. Não reaplicar a baseline, executar `db reset`, push de configuração ou reconciliar automaticamente migrations de outros aplicativos.
3. **Concluído — Data API:** operação autorizada `20261107004936_horion_shared_api_exposure`, com lista ativa **`public, graphql_public, horion`**. **Nunca expor `horion_private`**. O registro SQL está em `supabase/operations`, separado das migrations de schema. Sua aplicação exige um preflight da lista efetivamente observada e preservação de todos os schemas existentes; não presumir que outra instalação usa a mesma lista. O override persistente do papel `authenticator` é agora a fonte de controle da exposição. Alterações futuras pelo Dashboard podem não prevalecer enquanto ele existir. Uma eventual devolução do controle ao Dashboard exige preservar a lista equivalente primeiro, revisar o `RESET` somente de `pgrst.db_schemas` e recarregar a configuração; não executar esse procedimento automaticamente. `supabase/config.toml` serve somente à stack local e não deve substituir a configuração remota do Rango.
4. **Concluído parcialmente — credenciais e clientes:** `.env.local` ignorado contém URL e chave publishable do projeto. Os clientes usam `db.schema='horion'`, cookie exclusivo Horion e nenhum fallback para `public`. Confirmar `NEXT_PUBLIC_APP_URL` para cada ambiente antes de testar autenticação real. A configuração de credenciais não muda os dados demonstrativos da interface para dados remotos.
5. **Mantido — identidades compartilhadas:** criação de novas identidades desativada por padrão. O hook Rango `public.handle_new_user` é global e também seria chamado por signup Horion; é necessário avaliar seus efeitos antes de habilitá-lo. Login de conta existente e adesão explícita ao Horion são fluxos distintos. Nenhuma senha, política de confirmação, configuração SMTP, template ou provedor global foi alterado nesta aplicação.
6. **Preparado — sessão e exclusão:** logout usa `scope:'local'`, evitando revogar outras sessões do usuário. Recuperação/exclusão da identidade Auth compartilhada exige coordenação entre produtos; Horion não usa Auth Admin para apagar contas globais.
7. **Pendente — validação integrada com contas reais:** a exposição e as provas HTTP anônimas já foram verificadas; ainda é necessário testar login, conta Auth sem adesão, membros A/B e moderador, incluindo URL expirada e uploads, sem presumir que os mocks substituem esses serviços. Conectar o adaptador da interface aos endpoints. As avaliações de desempenho já executadas estão registradas abaixo; novas verificações devem acompanhar mudanças futuras. Publicação do site continua dependente da aprovação separada do usuário.

A CLI 3 mudou o destino padrão e tentou gravar em um diretório somente leitura neste executor; a baseline foi gerada com a distribuição oficial **2.83.0**. Consultar `--help` antes de operar a CLI. Não há cobrança, transação, KYC, transferência de passaporte ou Exchange ativo.

## LGPD/GDPR e limites da entrega

Pedidos de exportação/exclusão têm campos reservados, porém a entrega não oferece ainda o processamento completo desses pedidos. A exportação atual da UI é apenas dos dados locais demonstrativos. Exclusão Horion exigirá apagar somente dados e objetos Horion e coordenar retenção/anônimização de auditoria e contribuições editoriais. **Não apagar `auth.users` nem revogar globalmente sessões** por pedido restrito ao Horion: a identidade também pertence ao Rango. Exclusão global só pode ocorrer em fluxo coordenado entre produtos. Deletar apenas `auth.users` não elimina objetos Storage nem invalida JWTs já emitidos.

Atribuições editoriais e contribuições de catálogo podem ser anonimizadas por `ON DELETE SET NULL`; dados pessoais de coleção são eliminados por cascata. Uma política legal de retenção, consentimento, termos e rotina de exclusão de objetos deve ser definida antes do uso público.

O ledger de reputação nega gravação a membros. Concessões, reversões, validação de evidências e limites por regra precisam de um worker/fluxo administrativo confiável e testes adicionais; a simples presença das tabelas não significa que a gamificação esteja concluída. Eventos de cobrança e entitlements igualmente estão preparados para evolução, sem integrações ativas.

## Verificação executada

- Aplicação remota da baseline confirmada na história `20261107003648 / horion_shared_foundation`.
- Preflight remoto antes/depois: fingerprint protegido idêntico `4577a6a52b5e12c77a187d75b01282b0`.
- Operação remota de Data API confirmada na história `20261107004936 / horion_shared_api_exposure`, após aprovação explícita do usuário.
- Provas HTTP reais: endpoint padrão `public` do Rango retornou **200**; `horion.profiles` e `horion.communities` retornaram **200**; `horion_private` retornou **406**. Acesso anônimo a documentos e execução anônima de onboarding foram negados com **401 / 42501**. Nenhum membro ou identidade foi criado por essas verificações.
- Advisors de segurança: sem WARN/ERROR do Horion; quatro INFO de ausência intencional de policies nas tabelas internas/futuras citadas acima.
- `tests/database.test.ts`: executa toda a cadeia ativa de migrations de schema no PostgreSQL PGlite, troca papéis e identidade entre visitante/A/B/admin e verifica permissões, constraints, documentos, bloqueios, votos, associação de comentários, visibilidade e auditoria de moderação. Também testa o RPC de votos e o limite de publicação com tentativa de falsear a data.
- `tests/migration-safety.test.ts`: simula objetos públicos, hook Auth, buckets e policies permissivas do Rango; verifica fingerprints preservados, ausência de adesão automática, onboarding explícito e guards RESTRICTIVE contra vazamento por OR, além de colisões/rollback.
- `tests/api.test.ts`: invoca handlers reais com `NextRequest`, sem servidor de preview e sem serviço externo. Verifica ausência de configuração, Origin, JSON inválido/excessivo, injeção de papel/estado de verificação, callback e assinaturas de arquivo. O marcador `server-only` recebe um shim restrito aos testes porque Next.js normalmente o resolve na compilação.
- TypeScript verificado sem erros na implementação dos handlers.

**Limites:** os testes PGlite não substituem serviços reais Supabase Auth/Storage/PostgREST, SMTP, renovação de cookies no navegador ou advisors. Malware/EXIF, exclusão/exportação pessoal completa e fluxos de múltiplas contas reais continuam pendentes até verificação própria. A aplicação remota, o fingerprint, os advisors e as respostas HTTP anônimas são verificações distintas dos testes locais. Eles não equivalem à validação de login/onboarding com usuários reais, upload privado ou sessão renovada no navegador. O MVP completo ainda não está concluído.

## Fechamento desta configuração

A rodada final passou em 65 testes, sem falhas ou testes ignorados, com toda a cadeia de migrations ativa em PGlite. TypeScript e build com `.env.local` passaram. A execução dos testes usa `--no-wasm-tier-up --no-wasm-async-compilation` para estabilizar o teardown de múltiplas instâncias PGlite no Node 24 após um crash nativo do compilador WASM; nenhuma validação SQL foi removida.

Após o follow-up, os advisors de performance do Horion reportaram apenas 51 INFO de [índices ainda sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), compatíveis com as tabelas recém-criadas e sem membros. Não restam as cinco FKs sem índice nem o WARN de múltiplas policies de UPDATE do Horion. Os quatro INFO de segurança por [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) são negações intencionais de acesso direto.

O fingerprint protegido continuou idêntico após as duas migrations de schema **e após a exposição autorizada da Data API**: `4577a6a52b5e12c77a187d75b01282b0`. Um teste SQL remoto com papel anônimo confirmou acesso ao conteúdo público vazio e negação de SELECT em documentos/papéis internos ou EXECUTE no onboarding. As provas HTTP posteriores à exposição confirmaram `public` do Rango e os endpoints públicos Horion respondendo 200, `horion_private` fora da API e documentos/onboarding inacessíveis ao papel anônimo. Permanecem **zero membros Horion**, sem identidade nova ou alterações globais de Auth. Essas provas não representam um fluxo concluído de sessão, adesão ou upload privado com usuário real. Evidências sem credenciais estão em [SHARED_DATABASE_VERIFICATION.json](SHARED_DATABASE_VERIFICATION.json).

As duas migrations em `supabase/migrations` modelam o schema Horion. A operação global aprovada de exposição está separada em `supabase/operations/20261107004936_horion_shared_api_exposure.sql` e deve ser tratada com o preflight próprio da configuração observada. `supabase/config.toml` é somente para a stack local: não executar `supabase config push` ou reset no projeto compartilhado, pois isso poderia alterar configurações globais do Rango. A exposição atual é controlada pelo override SQL autorizado; uma futura transição de volta ao Dashboard requer a preservação explícita da lista e revisão do RESET antes da execução.
