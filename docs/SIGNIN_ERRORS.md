# Credenciais existentes e erros de acesso

A atualização distingue erros de credenciais, dados inválidos, conexão, serviço, sessão e limites. O cadastro utiliza o mesmo diretório Auth do Rango: quando um endereço já existe, a senha enviada é validada contra essa identidade. O cadastro não substitui a senha ou os papéis existentes.

Na tentativa investigada, os registros do Auth indicaram `email_exists`, seguido de `invalid_credentials`, e o endpoint respondeu 401. A identidade já estava confirmada. O erro exibido anteriormente não explicava esse contexto.

## Comportamento

- O erro de cadastro orienta, de forma condicional, quem já usa Rango/Horion a entrar com a senha da conta existente. Não há consulta pública que exponha se um e-mail está cadastrado.
- O botão **Entrar com este e-mail** preserva o endereço, limpa a senha nova e foca o campo de senha na entrada.
- Falhas de rede, serviço, sessão e limites possuem mensagens distintas. Respostas desconhecidas de gateway não são tratadas como senha incorreta.
- O backend preserva 400 para dados inválidos, 401 para credenciais recusadas, 429 para limite e 503 para indisponibilidade. O cliente interpreta apenas status e códigos permitidos; mensagens internas nunca são exibidas.
- Uma identidade pendente continua exigindo prova da senha antes de qualquer confirmação. Login não cria conta, não muda senha e não concede papéis.

## Validação

Passaram **155 testes automatizados**, TypeScript e builds Next.js/estático. Quatro cenários EN/PT em desktop e mobile passaram com **toda a rede Supabase simulada**. Cada cenário verificou cadastro 401, troca para entrada preservando e-mail/limpando senha/foco, login incorreto e erros de serviço, limite e rede. Foram 37 chamadas interceptadas por cenário, sem contas, e-mails ou chamadas reais. A captura PT mobile foi inspecionada, sem clipping ou overflow.

Cancelamentos de respostas HTTP de erro controladas durante navegação foram identificados separadamente no harness. Erros inesperados, exceções de página e violações de CSP continuam falhando o QA. Artefatos locais: `/tmp/horion-browser-qa/signup-error-results/`.

Não foi tentado autenticar a conta real do usuário: sua senha não é solicitada ao assistente. A recuperação depende da escolha do próprio usuário e de um fluxo autorizado; esta alteração não redefine credenciais.
