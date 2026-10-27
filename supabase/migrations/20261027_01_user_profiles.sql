-- Executar somente no banco do atrio-dev, após revisar o destino e o schema remoto.
-- Esta migration não foi executada nesta tarefa.
create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete restrict,
    role text not null check (role in ('DIRETOR', 'MONITOR')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
grant all on public.user_profiles to service_role;

create or replace function public.guard_last_active_director()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    perform pg_advisory_xact_lock(hashtext('user_profiles_active_director_guard'));
    if tg_op = 'DELETE' then
        if old.role = 'DIRETOR' and old.active and
           (select count(*) from public.user_profiles where role = 'DIRETOR' and active) <= 1 then
            raise exception 'cannot remove the last active director';
        end if;
        return old;
    end if;
    if old.role = 'DIRETOR' and old.active and
       (new.role <> 'DIRETOR' or not new.active) and
       (select count(*) from public.user_profiles where role = 'DIRETOR' and active) <= 1 then
        raise exception 'cannot deactivate or demote the last active director';
    end if;
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_profiles_guard_last_director on public.user_profiles;
create trigger user_profiles_guard_last_director
before update or delete on public.user_profiles
for each row execute function public.guard_last_active_director();

-- Ownership lets a Monitor consult/print only contracts created in their own flow.
alter table public.contratos
    add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete restrict;
create index if not exists contratos_created_by_user_idx on public.contratos(created_by_user_id, data_contrato desc);

-- Owner-aware overloads preserve the original RPC behavior and stamp authorship
-- in the same transaction as creation. The backend calls these overloads only.
create or replace function public.cadastrar_aluno_contrato(
    p_aluno jsonb, p_responsavel jsonb, p_data_contrato date, p_tipo_vaga text,
    p_mensalidade_valor numeric, p_matricula_valor numeric, p_cobrar_matricula boolean,
    p_vencimento_dia smallint, p_created_by_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_result jsonb;
begin
    if not exists (select 1 from public.user_profiles where id = p_created_by_user_id and active) then
        raise exception 'active creator profile required';
    end if;
    v_result := public.cadastrar_aluno_contrato(p_aluno, p_responsavel, p_data_contrato, p_tipo_vaga,
        p_mensalidade_valor, p_matricula_valor, p_cobrar_matricula, p_vencimento_dia);
    update public.contratos set created_by_user_id = p_created_by_user_id
    where id = (v_result->>'contrato_id')::uuid;
    return v_result;
end;
$$;

create or replace function public.cadastrar_contrato_existente(
    p_aluno_id uuid, p_responsavel_id uuid, p_data_contrato date, p_tipo_vaga text,
    p_mensalidade_valor numeric, p_matricula_valor numeric, p_cobrar_matricula boolean,
    p_vencimento_dia smallint, p_created_by_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_result jsonb;
begin
    if not exists (select 1 from public.user_profiles where id = p_created_by_user_id and active) then
        raise exception 'active creator profile required';
    end if;
    v_result := public.cadastrar_contrato_existente(p_aluno_id, p_responsavel_id, p_data_contrato, p_tipo_vaga,
        p_mensalidade_valor, p_matricula_valor, p_cobrar_matricula, p_vencimento_dia);
    update public.contratos set created_by_user_id = p_created_by_user_id
    where id = (v_result->>'contrato_id')::uuid;
    return v_result;
end;
$$;

create or replace function public.reativar_aluno_contrato(
    p_aluno_id uuid, p_responsavel_id uuid, p_data_contrato date, p_tipo_vaga text,
    p_mensalidade_valor numeric, p_matricula_valor numeric, p_cobrar_matricula boolean,
    p_vencimento_dia smallint, p_created_by_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_result jsonb;
begin
    if not exists (select 1 from public.user_profiles where id = p_created_by_user_id and active) then
        raise exception 'active creator profile required';
    end if;
    v_result := public.reativar_aluno_contrato(p_aluno_id, p_responsavel_id, p_data_contrato, p_tipo_vaga,
        p_mensalidade_valor, p_matricula_valor, p_cobrar_matricula, p_vencimento_dia);
    update public.contratos set created_by_user_id = p_created_by_user_id
    where id = (v_result->>'contrato_id')::uuid;
    return v_result;
end;
$$;

revoke all on function public.cadastrar_aluno_contrato(jsonb,jsonb,date,text,numeric,numeric,boolean,smallint,uuid) from public, anon, authenticated;
revoke all on function public.cadastrar_contrato_existente(uuid,uuid,date,text,numeric,numeric,boolean,smallint,uuid) from public, anon, authenticated;
revoke all on function public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint,uuid) from public, anon, authenticated;
grant execute on function public.cadastrar_aluno_contrato(jsonb,jsonb,date,text,numeric,numeric,boolean,smallint,uuid) to service_role;
grant execute on function public.cadastrar_contrato_existente(uuid,uuid,date,text,numeric,numeric,boolean,smallint,uuid) to service_role;
grant execute on function public.reativar_aluno_contrato(uuid,uuid,date,text,numeric,numeric,boolean,smallint,uuid) to service_role;

-- First Director provisioning is a controlled SQL/admin operation documented in README.md.
-- There is intentionally no public bootstrap RPC or automatic first-user promotion.
