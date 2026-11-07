# Arquitetura do Horion

## Escopo desta base

O Horion começa como um monólito modular: uma aplicação Next.js com React e TypeScript e uma base PostgreSQL gerenciada pelo Supabase. Os módulos compartilham identidade e referências, sem exigir microserviços. O código local não publica um site, não ativa cobrança e não altera automaticamente projetos Supabase existentes.

Há duas fronteiras que precisam permanecer explícitas:

- **Demonstração:** dados fictícios e interações persistidas no navegador. Serve para avaliar navegação, linguagem visual e fluxos de produto. Não oferece isolamento entre usuários, comprovação de identidade ou armazenamento seguro de documentos.
- **Backend Supabase:** migrações, políticas e pontos de integração preparados para um projeto explicitamente escolhido. Sua existência no repositório não significa que o banco remoto foi configurado nem que os fluxos foram validados em produção. Consulte [DATABASE.md](DATABASE.md).

Não se deve trocar silenciosamente uma falha do backend por uma gravação local: isso daria ao usuário uma confirmação falsa de persistência.

## Organização

| Camada             | Responsabilidade                                                               |
| ------------------ | ------------------------------------------------------------------------------ |
| `app/`             | Rotas, metadados, erros e limites de execução no servidor                      |
| `components/`      | Interface, estados dos formulários e composição das páginas                    |
| `lib/domain.ts`    | Tipos, invariantes e operações determinísticas da demonstração                 |
| `lib/demo-data.ts` | Conteúdo fictício e referências de exemplo identificadas                       |
| `lib/store.tsx`    | Estado da demonstração, persistência local, exportação e recuperação de falhas |
| `lib/supabase/`    | Clientes, sessão e funções de acesso ao backend                                |
| `supabase/`        | Modelo relacional, migrações e testes de acesso                                |
| `public/`          | Fontes e fotografias servidas localmente                                       |
| `tests/`           | Verificações automatizadas; o relatório de execução fica no README             |

## Limites dos módulos

| Produto          | Domínio                                                                    | Relações principais                                                                     |
| ---------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Watch Club       | Perfis, comunidades, publicações, comentários, votos e moderação           | Autor, comunidade e referência opcional                                                 |
| Catálogo         | Marcas, coleções de fabricantes, modelos, referências, movimentos e fontes | Uma referência identifica uma configuração comercial; não identifica um exemplar físico |
| My Collection    | Exemplares pessoais, estados e preferências de visibilidade                | Usuário proprietário e referência opcional                                              |
| Passport         | Registro de um exemplar, eventos e documentos                              | Exemplar físico, proprietário atual, histórico e verificação explícita                  |
| Journal          | Artigos e relações editoriais                                              | Autor editorial, idioma, marcas e referências                                           |
| Society          | Planos, direitos de acesso, assinaturas e benefícios                       | Identidade comum; independente da reputação                                             |
| Reputação        | Eventos de concessão/reversão e insígnias                                  | Critério verificável, origem e auditoria                                                |
| Exchange, futuro | Anúncios, vendedores, negociações e disputas                               | Relações com catálogo e passaporte, sem pressupor confiança comercial pelo nível social |

Catálogo e coleção pessoal usam nomes distintos no banco para evitar a ambiguidade de “collections”. O catálogo não deve conter números de série, valores de aquisição nem documentos de um membro.

## Modelo de dados

A estrutura normalizada segue `brand → manufacturer collection → model → reference`, com movimentos, especificações e fontes associados à referência. Correções e contribuições precisam manter origem, estado de revisão e histórico; um campo desconhecido permanece vazio.

Um `user_watch` representa um exemplar ou item de wishlist. A associação ao catálogo não declara autenticidade. Um `passport` representa seu arquivo histórico; eventos registram data, tipo, descrição e nível de informação. Dados de aquisição, séries e documentos ficam em estruturas privadas separadas das projeções públicas.

