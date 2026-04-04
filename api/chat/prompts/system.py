"""
chat/prompts/system.py
======================
Loads system.md and fills in runtime context blocks.

To change the assistant's persona, tone, or rules → edit system.md.
To change how context blocks are formatted → edit the _*_block() functions below.

Environment variables
---------------------
  CHAT_ABSTRACT_CHARS   int, default 220
"""

import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from chat.agent import SelectionContext

ABSTRACT_CHARS: int = int(os.getenv("CHAT_ABSTRACT_CHARS", "220"))
_TEMPLATE = (Path(__file__).parent / "system.md").read_text()


# ---------------------------------------------------------------------------
# Block builders — edit these to change how context is formatted in the prompt
# ---------------------------------------------------------------------------

def _filter_block(context: "SelectionContext") -> str:
    lines = [
        f"  • {group}: {', '.join(names)}"
        for group, names in context.active_filter_names.items()
        if names
    ]
    year_note = ""
    if context.year_range and len(context.year_range) == 2:
        year_note = f"\n  Year range: {context.year_range[0]}–{context.year_range[1]}"
    body = "\n".join(lines) if lines else "None — full corpus visible"
    return f"[Active filters]\n{body}{year_note}"


def _stats_block(context: "SelectionContext") -> str:
    lines = [f"  Total visible: {context.total_visible:,} documents"]
    for group_name, counts in (context.selection_stats or {}).items():
        top = ", ".join(f"{c['name']} ({c['count']})" for c in counts[:6])
        lines.append(f"  {group_name}: {top}")
    return "[Selection overview]\n" + "\n".join(lines)


def _docs_block(docs: list[dict]) -> str:
    if not docs:
        return ""
    lines = []
    for i, d in enumerate(docs):
        abstract = (d.get("abstract") or "")
        snippet  = abstract[:ABSTRACT_CHARS] + "…" if abstract else "(no abstract)"
        authors  = f" · {d['authors']}" if d.get("authors") else ""
        lines.append(
            f'{i + 1}. "{d["title"]}" ({d["year"]}{authors})\n'
            f"   {snippet}"
        )
    return "[Most relevant papers retrieved for this query]\n" + "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build_system_prompt(context: "SelectionContext", docs: list[dict]) -> str:
    """
    Fill system.md template with runtime context and return the full prompt string.
    """
    return _TEMPLATE.format(
        filter_block=_filter_block(context),
        stats_block=_stats_block(context),
        docs_block=_docs_block(docs) or "(no papers retrieved for this query)",
    )
