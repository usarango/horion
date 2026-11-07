# Infraestrutura e repositório

Decisões verificadas em 7 de novembro de 2026.

## Código

O repositório indicado pelo proprietário é [usarango/horion](https://github.com/usarango/horion). A base foi preparada na branch `codex/horion-foundation`, preservando o commit inicial da `main`. O envio de código e a abertura de PR não publicam o site. Não há workflow de deploy nesta entrega.

O repositório é público. Credenciais, `.env.local`, documentos, dados pessoais e arquivos de execução não devem ser versionados. `.env.example` contém somente os nomes das variáveis.

## Supabase: organização e projeto

O proprietário autorizou considerar o Supabase utilizado pelo Rango. A organização existente está no plano Pro. A expressão “mesmo Supabase” precisa distinguir dois cenários antes de qualquer criação paga ou migração remota:

| Opção                                 | Efeito                                                                    | Custo de referência                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Projeto separado na mesma organização | Banco, Auth, Storage e configurações próprios para Horion                 | Cada projeto Micro adicional começa em aproximadamente US$10/mês de compute, faturado por hora                   |
| Mesmo projeto existente               | Reutiliza instância e capacidade; compartilha Auth, cotas e configurações | Nenhuma nova instância de compute apenas por adicionar uma aplicação; consumo excedente pode aumentar a cobrança |

O Pro começa em **US$25/mês por organização**, com **US$10/mês de créditos de compute**, suficientes para uma instância Micro. Assim, US$10 não é o preço total do plano Pro. O preço efetivo depende de compute, uso, extras e impostos; a assinatura identificada não equivale à consulta da fatura.

Fontes oficiais: [preços](https://supabase.com/pricing), [compute e créditos](https://supabase.com/docs/guides/platform/manage-your-usage/compute) e [cobrança por organização](https://supabase.com/docs/guides/platform/billing-on-supabase).

## Compatibilidade com o Rango

O código do Rango e os metadados do projeto foram consultados somente para identificar o ambiente. Nenhum dado de clientes foi copiado para este repositório. Foram encontradas tabelas existentes com nomes utilizados pela baseline do Horion, incluindo `profiles` e `notifications`.

A migração atual pressupõe **projeto dedicado com schema `public` vazio**. Uma proteção inicial recusa sua execução em um banco com tabelas de aplicação, antes de criar os schemas do Horion; o script inteiro também usa transação. Um teste PostgreSQL confirma que as tabelas, dados e namespaces existentes permanecem intactos após a recusa.

Se a escolha for compartilhar o mesmo projeto, é necessário adaptar e testar a baseline antes da aplicação:

- Isolar tabelas e helpers em schemas exclusivos, sem alterar o `public` do Rango.
- Não criar perfis Horion automaticamente para todos os usuários de `auth.users`; usar adesão explícita.
- Revisar hooks de signup, porque Auth é global ao projeto e hooks do Rango também podem disparar em contas criadas pelo Horion.
- Usar nomes exclusivos de buckets/cookies; considerar que policies permissivas existentes de Storage são combinadas por OR.
- Preservar os schemas já expostos pela API, SMTP, callbacks e configurações de Auth do Rango.
- Excluir dados Horion sem apagar a identidade compartilhada ou dados do Rango.

Criar um projeto separado é a recomendação técnica para isolar as duas aplicações. A decisão e o custo devem ser confirmados antes de provisionar. Não houve criação de projeto/branch Supabase, alteração de plano, aplicação remota de SQL ou ativação de cobrança.
