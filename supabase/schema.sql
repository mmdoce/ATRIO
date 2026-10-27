create extension if not exists pgcrypto;

create table if not exists public.alunos (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    cpf text unique,
    data_nascimento date,
    telefone text,
    email text,
    endereco text,
    mensalidade_valor numeric(10,2) not null check (mensalidade_valor > 0),
    responsavel_financeiro_nome text not null,
    responsavel_financeiro_documento text,
    responsavel_financeiro_telefone text,
    vencimento_dia smallint not null check (vencimento_dia between 1 and 31),
    primeira_data_vencimento date not null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

create table if not exists public.mensalidades (
    id uuid primary key default gen_random_uuid(),
    aluno_id uuid not null references public.alunos(id) on delete restrict,
    competencia date not null,
    data_vencimento date not null,
    valor_devido numeric(10,2) not null check (valor_devido > 0),
    valor_pago numeric(10,2),
    forma_pagamento text check (forma_pagamento in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro')),
    status text not null default 'pendente' check (status in ('pendente', 'paga', 'cancelada')),
    comprovante_path text,
    pago_em timestamptz,
    criado_em timestamptz not null default now(),
    unique (aluno_id, competencia),
    check ((status = 'paga' and valor_pago is not null and forma_pagamento is not null and pago_em is not null)
        or status <> 'paga')
);

-- Registro imutável da liquidação, separado do estado atual da parcela.
create table if not exists public.pagamentos_mensalidade (
    id uuid primary key default gen_random_uuid(),
    mensalidade_id uuid not null unique references public.mensalidades(id) on delete restrict,
    valor_pago numeric(10,2) not null check (valor_pago > 0),
    forma_pagamento text not null check (forma_pagamento in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro')),
    comprovante_path text,
    pago_em timestamptz not null default now(),
    criado_em timestamptz not null default now()
);

-- As tabelas financeiras só são acessadas pelo backend com service_role.
-- Sem políticas para anon/authenticated, RLS nega o acesso direto pela API REST.
alter table public.alunos enable row level security;
alter table public.mensalidades enable row level security;
alter table public.pagamentos_mensalidade enable row level security;
revoke all on public.alunos, public.mensalidades, public.pagamentos_mensalidade from anon, authenticated;
grant all on public.alunos, public.mensalidades, public.pagamentos_mensalidade to service_role;

create index if not exists mensalidades_aluno_vencimento_idx
    on public.mensalidades (aluno_id, data_vencimento);
create index if not exists mensalidades_status_vencimento_idx
    on public.mensalidades (status, data_vencimento);

-- Cria a primeira parcela, com valor copiado do cadastro do aluno.
create or replace function public.criar_primeira_mensalidade()
returns trigger
language plpgsql
as $$
begin
    insert into public.mensalidades (aluno_id, competencia, data_vencimento, valor_devido)
    values (
        new.id,
        date_trunc('month', new.primeira_data_vencimento)::date,
        new.primeira_data_vencimento,
        new.mensalidade_valor
    );
    return new;
end;
$$;

drop trigger if exists alunos_criar_primeira_mensalidade on public.alunos;
create trigger alunos_criar_primeira_mensalidade
after insert on public.alunos
for each row execute function public.criar_primeira_mensalidade();

-- Baixa atômica: bloqueia concorrência, valida valor e só transita pendente -> paga.
create or replace function public.baixar_mensalidade(
    p_mensalidade_id uuid,
    p_valor_pago numeric,
    p_forma_pagamento text,
    p_comprovante_path text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    parcela public.mensalidades%rowtype;
begin
    select * into parcela
    from public.mensalidades
    where id = p_mensalidade_id
    for update;

    if not found or parcela.status <> 'pendente' then
        raise exception 'Parcela não encontrada ou já baixada';
    end if;
    if p_valor_pago is distinct from parcela.valor_devido then
        raise exception 'Valor pago deve ser igual ao valor devido';
    end if;
    if p_forma_pagamento not in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro') then
        raise exception 'Forma de pagamento inválida';
    end if;

    update public.mensalidades
    set valor_pago = p_valor_pago,
        forma_pagamento = p_forma_pagamento,
        comprovante_path = p_comprovante_path,
        status = 'paga',
        pago_em = now()
    where id = p_mensalidade_id
    returning * into parcela;

    insert into public.pagamentos_mensalidade (
        mensalidade_id, valor_pago, forma_pagamento, comprovante_path, pago_em
    ) values (
        parcela.id, p_valor_pago, p_forma_pagamento, p_comprovante_path, parcela.pago_em
    );

    return to_jsonb(parcela) || jsonb_build_object('pagamento_id', (
        select id from public.pagamentos_mensalidade where mensalidade_id = parcela.id
    ));
end;
$$;

revoke all on function public.baixar_mensalidade(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.baixar_mensalidade(uuid, numeric, text, text) to service_role;

-- Crie este bucket privado no Storage (ou via painel) com limite de 10 MB
-- e tipos permitidos: application/pdf, image/jpeg, image/png, image/webp.
-- Restrinja políticas de leitura/escrita conforme os papéis do seu sistema.
