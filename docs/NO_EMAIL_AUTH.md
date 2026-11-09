# Cadastro Horion sem confirmação de e-mail

A versão pública 5 foi publicada em 9 de novembro de 2026, às 00:11:33 UTC. A Edge Function `horion-register` versão 2 e a migration `20261107044651_horion_registration_gateway` estão ativas. Proveniência e limites de QA em [PUBLICATION.json](PUBLICATION.json) e [LIVE_RELEASE.md](LIVE_RELEASE.md).

O Horion utiliza uma Edge Function própria, `horion-register`, para cadastrar uma identidade com senha e estabelecer uma sessão imediatamente. A configuração global de confirmação do projeto compartilhado permanece preservada; o fluxo público normal do Rango e suas Edge Functions não são substituídos.

A função recebe apenas e-mail, senha, nome de exibição, idioma e intenção de entrada. O cadastro usa `auth.admin.createUser` com `email_confirm: true`, no servidor, seguido de autenticação normal por senha em um cliente sem privilégios. Nenhuma chave administrativa entra no navegador. A resposta contém somente os dois tokens de sessão; o cliente os instala e confirma a identidade novamente com `getUser` antes de prosseguir.

Contas existentes conservam sua senha, metadados e papéis. Uma senha incorreta nunca autoriza alteração de confirmação. Para uma identidade pendente, a função exige o código `email_not_confirmed` da autenticação normal, que no GoTrue v2.197.0 observado é produzido após a validação da senha. Só então ela consulta o UUID exato por uma RPC exclusiva de `service_role`, confirma esse UUID e repete o login. A intenção de login nunca cria uma conta. Não se deve substituir essa prova por um e-mail informado ou por um erro reportado pelo frontend.

A adesão ao Horion continua explícita, após autenticar: o usuário escolhe membro ou loja e cria seu perfil. Categoria de perfil não concede moderação, administração ou verificação comercial. A atribuição administrativa inicial continua ligada ao UUID confirmado previamente designado, independentemente do texto do e-mail ou de metadados editáveis.

## Proteções do endpoint

- Corpo JSON limitado a 8 KB; campos desconhecidos, tipos inválidos e tentativas de enviar papéis/metadados arbitrários são recusados.
- CORS permite somente a origem pública Horion e desenvolvimento local nas portas documentadas. A origem não é usada como prova de autenticação.
- Limites atômicos: 100 tentativas por hora no total, 20 por hora por origem de rede, cinco por minuto por origem e cinco por hora por e-mail. O limite global também se aplica se um cabeçalho de encaminhamento for falsificado.
- IP e e-mail são registrados apenas como HMACs com separação de finalidade, em tabela privada. O servidor determina a data e remove entradas com mais de 24 horas na próxima tentativa.
- RPCs e tabela de controle não são acessíveis a `anon` ou `authenticated`; somente o backend autorizado pode consumir limites ou procurar uma identidade pendente.
- A função não registra senha, e-mail, chave administrativa ou tokens em seus próprios logs. A auditoria padrão do serviço Auth permanece ativa. Respostas de autenticação são genéricas, sem expor erros internos.

Desativar a etapa significa que o cadastro não comprova posse do endereço de e-mail. Uma conta ou perfil criado não deve ser apresentado como identidade verificada. A identidade Auth é compartilhada entre os aplicativos, embora suas permissões de produto sejam separadas.

## Verificação e operação

Os 155 testes automatizados cobrem cadastro novo, duplicidade, conta pendente, senha incorreta, recusa de privilégios, limites, corpo excessivo, CORS e o contrato de estabelecimento de sessão no cliente. Os tokens de renovação são tratados como opacos: o GoTrue observado emite tokens válidos de 12 caracteres, aceitos sem comprimento mínimo arbitrário. Quatro cenários com rede integralmente simulada verificaram a sessão e o onboarding direto. O reteste real completo aguarda autorização de alteração e limpeza das identidades temporárias; não é apresentado como concluído. A referência à ordem de validação do GoTrue deve ser reavaliada quando o Auth for atualizado.

A pasta `supabase/functions` pertence ao runtime Deno e fica fora do build Next.js; seu handler é verificado pelos testes Node e seu entrypoint pelo serviço de Edge Functions no deploy. A chave privilegiada é obtida apenas do ambiente padrão desse serviço. O build público continua incorporando somente a URL/chave pública Supabase.

## Contas existentes e mensagens

Um e-mail já registrado no diretório compartilhado usa a senha existente. O cadastro não redefine essa senha. A tela oferece troca para entrada preservando e-mail e limpando a senha nova; códigos de rede, serviço, limite e credenciais são distintos. Evidências da versão 5: [SIGNIN_ERRORS.md](SIGNIN_ERRORS.md).
