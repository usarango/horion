# Validação desta iteração

Atualizado em 7 de novembro de 2026. Ambiente: Node.js 24.22.1, npm 11.9.0.

## Comandos executados

| Comando             | Resultado observado                                                                |
| ------------------- | ---------------------------------------------------------------------------------- |
| `npm run typecheck` | Passou, sem erros TypeScript                                                       |
| `npm test`          | **40 testes passaram**, zero falhas, cancelados ou ignorados                       |
| `npm run build`     | Passou com Webpack; compilação, TypeScript, geração de páginas e traces concluídos |

O teste usa `node --import tsx --test --test-isolation=none tests/*.test.ts` para executar os casos nomeados dentro deste sandbox. O modo de isolamento padrão do Node apresentou apenas agregados por arquivo; desativar o isolamento tornou a contagem dos casos explícita. Nenhum teste exige serviços externos ou segredos.

## Cobertura

| Conjunto            | Casos | Evidência                                                                                                                                                                                                                                                                    |
| ------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domínio             |    14 | Publicar exige comunidade; edição/exclusão só do autor; votos alternam uma vez; replies pertencem ao post; coleção privada por padrão; duplicidades; Passport somente para owned; eventos declarados; ranking; denúncias; recuperação segura de estado local corrompido      |
| PostgreSQL / RLS    |    16 | Migration inteira executada em PGlite; visitante/A/B/admin; isolamento de série/documentos/Passport; negação de autoatribuição de papéis e pontos; propriedade imutável; documentos e mídias; bloqueios; comentários; moderação/auditoria; RPC de voto; limite de publicação |
| API                 |     7 | Handlers reais com NextRequest; sem configuração; Origin; payload estrito; excesso de JSON; callback sem redirecionamento aberto; assinaturas de arquivo                                                                                                                     |
| Internacionalização |     2 | Chaves completas e correspondentes nos dois dicionários; rótulos e datas localizados                                                                                                                                                                                         |

Os testes de banco usam representações mínimas de Auth/Storage para criar papéis e executar as políticas. Eles são testes de PostgreSQL e autorização, **não** resultados de Supabase Auth HTTP, Storage, PostgREST, SMTP ou advisors reais.

## Revisão de integração

A revisão de código encontrou e corrigiu:

- Links para posts que não estavam entre os cinco primeiros itens do feed ou não correspondiam ao filtro atual.
- Abertura do Passport de outro relógio quando a coleção tinha vários passaportes.
- Links de comunidade sem seleção do resultado procurado.
- Seletor de tema inicialmente divergente do tema salvo.
- Ações disponíveis antes da recuperação do estado local.
- Navegação mobile fora da tela ainda alcançável pelo teclado; foram adicionados `inert`, contenção de foco, restauração de foco e fechamento por Escape.
- Estado local com datas inválidas, referências inexistentes ou ciclos de respostas que poderia provocar falha de renderização.

Essas correções passaram pelo TypeScript e pelos testes pertinentes. Contenção de foco e reflow mobile ainda precisam de homologação em navegador.

## Problemas do ambiente

O Turbopack falhou ao compilar CSS por tentar abrir uma porta interna não permitida (`Operation not permitted`). Liberar a permissão de rede do comando não resolveu. Foi selecionado o compilador Webpack suportado pelo Next.js; `dev` e `build` usam `--webpack`.

O diretório de usuário é somente leitura para caches e configuração de algumas ferramentas. O cache npm foi direcionado para `/tmp/horion-npm-cache`. A CLI Supabase 2.83.0 criou a migration; detalhes em [DATABASE.md](DATABASE.md).

O recurso de navegador `cua_repl.js` exigido pelo fluxo gerenciado de Sites não estava disponível. Nenhum navegador foi instalado ou controlado por alternativa improvisada; não foi iniciado servidor de preview para QA. Não há captura de tela, resultado Lighthouse, teste visual em dispositivos nem teste ponta a ponta afirmado nesta entrega.

## Serviços e funcionalidades não verificados

- Projeto Supabase remoto, advisors e tipos gerados do projeto.
- Cadastro, confirmação, renovação e encerramento de sessões com contas reais.
- Upload/download real e expiração de URL assinada no Supabase Storage.
- Integração multiusuário da interface; as interações de produto permanecem locais.
- Acessibilidade, contraste e layouts homologados em navegador e tecnologia assistiva.
- Antiabuso completo, antimalware, remoção de EXIF e limpeza de objetos órfãos.
- Processamento completo de exportação/exclusão pessoal e política legal de retenção.
- Concessão/reversão automatizada de mérito, assinatura, pagamentos e marketplace.
- Deploy ou publicação em produção.

Nenhum banco existente, serviço de cobrança, canal externo ou ambiente de produção foi alterado. A próxima etapa é a homologação em um projeto de desenvolvimento explicitamente escolhido para Horion.

A verificação de 7 de novembro acrescentou o teste de segurança da migração: `npm test` passou com 40 casos e `npm run typecheck` passou. O build de produção anteriormente aprovado permanece válido para o código da aplicação, que não mudou nesta atualização de infraestrutura. O repositório e a organização Supabase foram consultados; nenhuma migration remota foi executada.
