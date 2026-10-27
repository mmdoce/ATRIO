from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


_UNITS = ("zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove")
_TEENS = ("dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove")
_TENS = ("", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa")
_HUNDREDS = ("", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos")


def _under_thousand(number: int) -> str:
    if number == 0:
        return ""
    if number == 100:
        return "cem"
    parts: list[str] = []
    hundreds, remainder = divmod(number, 100)
    if hundreds:
        parts.append(_HUNDREDS[hundreds])
    if 10 <= remainder < 20:
        parts.append(_TEENS[remainder - 10])
    else:
        tens, units = divmod(remainder, 10)
        if tens:
            parts.append(_TENS[tens])
        if units:
            parts.append(_UNITS[units])
    return " e ".join(parts)


def _integer_words(number: int) -> str:
    if number == 0:
        return "zero"
    groups: list[tuple[int, str]] = []
    scales = ("", "mil", "milhão", "bilhão")
    while number:
        number, group = divmod(number, 1000)
        groups.append((group, scales[len(groups)]))
    rendered: list[str] = []
    for group, scale in reversed(groups):
        if group == 0:
            continue
        if not scale:
            text = _under_thousand(group)
        elif scale == "mil":
            text = "mil" if group == 1 else f"{_under_thousand(group)} mil"
        else:
            label = scale if group == 1 else {"milhão": "milhões", "bilhão": "bilhões"}[scale]
            text = f"{_under_thousand(group)} {label}"
        rendered.append(text)
    if len(rendered) > 1 and (groups[0][0] == 0 or groups[0][0] < 100 or groups[0][0] % 100 == 0):
        return " e ".join(rendered)
    return " ".join(rendered)


def valor_por_extenso(value: Decimal) -> str:
    """Render a nonnegative monetary amount as Portuguese BRL text."""
    amount = Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount < 0:
        raise ValueError("Valor monetário não pode ser negativo")
    whole, cents = divmod(int(amount * 100), 100)
    reais_text = _integer_words(whole)
    reais = "real" if whole == 1 else "reais"
    if whole == 0:
        reais_text = "zero"
    result = f"{reais_text} {reais}"
    if cents:
        centavos = "centavo" if cents == 1 else "centavos"
        centavos_text = _integer_words(cents)
        result += f" e {centavos_text} {centavos}"
    return result

