export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCpf(value: string): string {
  const raw = digits(value).slice(0, 11);
  return raw
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatPhone(value: string): string {
  const raw = digits(value).slice(0, 11);
  if (raw.length <= 2) return raw.length ? `(${raw}` : "";
  if (raw.length <= 6) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
  const splitAt = raw.length === 11 ? 7 : 6;
  return `(${raw.slice(0, 2)}) ${raw.slice(2, splitAt)}-${raw.slice(splitAt)}`;
}

export function formatCep(value: string): string {
  const raw = digits(value).slice(0, 8);
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}

export function isValidCpf(value: string): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length += 1) {
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += Number(cpf[index]) * (length + 1 - index);
    }
    let check = (total * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[length])) return false;
  }
  return true;
}

export function parseBrlToCents(value: string): number | null {
  const input = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!input || !/^[\d.,]+$/.test(input)) return null;

  let normalized: string;
  if (input.includes(",")) {
    const parts = input.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1] ?? "")) return null;
    const integer = parts[0] ?? "";
    const isGrouped = /^\d{1,3}(\.\d{3})+$/.test(integer);
    if (!/^\d+$/.test(integer) && !isGrouped) return null;
    normalized = `${integer.replace(/\./g, "")}.${(parts[1] ?? "").padEnd(2, "0")}`;
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(input)) return null;
    normalized = input.includes(".") ? input : `${input}.00`;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) return null;
  return Math.round(amount * 100);
}

export function formatBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function addThirtyCalendarDays(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}
