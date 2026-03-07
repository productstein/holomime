"""
holomime Voice Agent — LiveKit VoicePipelineAgent

This agent joins LiveKit rooms and conducts voice conversations
with personality-tuned behavior. Each session receives an archetype
ID via participant metadata, which determines:
  1. The system prompt (personality instructions from Big Five scores)
  2. The TTS voice (distinct voice per archetype)

Usage:
  # Development (connects to LiveKit Cloud, auto-dispatched)
  python agent.py dev

  # Production
  python agent.py start
"""

import json
import logging

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice import AgentSession, VoicePipelineAgent
from livekit.plugins import cartesia, deepgram, elevenlabs, openai, silero

from personality import build_system_prompt
from voice_map import get_voice_config
from cloud import (
    SessionMetrics, is_enabled as cloud_enabled,
    load_custom_detectors, run_drift_check, run_custom_detectors, report_session,
)

load_dotenv()

logger = logging.getLogger("holomime-agent")

# Load custom detectors at startup (if cloud is configured)
_custom_detectors = load_custom_detectors() if cloud_enabled() else []


async def entrypoint(ctx: JobContext):
    """Called when a new voice session is dispatched."""
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for the browser participant to join
    participant = await ctx.wait_for_participant()

    # Read archetype + TTS provider from participant metadata (set by token endpoint)
    archetype_id = "counselor"  # default fallback
    tts_provider = "cartesia"   # default: Cartesia for Free/Pro, ElevenLabs for Enterprise
    if participant.metadata:
        try:
            meta = json.loads(participant.metadata)
            archetype_id = meta.get("archetypeId", "counselor")
            tts_provider = meta.get("ttsProvider", "cartesia")
        except json.JSONDecodeError:
            pass

    logger.info(
        f"Starting voice session: archetype={archetype_id}, "
        f"tts={tts_provider}, participant={participant.identity}"
    )

    # Initialize session metrics for cloud reporting
    metrics = SessionMetrics()

    # Build personality-aware system prompt
    system_prompt = build_system_prompt(archetype_id)

    # Get matching TTS voice for the selected provider
    voice_config = get_voice_config(archetype_id, provider=tts_provider)

    # Select TTS engine based on provider
    if tts_provider == "elevenlabs":
        tts_engine = elevenlabs.TTS(
            voice=voice_config["voice_id"],
            model=voice_config.get("model", "eleven_turbo_v2_5"),
        )
    else:
        tts_engine = cartesia.TTS(voice=voice_config["voice_id"])

    # Build the voice pipeline
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=tts_engine,
        chat_ctx=llm.ChatContext().append(
            role="system",
            text=system_prompt,
        ),
    )

    # Send transcript updates to the browser via data channel
    @session.on("user_speech_committed")
    def on_user_speech(msg):
        text = msg.content if hasattr(msg, 'content') else str(msg)
        metrics.add_message("user", text)
        try:
            data = json.dumps({
                "type": "transcript",
                "role": "user",
                "text": text,
                "final": True,
            }).encode()
            ctx.room.local_participant.publish_data(data, reliable=True)
        except Exception as e:
            logger.warning(f"Failed to send user transcript: {e}")

    @session.on("agent_speech_committed")
    def on_agent_speech(msg):
        text = msg.content if hasattr(msg, 'content') else str(msg)
        metrics.add_message("agent", text)
        try:
            data = json.dumps({
                "type": "transcript",
                "role": "agent",
                "text": text,
                "final": True,
            }).encode()
            ctx.room.local_participant.publish_data(data, reliable=True)
        except Exception as e:
            logger.warning(f"Failed to send agent transcript: {e}")

    # Report metrics when participant disconnects
    @ctx.room.on("participant_disconnected")
    def on_disconnect(p):
        if p.identity == participant.identity:
            run_drift_check(metrics)
            run_custom_detectors(metrics, _custom_detectors)
            report_session(metrics)
            logger.info(
                f"Session ended: {metrics.messages_processed} messages, "
                f"{metrics.drift_events} drift events, risk={metrics.risk_level}"
            )

    # Start the voice pipeline
    session.start(ctx.room, participant)

    # Greet the user in character
    greetings = {
        "counselor": "Hi there. I'm glad you're here. What's on your mind?",
        "scientist": "Hello. I'm ready to analyze whatever you'd like to discuss.",
        "maverick": "Hey! Let's shake things up. What are we working on?",
        "leader": "Good. Let's get straight to it. What do you need?",
        "mentor": "Welcome. Take your time. I'm here to help you find your way.",
        "executor": "Ready. What needs to be done?",
        "educator": "Hi! I'd love to help you learn something new today. What interests you?",
        "challenger": "So. What's the assumption you want me to break?",
        "companion": "Hey friend! What's happening? Let's figure this out together.",
        "philosopher": "Hello. Before we begin — what question is weighing on you?",
        "responder": "I'm here. Tell me what happened.",
        "advocate": "Interesting. What's the consensus? Because I probably disagree.",
        "guardian": "Systems nominal. What needs compliance review?",
        "negotiator": "Let's find some common ground. What are we working with?",
    }

    greeting = greetings.get(archetype_id, "Hello! How can I help you today?")
    await session.say(greeting, allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
