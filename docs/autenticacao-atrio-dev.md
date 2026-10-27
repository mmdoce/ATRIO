# Autenticação do Átrio em desenvolvimento

## Escopo

Este documento descreve somente a configuração local do checkout `ATRIO` e os valores próprios do projeto Supabase de desenvolvimento. A URL encontrada no `.env` não identifica, por si só, o ambiente como `atrio-dev`; confira o project ref no painel antes de preencher qualquer configuração. Não reutilize URL, chave anon, SMTP, redirects ou dados de `sistema-atrio`. A migração `supabase/migrations/20261027_01_user_profiles.sql` é local e não foi executada.

## Variáveis locais

Configure `frontend/.env.local` com `VITE_API_BASE_URL`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto `atrio-dev`. O último valor é a chave pública `anon`/publishable; nunca use `service_role` no Vite. O backend local mantém `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em `.env` ignorado pelo Git. Confirme que ambos apontam para o mesmo projeto de desenvolvimento. O backend usa a chave administrativa para PostgREST, Storage e convites; por isso RLS não limita essa conexão e a autorização por perfil da API é obrigatória.

## URLs e e-mail no Supabase

No projeto de desenvolvimento, defina a Site URL para `http://127.0.0.1:5173` durante o desenvolvimento local e adicione `http://127.0.0.1:5173/redefinir-senha` e `http://localhost:5173/redefinir-senha` à allowlist de redirects, se ambos os hosts forem usados. Configure separadamente a Site URL e allowlist do projeto de produção quando a implantação for autorizada; não inclua domínio de produção no projeto de desenvolvimento. Convites podem usar `AUTH_INVITE_REDIRECT_URL` no backend para uma URL do próprio ambiente.

Configure um provedor SMTP verificado em **Authentication → SMTP Settings** e ajuste os templates de convite e recuperação para a identidade Átrio. O serviço padrão de e-mail do Supabase pode ter limites baixos de envio, janelas de espera e restrições de destinatários; confira os limites atuais do plano e o rate limit de Auth no painel. Nenhum e-mail ou convite real foi enviado nesta implementação, portanto o envio não está validado.

## Aplicar o perfil no banco de desenvolvimento

Antes de aplicar, confirme explicitamente o project ref `atrio-dev`, compare a migration com o schema remoto e faça backup. A migration habilita RLS e não cria políticas para `anon`/`authenticated`; o acesso de perfis ocorre no backend. Não execute no projeto de produção.

### Primeiro Diretor

1. Um administrador autorizado cria/convida a conta no painel Auth do projeto `atrio-dev` ou por procedimento administrativo do provedor; o usuário define sua própria senha pelo e-mail de convite. Não use senha fixa nem bootstrap web.
2. Depois de a conta Auth existir, confirme que ainda não há Diretor ativo. Obtenha o UUID imutável dessa conta no painel e, no SQL Editor do projeto confirmado, insira seu perfil: `insert into public.user_profiles (id, role, active) values ('<UUID_CONFIRMADO>', 'DIRETOR', true);`.
3. Teste o login e `/auth/me` com a conta de desenvolvimento. Não grave o UUID, e-mail, senha, token ou chave em arquivos versionados.

O endpoint público não cria perfis. Após haver Diretor ativo, Diretores podem convidar contas por `POST /admin/usuarios` e escolher `DIRETOR` ou `MONITOR`; o convite depende de SMTP/redirects. `PATCH /admin/usuarios/{id}` altera `role` e/ou `active`. O backend impede autoelevação e a trigger SQL serializa alterações que poderiam remover/rebaixar o último Diretor ativo.

## Rotas e permissões

Públicas: `GET /health` e documentos OpenAPI do FastAPI. A autenticação de login, logout, recuperação e redefinição usa Supabase Auth diretamente no navegador. `POST /contratos/previa-vencimento` também exige sessão, apesar de não persistir dados.

Privadas: `/auth/me`; consultas e gravações de alunos e contratos; financeiro, pagamentos e baixa; e `/admin/usuarios`. A API valida o bearer token com GoTrue (`get_user`, que valida assinatura, issuer, audience, expiração e estado do usuário), consulta `user_profiles` pelo UUID autenticado e bloqueia perfil ausente/inativo. Sem token válido responde 401; perfil sem acesso responde 403. Diretor acessa as rotas atuais e a administração. Monitor acessa cadastro e consultas cadastrais de alunos e somente contratos criados pela própria conta. A interface esconde financeiro; a API bloqueia mensalidades, pagamentos, dashboard, encerramento, reativação e administração.

## Senha

A política da tela de redefinição exige no mínimo 10 caracteres, maiúscula, minúscula e número. Atualize simultaneamente essa validação e a política configurada em Authentication → Password Requirements se o projeto usar outra política. Recovery só é aceito após evento `PASSWORD_RECOVERY` emitido pelo SDK no fluxo de link válido; parâmetros arbitrários da URL não autenticam. O SDK persiste e renova a sessão no navegador.

## Limitações de validação

A instalação de `@supabase/supabase-js` não completou: o registry npm foi bloqueado no sandbox e a tentativa autorizada terminou com erro de certificado TLS (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Não desative a verificação TLS. Antes de buildar, instale a dependência em rede com CA confiável e atualize o lockfile. O frontend e os fluxos remotos de Auth não foram validados. Nenhum token, senha, convite, migration ou configuração remota foi usado/modificado.

O backend atual também não tinha endpoints de pré-baixa; esse fluxo precisa ser criado como recurso novo com Monitor solicitando e Diretor decidindo. Nenhuma pré-baixa foi alterada ou exposta nesta implementação.

O modelo atual de contratos não registra qual Monitor realizou o cadastro. Para impedir que um Monitor consulte contratos de outras pessoas ou informações de responsáveis/valores pela API, a consulta de contratos e a visualização/impressão do documento ficaram restritas a Diretor. Para habilitar a exceção solicitada de visualizar o contrato que o próprio Monitor cadastrou, será necessário adicionar autoria imutável aos cadastros/contratos em migration e aplicar filtragem no servidor. O backend atual também não tinha endpoints de pré-baixa; esse fluxo precisa ser projetado como recurso novo, com Monitor solicitando e Diretor decidindo, antes de poder ser habilitado.
