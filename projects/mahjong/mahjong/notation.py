import re
from .core.tile import tiles_from_types


def parse_types(text: str) -> list[int]:
    """Compact notation: m=万, p=筒, s=条, z=东南西北中发白 (1..7)."""
    text = re.sub(r"[\s,，]+", "", text)
    parts = list(re.finditer(r"([1-9]+)([mpsz])", text))
    if not parts or "".join(m.group() for m in parts) != text:
        raise ValueError("use compact notation such as 123m456p789s11555z")
    result = []
    for part in parts:
        digits,suit=part.groups()
        for d in digits:
            n=int(d)
            if suit=="z" and n>7:
                raise ValueError("honors z have ranks 1..7 only")
            result.append({"m":0,"p":9,"s":18,"z":27}[suit]+n-1)
    tiles_from_types(result)  # physical limit within the supplied hand
    return result


def format_type(t: int) -> str:
    return f"{t%9+1}{'mps'[t//9]}" if t<27 else f"{t-26}z"
