-- INTEGRATION TEST ONLY. Run only on a disposable PostgreSQL clone named with
-- test, scratch or isolated. Requires schema.sql and the migration already
-- applied in that clone. Never run on Supabase production. Final ROLLBACK keeps
-- all successful assertions and temporary test objects out of the database.
begin;

do $$
begin
    if current_database() !~* '(test|scratch|isolated)' then
        raise exception 'Refusing: database name must identify a disposable test database';
    end if;
    if exists (
        select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='alunos'
          and t.tgname='zz_atrio_test_mensalidade_mutator' and not t.tgisinternal
    ) then
        raise exception 'Test fixture already exists; use a fresh disposable database';
    end if;
    if to_regprocedure('public.atrio_test_mensalidade_mutator()') is not null then
        raise exception 'Test fixture function already exists; use a fresh disposable database';
    end if;
    if exists (
        select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='alunos' and not t.tgisinternal
          and t.tgname <> 'alunos_criar_primeira_mensalidade'
    ) then
        raise exception 'Unexpected alumno trigger; use a reviewed isolated clone';
    end if;
end;
$$;

do $$
declare
    result jsonb;
    aluno uuid;
    contrato uuid;
    contrato_anterior uuid;
    responsavel uuid;
    monthly_count bigint;
    enrollment_count bigint;
    caught boolean;
    violated_constraint text;
    before_alunos bigint;
    before_contracts bigint;
    before_monthlies bigint;
    successor uuid;
    reactivated uuid;
