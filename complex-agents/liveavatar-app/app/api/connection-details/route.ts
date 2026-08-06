import { NextResponse } from 'next/server';

const API_KEY = process.env.VONATIVE_API_KEY;
const API_URL = process.env.VONATIVE_API_URL || 'https://api.vonative.com';

export const revalidate = 0;

export async function POST(req: Request) {
  try {
    if (!API_KEY) {
      throw new Error('VONATIVE_API_KEY is not defined');
    }

    const body = await req.json().catch(() => ({}));
    let meetSlug = body?.meetSlug || process.env.VONATIVE_MEET_SLUG;

    if (!meetSlug) {
      // 1. Create the Client Tool
      const toolPayload = {
        type: 'client',
        name: 'Perform RPC Tool',
        config: {
          client: {
            event_name: 'perform_rpc',
          },
          function: {
            name: 'perform_rpc',
            description:
              'Call this to perform a Remote Procedure Call on the client frontend. Useful for navigating pages or triggering UI states. The action can be "updateField" or "submitForm".',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', description: 'The action (e.g. "updateField", "submitForm")' },
                fieldName: { type: 'string', description: 'The field to update' },
                value: { type: 'string', description: 'The value to set' },
              },
              required: ['action'],
            },
          }
        },
      };

      const toolRes = await fetch(`${API_URL}/v1/tools/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(toolPayload),
      });

      if (!toolRes.ok) throw new Error(`Failed to create tool: ${await toolRes.text()}`);
      const toolData = await toolRes.json();
      const toolId = toolData.id || toolData.data?.id;

      // 2. Create the Assistant with first_message, system_prompt, voice, transcriber, and tools
      const assistantPayload = {
        name: 'LiveAvatar Example Assistant',
        system_prompt: `You are Liv, a friendly and professional AI medical intake assistant. Your job is to help patients fill out their intake form before their appointment by having a natural conversation.

You have access to a tool called \`perform_rpc\` that lets you update fields on the patient's form in real time as they provide information.

The intake form has the following fields. Use the exact fieldName values shown:
- fullName — Patient's full name
- dob — Date of birth (format: MM/DD/YYYY)
- address — Home address
- phone — Phone number
- emergencyName — Emergency contact full name
- emergencyRelationship — Emergency contact relationship (e.g. Spouse, Parent, Sibling)
- emergencyPhone — Emergency contact phone number
- medications — Current medications (comma-separated, or "None")
- allergies — Known allergies (comma-separated, or "None")
- reasonForVisit — Reason for today's visit

## How to interact
1. Greet the patient warmly and explain you will help them fill out their intake form.
2. Ask for information conversationally, one or two fields at a time. Do not read out field names robotically.
3. As soon as the patient provides a piece of information, IMMEDIATELY call \`perform_rpc\` with action "updateField", the correct fieldName, and the value. Do not wait until the end.
4. Confirm each entry back to the patient naturally (e.g. "Got it, I've noted that down.").
5. Once all fields are filled, give the patient a brief summary and ask them to confirm.
6. On confirmation, call \`perform_rpc\` with action "submitForm" to submit.
7. Thank the patient and let them know the form has been submitted.

## Rules
- Be warm, empathetic, and patient.
- If a patient is unsure about something (e.g. medications), help them through it.
- Never make up information — only record what the patient tells you.
- Keep responses concise and conversational. Avoid long monologues.`,
        first_message: 'Hi, I\'m Liv, your virtual intake assistant! I\'ll help you fill out your patient form today so we can make your visit as smooth as possible. Let\'s start — could you please tell me your full name?',
        first_message_mode: 'assistant-speaks-first',
        model: {
          provider: 'openai',
          model: 'gpt-4o',
        },
        voice: { provider: 'spitch', voiceId: 'lina' },
        transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
        tool_ids: [toolId],
      };

      const assistantRes = await fetch(`${API_URL}/v1/assistants/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(assistantPayload),
      });

      if (!assistantRes.ok) throw new Error(`Failed to create assistant: ${await assistantRes.text()}`);
      const assistantData = await assistantRes.json();
      const assistantId = assistantData.id || assistantData.data?.id;
      const assistantUuid = assistantData.uuid || assistantData.data?.uuid || assistantId;

      // 3. Publish the assistant (syncs config to the runtime)
      const publishRes = await fetch(`${API_URL}/v1/assistants/${assistantUuid}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      });

      if (!publishRes.ok) {
        console.warn(`Warning: Failed to publish assistant: ${await publishRes.text()}`);
        // Non-fatal — continue even if publish fails
      }

      // 4. Create the Meet Deployment linked to the published assistant
      const generatedSlug = `liveavatar-example-${Date.now()}`;
      const meetPayload = {
        name: 'LiveAvatar Example Meet',
        slug: generatedSlug,
        title: 'LiveAvatar Example',
        subtitle: 'Powered by Vonative',
        welcome_message: 'Welcome! Click the button below to start a session.',
        assistant_id: assistantUuid,
        avatar_id: process.env.VONATIVE_AVATAR_ID || undefined,
        video_quality: '720p',
        posture: 'half_body',
        background_type: 'transparent',
        allow_visual_input: true,
        allow_camera_input: true,
        allow_screen_share: true,
        allow_file_upload: false,
        access_mode: 'open',
      };

      const meetRes = await fetch(`${API_URL}/v1/meets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(meetPayload),
      });

      if (!meetRes.ok) throw new Error(`Failed to create meet: ${await meetRes.text()}`);
      meetSlug = generatedSlug;
    }

    // 4. Call Vonative API to create a public meet session
    const response = await fetch(`${API_URL}/v1/public/meets/${meetSlug}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locale: 'en',
        localised_currency: 'USD',
        video_input_enabled: true, // Requesting visual input in the session
        metadata: { clientType: 'web', participantName: 'user' }
      }),
    });

    if (!response.ok) {
      throw new Error(`Vonative API error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    const payload = data.data || data;

    const headers = new Headers({ 'Cache-Control': 'no-store' });
    return NextResponse.json(
      {
        serverUrl: payload.ws_url,
        participantToken: payload.client_token,
        roomName: payload.room_name,
        participantName: 'user',
      },
      { headers }
    );
  } catch (error) {
    console.error(error);
    return new NextResponse(error instanceof Error ? error.message : 'Internal Error', { status: 500 });
  }
}
