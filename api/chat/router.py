"""
chat/router.py
==============
FastAPI router — single endpoint POST /chat.

This module only handles HTTP: parsing the request, fetching abstracts
from the DB, delegating to agent.run(), and returning the response.
No prompt logic or LLM calls live here.
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from chat.agent import HistoryMessage, SelectionContext, run as agent_run

router = APIRouter()

MAX_DOCS = int(os.getenv("CHAT_MAX_DOCS", "12"))


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = Field(default_factory=list)
    context: SelectionContext
    # Pre-searched slim.arrow indices (client-side title search)
    relevant_doc_ids: list[int] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    usage: Optional[dict] = None
    context_docs: int = 0


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    # 1. Fetch abstracts for the pre-searched doc IDs
    docs: list[dict] = []
    if req.relevant_doc_ids:
        from main import get_db   # deferred to avoid circular import at startup
        conn = get_db()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT idx, title, abstract, year, authors, doi
                    FROM documents
                    WHERE idx = ANY(%s)
                    ORDER BY idx
                    """,
                    (req.relevant_doc_ids[:MAX_DOCS],),
                )
                docs = [dict(row) for row in cur.fetchall()]
        finally:
            conn.close()

    # 2. Run the agent
    try:
        reply, usage = agent_run(
            message=req.message,
            history=req.history,
            context=req.context,
            docs=docs,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Agent error: {exc}") from exc

    return ChatResponse(reply=reply, usage=usage, context_docs=len(docs))