begin
    result := public.cadastrar_aluno_contrato(
        '{"nome":"TEST_NORMAL","cpf":"00000000001","data_nascimento":"1990-01-01","rg":"TEST-RG-01","telefone":"0000000001","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
        '{"nome":"TEST_GUARDIAN_01","cpf":"00000000002","rg":"TEST-RG-02","telefone":"0000000002","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
        current_date, 'SOCIAL', 0.01, 0, false, null
    );
    aluno := (result->>'aluno_id')::uuid;
    contrato := (result->>'contrato_id')::uuid;
    contrato_anterior := contrato;
    responsavel := (result->>'responsavel_financeiro_id')::uuid;
    if result->>'matricula_id' is not null then
        raise exception 'Unexpected enrollment charge when disabled';
    end if;
    select count(*) into monthly_count from public.mensalidades
     where aluno_id=aluno and tipo_cobranca='MENSALIDADE';
    if monthly_count <> 1 then raise exception 'Expected one recurring installment'; end if;

    caught := false;
    begin
        insert into public.mensalidades
            (aluno_id, contrato_id, tipo_cobranca, competencia, data_vencimento, valor_devido)
        values
            (aluno, contrato, 'MENSALIDADE', date_trunc('month', current_date + 30)::date,
             current_date + 30, 0.01);
    exception when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint <> 'mensalidades_contrato_competencia_tipo_uidx' then
            raise exception 'Duplicate was blocked by unexpected constraint: %', violated_constraint;
        end if;
        caught := true;
    end;
    if not caught then raise exception 'Duplicate charge did not violate the unique index'; end if;

    -- A successor contract after closure reuses the same student and guardian;
    -- its monthly charge has a separate contract key in the same competence.
    select count(*) into before_alunos from public.alunos;
    perform public.encerrar_contrato(contrato_anterior);
    if (select ativo from public.alunos where id=aluno) then
        raise exception 'Closure did not synchronize the legacy student active flag';
    end if;
    result := public.cadastrar_contrato_existente(
        aluno, responsavel, current_date, 'SOCIAL', 0.01, 0, false, null
    );
    successor := (result->>'contrato_id')::uuid;
    if (result->>'aluno_id')::uuid <> aluno then
        raise exception 'Successor contract changed the student ID';
    end if;
    if (result->>'contrato_id')::uuid = contrato_anterior then
        raise exception 'Successor contract reused the prior contract ID';
    end if;
    if (select count(*) from public.alunos) <> before_alunos then
        raise exception 'Successor contract inserted another student';
    end if;
    select count(*) into monthly_count from public.mensalidades
     where aluno_id=aluno and tipo_cobranca='MENSALIDADE';
    if monthly_count <> 2 then raise exception 'Expected one monthly charge per contract'; end if;
    if not (select ativo from public.alunos where id=aluno) then
        raise exception 'New contract did not reactivate the legacy student active flag';
    end if;

    -- Reactivation must reject an active contract without making any partial
    -- contract or charge inserts.
    select count(*) into before_contracts from public.contratos where aluno_id=aluno;
    select count(*) into before_monthlies from public.mensalidades where aluno_id=aluno;
    caught := false;
    begin
        perform public.reativar_aluno_contrato(
            aluno, responsavel, current_date, 'PARTICULAR', 20.00, 0, false, 10::smallint
        );
    exception when others then
        if sqlerrm not like '%contrato ativo%' then raise; end if;
        caught := true;
    end;
    if not caught then raise exception 'Reactivation with an active contract was accepted'; end if;
    if (select count(*) from public.contratos where aluno_id=aluno) <> before_contracts
       or (select count(*) from public.mensalidades where aluno_id=aluno) <> before_monthlies then
        raise exception 'Rejected reactivation left partial contract or charge rows';
    end if;

    -- After ending the successor, reactivation creates a new contract while
    -- preserving both earlier contracts and their historical charges.
    perform public.encerrar_contrato(successor);
    result := public.reativar_aluno_contrato(
        aluno, responsavel, current_date, 'PARTICULAR', 20.00, 0, false, 10::smallint
    );
    reactivated := (result->>'contrato_id')::uuid;
    if reactivated in (contrato_anterior, successor) then
        raise exception 'Reactivation reused a historical contract';
    end if;
    if (select count(*) from public.contratos where aluno_id=aluno) <> before_contracts + 1
       or (select count(*) from public.mensalidades where aluno_id=aluno) <> before_monthlies + 1 then
        raise exception 'Reactivation did not create exactly one new contract and recurring charge';
    end if;
    if (select count(*) from public.contratos where id in (contrato_anterior, successor) and situacao='encerrado') <> 2
       or not (select ativo from public.alunos where id=aluno) then
        raise exception 'Reactivation changed historical status or failed to set active status';
    end if;

    result := public.cadastrar_aluno_contrato(
        '{"nome":"TEST_WITH_ENROLLMENT","cpf":"00000000003","data_nascimento":"1990-01-01","rg":"TEST-RG-03","telefone":"0000000003","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
        '{"nome":"TEST_GUARDIAN_02","cpf":"00000000004","rg":"TEST-RG-04","telefone":"0000000004","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
        current_date, 'SOCIAL', 10.00, 1.00, true, null
    );
    aluno := (result->>'aluno_id')::uuid;
    if result->>'matricula_id' is null then raise exception 'Expected enrollment charge'; end if;
    select count(*) into monthly_count from public.mensalidades
     where aluno_id=aluno and tipo_cobranca='MENSALIDADE';
    select count(*) into enrollment_count from public.mensalidades
     where aluno_id=aluno and tipo_cobranca='MATRICULA';
    if monthly_count <> 1 or enrollment_count <> 1 then
        raise exception 'Expected one monthly and one separate enrollment charge';
    end if;

    -- Direct RPC inputs with sub-cent precision must be rejected rather than
    -- rounded by the NUMERIC(12,2) destination columns.
    caught := false;
    begin
        perform public.cadastrar_aluno_contrato(
            '{"nome":"TEST_EXCESS_MONTHLY_SCALE","cpf":"00000000011","data_nascimento":"1990-01-01","rg":"TEST-RG-11","telefone":"0000000011","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            '{"nome":"TEST_GUARDIAN_06","cpf":"00000000012","rg":"TEST-RG-12","telefone":"0000000012","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            current_date, 'SOCIAL', 10.005, 0, false, null
        );
    exception when others then
        if sqlerrm not like '%Valores do contrato inválidos%' then raise; end if;
        caught := true;
    end;
    if not caught then raise exception 'Sub-cent monthly value was not rejected'; end if;

    caught := false;
    begin
        perform public.cadastrar_aluno_contrato(
            '{"nome":"TEST_EXCESS_ENROLLMENT_SCALE","cpf":"00000000013","data_nascimento":"1990-01-01","rg":"TEST-RG-13","telefone":"0000000013","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            '{"nome":"TEST_GUARDIAN_07","cpf":"00000000014","rg":"TEST-RG-14","telefone":"0000000014","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            current_date, 'SOCIAL', 10.00, 1.005, true, null
        );
    exception when others then
        if sqlerrm not like '%Valores do contrato inválidos%' then raise; end if;
        caught := true;
    end;
    if not caught then raise exception 'Sub-cent enrollment value was not rejected'; end if;
end;
$$;

create function public.atrio_test_mensalidade_mutator()
returns trigger language plpgsql as $$
begin
    if new.nome = 'TEST_DUPLICATE_MONTHLY' then
        insert into public.mensalidades (aluno_id, competencia, data_vencimento, valor_devido)
        values (new.id, date_trunc('month', new.primeira_data_vencimento)::date,
                new.primeira_data_vencimento, new.mensalidade_valor);
    elsif new.nome = 'TEST_WRONG_LINK' then
        update public.mensalidades
           set data_vencimento = data_vencimento + 1
         where aluno_id = new.id and tipo_cobranca = 'MENSALIDADE';
    end if;
    return new;
end;
$$;
create trigger zz_atrio_test_mensalidade_mutator
after insert on public.alunos
for each row execute function public.atrio_test_mensalidade_mutator();

do $$
declare
    before_alunos bigint;
    before_responsaveis bigint;
    before_contratos bigint;
    before_mensalidades bigint;
    caught boolean;
begin
    select count(*) into before_alunos from public.alunos;
    select count(*) into before_responsaveis from public.responsaveis_financeiros;
    select count(*) into before_contratos from public.contratos;
    select count(*) into before_mensalidades from public.mensalidades;

    alter table public.alunos disable trigger alunos_criar_primeira_mensalidade;
    caught := false;
    begin
        perform public.cadastrar_aluno_contrato(
            '{"nome":"TEST_NO_MONTHLY","cpf":"00000000005","data_nascimento":"1990-01-01","rg":"TEST-RG-05","telefone":"0000000005","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            '{"nome":"TEST_GUARDIAN_03","cpf":"00000000006","rg":"TEST-RG-06","telefone":"0000000006","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            current_date, 'SOCIAL', 10.00, 0, false, null
        );
    exception when others then
        if sqlerrm not like '%encontradas 0%' then raise; end if;
        caught := true;
    end;
    alter table public.alunos enable trigger alunos_criar_primeira_mensalidade;
    if not caught then raise exception 'Zero monthly rows did not abort registration'; end if;

    caught := false;
    begin
        perform public.cadastrar_aluno_contrato(
            '{"nome":"TEST_DUPLICATE_MONTHLY","cpf":"00000000007","data_nascimento":"1990-01-01","rg":"TEST-RG-07","telefone":"0000000007","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            '{"nome":"TEST_GUARDIAN_04","cpf":"00000000008","rg":"TEST-RG-08","telefone":"0000000008","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            current_date, 'SOCIAL', 10.00, 0, false, null
        );
    exception when others then
        if sqlerrm not like '%encontradas 2%' then raise; end if;
        caught := true;
    end;
    if not caught then raise exception 'Two monthly rows did not abort registration'; end if;

    caught := false;
    begin
        perform public.cadastrar_aluno_contrato(
            '{"nome":"TEST_WRONG_LINK","cpf":"00000000009","data_nascimento":"1990-01-01","rg":"TEST-RG-09","telefone":"0000000009","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            '{"nome":"TEST_GUARDIAN_05","cpf":"00000000010","rg":"TEST-RG-10","telefone":"0000000010","cep":"00000000","endereco":"TEST ADDRESS","bairro":"TEST","cidade":"TEST","estado":"SP"}'::jsonb,
            current_date, 'SOCIAL', 10.00, 0, false, null
        );
    exception when others then
        if sqlerrm not like '%diverge dos dados do contrato%' then raise; end if;
        caught := true;
    end;
    if not caught then raise exception 'Mismatched monthly row did not abort registration'; end if;

    if (select count(*) from public.alunos) <> before_alunos
       or (select count(*) from public.responsaveis_financeiros) <> before_responsaveis
       or (select count(*) from public.contratos) <> before_contratos
       or (select count(*) from public.mensalidades) <> before_mensalidades then
        raise exception 'Failure path did not roll back all aggregate inserts';
    end if;
end;
$$;

rollback;
