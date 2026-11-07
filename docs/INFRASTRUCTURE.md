# Infraestrutura e repositório

Estado verificado em 7 de novembro de 2026.

## Código

Repositório: [usarango/horion](https://github.com/usarango/horion), branch de trabalho `codex/horion-foundation`. A base preserva o commit inicial da `main`. Envio de código e PR não publicam o site; não há workflow de deploy nesta entrega.

O repositório é público. Credenciais, `.env.local`, documentos, dados pessoais e arquivos de execução não devem ser versionados. `.env.example` registra configuração de exemplo, sem chave de acesso. O identificador e a URL do projeto Supabase não são segredos.

## Supabase compartilhado escolhido

O Horion utiliza o projeto Rango **`bkjjzujujedqbsrppvpt`**, na organização Pro existente. Não foi criado outro projeto/branch Supabase, alterado plano ou ativado pagamento.

A migration **`20261107003648_horion_shared_foundation`** consta no histórico remoto e criou:

- Schemas `horion` e `horion_private`, com 37 tabelas protegidas por RLS.
- Buckets `horion-passport-documents` e `horion-post-media`.
- 12 novas policies de Storage, incluindo proteções contra permissões amplas preexistentes.
- Funções e constraints para adesão explícita, propriedade, moderação e auditoria.

A segunda migration aplicada, **`20261107004514_horion_shared_performance`**, acrescentou cinco índices compostos para FKs e consolidou duas policies de UPDATE de posts em uma. A combinação OR das condições `USING` e `WITH CHECK` foi preservada. Essas alterações se limitam aos objetos Horion.

A baseline anterior para projeto dedicado foi arquivada; a versão atual não usa os nomes de tabelas do `public` do Rango. O fingerprint dos metadados protegidos existentes permaneceu **`4577a6a52b5e12c77a187d75b01282b0`** antes e depois de ambas as migrações. Esse levantamento cobriu definições de tabelas, colunas, índices, funções, constraints e RLS do `public`, hooks Auth existentes, buckets/policies e privilégios padrão; não é checksum de todos os dados de clientes nem teste ponta a ponta do Rango. Os resultados estão em [SHARED_DATABASE_VERIFICATION.json](SHARED_DATABASE_VERIFICATION.json).

## Exposição da Data API: pendente

O PostgREST observado ainda expõe somente **`public,graphql_public`**. A rota padrão consultada do Rango respondeu `200` com `[]`; requisições com `Accept-Profile: horion` e com o schema privado receberam `406/PGRST106`. Assim, a aplicação das tabelas não habilitou o onboarding ou os endpoints remotos de dados Horion.

A revisão automática **rejeitou** a proposta de override, `ALTER ROLE authenticator SET pgrst.db_schemas`. O motivo foi a alteração persistente de configuração compartilhada e a substituição do controle de schemas pelo Dashboard, sem aprovação explícita dessa abrangência. **O comando não foi executado.** O SQL está arquivado em [operations/proposed_api_role_override.sql.txt](operations/proposed_api_role_override.sql.txt), fora das migrações aplicáveis.

O passo recomendado é adicionar `horion` em **Data API → Settings → Exposed schemas**, preservando `public` e `graphql_public`, após aprovação explícita. Depois, validar por HTTP o acesso ao schema e o comportamento anterior do `public`. Não é necessário um override de papel para essa configuração pelo Dashboard.

Referências oficiais: [schemas customizados](https://supabase.com/docs/guides/api/using-custom-schemas), [PGRST106](https://supabase.com/kb/troubleshooting/pgrst106-the-schema-must-be-one-of-the-following-error-when-querying-an-exposed-schema) e [efeito dos overrides sobre o Dashboard](https://supabase.com/kb/troubleshooting/postgrest-error-pgrst002-could-not-query-the-database-for-the-schema-cache-c396e9).

## Auth e limites do compartilhamento

Os clientes acessam o schema `horion` e usam cookies próprios `horion-auth`. O diretório Auth, as cotas, o SMTP e as configurações de identidade continuam globais ao projeto. Cookies separados não tornam independentes as identidades.

`HORION_ALLOW_SHARED_SIGNUP=false` mantém a criação de contas desativada por padrão. Usuários existentes precisam aderir explicitamente para criar o perfil Horion; não foi adicionado um hook global de signup do Horion. Não se deve habilitar cadastro ou excluir identidades compartilhadas como se o projeto atendesse somente a esta aplicação.

A interface de produto continua demonstrativa e local. Configurar as variáveis de ambiente habilita os clientes preparados, mas não migra registros fictícios nem conecta automaticamente o feed, a coleção ou o Passport ao banco remoto.

## Custos de referência

O Pro começa em **US$25/mês por organização**, incluindo **US$10/mês de créditos de compute**, suficientes para uma instância Micro. Um Micro adicional começa em aproximadamente **US$10/mês**, faturado por hora. US$10 não é o preço total do Pro.

Reutilizar o projeto existente não cria outra instância de compute apenas por adicionar uma aplicação. Consumo excedente e mudanças de capacidade podem aumentar a cobrança; o plano consultado não equivale à verificação da fatura real. Não foi assumida despesa nova.

Fontes oficiais: [preços](https://supabase.com/pricing), [compute e créditos](https://supabase.com/docs/guides/platform/manage-your-usage/compute) e [cobrança por organização](https://supabase.com/docs/guides/platform/billing-on-supabase).

## Continuidade

Validação final local: 65/65 testes, TypeScript e build aprovados, incluindo build com `.env.local`. A análise remota de segurança apresentou quatro avisos informativos de acesso direto intencionalmente negado. A de performance apresentou 51 avisos informativos de índices ainda sem uso, compatíveis com a ausência de atividade da aplicação, sem aviso Horion de FK sem índice ou múltiplas policies permissivas. Detalhes e limites: [VALIDATION.md](VALIDATION.md).

Primeiro, aprovar/configurar a exposição do schema. Depois, testar adesão e isolamento remotos, homologar Storage e sessões, conectar a interface e preparar deploy separado. Publicação em produção, despesas e pagamentos permanecem fora da execução autorizada atual.
