#!/usr/bin/env python3
"""Create a Pidgin English voice assistant (Spitch TTS + ElevenLabs STT) and join a terminal web call."""

import asyncio
import json
import sys
from pathlib import Path
# Add sdk to path for local testing
sys.path.insert(0, str(Path(__file__).parent.parent / "sdk" / "python"))

from vonative import VonativeClient, CallConfig
from crud_utils import BASE_URL, auth_headers, get_api_key, make_client, timestamp

PIDGIN_PROMPT = (
    "You be a Nigerian Pidgin realtime voice AI assistant for Boboyii platform.\n\n"
    "Rules:\n"
    "- Always respond ONLY in Nigerian Pidgin.\n"
    "- Never respond in standard English.\n"
    "- Never translate to standard English.\n"
    "- If the user speaks standard English, still respond in Pidgin.\n"
    "- Use natural, current Nigerian Pidgin (Lagos/Waffi style).\n"
    "- Keep responses short and speech-friendly.\n"
    "- Sound like a real person for the street, not like textbook.\n"
    "- Sound natural when read by TTS.\n"
    "- Maintain Pidgin for the whole conversation.\n\n"
    "Your work na to help customers with Boboyii voice AI platform.\n"
    "You fit answer questions about assistants, phone numbers, billing, and general platform help.\n"
    "You dey friendly, patient, and helpful always.\n\n"
    "Examples:\n"
    'User: "Hello"\n'
    'Response: "Wetin dey sup? You welcome to Boboyii. How I fit help you today?"\n\n'
    'User: "What is my account balance?"\n'
    'Response: "Make I check wetin remain for your account. No worry, I go help you."\n\n'
    'User: "How I create assistant?"\n'
    'Response: "To create assistant, you just need to give am name and choose voice wey you want.\n'
    'You fit do everything from your dashboard. Make I show you?"\n\n'
    'User: "Please speak English"\n'
    'Response: "No vex, na Pidgin I fit speak with you. But I go still help you well well!"\n\n'
    'User: "How are you?"\n'
    'Response: "I dey fine. How you self dey? Wetin you want help with today?"'
)

def find_audio_devices():
    """Return (input_device, output_device) names or None."""
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        inp = next((d for d in devices if d["max_input_channels"] > 0), None)
        out = next((d for d in devices if d["max_output_channels"] > 0), None)
        return inp["name"] if inp else None, out["name"] if out else None
    except Exception:
        return None, None


def main():
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    ts = timestamp()

    inp_dev, out_dev = find_audio_devices()
    print(f"🎤 Input:  {inp_dev or 'N/A'}")
    print(f"🔊 Output: {out_dev or 'N/A'}\n")

    print("=" * 70)
    print("CREATE PIDGIN ASSISTANT  POST /v1/assistants/")
    print("=" * 70)

    assistant_payload = {
        "name": f"Pidgin Assistant {ts}",
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 300,
        },
        "voice": {
            "provider": "spitch",
            "voice_id": "boma",
            "language": "pcm",
            "speed": 1.0,
            "filler_words_enabled": False,
        },
        "transcriber": {
            "provider": "11labs",
            "model": "scribe_v1",
            "language": "en",
        },
        "system_prompt": PIDGIN_PROMPT,
        "first_message": "Hello-o! I be your Boboyii Pidgin assistant. Wetin dey happen? How I fit help you today?",
        "first_message_mode": "assistant-speaks-first",
        "first_message_interruptions_enabled": True,
        "end_call_message": "Thank you for calling Boboyii. Make you no worry, we dey here for you anytime. Bye bye!",
        "end_call_phrases": ["bye", "goodbye", "thank you", "bye bye"],
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
    }

    resp = client.post(f"{BASE_URL}/v1/assistants/", json=assistant_payload, headers=headers)
    print(f"Status: {resp.status_code}")
    body = resp.json()

    if resp.status_code >= 400:
        print(f"CREATE failed:\n{json.dumps(body, indent=2)}")
        return 1

    asst_uuid = (
        body.get("data", body).get("uuid")
        or body.get("uuid")
        or body.get("data", body).get("id")
    )
    if not asst_uuid:
        print("No assistant UUID found")
        return 1

    asst_name = body.get("data", body).get("name", f"Pidgin Assistant {ts}")
    print(json.dumps(body, indent=2))
    print(f"\n✓ Created: {asst_name}  uuid={asst_uuid}\n")

    print("=" * 70)
    print("INITIATE WEB CALL  POST /v1/calls")
    print("=" * 70)

    call_payload = {
        "assistant_id": asst_uuid,
        "client_type": "terminal"
    }
    resp = client.post(f"{BASE_URL}/v1/calls", json=call_payload, headers=headers)
    print(f"Status: {resp.status_code}")

    if resp.status_code >= 400:
        print(f"Web call failed: {resp.text}")
        return 1

    result = resp.json().get("data", resp.json())
    room_name = result.get("room_name")
    token = result.get("token")
    livekit_url = result.get("livekit_url")
    print(json.dumps(result, indent=2))
    print()

    print("=" * 70)
    print("JOINING CALL FROM TERMINAL")
    print("=" * 70)

    async def run_loop():
        client = VonativeClient()
        
        client.on_connected = lambda: print("✓ Connected to room")
        client.on_disconnected = lambda reason: print(f"✗ Disconnected: {reason}")
        client.on_agent_joined = lambda: print("🤖 Agent don join — dey speak make I hear!")

        print("🎤 Mic hot. Press Ctrl+C to end call.\n")
        
        config = CallConfig(livekit_url=livekit_url, token=token)
        await client.connect(config)
        
        try:
            while client.is_running:
                await asyncio.sleep(0.2)
        finally:
            await client.disconnect()

    try:
        asyncio.run(run_loop())
    except KeyboardInterrupt:
        print("\n⏹  Ending call...")

    print("Call ended. Bye bye!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
