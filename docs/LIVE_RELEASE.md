# Horion: base conectada e verificação em navegador

Estado observado em 7 de novembro de 2026. A **versão pública 2** foi publicada pelo Sites às 03:38 UTC, com estado `succeeded`, em [Horion Watch Club](https://horion-watch-club-preview.victortb12.chatgpt.site). Este registro descreve a implementação conectada e distingue os testes públicos, simulados e as pendências de homologação autenticada. A proveniência está em [PUBLICATION.json](PUBLICATION.json).

Validação final: **116/116 testes automatizados passaram**, incluindo os **50 testes SQL** e os nove casos de concessão administrativa diferida. TypeScript, build Next.js de produção e build estático conectado também passaram. Os resultados de navegador abaixo são registrados separadamente, com distinção entre Supabase real e rede simulada.

## Dados e identidade

A interface de produto usa o Supabase como origem dos registros. Feed, comunidades, catálogo, perfis e coleção começam vazios quando não existem dados, sem carregar o antigo dataset de demonstração ou oferecer persistência local como alternativa a uma falha de rede. Preferências de tema/idioma e o mecanismo de sessão continuam usando recursos próprios do navegador.

O acesso de conta oferece login e cadastro. O build verificado habilitou o cadastro por configuração explícita; a confirmação de e-mail continua necessária no projeto compartilhado. Depois de autenticar e confirmar o e-mail, o membro escolhe seu perfil Horion, incluindo o tipo membro ou loja. Informações de loja são autodeclaradas e não conferem verificação, credencial profissional, garantia comercial ou permissão de moderação.

Auth permanece compartilhado com o Rango; os cookies/sessões do cliente Horion e os dados da aplicação são separados. A confirmação pode usar o link recebido por e-mail, validado somente contra a origem Supabase configurada. A entrega de e-mail, o template/SMTP e a criação/confirmação real de contas não foram testados nesta rodada. Nenhum endereço de teste foi cadastrado nem mensagem de confirmação solicitada pelo QA.

## Banco compartilhado

A migration remota **`20261107032737_horion_live_community`** foi aplicada. O fingerprint dos metadados protegidos do Rango permaneceu **`4577a6a52b5e12c77a187d75b01282b0`**, idêntico ao anterior. Essa comparação cobre as definições protegidas observadas, não todos os dados de clientes nem todos os fluxos funcionais do Rango. A configuração da Data API continua isolando `horion_private` e acrescentando apenas `horion` à lista pública anterior.

A migration **`20261107033322_horion_deferred_admin_roles`** também foi aplicada, com concessão administrativa diferida e moderação atômica. A autorização inicial foi vinculada privadamente à identidade Auth existente e confirmada indicada pelo proprietário. Ela passa a valer na adesão real ao Horion; nenhum perfil fictício ou automático foi criado para representá-la. E-mails e identificadores dessa identidade não são publicados no repositório.

A verificação remota final observou **zero perfis Horion, comunidades, publicações e referências de catálogo**. O produto continua começando do zero; esses estados vazios não são preenchidos por fixtures. Quem já possui a identidade compartilhada pode usar suas credenciais existentes e realizar a adesão explícita.

## Build público conectado

`npm run build:preview` empacota os componentes reais para hospedagem estática. O nome do comando é histórico; o manifesto agora indica `live-supabase`, schema `horion`, backend configurado e o estado efetivo do cadastro.

O build lê `.env.local` quando presente, preservando variáveis já fornecidas ao processo. Apenas a URL e a chave pública Supabase entram nas definições de ambiente do JavaScript. O controle de cadastro é compilado como booleano; nenhuma chave secreta, `service_role`, arquivo de ambiente ou rota de servidor faz parte do grafo. O build recusa URL HTTPS inválida, chave ausente ou chave identificada como secreta/service-role. As três recusas foram verificadas antes de modificar o artefato existente.

A CSP permite conexão somente à própria origem e à origem HTTPS/WSS exata do Supabase configurado. Imagens podem vir da própria origem, desse Supabase ou de `blob:`/`data:`. Não há wildcard de destino. O artefato copia fontes e ícone; as cinco fotografias antigas foram removidas do projeto e não existe `dist/images` com material semeado.

Foram emitidas 26 rotas em inglês e português. O build passou com backend e cadastro habilitados. O aviso informativo do Node sobre a inferência de módulos em `preview/routes.ts` não impediu a compilação.

## QA executado

Playwright 1.57.0 e Chromium 156.0.8078.79 já estavam instalados. O sandbox bloqueou uma chamada de socket necessária para iniciar o navegador; a execução aprovada fora dele permitiu o QA. Não houve instalação de dependências ou alteração do `package.json` para esses testes. O servidor HTTP local serviu o artefato em `127.0.0.1:4000`, com consultas reais e somente de leitura ao Supabase.

| Conjunto                             |                                                   Cenários | Resultado      |
| ------------------------------------ | ---------------------------------------------------------: | -------------- |
| Home e acesso de conta               |                   4: EN/PT × desktop 1440 px/mobile 390 px | Todos passaram |
| Páginas secundárias como visitante   |                     22: 11 rotas em EN desktop e PT mobile | Todos passaram |
| Onboarding de loja com rede simulada | 4: EN/PT × desktop/mobile, todas as chamadas interceptadas | Todos passaram |
| Validação de configuração do build   |      3 recusas: URL insegura, chave ausente, chave secreta | Todas passaram |

Nos quatro cenários da home, foram verificados status HTTP 200, `lang` correto, feed sem publicações semeadas, ausência de rótulos de demonstração, ausência de overflow horizontal, abertura do login com e-mail/senha, cadastro habilitado com nome e senha mínima de 12 caracteres, acesso ao formulário de confirmação por link e fechamento por Escape. Nenhum formulário foi submetido.

As rotas secundárias foram Explore, Communities, Watches, My Collection, Passport, Journal, Society, Profile, Notifications, Settings e Admin. Todas responderam 200, apresentaram título localizado e mantiveram a largura da viewport. Não foram observados erros de console, exceções de página, requisições falhas ou violações de CSP nesses 26 cenários. Capturas da home, cadastro, comunidades, exploração e acesso administrativo restrito foram abertas e inspecionadas visualmente.

Separadamente, quatro cenários de onboarding autenticado usaram **rede inteiramente simulada**: todas as chamadas Supabase foram interceptadas. Eles verificaram o envio dos seis argumentos de adesão para loja, a preservação dos campos e do diálogo diante de respostas intencionais 400/422 e a atualização do perfil após nova tentativa com resposta simulada 200. Esses testes validam o comportamento da interface e o contrato enviado; não executam autenticação, cadastro ou RPC reais.

A primeira execução encontrou `42703: column profiles.account_type does not exist`, pois o código live chegou antes da migração remota correspondente. Após sua aplicação, a rodada completa passou sem esse erro. Uma ambiguidade do seletor de teste entre o menu mobile e o diálogo de conta foi corrigida no script de QA, sem mudança de produto.

Os registros da rodada estão no workspace em `/tmp/horion-browser-qa/results/smoke.json`, `guest-routes.json` e `onboarding-mocked.json`, junto às capturas. Os scripts e resultados de QA são artefatos locais, não dependências da aplicação.

## Limites da evidência

O QA não criou contas, lojas, comunidades, publicações, relógios ou documentos no backend. Ele não demonstra entrega de e-mail, confirmação de uma conta real, adesão autenticada persistida, mudança remota de perfil, upload/download de documentos ou permissões de um administrador autenticado. Os quatro casos com rede simulada não removem essas pendências. Esses cenários exigem homologação própria; testes locais de domínio/RLS não devem ser apresentados como prova de um fluxo real de navegador que não foi executado.

A ausência de overflow e a inspeção de capturas cobrem as larguras verificadas. Não substituem auditoria integral de acessibilidade, testes com tecnologia assistiva, todos os dispositivos ou medição de performance. Cobranças, transações e marketplace continuam fora desta rodada.

## Verificação remota após as migrações

O fingerprint protegido do Rango permaneceu `4577a6a52b5e12c77a187d75b01282b0`. A API respondeu 200 para os campos públicos novos do Horion e para a leitura limitada do Rango; negou leitura anônima de documentos e execução das duas RPCs administrativas com 401/42501, e manteve `horion_private` fora da API com 406/PGRST106. O advisor de segurança não encontrou avisos WARN/ERROR do Horion; cinco INFO registram tabelas com acesso direto intencionalmente negado.

## Conferência da versão publicada

Após o deploy confirmado, dois novos contextos de navegador acessaram o site público sem cookies, cache ou token de acesso especial: inglês em desktop 1440 px e português em mobile 390 px. Ambos receberam HTTP 200, carregaram o manifesto `live-supabase` com cadastro habilitado, consultaram as tabelas públicas reais e abriram os formulários de login, cadastro e confirmação. Não houve overflow, erros de console, exceções, requisições falhas ou violações de CSP. Nenhum formulário foi enviado.

O JavaScript servido foi `horion-BORZU7CV.js`, com `horion-DEA3PXVQ.css`, correspondendo ao artefato salvo. As cinco fotografias da demonstração anterior retornaram 404. Evidências locais em `/tmp/horion-browser-qa/hosted-results/`, com capturas inspecionadas visualmente. Essa conferência confirma a versão pública e seu acesso de leitura ao Supabase; mantém os limites de homologação autenticada descritos acima.

## Próxima etapa

Realizar o primeiro acesso do proprietário e a adesão ao perfil, validar uma publicação real e uma segunda conta/loja, e homologar entrega de e-mail. A allowlist compartilhada de redirecionamento ainda precisa incluir as URLs Horion, preservando as do Rango, para permitir a confirmação convencional por clique; a versão atual oferece a confirmação dentro do Horion por link colado. O gerenciamento da allowlist exige acesso de configuração Auth que não está disponível no conector desta sessão.
