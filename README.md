# Átrio

API de cadastro e controle financeiro com FastAPI e Supabase. A API agora exige Supabase Auth e perfil ativo no backend. Para ambiente de desenvolvimento, configure o SDK no frontend, aplique e valide `supabase/migrations/20261027_01_user_profiles.sql` somente no banco `atrio-dev` e siga [a documentação de autenticação](docs/autenticacao-atrio-dev.md). A autenticação remota e a migração ainda não foram validadas.

## Configuração local

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e, se necessário, `SUPABASE_RECEIPTS_BUCKET` no `.env`. A chave `service_role` deve ficar somente no backend e nunca no frontend ou no repositório. Sem essas variáveis, a aplicação importa para Swagger e testes, mas endpoints que acessam o banco respondem `503`.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Swagger: `http://127.0.0.1:8000/docs`.

## Cadastro e contratos

`POST /contratos/previa-vencimento` recebe `data_contrato`, calcula data + 30 dias corridos e não persiste dados. O frontend deve apresentar essa prévia para conferência antes de enviar o cadastro.

`POST /alunos` agora recebe um objeto agregado com `aluno`, `responsavel_financeiro` e `contrato`. Os campos pessoais do aluno e do responsável são separados. `contrato` informa `tipo_vaga`, `data_contrato`, `mensalidade_valor`, `matricula_valor`, `cobrar_matricula` e, opcionalmente, `vencimento_dia`. Tipos de vaga são registros administráveis em `tipos_vaga`; o banco vem inicialmente com `SOCIAL` e `PARTICULAR`. Uma cobrança de matrícula só é gerada quando `cobrar_matricula` é verdadeiro.

Para contratos sucessivos de pessoas já existentes, `POST /contratos` recebe `aluno_id`, `responsavel_financeiro_id` e os campos do contrato. `POST /contratos/{contrato_id}/encerrar` encerra o contrato ativo sem mexer nas cobranças existentes. Esses endpoints e o restante da API também aguardam autenticação/autorização antes de qualquer uso real.

O cadastro é uma chamada RPC transacional. O número do contrato é identity com unicidade no banco. O trigger legado `alunos_criar_primeira_mensalidade` cria a primeira mensalidade; a RPC associa essa linha ao contrato e falha atomicamente se não encontrar a parcela esperada. A constraint antiga por aluno/competência é substituída por unicidade de contrato, competência e tipo de cobrança para permitir novos contratos sem perder cobranças anteriores. O endpoint retorna valores por extenso derivados do `Decimal`; o valor numérico continua sendo a fonte de verdade.

O comportamento local anterior cria somente **a primeira mensalidade** usando `primeira_data_vencimento` e o valor atual do aluno. Não há geração automática de parcelas recorrentes futuras no schema encontrado. A implementação preserva essa regra: cria a primeira mensalidade na data do contrato + 30 dias; `vencimento_dia` fica registrado para futura regra, mas não agenda parcelas seguintes. Não cria cobranças retroativas nem altera valores de parcelas ao mudar o contrato.

`POST /mensalidades/baixa` segue registrando pagamento de uma parcela existente. Criação de parcela não equivale a pagamento. Comprovantes devem continuar em bucket privado e o acesso aos comprovantes e rotas financeiras precisa de autorização por perfil.

### Limites monetários e proteção contra duplicidade

A API usa `Decimal` com limite explícito `NUMERIC(10,2)`: mensalidade e pagamento aceitam de `0,01` a `99.999.999,99`; matrícula aceita de `0,00` a `99.999.999,99`, mas precisa ser positiva quando `cobrar_matricula=true`. Valores com precisão efetiva maior que duas casas são rejeitados; não há arredondamento implícito. Zeros finais sem alteração do valor (por exemplo, `1,230`) podem ser normalizados pelo PostgreSQL para escala 2. A API rejeita excesso e faixa inválida antes da RPC.

Esse limite corresponde à coluna legada `alunos.mensalidade_valor NUMERIC(10,2)`, então não é necessário ampliá-la. As colunas novas de contrato e as cobranças podem aceitar precisão SQL maior, mas ambas as RPCs também impõem o teto da API. A migração amplia as colunas de mensalidades/pagamentos existentes para `NUMERIC(12,2)`; registros existentes, definidos no schema-base como `NUMERIC(10,2)`, cabem sem arredondamento.

