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
    # CREATE assistant with a rich configuration payload
    # ------------------------------------------------------------------
    print("=" * 70)
    print("CREATE ASSISTANT  POST /v1/assistants/")
    print("=" * 70)
    print()
    print("name ................. Required. Human-readable label")
    print("model ................ Dict. Provider + model ID + optional settings")
    print("voice ................ Dict. TTS provider, voice ID, speed, etc.")
    print("transcriber ......... Dict. STT provider (deepgram, azure, etc.)")
    print("system_prompt ....... System instructions for the AI")
    print("first_message ....... Greeting spoken when call connects")
    print("first_message_mode .. 'assistant-speaks-first' or 'agent-asks-first'")
    print("max_duration_seconds  Max call length before forced hangup")
    print("silence_timeout_seconds  Seconds of silence before hanging up")
    print("background_sound .... 'office', 'restaurant', etc. for outbound")
    print("summary_enabled ..... Auto-generate post-call summary")
    print()

    assistant_payload = {
        "name": f"My Sales Assistant {ts}",
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 300,
            "emotion_recognition_enabled": False,
        },
        "voice": {
            "provider": "azure",
            "voice_id": "en-US-AriaNeural",
            "speed": 1.0,
            "filler_words_enabled": False,
        },
        "transcriber": {
            "provider": "deepgram",
            "language": "en",
            "model": "nova-2",
        },
        "system_prompt": (
            "You are a professional sales assistant at Boboyii. "
            "Your goal is to qualify leads, answer product questions, "
            "and book demo appointments. Be concise, friendly, and persuasive."
        ),
        "first_message": "Hi there! Thanks for your interest in Boboyii. How can I help you today?",
        "first_message_mode": "assistant-speaks-first",
        "first_message_interruptions_enabled": True,
        "end_call_message": "Thank you for your time. Have a great day!",
        "end_call_phrases": ["goodbye", "bye", "talk to you later"],
        "voicemail_message": "Hi, this is a message from Boboyii. Please give us a call back.",
        "voicemail_detection": {"enabled": True, "timeout_seconds": 10},
        "max_duration_seconds": 600.0,
        "silence_timeout_seconds": 30.0,
        "background_sound": "office",
        "background_sound_volume": 0.8,
        "model_output_in_messages_enabled": False,
        "audio_recording_enabled": True,
        "summary_enabled": True,
        "analysis_plan": {
            "summary_plan": {"enabled": True, "timeout_seconds": 30},
        },
        "server_messages": [
            {"type": "end-of-call-report", "destination": "http://webhook-service:8005/internal/vapi/end-of-call"},
        ],
    }

    resp = client.post(
        f"{BASE_URL}/v1/assistants/",
        json=assistant_payload,
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    body = resp.json()
    print(json.dumps(body, indent=2))
    print()

    if resp.status_code >= 400:
        print("CREATE failed — aborting")
        return

    asst_uuid = body.get("data", body).get("uuid") or body.get("uuid") or body.get("data", body).get("id")
    if not asst_uuid:
        print("No assistant UUID found in response")
        return
    print(f"Created assistant UUID: {asst_uuid}")

    # ------------------------------------------------------------------
    # LIST assistants (with pagination params)
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("LIST ASSISTANTS  GET /v1/assistants/?limit=3&offset=0")
    print("=" * 70)

    resp = client.get(
        f"{BASE_URL}/v1/assistants/",
        params={"limit": 3, "offset": 0},
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    data = resp.json()
    items = data.get("data", data.get("results", []))
    print(f"Returned {len(items)} assistant(s)")
    if items:
        for a in items[:3]:
            inner = a.get("data", a)
            print(f"  - {inner.get('name', '?')}  uuid={inner.get('uuid', '?')}")

    # ------------------------------------------------------------------
    # GET assistant by ID (includes full config)
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print(f"GET ASSISTANT  GET /v1/assistants/{asst_uuid}")
    print("=" * 70)

    resp = client.get(f"{BASE_URL}/v1/assistants/{asst_uuid}", headers=headers)
    print(f"Status: {resp.status_code}")
    detail = resp.json().get("data", resp.json())
    print(f"Name .............. {detail.get('name')}")
    print(f"Model ............. {detail.get('model', {}).get('model')}")
    print(f"Voice ............ {detail.get('voice', {}).get('voice_id')}")
    print(f"Transcriber ...... {detail.get('transcriber', {}).get('provider')}")
    print(f"First message .... {detail.get('first_message')}")
    print(f"Silence timeout .. {detail.get('silence_timeout_seconds')}s")
    print(f"Max duration ..... {detail.get('max_duration_seconds')}s")
    print(f"Summary enabled .. {detail.get('summary_enabled')}")
    print()

    # ------------------------------------------------------------------
    # UPDATE assistant (partial — only send fields to change)
    # ------------------------------------------------------------------
    print("=" * 70)
    print(f"UPDATE ASSISTANT  PATCH /v1/assistants/{asst_uuid}")
    print("=" * 70)
    print("Only fields sent in the body are changed; omitted fields stay as-is.")

    resp = client.patch(
        f"{BASE_URL}/v1/assistants/{asst_uuid}",
        json={
            "name": f"My Sales Assistant {ts} (updated)",
            "silence_timeout_seconds": 15.0,
            "summary_enabled": False,
        },
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    updated = resp.json().get("data", resp.json())
    print(f"New name ................. {updated.get('name')}")
    print(f"New silence timeout ...... {updated.get('silence_timeout_seconds')}s")
    print(f"Summary enabled now ...... {updated.get('summary_enabled')}")
    print()

    # ------------------------------------------------------------------
    # DELETE assistant
    # ------------------------------------------------------------------
    print("=" * 70)
    print(f"DELETE ASSISTANT  DELETE /v1/assistants/{asst_uuid}")
    print("=" * 70)

    resp = client.delete(f"{BASE_URL}/v1/assistants/{asst_uuid}", headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Message: {resp.json().get('message', '')}")
    print()


if __name__ == "__main__":
    main()
