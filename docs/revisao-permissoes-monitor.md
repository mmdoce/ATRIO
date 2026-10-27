# Revisão pendente: escopo de dados do Monitor

Esta nota identifica respostas da API que precisam de decisão de menor privilégio em uma tarefa separada. Nenhuma regra de autorização foi alterada nesta etapa.

## Endpoints para revisar

- `GET /alunos`: Monitor pode listar alunos sem filtro de propriedade/autoria.
- `GET /alunos/{aluno_id}`: a ficha é carregada antes do filtro de contratos e pode retornar todos os dados pessoais do aluno; os contratos são filtrados por autoria, mas os campos retornados ainda precisam de revisão.
- `GET /contratos`: lista contratos criados pelo Monitor autenticado, conforme `created_by_user_id`.
- `GET /contratos/{contrato_id}`: limita o contrato à autoria do Monitor, porém a resposta é a mesma representação detalhada do Diretor.

## Campos para revisar nas respostas do Monitor

- Ficha do aluno: `cpf`, `rg`, `data_nascimento`, `telefone`, `email`, `cep`, `endereco`, `bairro`, `cidade` e `estado`.
- Resumo/detalhe do contrato: `mensalidade_valor`, `matricula_valor`, `cobrar_matricula` e campos monetários por extenso.
- Responsável financeiro incluído no contrato: `cpf`, `rg`, `telefone`, `cep`, `endereco`, `bairro`, `cidade` e `estado`.
- Escopo de consulta: decidir se a listagem e a ficha devem ser limitadas aos alunos/contratos cadastrados pelo próprio Monitor ou a outra regra operacional explícita.

## Critério sugerido para a tarefa de autorização

Definir quais dados são necessários para cadastro e impressão do contrato, aplicar filtragem e projeção no backend e testar tanto a presença de campos permitidos quanto a ausência dos demais em chamadas diretas à API. A interface não deve ser usada como controle de acesso.