No cadastro agregado, a RPC conta todas as mensalidades recorrentes do aluno recém-inserido e exige exatamente uma. Em seguida valida competência, vencimento, status, vínculo nulo e valor antes de associá-la ao contrato; não altera o valor da parcela nem cria outra mensalidade recorrente. Zero, duas ou uma parcela divergente causa exceção e rollback da chamada. A matrícula segue como tipo de cobrança separado. O índice único `(contrato_id, competencia, tipo_cobranca)` protege cobranças já associadas a contratos; a constraint anterior `(aluno_id, competencia)` é removida pela migração para permitir contratos sucessivos no mesmo período. Se houver um índice único independente equivalente no banco remoto, a migração aborta na pré-condição para revisão manual em vez de deixá-lo bloqueando silenciosamente o novo fluxo.

O cadastro agregado sempre cria um novo registro de responsável e não procura duplicatas por CPF. Isso é intencional nesta etapa: não se mesclam pessoas automaticamente. Uma solução futura deve ter fluxo de revisão de identidade e possíveis correspondências, considerar privacidade e erros de CPF, e preservar os vínculos e auditoria dos contratos históricos.

### Formatos HTTP e exemplos fictícios

Todos os exemplos abaixo são ilustrativos, com identificadores e dados fabricados. Não correspondem a pessoas atendidas. As respostas de cadastro são exemplos de contrato da API, não resultados de uma chamada ao Supabase.

Prévia (não grava no banco):

```http
POST /contratos/previa-vencimento
Content-Type: application/json
```

```json
{"data_contrato":"2026-10-01"}
```

Resposta `200`:

```json
{"primeiro_vencimento":"2026-10-31"}
```

Cadastro agregado — `POST /alunos` recebe `CadastroAlunoCreate`: `aluno` contém `nome`, `rg`, `cpf`, `telefone`, `cep`, `endereco`, `bairro`, `cidade`, `estado`, `data_nascimento`; `responsavel_financeiro` contém os mesmos campos pessoais, sem data de nascimento; `contrato` contém `data_contrato`, `tipo_vaga`, `mensalidade_valor`, `matricula_valor`, `cobrar_matricula` e `vencimento_dia` opcional. CPF precisa passar no dígito verificador. Valores monetários são strings decimais no JSON.

```http
POST /alunos
Content-Type: application/json
```

```json
{
  "aluno": {
    "nome": "Acolhido Fictício",
    "rg": "RG-TESTE-001",
    "cpf": "87032165435",
    "telefone": "11900000001",
    "cep": "01001000",
    "endereco": "Rua Exemplo, 100",
    "bairro": "Centro",
    "cidade": "Cidade Fictícia",
    "estado": "SP",
    "data_nascimento": "1990-01-01"
  },
  "responsavel_financeiro": {
    "nome": "Responsável Fictício",
    "rg": "RG-TESTE-002",
    "cpf": "24893067150",
    "telefone": "11900000002",
    "cep": "01001000",
    "endereco": "Avenida Inventada, 200",
    "bairro": "Centro",
    "cidade": "Cidade Fictícia",
    "estado": "SP"
  },
  "contrato": {
    "data_contrato": "2026-10-01",
    "tipo_vaga": "SOCIAL",
    "mensalidade_valor": "1250.00",
    "matricula_valor": "300.00",
    "cobrar_matricula": true,
    "vencimento_dia": 25
  }
}
```

Resposta ilustrativa `201` (`CadastroAlunoResponse`):

```json
{
  "aluno_id": "00000000-0000-0000-0000-000000000001",
  "responsavel_financeiro_id": "00000000-0000-0000-0000-000000000002",
  "contrato_id": "00000000-0000-0000-0000-000000000003",
  "numero_contrato": 101,
  "primeiro_vencimento": "2026-10-31",
  "mensalidade_id": "00000000-0000-0000-0000-000000000004",
  "matricula_id": "00000000-0000-0000-0000-000000000005",
  "situacao": "ativo",
  "mensalidade_valor_por_extenso": "mil duzentos e cinquenta reais",
  "matricula_valor_por_extenso": "trezentos reais"
}
```

