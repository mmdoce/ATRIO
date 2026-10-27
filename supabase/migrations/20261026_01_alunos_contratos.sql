-- Migration aditiva para cadastro agregado de aluno, responsável e contrato.
-- NÃO executar antes de comparar o banco remoto com schema.sql e rodar as
-- consultas de diagnóstico do README. A RPC depende do trigger legado abaixo.
begin;

do $$
begin
    if to_regclass('public.alunos') is null
       or to_regclass('public.mensalidades') is null
       or to_regclass('public.pagamentos_mensalidade') is null then
        raise exception 'Pré-condição falhou: tabelas legadas não encontradas';
    end if;
    if not exists (
        select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'alunos'
          and t.tgname = 'alunos_criar_primeira_mensalidade' and not t.tgisinternal
    ) then
        raise exception 'Pré-condição falhou: trigger alunos_criar_primeira_mensalidade ausente; revisar fluxo legado antes da migração';
    end if;
    if not exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'alunos'
          and t.tgname = 'alunos_criar_primeira_mensalidade'
          and t.tgenabled <> 'D'
          and position('AFTER INSERT' in pg_get_triggerdef(t.oid)) > 0
          and position('new.primeira_data_vencimento' in lower(pg_get_functiondef(t.tgfoid))) > 0
          and position('new.mensalidade_valor' in lower(pg_get_functiondef(t.tgfoid))) > 0
    ) then
        raise exception 'Pré-condição falhou: trigger legado está desativado ou diverge do comportamento esperado; revisar manualmente';
    end if;
    if exists (
        select 1
        from pg_index i
        join pg_class t on t.oid = i.indrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = 'mensalidades'
          and i.indisunique and i.indnkeyatts = 2
          and (select array_agg(a.attname::name order by a.attname::name)
               from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
               where k.ord <= i.indnkeyatts)
              = array['aluno_id', 'competencia']::name[]
          and not exists (
              select 1 from pg_constraint con where con.conindid = i.indexrelid
          )
    ) then
        raise exception 'Pré-condição falhou: índice UNIQUE independente em mensalidades(aluno_id, competencia); revisar antes da migração';
    end if;
end;
$$;

create table if not exists public.tipos_vaga (
    codigo text primary key,
    descricao text not null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);
insert into public.tipos_vaga (codigo, descricao) values
    ('SOCIAL', 'Social'), ('PARTICULAR', 'Particular')
on conflict (codigo) do nothing;

create table if not exists public.responsaveis_financeiros (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    rg text not null,
    cpf text not null,
    telefone text not null,
    cep text not null,
    endereco text not null,
    bairro text not null,
    cidade text not null,
    estado char(2) not null,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);
create index if not exists responsaveis_financeiros_cpf_idx
    on public.responsaveis_financeiros (cpf);

alter table public.alunos add column if not exists rg text;
alter table public.alunos add column if not exists cep text;
alter table public.alunos add column if not exists bairro text;
alter table public.alunos add column if not exists cidade text;
alter table public.alunos add column if not exists estado char(2);
alter table public.alunos add column if not exists atualizado_em timestamptz not null default now();

create table if not exists public.contratos (
    id uuid primary key default gen_random_uuid(),
    numero_contrato bigint generated always as identity unique,
    aluno_id uuid not null references public.alunos(id) on delete restrict,
    responsavel_financeiro_id uuid not null references public.responsaveis_financeiros(id) on delete restrict,
    data_contrato date not null,
    tipo_vaga text not null references public.tipos_vaga(codigo),
    mensalidade_valor numeric(12,2) not null check (mensalidade_valor > 0),
    matricula_valor numeric(12,2) not null default 0 check (matricula_valor >= 0),
    cobrar_matricula boolean not null default false,
    primeiro_vencimento date not null,
    vencimento_dia smallint check (vencimento_dia between 1 and 31),
    situacao text not null default 'ativo' check (situacao in ('ativo', 'encerrado', 'suspenso')),
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    check (primeiro_vencimento = data_contrato + 30),
    check (not cobrar_matricula or matricula_valor > 0)
);
create unique index if not exists contratos_um_ativo_por_aluno_idx
    on public.contratos (aluno_id) where situacao = 'ativo';
create index if not exists contratos_responsavel_idx
    on public.contratos (responsavel_financeiro_id);

alter table public.mensalidades add column if not exists contrato_id uuid
    references public.contratos(id) on delete restrict;
