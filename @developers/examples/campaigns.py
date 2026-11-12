#!/usr/bin/env python3
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crud_utils import BASE_URL, auth_headers, get_api_key, make_client, extract_id, timestamp


def _get_phone_number_id(client, headers):
    resp = client.get(f"{BASE_URL}/v1/phone-numbers", params={"limit": 1}, headers=headers)
    if resp.status_code >= 400:
        return None
    items = resp.json().get("data", resp.json().get("items", resp.json().get("results", [])))
    return extract_id(items[0]) if items else None


def main():
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    ts = timestamp()
    phone_id = _get_phone_number_id(client, headers)

    if not phone_id:
        print("No phone numbers available for this organization.")
        print("Creating a campaign requires a phone_number_id linked to your org.")
        print("Purchase one first via POST /v1/phone-numbers/request or the dashboard.\n")
        resp = client.get(f"{BASE_URL}/v1/campaigns/", headers=headers)
        print(f"LIST campaigns -> {resp.status_code}")
        resp = client.get(f"{BASE_URL}/v1/campaigns/contacts/template", headers=headers)
        print(f"CSV template -> {resp.status_code}")
        if resp.status_code < 400:
            print(f"\nTemplate CSV preview:\n{resp.text[:500]}")
        return

    # ------------------------------------------------------------------
    # CREATE campaign
    # ------------------------------------------------------------------
    print("=" * 70)
    print("CREATE CAMPAIGN  POST /v1/campaigns/")
    print("=" * 70)
    print()
    print("name .............. Campaign name (required)")
    print("phone_number_id .. Your org's phone number UUID (required)")
    print("assistant_id ..... Vapi assistant ID (optional if local_assistant_id set)")
    print("local_assistant_id  Local assistant UUID for outbound calls")
    print("workflow_id ...... Workflow UUID for call flow (optional)")
    print("customers ........ Array of {name, phone, ...} contacts to call")
    print("schedule_plan .... Dict with time window, days, timezone, etc.")
    print()

    campaign_payload = {
        "name": f"Q3 Outreach {ts}",
        "phone_number_id": phone_id,
        "assistant_id": None,
        "local_assistant_id": None,
        "workflow_id": None,
        "customers": [
            {"name": "Alice Johnson", "phone": "+14155550101", "email": "alice@example.com", "company": "Acme Corp"},
            {"name": "Bob Smith", "phone": "+14155550102", "email": "bob@example.com", "company": "Globex Inc"},
            {"name": "Carol White", "phone": "+14155550103"},
        ],
        "schedule_plan": {
            "timezone": "America/New_York",
            "start_time": "09:00",
            "end_time": "17:00",
            "days_of_week": ["mon", "tue", "wed", "thu", "fri"],
            "max_calls_per_hour": 10,
            "retry_on_busy": True,
            "retry_on_no_answer": True,
            "max_retries": 2,
            "retry_delay_minutes": 30,
            "start_date": None,
            "end_date": None,
        },
    }

    resp = client.post(f"{BASE_URL}/v1/campaigns/", json=campaign_payload, headers=headers)
    print(f"Status: {resp.status_code}")
    body = resp.json()
    print(json.dumps(body, indent=2))
    print()

    if resp.status_code >= 400:
        print("CREATE failed — falling back to read-only examples")
        resp = client.get(f"{BASE_URL}/v1/campaigns/", headers=headers)
        print(f"LIST campaigns -> {resp.status_code}")
        resp = client.get(f"{BASE_URL}/v1/campaigns/contacts/template", headers=headers)
        print(f"CSV template -> {resp.status_code}")
        return

    campaign_uuid = extract_id(body)
    if not campaign_uuid:
        print("Could not extract campaign UUID")
        return
    print(f"Created campaign UUID: {campaign_uuid}")

    # ------------------------------------------------------------------
    # LIST
    # ------------------------------------------------------------------
    print("=" * 70)
    print("LIST CAMPAIGNS  GET /v1/campaigns/?limit=5&offset=0")
    print("=" * 70)
    resp = client.get(f"{BASE_URL}/v1/campaigns/", params={"limit": 5}, headers=headers)
    print(f"Status: {resp.status_code}")
    items = resp.json().get("data", resp.json().get("results", []))
    print(f"Returned {len(items)} campaign(s)")
    for c in items:
        inner = c.get("data", c)
        print(f"  - {inner.get('name')}  [{inner.get('status')}]  uuid={inner.get('uuid')}")

    # ------------------------------------------------------------------
    # GET by ID
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print(f"GET CAMPAIGN  GET /v1/campaigns/{campaign_uuid}")
    print("=" * 70)
    resp = client.get(f"{BASE_URL}/v1/campaigns/{campaign_uuid}", headers=headers)
    print(f"Status: {resp.status_code}")
    detail = resp.json().get("data", resp.json())
    print(f"Name .............. {detail.get('name')}")
    print(f"Status ........... {detail.get('status')}")
    print(f"Phone number ..... {detail.get('phone_number_id')}")
    print(f"Customers ........ {len(detail.get('customers', []))} contacts")
    print(f"Scheduled calls .. {detail.get('calls_counter_scheduled', 0)}")
    print(f"Cost ............. {detail.get('total_cost', 'N/A')}")

    # ------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print(f"UPDATE CAMPAIGN  PATCH /v1/campaigns/{campaign_uuid}")
    print("=" * 70)
    print("Only fields sent in the body change; customers can be appended.")
    resp = client.patch(
        f"{BASE_URL}/v1/campaigns/{campaign_uuid}",
        json={
            "name": f"Q3 Outreach {ts} (updated)",
            "customers": [{"name": "Diana Prince", "phone": "+14155550104"}],
        },
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    updated = resp.json().get("data", resp.json())
    print(f"New name .... {updated.get('name')}")
    print(f"Customers ... {len(updated.get('customers', []))} contacts")

    # ------------------------------------------------------------------
    # LIFECYCLE: start → pause → resume → cancel
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("CAMPAIGN LIFECYCLE")
    print("=" * 70)
    print("start  -> moves campaign to 'in_progress'")
    print("pause  -> pauses call dispatching (no new calls placed)")
    print("resume -> resumes dispatching from where it left off")
    print("cancel -> cancels remaining scheduled calls")
    print()

    for action in ["start", "pause", "resume", "cancel"]:
        resp = client.post(f"{BASE_URL}/v1/campaigns/{campaign_uuid}/{action}", headers=headers)
        print(f"POST .../{action} -> {resp.status_code}  {resp.json().get('message', '')}")

    # ------------------------------------------------------------------
    # CSV TEMPLATE
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("CSV TEMPLATE  GET /v1/campaigns/contacts/template")
    print("=" * 70)
    print("Download a CSV template for bulk contact import, then")
    print("upload it via POST /v1/campaigns/{uuid}/contacts/upload")
    print()

    resp = client.get(f"{BASE_URL}/v1/campaigns/contacts/template", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code < 400:
        print(f"\nTemplate CSV:\n{resp.text[:600]}...")
    print()

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------
    print("=" * 70)
    print(f"DELETE CAMPAIGN  DELETE /v1/campaigns/{campaign_uuid}")
    print("=" * 70)
    resp = client.delete(f"{BASE_URL}/v1/campaigns/{campaign_uuid}", headers=headers)
    print(f"Status: {resp.status_code}  Message: {resp.json().get('message', '')}")


if __name__ == "__main__":
    main()
