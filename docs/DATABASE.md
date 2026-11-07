# Horion — banco, segurança e integração

Para a decisão sobre reutilizar a conta ou o banco do Rango e o preço oficial, consulte [INFRASTRUCTURE.md](INFRASTRUCTURE.md). A baseline recusa bancos com tabelas de aplicação existentes.

## Estado entregue

A migration `supabase/migrations/20261106233423_horion_foundation.sql` foi criada pelo comando `supabase migration new horion_foundation` da CLI **2.83.0**. Foi executada em PostgreSQL embarcado via PGlite com schemas mínimos de Auth/Storage para testes de RLS e constraints. **Não foi aplicada a nenhum projeto remoto**. Os projetos existentes na conta não foram assumidos como pertencentes ao Horion.

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
| Autorizações internas | `app_private.user_roles`, `app_private.community_moderators`, `app_private.audit_log`                                                            |

Os campos técnicos desconhecidos são `NULL`, nunca estimativas apresentadas como especificações. Referências pendentes não são públicas. Fontes e sugestões de revisão têm persistência própria. A revisão editorial do catálogo ainda precisa de um fluxo administrativo completo.

## Fronteiras de segurança

- Todas as tabelas Horion em `public` têm RLS habilitado, com permissões explícitas. Módulos futuros sem políticas de escrita permanecem inacessíveis para gravação por visitantes/membros.
- O servidor usa a chave **publishable** e o JWT do próprio usuário; nenhuma chave `service_role` é necessária na aplicação web.
- `getClaims()` verifica a sessão no Proxy. Cada operação privada verifica novamente `getUser()` no servidor; as políticas do banco continuam sendo a autorização final.
- Papéis administrativos vêm de tabelas internas; `user_metadata`, nome de perfil, assinatura e reputação não concedem privilégios.
- Os helpers `SECURITY DEFINER` ficam no schema não exposto `app_private`, têm `search_path` vazio e EXECUTE explicitamente limitado. O trigger de bootstrap de perfil só é invocável pelo fluxo de inserção de `auth.users`; metadados fornecem apenas o nome, nunca permissões.
- `cast_vote` é uma função **SECURITY INVOKER**: aplica RLS e altera somente o valor do voto, sem permitir mudar usuário ou publicação.
- Documentos, números de série, preços e passaportes são exclusivamente do proprietário. Um administrador comunitário também não pode consultá-los. A publicação de um relógio depende da opção do item **e** da opção do perfil.
- Passaportes não têm UPDATE de proprietário nem endpoint de transferência. Eventos criados pelo usuário só aceitam `owner-declared`; anexar um documento não autentica o documento ou o relógio.
- Um bloqueio é consultado nos dois sentidos por um helper privado para impedir novos comentários, votos e relações de seguir. A lista privada de bloqueios não é revelada.
- Publicação exige participação na comunidade. O trigger serializa publicações por usuário e limita a cinco por minuto, usando a hora do banco, mesmo se o cliente tentar fornecer outra data. Isso é uma proteção inicial; comentários e outros fluxos ainda precisam de limites de abuso adicionais antes de abrir cadastro público.
- Mudanças em posts registram ator/identificador/operação; mudanças de estado/fixação também produzem um registro de moderação. Os logs não copiam documentos ou números de série.
- Foreign keys compostas garantem que respostas pertençam ao mesmo post do comentário pai e que passaporte/documento pertençam ao proprietário do relógio.

## Storage

Os buckets **passport-documents** (10 MB) e **post-media** (8 MB) são privados. Ambos rejeitam tipos fora das listas configuradas. O servidor também verifica assinatura binária, não somente extensão ou MIME informado pelo navegador. SVG e HTML não são aceitos.

Documentos seguem `userId/passportId/uuid`; somente o proprietário do passaporte pode inserir/ler o objeto e seus metadados. O download exige sessão no servidor e retorna URL assinada de **60 segundos**, com disposição de download. Mídias sociais têm URLs assinadas de **300 segundos** e só podem ser lidas quando os metadados estão associados a uma publicação pública acessível e publicada. Após moderação, novas assinaturas são negadas; uma URL já emitida pode funcionar até expirar.

Uploads são append-only: sem sobrescrita/upsert. Se a gravação dos metadados falhar, o handler tenta remover o objeto recém-enviado. Há limite de tamanho antes e após leitura. O proxy de produção também deve impor o limite a corpos em streaming. Verificação de assinatura não substitui análise antimalware, decodificação completa da imagem ou remoção de EXIF: esses tratamentos e a limpeza programada de órfãos continuam pendentes.

## Endpoints preparados

Todas as respostas privadas usam `Cache-Control: private, no-store`. Escritas verificam Origin e aceitam JSON estrito via Zod, limitando corpos JSON a 32 KiB. Sem as variáveis Supabase, as operações persistentes retornam **503** explícito.