alter table public.mensalidades add column if not exists tipo_cobranca text
    not null default 'MENSALIDADE';
alter table public.mensalidades add column if not exists atualizado_em timestamptz
    not null default now();
alter table public.mensalidades alter column valor_devido type numeric(12,2);
alter table public.mensalidades alter column valor_pago type numeric(12,2);
alter table public.pagamentos_mensalidade alter column valor_pago type numeric(12,2);
do $$
declare definition text;
begin
    select pg_get_constraintdef(oid) into definition
    from pg_constraint
    where conrelid = 'public.mensalidades'::regclass
      and conname = 'mensalidades_tipo_cobranca_check';
    if definition is null then
        alter table public.mensalidades add constraint mensalidades_tipo_cobranca_check
            check (tipo_cobranca in ('MATRICULA', 'MENSALIDADE'));
    elsif position('MATRICULA' in definition) = 0 or position('MENSALIDADE' in definition) = 0 then
        raise exception 'Constraint mensalidades_tipo_cobranca_check existe com definição incompatível';
    end if;
end;
$$;

-- A constraint antiga aluno/competência impede contratos posteriores no mesmo
-- mês. Remova somente a UNIQUE exata dessas duas colunas; seus dados ficam.
do $$
declare c record;
begin
    for c in
        select con.conname
        from pg_constraint con
        where con.conrelid = 'public.mensalidades'::regclass
          and con.contype = 'u'
          and (select array_agg(a.attname order by a.attname)
               from unnest(con.conkey) k(attnum)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum)
              = array['aluno_id', 'competencia']::name[]
    loop
        execute format('alter table public.mensalidades drop constraint %I', c.conname);
    end loop;
end;
$$;
create unique index if not exists mensalidades_contrato_competencia_tipo_uidx
    on public.mensalidades (contrato_id, competencia, tipo_cobranca)
    where contrato_id is not null;
create index if not exists mensalidades_contrato_vencimento_idx
    on public.mensalidades (contrato_id, data_vencimento);

alter table public.tipos_vaga enable row level security;
alter table public.responsaveis_financeiros enable row level security;
alter table public.contratos enable row level security;
revoke all on public.tipos_vaga, public.responsaveis_financeiros, public.contratos from anon, authenticated;
grant all on public.tipos_vaga, public.responsaveis_financeiros, public.contratos to service_role;
grant usage, select on sequence public.contratos_numero_contrato_seq to service_role;

