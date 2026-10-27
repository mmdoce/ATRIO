
import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    raise RuntimeError(
        "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrada no .env"
    )

supabase = create_client(url, key)

try:
    resultado = (
        supabase.table("alunos")
        .select("id")
        .limit(1)
        .execute()
    )

    print("Conexão com o Supabase realizada!")
    print("Resultado da consulta:", resultado.data)

except Exception as erro:
    print("Erro ao consultar o Supabase:")
    print(erro)