Perfis possuem conteúdo público e preferências privadas separados. Associações de comunidade, votos e seguidores devem ter unicidade por par de entidades. Comentários têm relação hierárquica limitada à mesma publicação. Eventos de reputação e ações administrativas são registros controlados pelo servidor; a edição de perfil nunca altera permissões.

## Segurança e privacidade

O servidor verifica identidade antes de operações protegidas e o PostgreSQL aplica RLS como limite de acesso a cada linha. Toda tabela exposta precisa de privilégios explícitos e políticas apropriadas; possuir uma chave pública da API não concede acesso aos dados de outro membro.

Documentos do Passport exigem bucket privado, política vinculada ao proprietário, validação de tamanho/tipo e URL assinada de curta duração emitida após autorização. O frontend não deve receber uma chave `service_role`. Documentação apresentada não muda automaticamente um evento para “verificado por parceiro”.

A demonstração não aceita documentos privados nem solicita séries ou preços. A preferência “privado” na demonstração é somente metadado de interface armazenado no próprio navegador. Não equivale a controle de acesso do backend.

Administração requer autorização no servidor e no banco. A página de moderação demonstrativa é um ambiente de teste local, não uma concessão de papel administrativo. O papel deve vir de uma fonte que o usuário não possa editar.

Antes da abertura pública, concluir limitação distribuída de requisições, controles de abuso, inspeção de arquivos e remoção de EXIF, registro estruturado sem dados sensíveis, recuperação de conta, exportação e exclusão com política de retenção e testes de isolamento entre membros.

## Internacionalização

Os idiomas iniciais são `en` e `pt-BR`, com prefixos de rota. Os 447 textos organizados em `lib/messages/en.json` e `pt-BR.json` usam chaves tipadas em `lib/i18n.ts`; o idioma manual é lembrado por cookie e o atributo HTML `lang` é definido no servidor. Texto da interface passa pelo dicionário/seleção de idioma; conteúdo de membros permanece no idioma original e pode ser filtrado. `Intl` deve formatar datas e números. O banco guarda instantes em UTC; a apresentação usa o fuso apropriado. Uma expansão para espanhol exige novo dicionário e configuração de locale, sem duplicar o domínio.

## Design system

Marfim e branco quente formam as superfícies; carvão sustenta leitura; verde inglês é a cor institucional e bronze destaca detalhes pontuais. Tokens semânticos permitem alterar claro/escuro sem fixar a paleta em cada componente. Instrument Serif nos títulos e DM Sans no texto são servidas localmente, com números tabulares nos dados técnicos. Movimento reduzido, foco visível, rótulos e reflow mobile são requisitos da interface.

As fotografias são ilustrações editoriais e não evidência técnica de uma referência ou autenticação de exemplar. A origem está em [ASSETS.md](ASSETS.md).

## Decisões de produto

- O acesso público não depende de criar conta.
- O feed inicial usa regras determinísticas descritas no código; não considera valor da coleção nem pagamentos.
- Postar, gastar ou assinar não concede mérito automaticamente.
- Um passaporte é um registro organizado, não prova definitiva de autenticidade ou propriedade.
- Benefícios Society são planejamento comercial até a definição e homologação do provedor.
- Marketplace, custódia financeira, blockchain e NFT não fazem parte da primeira ativação.

## Dependências externas e implantação

Para acesso multiusuário é necessário escolher um projeto Supabase de desenvolvimento, revisar as migrações, configurar Auth e URLs de retorno, criar buckets e publicar as variáveis de ambiente. E-mail depende do SMTP e das políticas do provedor. O deploy Next.js requer ambiente compatível, HTTPS, segredos por ambiente, política de cache para sessões e observabilidade.

GitHub, domínio, serviços pagos, pagamentos e publicação em produção são decisões separadas. Não há autorização implícita para despesas ou alteração de um banco sem vínculo confirmado com este projeto.