Com `cobrar_matricula: false`, `matricula_id` será `null`; o valor continua registrado no contrato. `POST /contratos` recebe os campos de `contrato` mais `aluno_id` e `responsavel_financeiro_id`, e retorna o mesmo schema `CadastroAlunoResponse`. `POST /contratos/{contrato_id}/encerrar` recebe o UUID no caminho, sem corpo, e retorna `{"contrato_id":"00000000-0000-0000-0000-000000000003","situacao":"encerrado"}` (`ContratoEncerradoResponse`). Erros de validação retornam `422` sem repetir os valores enviados; conflitos de contrato ativo retornam `409` com mensagem genérica.

**Dependem da migração ainda não aplicada:** `POST /alunos`, `POST /contratos` e `POST /contratos/{contrato_id}/encerrar`, pois usam novas tabelas e funções RPC. Prévia, health e Swagger não dependem dela. A baixa existente usa a função e tabelas do schema anterior e não foi modificada nesta etapa. Os testes locais fazem mock das RPCs; não demonstram conectividade nem compatibilidade do banco remoto.

## Migração Supabase

Foi criada `supabase/migrations/20261026_01_alunos_contratos.sql`. Ela é aditiva para as entidades e dados, mas remove apenas a constraint UNIQUE antiga `(aluno_id, competencia)`, necessária para contratos novos; preserva tabelas, alunos, mensalidades, pagamentos, função de baixa e trigger. A migração exige o trigger legado e adota a parcela criada por ele. Se a definição remota do trigger, constraints ou tabelas divergir, a operação pode falhar e reverter; o schema local não prova o estado remoto.

**Não execute a migração antes de inspecionar o Supabase remoto**, fazer backup e revisar os resultados abaixo. Não aplique `schema.sql` às cegas sobre uma instalação existente. Verifique as pré-condições e resolva divergências manualmente, sem preencher campos antigos com dados inventados.

```sql
-- Objetos/constraints e índices presentes no banco remoto
select table_name from information_schema.tables
where table_schema = 'public' and table_name in
  ('alunos', 'mensalidades', 'pagamentos_mensalidade', 'contratos', 'responsaveis_financeiros', 'tipos_vaga');
select c.relname as tabela, t.tgname as trigger,
       pg_get_triggerdef(t.oid) as definicao_trigger,
       pg_get_functiondef(t.tgfoid) as definicao_funcao
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='alunos' and not t.tgisinternal;
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid)
from pg_constraint where connamespace='public'::regnamespace
  and conrelid in ('public.alunos'::regclass, 'public.mensalidades'::regclass,
                   'public.pagamentos_mensalidade'::regclass);
select schemaname, tablename, indexname, indexdef from pg_indexes
where schemaname='public' and tablename in ('alunos','mensalidades','pagamentos_mensalidade');

-- Nulos nos campos legados e duplicidades a tratar antes das constraints
select count(*) as sem_cpf from public.alunos where cpf is null or btrim(cpf)='';
select regexp_replace(cpf, '\\D', '', 'g') as cpf_normalizado, count(*)
from public.alunos where cpf is not null
group by regexp_replace(cpf, '\\D', '', 'g') having count(*) > 1;
select count(*) as sem_mensalidade from public.alunos where mensalidade_valor is null;
select aluno_id, competencia, count(*) from public.mensalidades
group by aluno_id, competencia having count(*) > 1;
select aluno_id, data_vencimento, competencia, valor_devido, status
from public.mensalidades order by aluno_id, data_vencimento;
select mensalidade_id, count(*) from public.pagamentos_mensalidade
group by mensalidade_id having count(*) > 1;
```

O procedimento de implantação deve comparar as definições reais com `supabase/schema.sql`, avaliar os resultados, testar a migração em cópia isolada e validar pós-condições antes da aplicação planejada. A migração não foi executada remotamente.

## Testes

Os testes unitários usam `unittest`, `TestClient` e um mock da RPC, sem conectar ao Supabase:

```powershell
py -m unittest discover -s tests -v
```

Os testes não substituem uma validação da função PostgreSQL numa instância de teste isolada; os cenários concorrentes e de integridade do banco precisam dessa etapa antes da implantação.

`tests/sql/test_cadastro_atomic.sql` valida em PostgreSQL descartável os caminhos sem mensalidade do trigger, com duas mensalidades e com dados de vínculo divergentes, a cobrança opcional, o índice anti duplicidade, o encerramento, a criação sucessiva e a reativação sem duplicar contratos/cobranças. O script exige que o nome do banco inclua `test`, `scratch` ou `isolated`, usa dados fictícios e termina com `ROLLBACK`. Foi executado com `schema.sql` e as migrações 01 e 02 em container local exclusivo, banco `atrio_test` sobre `tmpfs`, sem portas publicadas. Isso valida o PostgreSQL local, não o Supabase remoto.

