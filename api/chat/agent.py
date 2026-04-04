"""
chat/agent.py
=============
Agent orchestration layer.

Flow for each request
---------------------
1. Build the message list (system prompt + history + user message).
2. Call the LLM with the available tools exposed.
3. If the model issues a tool_call, execute it and re-submit — loop until
   the model returns a plain text reply.
4. Return the final reply and token usage.

Adding tools
------------
Register new tools in chat/tools/__init__.py.
They are automatically picked up here via REGISTRY.

Environment variables
---------------------
  OPENAI_API_KEY    required
  CHAT_MODEL        default "gpt-4o-mini"
  CHAT_MAX_TOKENS   default 600
  CHAT_TEMPERATURE  default 0.7
  CHAT_HISTORY_TURNS  max turns of history to include, default 20
"""

import json
import os

from fastapi import HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from chat.prompts import build_system_prompt
from chat.tools import REGISTRY

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CHAT_MODEL     = os.getenv("CHAT_MODEL", "gpt-4o-mini")
MAX_TOKENS     = int(os.getenv("CHAT_MAX_TOKENS", "600"))
TEMPERATURE    = float(os.getenv("CHAT_TEMPERATURE", "0.7"))
HISTORY_TURNS  = int(os.getenv("CHAT_HISTORY_TURNS", "20"))
MAX_TOOL_LOOPS = 5   # safety cap on tool-call iterations


def _client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured on server.")
    return OpenAI(api_key=key)


# ---------------------------------------------------------------------------
# Pydantic schemas (shared with router.py)
# ---------------------------------------------------------------------------

class HistoryMessage(BaseModel):
    role: str
    content: str


class SelectionContext(BaseModel):
    """Human-readable context resolved by the frontend before sending."""
    total_visible: int
    # { "IPBES Direct Drivers": ["Climate Change", "Pollution"], ... }
    active_filter_names: dict[str, list[str]] = Field(default_factory=dict)
    # { "IPBES Direct Drivers": [{"name": "Climate Change", "count": 260}, ...] }
    selection_stats: dict[str, list[dict]] = Field(default_factory=dict)
    year_range: list[int] | None = None


# ---------------------------------------------------------------------------
# Core run function
# ---------------------------------------------------------------------------

def run(
    message: str,
    history: list[HistoryMessage],
    context: SelectionContext,
    docs: list[dict],
) -> tuple[str, dict | None]:
    """
    Run the agent for a single user turn.

    Parameters
    ----------
    message : str
        The user's latest message.
    history : list[HistoryMessage]
        Prior conversation turns (capped to HISTORY_TURNS).
    context : SelectionContext
        Resolved filter/stats context from the frontend.
    docs : list[dict]
        Full document records fetched from DB for the relevant IDs.

    Returns
    -------
    (reply, usage)
        reply  : str   — final assistant text
        usage  : dict  — token counts, or None on tool-only runs
    """
    oai = _client()

    # Build tool definitions for OpenAI
    tools = [{"type": "function", "function": t.schema} for t in REGISTRY.values()]

    # Assemble messages
    messages: list[dict] = [
        {"role": "system", "content": build_system_prompt(context, docs)}
    ]
    for h in history[-HISTORY_TURNS:]:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": message})

    # Agentic loop — runs until plain text reply or MAX_TOOL_LOOPS
    usage = None
    for _ in range(MAX_TOOL_LOOPS):
        response = oai.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )

        choice  = response.choices[0]
        usage   = response.usage

        if choice.finish_reason == "tool_calls":
            # Execute each tool call and append results
            messages.append(choice.message.model_dump(exclude_unset=True))
            for tc in choice.message.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments or "{}")
                tool    = REGISTRY.get(fn_name)
                if tool:
                    result = tool.fn(fn_args)
                else:
                    result = f"Tool '{fn_name}' not found."
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": str(result),
                })
        else:
            # Plain text reply — we're done
            reply = choice.message.content.strip()
            return reply, {
                "prompt_tokens":     usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens":      usage.total_tokens,
            }

    return "I reached the tool-call limit without a final answer. Please try rephrasing.", None