| Endpoint                           | Operação                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/auth`                    | Configuração e usuário autenticado atual, ou `{configured:false,user:null}`                                                                            |
| `POST /api/auth`                   | `{action:'login'\|'signup'\|'logout',email?,password?,displayName?,locale?}`; senha de cadastro com mínimo de 12 caracteres                            |
| `GET /auth/callback`               | Troca de código PKCE por sessão; destino restrito a `/en` ou `/pt-BR`                                                                                  |
| `GET /api/club?resource=…&page=0`  | `posts`, `communities`, `references` públicos; `watches`, `passports`, `profile`, `notifications`, `reports` com sessão e RLS; páginas de 24 registros |
| `POST /api/club`                   | Ações `profile`, `membership`, `post`, `comment`, `vote`, `save`, `watch`, `passport`, `event`, `report`, `moderate`, `notifications-read`             |
| `POST /api/passport-documents`     | Multipart `{passportId,file}`, somente proprietário                                                                                                    |
| `GET /api/passport-documents?id=…` | URL temporária de documento autorizado                                                                                                                 |
| `POST /api/post-media`             | Multipart `{postId,file,alt}`, somente autor                                                                                                           |
| `GET /api/post-media?id=…`         | URL temporária de imagem de post acessível                                                                                                             |

Os textos de usuário são dados, sem interpretação de HTML. A UI React usa escaping padrão. Conteúdo de terceiros não é automaticamente traduzido. A busca inicial usa título e paginação; há índice de busca textual disponível, mas busca global unificada/facetas ainda precisam de implementação.

## Configuração e ativação posterior

1. Selecionar explicitamente um projeto de desenvolvimento do Horion, preferencialmente vazio, e revisar a migration antes da aplicação. Não aplicar sobre esquemas desconhecidos.
2. Instalar uma CLI compatível e consultar `supabase --help`, `supabase migration --help` e a ajuda do subcomando que será utilizado. A CLI 3 mudou o destino padrão; esta entrega foi gerada com 2.83.0. A v3 tentou gravar em `/home/agent/.supabase`, que é somente leitura neste executor. A v2 foi obtida da distribuição oficial GitHub após falha do instalador npm.
3. Executar em uma stack Supabase de desenvolvimento, conferir o resultado real com os advisors de segurança/desempenho e gerar tipos TypeScript do projeto. Esses serviços e advisors não foram substituídos pelos mocks PGlite.
4. Copiar `.env.example` para `.env.local` e preencher `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_APP_URL`. Reiniciar/recompilar Next.js depois de mudar variáveis públicas.
5. Configurar URL do site, callbacks permitidos, confirmação de e-mail, SMTP e limites de Auth no projeto escolhido. Os padrões locais incluem confirmação de e-mail e senha mínima de 12 caracteres. Não habilitar login anônimo.
6. Manter apenas `public` nos schemas expostos à Data API; nunca expor `app_private`. Conceder papéis operacionais somente por administração confiável no banco. Não há administrador padrão.
7. Conectar o adaptador da UI aos endpoints e executar testes reais com visitante, proprietário A, usuário B e moderador, incluindo upload e URL expirada. Validar acessibilidade e fluxos de recuperação de senha/e-mail.
8. Só depois avaliar ambiente de homologação e publicação com aprovação do usuário. Não há cobrança, transação, KYC, transferência de passaporte ou Exchange ativo.

## LGPD/GDPR e limites da entrega

Pedidos de exportação/exclusão têm campos reservados, porém a entrega não oferece ainda o processamento completo desses pedidos. A exportação atual da UI é apenas dos dados locais demonstrativos. Exclusão real exigirá revogar sessões, apagar objetos Storage e coordenar retenção/anônimização de auditoria e contribuições editoriais. Deletar apenas `auth.users` não elimina objetos Storage nem invalida JWTs já emitidos.

Atribuições editoriais e contribuições de catálogo podem ser anonimizadas por `ON DELETE SET NULL`; dados pessoais de coleção são eliminados por cascata. Uma política legal de retenção, consentimento, termos e rotina de exclusão de objetos deve ser definida antes do uso público.

O ledger de reputação nega gravação a membros. Concessões, reversões, validação de evidências e limites por regra precisam de um worker/fluxo administrativo confiável e testes adicionais; a simples presença das tabelas não significa que a gamificação esteja concluída. Eventos de cobrança e entitlements igualmente estão preparados para evolução, sem integrações ativas.

## Verificação executada

- `tests/database.test.ts`: executa a migration inteira no PostgreSQL PGlite, troca papéis e identidade entre visitante/A/B/admin e verifica permissões, constraints, documentos, bloqueios, votos, associação de comentários, visibilidade e auditoria de moderação. Também testa o RPC de votos e o limite de publicação com tentativa de falsear a data.
- `tests/api.test.ts`: invoca handlers reais com `NextRequest`, sem servidor de preview e sem serviço externo. Verifica ausência de configuração, Origin, JSON inválido/excessivo, injeção de papel/estado de verificação, callback e assinaturas de arquivo. O marcador `server-only` recebe um shim restrito aos testes porque Next.js normalmente o resolve na compilação.
- TypeScript verificado sem erros na implementação dos handlers.

**Não verificado:** serviço real Supabase Auth/Storage/PostgREST, SMTP, renovação de sessão com cookies no navegador, advisor remoto, malware/EXIF, exclusão/exportação pessoal completa, implantação ou fluxos com múltiplas contas reais. A migration e os handlers devem passar por esses testes em homologação antes do lançamento.
