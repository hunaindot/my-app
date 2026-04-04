"""
chat/
=====
BioMap Research Assistant — backend chat package.

Package layout
--------------
  chat/
  ├── __init__.py        — this file; exports the FastAPI router
  ├── agent.py           — agent loop (tool calls, LLM orchestration)
  ├── router.py          — FastAPI endpoint (HTTP layer only)
  ├── prompts/
  │   ├── __init__.py
  │   └── system.py      — ALL system prompt templates live here
  └── tools/
      └── __init__.py    — tool registry + built-in tools (list_groups, get_label_info)

To change prompts    → edit chat/prompts/system.py
To add a tool        → add a module in chat/tools/, register in chat/tools/__init__.py
To change the model  → set env var CHAT_MODEL (default: gpt-4o-mini)
To tune parameters   → set CHAT_MAX_TOKENS, CHAT_TEMPERATURE, CHAT_HISTORY_TURNS

Included in main.py as:
    from chat import router as chat_router
    app.include_router(chat_router, prefix="/api")
"""

from chat.router import router

__all__ = ["router"]
