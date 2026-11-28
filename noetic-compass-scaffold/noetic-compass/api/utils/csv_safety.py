"""CSV formula-injection neutralization and safe download header helpers (CWE-1236).

Spreadsheets (Excel, LibreOffice Calc, Google Sheets) interpret CSV cells
starting with ``=``, ``+``, ``-``, ``@``, or leading control/whitespace
characters followed by a formula trigger as executable formulas or DDE
commands.  All user-controlled or untrusted text written to CSV exports MUST
pass through :func:`sanitize_csv_cell` / :func:`sanitize_csv_row` /
:func:`sanitize_csv_dict` before serialization.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Mapping
from typing import Any

FORMULA_TRIGGERS: tuple[str, ...] = ("=", "+", "-", "@", "\t", "\r")
_FORMULA_LEAD_CHARS: tuple[str, ...] = ("=", "+", "-", "@")
_CONTROL_LEAD_CHARS: tuple[str, ...] = ("\t", "\r", "\n")

CSV_DOWNLOAD_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
}


def _strip_leading_ignorable(value: str) -> str:
    """Strip leading ASCII whitespace, control chars (0x00-0x20, 0x7F), BOM, and Unicode whitespace/format chars."""
    idx = 0
    length = len(value)
    while idx < length:
        ch = value[idx]
        code = ord(ch)
        if code <= 0x20 or code == 0x7F or ch == "\ufeff" or ch.isspace():
            idx += 1
            continue
        if unicodedata.category(ch) in ("Cc", "Cf"):
            idx += 1
            continue
        break
    return value[idx:]


def sanitize_csv_cell(value: object) -> object:
    """Neutralize spreadsheet formula triggers in a single CSV cell value.

    Non-string values (``None``, ``int``, ``float``, ``bool``) are returned
    unchanged so numeric columns keep their native representation.  For strings,
    any cell whose first character is a control trigger (``\\t``, ``\\r``,
    ``\\n``) or formula trigger (``=``, ``+``, ``-``, ``@``), OR whose first
    non-whitespace / non-control character is a formula trigger, is prefixed
    with a literal single quote (``'``) so spreadsheets treat it as plain text.
    """
    if value is None or not isinstance(value, str):
        return value
    if value == "":
        return ""
    first = value[0]
    if first in _CONTROL_LEAD_CHARS or first in _FORMULA_LEAD_CHARS:
        return "'" + value
    stripped = _strip_leading_ignorable(value)
    if stripped and stripped[0] in _FORMULA_LEAD_CHARS:
        return "'" + value
    return value


def sanitize_csv_row(row: Iterable[object]) -> list[object]:
    """Sanitize every cell in a sequence/iterable CSV row."""
    return [sanitize_csv_cell(cell) for cell in row]


def sanitize_csv_dict(row: Mapping[str, object]) -> dict[str, Any]:
    """Sanitize every value in a mapping row for ``csv.DictWriter``."""
    return {key: sanitize_csv_cell(value) for key, value in row.items()}


def csv_download_headers(filename: str) -> dict[str, str]:
    """Return defense-in-depth download headers for CSV responses."""
    safe_name = "".join(
        ch for ch in filename if ch.isalnum() or ch in ("-", "_", ".")
    ).lstrip(".")
    if not safe_name:
        safe_name = "export.csv"
    return {
        **CSV_DOWNLOAD_HEADERS,
        "Content-Disposition": f'attachment; filename="{safe_name}"',
    }