## Frontend de cadastro

O frontend React + TypeScript está em `frontend/`. Requer Node.js e npm. Inicie o backend e o frontend em terminais separados:

Terminal 1, na raiz do projeto:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Terminal 2:

```powershell
cd frontend
npm install
npm run dev
```

Abra `http://127.0.0.1:5173`. A API padrão é `http://127.0.0.1:8000`; para alterá-la, copie `frontend/.env.example` para `frontend/.env.local` e ajuste `VITE_API_BASE_URL`. Essa variável contém apenas o endereço público da API, nunca uma chave. O Vite e o CORS do FastAPI aceitam somente origens locais de desenvolvimento configuradas.

A aplicação usa React Router e tem seções navegáveis: Dashboard, Acolhidos, Contratos, Financeiro, Pagamentos e Configurações. As páginas de listagem, detalhes e dashboard consomem os endpoints de leitura descritos abaixo. O fluxo de cadastro foi preservado em uma rota própria; após resposta HTTP de sucesso, abre os detalhes e consulta novamente o acolhido pela API.

O formulário valida os campos, apresenta a data do primeiro vencimento (contrato + 30 dias), discrimina mensalidade e matrícula e permite revisar antes de enviar. A cobrança de matrícula é opcional. O envio usa `POST /alunos`; a prévia chama `POST /contratos/previa-vencimento`. Em Pagamentos, a baixa usa o `POST /mensalidades/baixa` existente e exige o UUID de uma mensalidade já existente; comprovantes são enviados como multipart para o backend. O histórico usa `GET /pagamentos`; a interface indica que o comprovante está armazenado privadamente, sem gerar URL pública. A interface não acessa diretamente o Supabase e não simula registros.

O endpoint de cadastro e a nova reativação precisam de uma instância de backend conectada ao banco de desenvolvimento com as migrações aplicáveis. Não configure nem use credenciais de produção para desenvolvimento. Nenhuma conexão ou migração remota foi executada nesta etapa.

**Segurança:** os endpoints de negócio agora exigem um token Supabase válido e perfil autorizado; a API usa `service_role`, que ignora RLS, portanto mantém autorização explícita no servidor. Não use dados reais nem disponibilize em produção antes de instalar e validar o SDK, aplicar a migration no banco correto e concluir as verificações do ambiente. Mantenha a `service_role` apenas em segredo do backend, fora do frontend, dos exemplos e do repositório.

## Endpoints de leitura

As listas retornam `{ "items": [...], "total": N, "limit": N, "offset": N }`. O padrão é `limit=50`, máximo 100 e `offset=0`.

| Endpoint | Parâmetros principais | Uso |
| --- | --- | --- |
| `GET /alunos` | `q` (nome ou CPF completo), `ativo`, `situacao=ativo\|encerrado\|inativo`, `limit`, `offset` | Lista sem CPF completo; inclui o contrato ativo quando houver. |
| `GET /alunos/{aluno_id}` | UUID | Detalhes do aluno e contratos vinculados. |
| `GET /contratos` | `aluno_id`, `situacao=ativo\|encerrado\|suspenso`, `limit`, `offset` | Lista com nome do aluno. |
| `GET /contratos/{contrato_id}` | UUID | Detalhes do contrato e responsável. |
| `GET /mensalidades` | `competencia=AAAA-MM`, `status=pendente\|paga\|cancelada`, `aluno_id`, `contrato_id`, paginação | Lista cobranças e caminhos de comprovantes, quando presentes. |
| `GET /pagamentos` | `mensalidade_id`, `aluno_id`, `data_inicio`, `data_fim`, paginação | Histórico relacionado à mensalidade, aluno e contrato. |
| `GET /dashboard/indicadores` | — | Totais, até cinco vencimentos futuros e resumo da competência atual. |

Na ficha do acolhido, o encerramento usa `POST /contratos/{contrato_id}/encerrar`; esse RPC só encerra contrato atualmente ativo e preserva parcelas/pagamentos. A migração local `20261026_02_encerramento_reativacao.sql` mantém também `alunos.ativo` coerente. Data e motivo do encerramento não são gravados porque não há colunas nem parâmetros para isso no modelo atual.

