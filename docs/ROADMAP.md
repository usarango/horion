# Plano de implementação e critérios de entrega

Este roteiro acompanha as seis fases do briefing. Uma tela navegável ou uma migração escrita não encerra uma fase. O status efetivamente validado e os testes executados devem ser consultados no README da entrega.

## Fase 1 — Fundação

Objetivo: aplicação executável com identidade editorial, navegação pública, configuração bilíngue, modelo relacional e limites de autenticação.

- Inspecionar ambiente e registrar a ausência ou presença de código anterior.
- Estabelecer tokens, tipografia local, comportamento mobile, foco e movimento reduzido.
- Separar demonstração de backend; publicar instruções e variáveis de ambiente sem segredos.
- Escolher o projeto Supabase de desenvolvimento e revisar o plano de migração antes de aplicá-lo.
- Validar login, confirmação de e-mail, renovação e encerramento de sessão no projeto escolhido.

Conclusão exige build reproduzível, rotas e erros funcionais, autorização server-side e teste real de sessão; sem Supabase configurado, a autenticação permanece uma dependência aberta.

## Fase 2 — Comunidade

Objetivo: participação multiusuário com comunidades, texto/foto, comentários, votos, busca e moderação.

- Usar as interações locais para revisar os fluxos e substituir o adaptador demonstrativo pelo repositório remoto.
- Validar imagens no servidor, limitar dimensões e tamanho, remover metadados e definir política de conteúdo.
- Aplicar associação de comunidade e política de participação no servidor.
- Registrar edição, remoção, denúncias e decisões de moderação; proteger papéis administrativos.
- Implementar limitação de abuso persistente, paginação e índices de busca.

Conclusão exige duas contas interagindo sem acesso indevido entre membros e um moderador autorizado atuando por fluxo real. Testes apenas do reducer não substituem estes cenários.

## Fase 3 — Colecionismo

Objetivo: catálogo com fontes, coleção pessoal e passaportes com histórico e documentos privados.

- Revisar fontes e direitos de cada referência e fotografia; não inferir medidas a partir de imagens.
- Concluir fluxo de sugestão/correção e trilha de revisão do catálogo.
- Sincronizar coleção, wishlist, notas e visibilidade com RLS.
- Concluir eventos do Passport e níveis de informação separados.
- Habilitar documentos somente após testes de upload, autorização de download e expiração de URLs.
- Desenhar transferência e contestação sem expor proprietários anteriores; ativação fica para uma fase posterior.

Conclusão exige teste de membro A tentando ler/alterar dados privados do membro B, teste anônimo e documento inacessível sem autorização. A preferência local “privado” não atende este critério.

## Fase 4 — Clube

Objetivo: reputação auditável e direitos premium separados.

- Definir critérios, limites e valores de eventos de reputação; concessões e reversões controladas pelo servidor.
- Modelar insígnias com evidência verificável e evitar credenciais profissionais implícitas.
- Implementar consulta de entitlements independentemente do saldo de reputação.
- Validar pacote gratuito e benefícios Society com usuários; o preço de R$ 24,90 é hipótese.
- Escolher provedor, moedas, tributação e termos; homologar webhooks idempotentes antes de qualquer cobrança.

Conclusão não depende de pagamentos reais. O sistema precisa impedir autoatribuição de pontos, plano ou papel pela API.

## Fase 5 — Conteúdo

Objetivo: Journal editorial com publicação revisada, catálogo associado e SEO.

- Substituir textos de demonstração por conteúdo original aprovado.
- Concluir editor administrativo, rascunho, revisão e publicação.
- Adicionar metadados por artigo, canonical, sitemap e dados estruturados adequados.
- Incorporar somente vídeos autorizados, com consentimento e termos dos provedores.
- Definir canais YouTube/Instagram e fluxo editorial antes de integrar contas externas.

Conclusão exige conteúdo publicado por papel autorizado, rotas indexáveis e estados de rascunho não acessíveis publicamente.

## Fase 6 — Preparação comercial

Objetivo: preparar Exchange sem ativar transações.

- Modelar vendedores, anúncios, condição, mensagens, ofertas, disputas e histórico comercial.
- Diferenciar reputação comercial de participação comunitária.
- Avaliar KYC, verificação de posse e parceiros de autenticação por país.
- Definir proteção ao comprador, retenção e processo de contestação.
- Avaliar provedores de intermediação e obrigações regulatórias; não criar custódia própria.

Transações, recebimentos e anúncios comerciais ativos exigem novo gate de aprovação e homologação.

## Gate para considerar o MVP funcional

Os 15 critérios do briefing devem ser demonstrados no backend escolhido, incluindo conta, perfil, comunidades, publicação, interação entre membros, coleção, passaporte, manutenção, documentos privados, catálogo, reputação, moderação, dois idiomas e testes críticos. A entrega local de demonstração permite revisar o produto, mas não substitui esse gate.

## Relatório ao encerrar cada fase

Registrar funcionalidades verificadas, alterações de banco aplicadas e apenas preparadas, arquivos principais, comandos de testes e resultados observados, problemas, pendências e próxima etapa. Falhas e verificações não executadas devem ser explícitas. Dados fictícios nunca devem ser descritos como atividade real da comunidade.
