#!/usr/bin/env python3
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crud_utils import BASE_URL, auth_headers, get_api_key, make_client, timestamp


def main():
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    ts = timestamp()

    # ------------------------------------------------------------------
    # CREATE a workflow
    # ------------------------------------------------------------------
    print("=" * 70)
    print("CREATE WORKFLOW  POST /v1/workflows")
    print("=" * 70)
    print()
    print("name ............... Workflow name (required)")
    print("description ........ Optional description")
    print("nodes .............. Array of node objects defining the call flow")
    print("edges .............. Connections between nodes")
    print("global_edges ...... Fallback edges from all nodes")
    print("variables_schema .. Typed variables the workflow reads/writes")
    print()

    workflow_payload = {
        "name": f"Qualification Flow {ts}",
        "description": "Lead qualification workflow with transfer to sales",
        "nodes": [
            {
                "id": "start",
                "type": "start",
                "data": {
                    "label": "Greeting",
                    "prompt": "Hi {{contact.name}}, this is {{assistant.name}} from Boboyii. Do you have a few minutes to chat?",
                    "firstMessage": "Hello! I'm calling from Boboyii.",
                    "model": {"provider": "openai", "model": "gpt-4o-mini", "temperature": 0.7},
                    "voice": {"provider": "azure", "voice_id": "en-US-AriaNeural"},
                    "transcriber": {"provider": "deepgram", "model": "nova-2"},
                },
            },
            {
                "id": "qualify",
                "type": "conversation",
                "data": {
                    "label": "Qualify Lead",
                    "prompt": (
                        "Ask the prospect about their business needs. "
                        "Extract: company size, budget range, timeline. "
                        "If they are not interested, thank them and end the call."
                    ),
                    "extraction_type": "ai",
                    "extract_variables": ["company_size", "budget_range", "timeline"],
                },
            },
            {
                "id": "transfer",
                "type": "transferCall",
                "data": {
                    "label": "Transfer to Sales",
                    "prompt": "Great, let me transfer you to our sales team.",
                },
            },
            {
                "id": "end",
                "type": "end",
                "data": {
                    "label": "End Call",
                    "prompt": "Thank you for your time! Goodbye.",
                },
            },
        ],
        "edges": [
            {"id": "e1", "source": "start", "target": "qualify"},
            {"id": "e2", "source": "qualify", "target": "transfer",
             "condition": {"variable": "company_size", "operator": "gte", "value": "50"}},
            {"id": "e3", "source": "qualify", "target": "end",
             "condition": {"variable": "company_size", "operator": "exists", "value": False}},
        ],
        "variables_schema": {
            "company_size": {"type": "string", "required": False, "pii": False},
            "budget_range": {"type": "string", "required": False, "pii": False},
            "timeline": {"type": "string", "required": False, "pii": False},
        },
    }

    resp = client.post(f"{BASE_URL}/v1/workflows", json=workflow_payload, headers=headers)
    print(f"Status: {resp.status_code}")
    body = resp.json()
    print(json.dumps(body, indent=2))
    print()

    if resp.status_code >= 400:
        print("CREATE failed — skipping workflow-specific operations")
        wf_uuid = None
    else:
        wf_uuid = body.get("data", body).get("uuid") or body.get("uuid") or body.get("data", body).get("id")
        if wf_uuid:
            print(f"Created workflow UUID: {wf_uuid}")
        print()

    # ------------------------------------------------------------------
    # LIST workflows
    # ------------------------------------------------------------------
    print("=" * 70)
    print("LIST WORKFLOWS  GET /v1/workflows?limit=5")
    print("=" * 70)

    resp = client.get(f"{BASE_URL}/v1/workflows", params={"limit": 5}, headers=headers)
    print(f"Status: {resp.status_code}")
    items = resp.json().get("data", resp.json().get("results", resp.json().get("items", [])))
    print(f"Returned {len(items)} workflow(s)")
    for wf in items[:3]:
        inner = wf.get("data", wf)
        print(f"  - {inner.get('name', '?')}  [{inner.get('status', '?')}]  uuid={inner.get('uuid', inner.get('id', '?'))}")
    print()

    # ------------------------------------------------------------------
    # DELETE workflow (cleanup)
    # ------------------------------------------------------------------
    if wf_uuid:
        print("=" * 70)
        print(f"DELETE WORKFLOW  DELETE /v1/workflows/{wf_uuid}")
        print("=" * 70)
        resp = client.delete(f"{BASE_URL}/v1/workflows/{wf_uuid}", headers=headers)
        print(f"Status: {resp.status_code}  Message: {resp.json().get('message', '')}")
        print()

    # ------------------------------------------------------------------
    # LIST tools
    # ------------------------------------------------------------------
    print("=" * 70)
    print("LIST TOOLS  GET /v1/tools?limit=5")
    print("=" * 70)
    print("Tools are pre-built integrations (Google Sheets, Calendar, etc.)")
    print("and custom function tools that assistants can call at runtime.\n")

    resp = client.get(f"{BASE_URL}/v1/tools", params={"limit": 5}, headers=headers)
    print(f"Status: {resp.status_code}")
    tools = resp.json().get("data", resp.json().get("results", []))
    print(f"Returned {len(tools)} tool(s)")
    for t in tools[:5]:
        inner = t.get("data", t)
        print(f"  - {inner.get('name', '?')}  type={inner.get('type', '?')}  uuid={inner.get('uuid', inner.get('id', '?'))}")
    print()

    # ------------------------------------------------------------------
    # CREATE a custom function tool
    # ------------------------------------------------------------------
    print("=" * 70)
    print("CREATE TOOL  POST /v1/tools")
    print("=" * 70)
    print("Define a custom function that the assistant can call (like a plugin).")
    print("You define the JSON Schema parameters the LLM fills at runtime.\n")

    tool_payload = {
        "name": f"lookup_order_{ts}",
        "description": "Look up an order by ID and return its status, total, and shipping info.",
        "type": "function",
        "function": {
            "name": f"lookup_order_{ts}",
            "description": "Look up an order by ID and return its status, total, and shipping info.",
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The unique order identifier (e.g. ORD-12345)",
                    },
                    "include_line_items": {
                        "type": "boolean",
                        "description": "Whether to include individual line items in the response",
                    },
                },
                "required": ["order_id"],
                "additionalProperties": False,
            },
        },
        "async": False,
        "messages": [
            {
                "type": "request-start",
                "content": "Looking up your order details...",
                "conditions": [],
            },
        ],
        "server": {
            "url": "https://api.example.com/orders",
            "method": "GET",
            "headers": {"Authorization": "Bearer sk-my-api-key"},
            "timeout_seconds": 15,
        },
    }

    resp = client.post(f"{BASE_URL}/v1/tools", json=tool_payload, headers=headers)
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json(), indent=2))

    tool_uuid = resp.json().get("data", resp.json()).get("uuid") or resp.json().get("uuid")
    if tool_uuid:
        print()
        print("=" * 70)
        print(f"DELETE TOOL  DELETE /v1/tools/{tool_uuid}")
        print("=" * 70)
        resp = client.delete(f"{BASE_URL}/v1/tools/{tool_uuid}", headers=headers)
        print(f"Status: {resp.status_code}  Message: {resp.json().get('message', '')}")


if __name__ == "__main__":
    main()