Reativação é um novo vínculo: `POST /alunos/{aluno_id}/reativar` exige que exista contrato encerrado e nenhum contrato ativo; a transação delega a criação do novo contrato e cobranças à RPC já existente `cadastrar_contrato_existente`, e atualiza o indicador legado do aluno. A unicidade parcial de contrato ativo continua sendo a proteção contra concorrência. O frontend reaproveita o responsável do último contrato encerrado, mostra as condições anteriores para conferência e inicia a nova matrícula sem cobrança; o usuário pode marcar explicitamente a cobrança de uma nova matrícula. A migração precisa ser aplicada e validada no banco de desenvolvimento para habilitar a reativação; ela não foi aplicada nesta tarefa.

O documento contratual usa o rascunho institucional `Contrato.jsx` fornecido como referência apenas para o layout, as cláusulas e as assinaturas; o formulário manual do rascunho não é utilizado. Após o cadastro confirmado, a ficha oferece visualização, impressão e download em PDF. O documento é gerado com `GET /contratos/{contrato_id}`, portanto usa o número e os dados persistidos; a impressão abre o diálogo do navegador e o download é feito escolhendo “Salvar como PDF”. O mesmo documento pode ser aberto depois pela ficha do acolhido ou pelos detalhes do contrato. O CSS define página A4, preserva acentuação e oculta controles da aplicação no modo de impressão. Campos ausentes ficam em branco, e matrícula não cobrada é identificada explicitamente. Os tipos exibidos são os valores do contrato `SOCIAL` e `PARTICULAR`.

O encerramento mantém contratos, mensalidades e pagamentos históricos. A migração local `20261026_02_encerramento_reativacao.sql` sincroniza o campo legado `alunos.ativo` na mesma transação do encerramento e da criação de um contrato sucessor. A reativação não reabre contrato: cria um novo contrato e a cobrança recorrente inicial via RPC existente; a matrícula começa desmarcada e só é cobrada se o usuário confirmar. A regra exige um contrato encerrado e nenhum ativo e depende da migração 02 aplicada no banco de desenvolvimento. O endpoint de encerramento não registra data nem motivo, pois o modelo atual não tem esses campos. A lista aceita os filtros Ativo, Encerrado e Todos; a ficha inclui dados cadastrais do aluno, cada responsável relacionado ao respectivo contrato, cobranças e histórico.

Os totais financeiros do dashboard seguem esta regra: recebido soma `pagamentos_mensalidade.valor_pago` pelo mês de `pago_em`; em aberto soma `mensalidades.valor_devido` das parcelas pendentes cuja competência é o mês corrente. As rotas respondem `404` para detalhes inexistentes, `422` para parâmetros inválidos e mensagens genéricas `502` para falha de consulta. As listagens usam consultas em lote para dados relacionados e paginação; o filtro de pagamentos por aluno utiliza a relação `pagamentos_mensalidade.mensalidade_id -> mensalidades.id` declarada no schema local.

As rotas dependem das tabelas e colunas disponíveis no banco usado pelo backend. Os formatos das chaves estrangeiras foram comparados com `supabase/schema.sql` e a migração local, mas não foi possível confirmar a conectividade nem os metadados do Supabase de desenvolvimento nesta execução. Valide a relação usada pelo PostgREST no ambiente conectado antes de considerar a integração real confirmada. Nenhuma migração foi executada. A API implementa autenticacao/autorizacao local; valide a migration, SDK e ambiente antes do uso com dados reais ou implantacao.

Na agenda do Dashboard, “Dar baixa” abre um formulário para a mensalidade selecionada e envia os campos `mensalidade_id`, `valor_pago` e `forma_pagamento` como `multipart/form-data`, com `comprovante` opcional. A função SQL `baixar_mensalidade` exige que o valor recebido seja exatamente igual ao valor devido e muda o status de `pendente` para `paga`; **não aceita baixa parcial**. Em caso de sucesso, os indicadores são consultados novamente. O Dashboard usa as mesmas formas de pagamento aceitas por `POST /mensalidades/baixa`: `dinheiro`, `pix`, `cartao_credito`, `cartao_debito`, `transferencia`, `boleto` e `outro`.

Para executar os testes puros do fluxo de pagamento no frontend (Node.js 22 ou superior):

```powershell
cd frontend
npm test
npm run build
```
