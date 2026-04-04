"""
chat/tools/__init__.py
======================
Tool registry for the BioMap Research Assistant.

Built-in tools
--------------
  list_groups       List all filter groups and their labels (from info.json).
  get_label_info    Look up a specific group or label — count, hierarchy, level.
  search_corpus     Full-text title search in the DB; returns matching paper titles + years.
  get_corpus_stats  Total document count and year range from info.json.

How to add a new tool
---------------------
1. Create a module in this directory or add a function here.
2. Define a SCHEMA dict (OpenAI function-calling format).
3. Register it in REGISTRY at the bottom of this file.

The agent (agent.py) reads REGISTRY automatically — no other changes needed.
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Tool dataclass
# ---------------------------------------------------------------------------

@dataclass
class Tool:
    schema: dict
    fn: Callable[..., Any]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_INFO_PATH = Path(__file__).parent.parent.parent / "info.json"

def _load_info() -> dict:
    return json.loads(_INFO_PATH.read_text())

def _get_db():
    """Import get_db lazily to avoid circular imports at startup."""
    from main import get_db
    return get_db()


# ---------------------------------------------------------------------------
# Tool: list_groups
# ---------------------------------------------------------------------------

def _list_groups(_: dict) -> str:
    info = _load_info()
    lines = []
    for gk, group in info["groups"].items():
        names = [lbl["name"] for lbl in group["labels"].values()]
        lines.append(f"{group['name']} [{gk}] ({group['type']}): {', '.join(names)}")
    return "\n".join(lines)

LIST_GROUPS_SCHEMA = {
    "name": "list_groups",
    "description": (
        "List all available filter groups and their label names. "
        "Use this to understand what filters and categories exist before suggesting one to the user."
    ),
    "parameters": {"type": "object", "properties": {}, "required": []},
}


# ---------------------------------------------------------------------------
# Tool: get_label_info
# ---------------------------------------------------------------------------

def _get_label_info(args: dict) -> str:
    info       = _load_info()
    group_key  = args.get("group_key", "").lower().replace(" ", "_")
    label_name = args.get("label_name", "").lower()

    group_data = info["groups"].get(group_key)
    if not group_data:
        for gk, gv in info["groups"].items():
            if gv["name"].lower() == group_key:
                group_data, group_key = gv, gk
                break
    if not group_data:
        return f"Group '{group_key}' not found. Available: {', '.join(info['groups'].keys())}"

    if not label_name:
        rows = [
            f"  - {lbl['name']}: {lbl.get('count', '?')} docs"
            + (f" (level {lbl['level']})" if lbl.get("level") else "")
            for lbl in group_data["labels"].values()
        ]
        return f"Group: {group_data['name']}\nType: {group_data['type']}\nLabels:\n" + "\n".join(rows)

    for lbl in group_data["labels"].values():
        if lbl["name"].lower() == label_name or lbl["id"].lower() == label_name:
            children = lbl.get("children", [])
            parent   = lbl.get("parent")
            return (
                f"Label: {lbl['name']}\nGroup: {group_data['name']}\n"
                f"Count: {lbl.get('count', '?')} documents\nLevel: {lbl.get('level', 0)}\n"
                + (f"Parent: {parent}\n" if parent else "")
                + (f"Children: {', '.join(children)}" if children else "")
            )
    return f"Label '{label_name}' not found in '{group_data['name']}'."

GET_LABEL_INFO_SCHEMA = {
    "name": "get_label_info",
    "description": (
        "Look up metadata for a filter group or a specific label — "
        "document counts, hierarchy (parent/children), and level. "
        "Use when the user asks what a category means or how many papers it contains."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "group_key": {
                "type": "string",
                "description": "Group key or display name, e.g. 'drivers', 'threats', 'realm'.",
            },
            "label_name": {
                "type": "string",
                "description": "Optional label name or id within the group, e.g. 'Climate Change'.",
            },
        },
        "required": ["group_key"],
    },
}


# ---------------------------------------------------------------------------
# Tool: get_corpus_stats
# ---------------------------------------------------------------------------

def _get_corpus_stats(_: dict) -> str:
    info = _load_info()
    return (
        f"Total documents in corpus: {info['total']:,}\n"
        f"Year range: {info['start_year']}–{info['end_year']}\n"
        f"Filter groups: {', '.join(g['name'] for g in info['groups'].values())}"
    )

GET_CORPUS_STATS_SCHEMA = {
    "name": "get_corpus_stats",
    "description": "Get total document count, year range, and available filter groups for the corpus.",
    "parameters": {"type": "object", "properties": {}, "required": []},
}


# ---------------------------------------------------------------------------
# Tool: search_corpus
# DB title search — useful when the user mentions a specific topic not in the context
# ---------------------------------------------------------------------------

def _search_corpus(args: dict) -> str:
    query = args.get("query", "").strip()
    limit = min(int(args.get("limit", 10)), 20)
    if not query:
        return "No query provided."

    # Build ILIKE conditions for each word
    words   = [w for w in query.lower().split() if len(w) > 3][:6]
    if not words:
        return "Query too short — provide at least one word longer than 3 characters."

    conditions = " AND ".join(["title ILIKE %s"] * len(words))
    params     = [f"%{w}%" for w in words] + [limit]

    try:
        conn = _get_db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT title, year, doi FROM documents WHERE {conditions} LIMIT %s",
                    params,
                )
                rows = cur.fetchall()
        finally:
            conn.close()
    except Exception as exc:
        return f"Database error: {exc}"

    if not rows:
        return f"No papers found matching '{query}'."

    lines = [f"{i+1}. \"{r['title']}\" ({r['year']})" for i, r in enumerate(rows)]
    return f"Papers matching '{query}':\n" + "\n".join(lines)

SEARCH_CORPUS_SCHEMA = {
    "name": "search_corpus",
    "description": (
        "Search the full corpus database by title keywords. "
        "Use when the user mentions a specific topic, species, or concept and you want "
        "to find relevant papers beyond what was retrieved in the initial context."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Keywords to search for in paper titles.",
            },
            "limit": {
                "type": "integer",
                "description": "Max results to return (default 10, max 20).",
                "default": 10,
            },
        },
        "required": ["query"],
    },
}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

REGISTRY: dict[str, Tool] = {
    "list_groups":      Tool(schema=LIST_GROUPS_SCHEMA,      fn=_list_groups),
    "get_label_info":   Tool(schema=GET_LABEL_INFO_SCHEMA,   fn=_get_label_info),
    "get_corpus_stats": Tool(schema=GET_CORPUS_STATS_SCHEMA, fn=_get_corpus_stats),
    "search_corpus":    Tool(schema=SEARCH_CORPUS_SCHEMA,    fn=_search_corpus),
}
