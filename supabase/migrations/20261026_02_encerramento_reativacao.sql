-- Keep the legacy aluno active flag synchronized with the contract lifecycle.
-- Reactivation always creates a successor contract through the existing RPC;
-- it never reopens or edits a historical contract or its charges.
begin;

do $$
begin
    if to_regclass('public.alunos') is null or to_regclass('public.contratos') is null then
        raise exception 'Precondition failed: public.alunos and public.contratos must exist';
    end if;
    if to_regprocedure('public.cadastrar_contrato_existente(uuid,uuid,date,text,numeric,numeric,boolean,smallint)') is null then
        raise exception 'Precondition failed: cadastrar_contrato_existente RPC is missing';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='alunos' and column_name='ativo'
    ) then
        raise exception 'Precondition failed: public.alunos.ativo is missing';
    end if;
end;
$$;

create or replace function public.encerrar_contrato(p_contrato_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_aluno_id uuid;
begin
    update contratos
       set situacao = 'encerrado', atualizado_em = now()
     where id = p_contrato_id and situacao = 'ativo'
     returning aluno_id into v_aluno_id;
    if not found then
        raise exception 'Contrato ativo não encontrado';
    end if;

    update alunos set ativo = false, atualizado_em = now() where id = v_aluno_id;
    return jsonb_build_object('contrato_id', p_contrato_id, 'situacao', 'encerrado');
end;
$$;

-- Keep the existing successor-contract endpoint consistent too: any new active
-- contract reactivates the student's legacy active flag within the same call.
create or replace function public.cadastrar_contrato_existente(
    p_aluno_id uuid,
    p_responsavel_id uuid,
    p_data_contrato date,
    p_tipo_vaga text,
    p_mensalidade_valor numeric,
    p_matricula_valor numeric,
    p_cobrar_matricula boolean,
    p_vencimento_dia smallint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_contrato_id uuid;
    v_numero bigint;
    v_primeiro date;
    v_mensalidade_id uuid;
    v_matricula_id uuid;
    v_competencia date;
begin
    if not exists (select 1 from alunos where id = p_aluno_id) then
        raise exception 'Aluno não encontrado';
    end if;
    if not exists (select 1 from responsaveis_financeiros where id = p_responsavel_id) then
        raise exception 'Responsável não encontrado';
    end if;
    if p_data_contrato > current_date then
        raise exception 'Data do contrato não pode estar no futuro';
    end if;
    if not exists (select 1 from tipos_vaga where codigo = upper(p_tipo_vaga) and ativo) then
        raise exception 'Tipo de vaga inexistente ou inativo';
    end if;
    if p_mensalidade_valor is null or p_mensalidade_valor < 0.01
       or p_mensalidade_valor > 99999999.99
       or p_mensalidade_valor * 100 <> trunc(p_mensalidade_valor * 100)
       or p_matricula_valor is null or p_matricula_valor < 0
       or p_matricula_valor > 99999999.99
       or p_matricula_valor * 100 <> trunc(p_matricula_valor * 100)
       or p_cobrar_matricula is null
       or (p_cobrar_matricula and p_matricula_valor <= 0) then
        raise exception 'Valores do contrato inválidos';
    end if;

    v_primeiro := p_data_contrato + 30;
    v_competencia := date_trunc('month', v_primeiro)::date;
    insert into contratos
        (aluno_id, responsavel_financeiro_id, data_contrato, tipo_vaga,
         mensalidade_valor, matricula_valor, cobrar_matricula, primeiro_vencimento,
         vencimento_dia)
    values
        (p_aluno_id, p_responsavel_id, p_data_contrato, upper(p_tipo_vaga),
         p_mensalidade_valor, p_matricula_valor, p_cobrar_matricula, v_primeiro,
         p_vencimento_dia)
    returning id, numero_contrato into v_contrato_id, v_numero;

    insert into mensalidades
        (aluno_id, contrato_id, tipo_cobranca, competencia, data_vencimento, valor_devido)
    values
        (p_aluno_id, v_contrato_id, 'MENSALIDADE', v_competencia, v_primeiro,
         p_mensalidade_valor)
    returning id into v_mensalidade_id;

    if p_cobrar_matricula then
        insert into mensalidades
            (aluno_id, contrato_id, tipo_cobranca, competencia, data_vencimento, valor_devido)
        values
            (p_aluno_id, v_contrato_id, 'MATRICULA', v_competencia, p_data_contrato,
             p_matricula_valor)
        returning id into v_matricula_id;
    end if;

    update alunos set ativo = true, atualizado_em = now() where id = p_aluno_id;
    return jsonb_build_object(
        'aluno_id', p_aluno_id,
        'responsavel_financeiro_id', p_responsavel_id,
        'contrato_id', v_contrato_id,
        'numero_contrato', v_numero,
        'primeiro_vencimento', v_primeiro,
        'mensalidade_id', v_mensalidade_id,
        'matricula_id', v_matricula_id,
        'situacao', 'ativo'
    );
end;
$$;

create or replace function public.reativar_aluno_contrato(
    p_aluno_id uuid,
    p_responsavel_id uuid,
    p_data_contrato date,
    p_tipo_vaga text,
    p_mensalidade_valor numeric,
    p_matricula_valor numeric,
    p_cobrar_matricula boolean,
    p_vencimento_dia smallint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_result jsonb;
begin
    if not exists (select 1 from alunos where id = p_aluno_id) then
        raise exception 'Aluno não encontrado';
    end if;
    if exists (select 1 from contratos where aluno_id = p_aluno_id and situacao = 'ativo') then
        raise exception 'Aluno já possui contrato ativo';
    end if;
    if not exists (select 1 from contratos where aluno_id = p_aluno_id and situacao = 'encerrado') then
        raise exception 'Não existe contrato encerrado para reativar';
    end if;

    -- Existing contract RPC validates the responsible, vacancy type, dates and
    -- money, and creates the contract/charges atomically. This call shares this
    -- PostgreSQL transaction; any error rolls back all changes below as well.
    v_result := public.cadastrar_contrato_existente(
        p_aluno_id, p_responsavel_id, p_data_contrato, p_tipo_vaga,
        p_mensalidade_valor, p_matricula_valor, p_cobrar_matricula, p_vencimento_dia
    );
    update alunos set ativo = true, atualizado_em = now() where id = p_aluno_id;
    return v_result;
end;
$$;

revoke all on function public.encerrar_contrato(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_contrato(uuid) to service_role;
revoke all on function public.cadastrar_contrato_existente(uuid,uuid,date,text,numeric,numeric,boolean,smallint)
    from public, anon, authenticated;
grant execute on function public.cadastrar_contrato_existente(uuid,uuid,date,text,numeric,numeric,boolean,smallint)
    to service_role;
revoke all on function public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint)
    from public, anon, authenticated;
grant execute on function public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint)
    to service_role;

do $$
begin
    if not has_function_privilege('service_role', 'public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint)', 'EXECUTE') then
        raise exception 'Postcondition failed: service_role cannot execute reactivation RPC';
    end if;
    if has_function_privilege('anon', 'public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint)', 'EXECUTE') then
        raise exception 'Postcondition failed: reactivation RPC remains executable by an untrusted role';
    end if;
end;
$$;

commit;