create or replace function public.cadastrar_aluno_contrato(
    p_aluno jsonb,
    p_responsavel jsonb,
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
    v_aluno_id uuid;
    v_responsavel_id uuid;
    v_contrato_id uuid;
    v_numero bigint;
    v_primeiro date;
    v_mensalidade_id uuid;
    v_matricula_id uuid;
    v_competencia date;
    v_mensalidades_encontradas bigint;
    v_mensalidade public.mensalidades%rowtype;
begin
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

    insert into responsaveis_financeiros
        (nome, rg, cpf, telefone, cep, endereco, bairro, cidade, estado)
    values
        (p_responsavel->>'nome', p_responsavel->>'rg', p_responsavel->>'cpf',
         p_responsavel->>'telefone', p_responsavel->>'cep', p_responsavel->>'endereco',
         p_responsavel->>'bairro', p_responsavel->>'cidade', upper(p_responsavel->>'estado'))
    returning id into v_responsavel_id;

    -- Campos legados continuam preenchidos porque são NOT NULL e alimentam o
    -- trigger existente. Ele cria a primeira mensalidade dentro desta transação.
    insert into alunos
        (nome, cpf, data_nascimento, rg, telefone, cep, endereco, bairro, cidade, estado,
         mensalidade_valor, responsavel_financeiro_nome, responsavel_financeiro_documento,
         responsavel_financeiro_telefone, vencimento_dia, primeira_data_vencimento)
    values
        (p_aluno->>'nome', p_aluno->>'cpf', (p_aluno->>'data_nascimento')::date,
         p_aluno->>'rg', p_aluno->>'telefone', p_aluno->>'cep', p_aluno->>'endereco',
         p_aluno->>'bairro', p_aluno->>'cidade', upper(p_aluno->>'estado'),
         p_mensalidade_valor, p_responsavel->>'nome', p_responsavel->>'cpf',
         p_responsavel->>'telefone', coalesce(p_vencimento_dia, extract(day from v_primeiro)::smallint),
         v_primeiro)
    returning id into v_aluno_id;

    insert into contratos
        (aluno_id, responsavel_financeiro_id, data_contrato, tipo_vaga,
         mensalidade_valor, matricula_valor, cobrar_matricula, primeiro_vencimento,
         vencimento_dia)
    values
        (v_aluno_id, v_responsavel_id, p_data_contrato, upper(p_tipo_vaga),
         p_mensalidade_valor, p_matricula_valor, p_cobrar_matricula, v_primeiro,
         p_vencimento_dia)
    returning id, numero_contrato into v_contrato_id, v_numero;

    -- Adota a parcela criada pelo trigger (mesma data/competência); se o banco
    -- remoto tiver trigger diferente, todo o cadastro falha e reverte.
    select count(*) into v_mensalidades_encontradas
    from mensalidades
    where aluno_id = v_aluno_id and tipo_cobranca = 'MENSALIDADE';
    if v_mensalidades_encontradas <> 1 then
        raise exception 'Esperada exatamente uma mensalidade recorrente para o aluno recém-cadastrado; encontradas %',
            v_mensalidades_encontradas;
    end if;
    select * into strict v_mensalidade
    from mensalidades
    where aluno_id = v_aluno_id and tipo_cobranca = 'MENSALIDADE'
    for update;
    if v_mensalidade.competencia is distinct from v_competencia
       or v_mensalidade.data_vencimento is distinct from v_primeiro
       or v_mensalidade.status is distinct from 'pendente'
       or v_mensalidade.contrato_id is not null
       or v_mensalidade.valor_devido is distinct from p_mensalidade_valor then
        raise exception 'A mensalidade recorrente criada pelo trigger diverge dos dados do contrato';
    end if;
    v_mensalidade_id := v_mensalidade.id;
    update mensalidades
       set contrato_id = v_contrato_id, atualizado_em = now()
     where id = v_mensalidade_id;

    if p_cobrar_matricula then
        insert into mensalidades
            (aluno_id, contrato_id, tipo_cobranca, competencia, data_vencimento, valor_devido)
        values
            (v_aluno_id, v_contrato_id, 'MATRICULA', v_competencia, p_data_contrato,
             p_matricula_valor)
        returning id into v_matricula_id;
    end if;

    return jsonb_build_object(
        'aluno_id', v_aluno_id,
        'responsavel_financeiro_id', v_responsavel_id,
        'contrato_id', v_contrato_id,
        'numero_contrato', v_numero,
        'primeiro_vencimento', v_primeiro,
        'mensalidade_id', v_mensalidade_id,
        'matricula_id', v_matricula_id,
        'situacao', 'ativo'
    );
end;
$$;

-- Contrato sucessor para pessoas já cadastradas: não insere aluno e, portanto,
-- não dispara o trigger legado. Cria as cobranças explicitamente na transação.
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

create or replace function public.encerrar_contrato(p_contrato_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
    update contratos set situacao = 'encerrado', atualizado_em = now()
     where id = p_contrato_id and situacao = 'ativo';
    if not found then
        raise exception 'Contrato ativo não encontrado';
    end if;
    return jsonb_build_object('contrato_id', p_contrato_id, 'situacao', 'encerrado');
end;
$$;

revoke all on function public.cadastrar_aluno_contrato(jsonb, jsonb, date, text, numeric, numeric, boolean, smallint)
    from public, anon, authenticated;
grant execute on function public.cadastrar_aluno_contrato(jsonb, jsonb, date, text, numeric, numeric, boolean, smallint)
    to service_role;
revoke all on function public.cadastrar_contrato_existente(uuid, uuid, date, text, numeric, numeric, boolean, smallint)
    from public, anon, authenticated;
grant execute on function public.cadastrar_contrato_existente(uuid, uuid, date, text, numeric, numeric, boolean, smallint)
    to service_role;
revoke all on function public.encerrar_contrato(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_contrato(uuid) to service_role;

do $$
begin
    if not exists (select 1 from pg_indexes where schemaname='public'
                   and indexname='contratos_um_ativo_por_aluno_idx') then
        raise exception 'Pós-condição falhou: índice de contrato ativo ausente';
    end if;
    if not exists (select 1 from pg_indexes where schemaname='public'
                   and indexname='mensalidades_contrato_competencia_tipo_uidx') then
        raise exception 'Pós-condição falhou: índice de parcelas por contrato ausente';
    end if;
end;
$$;
commit;
