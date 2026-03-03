"""
Maps holomime archetype IDs to TTS voice configurations.

Supports two providers:
  - Cartesia (default) — sub-200ms latency, emotion controls. Used for Free/Pro.
  - ElevenLabs (enterprise) — premium voice quality, voice cloning. Enterprise tier.

Cartesia voice IDs should be updated with your account's voice IDs from:
  https://play.cartesia.ai/voices

ElevenLabs voice IDs are pre-made voices from the ElevenLabs library.
To use custom cloned voices, replace IDs via:
  https://elevenlabs.io/app/voice-library
"""

# ---------------------------------------------------------------------------
# Cartesia voices (Free / Pro tiers)
# ---------------------------------------------------------------------------
CARTESIA_VOICE_MAP: dict[str, dict] = {
    "counselor": {
        "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",  # warm female
        "speed": "normal",
        "emotion": ["positivity:high", "curiosity:medium"],
        "description": "Warm, gentle, empathetic",
    },
    "scientist": {
        "voice_id": "694f9389-aac1-45b6-b726-9d9369183238",  # precise male
        "speed": "normal",
        "emotion": [],
        "description": "Precise, measured, analytical",
    },
    "maverick": {
        "voice_id": "156fb8d2-335b-4950-9cb3-a2d33f2c7c58",  # energetic female
        "speed": "fast",
        "emotion": ["positivity:high", "surprise:medium"],
        "description": "Energetic, bold, expressive",
    },
    "leader": {
        "voice_id": "a167e0f3-df7e-4d52-a9c3-f949145efdab",  # authoritative male
        "speed": "normal",
        "emotion": ["anger:low"],
        "description": "Commanding, confident, direct",
    },
    "mentor": {
        "voice_id": "d46abd1d-2571-474c-bf7f-8d6f7b908e28",  # warm baritone male
        "speed": "slow",
        "emotion": ["positivity:medium"],
        "description": "Wise, reassuring, patient",
    },
    "executor": {
        "voice_id": "694f9389-aac1-45b6-b726-9d9369183238",  # clipped male
        "speed": "fast",
        "emotion": [],
        "description": "Clipped, efficient, minimal",
    },
    "educator": {
        "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",  # clear female
        "speed": "normal",
        "emotion": ["positivity:medium", "curiosity:low"],
        "description": "Clear, patient, encouraging",
    },
    "challenger": {
        "voice_id": "a167e0f3-df7e-4d52-a9c3-f949145efdab",  # intense male
        "speed": "normal",
        "emotion": ["anger:medium", "surprise:low"],
        "description": "Sharp, challenging, provocative",
    },
    "companion": {
        "voice_id": "156fb8d2-335b-4950-9cb3-a2d33f2c7c58",  # friendly female
        "speed": "normal",
        "emotion": ["positivity:high", "surprise:low"],
        "description": "Playful, warm, upbeat",
    },
    "philosopher": {
        "voice_id": "d46abd1d-2571-474c-bf7f-8d6f7b908e28",  # thoughtful male
        "speed": "slow",
        "emotion": [],
        "description": "Deep, reflective, contemplative",
    },
    "responder": {
        "voice_id": "a167e0f3-df7e-4d52-a9c3-f949145efdab",  # steady male
        "speed": "fast",
        "emotion": ["anger:low"],
        "description": "Calm under pressure, decisive",
    },
    "advocate": {
        "voice_id": "156fb8d2-335b-4950-9cb3-a2d33f2c7c58",  # sharp female
        "speed": "normal",
        "emotion": ["surprise:medium"],
        "description": "Incisive, contrarian, probing",
    },
    "guardian": {
        "voice_id": "694f9389-aac1-45b6-b726-9d9369183238",  # precise male
        "speed": "normal",
        "emotion": [],
        "description": "Methodical, vigilant, precise",
    },
    "negotiator": {
        "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",  # warm female
        "speed": "normal",
        "emotion": ["positivity:medium"],
        "description": "Diplomatic, composed, bridge-building",
    },
}

# ---------------------------------------------------------------------------
# ElevenLabs voices (Enterprise tier)
# Pre-made voices from the ElevenLabs library. Replace with cloned voice IDs
# for custom brand voices: https://elevenlabs.io/app/voice-library
# ---------------------------------------------------------------------------
ELEVENLABS_VOICE_MAP: dict[str, dict] = {
    "counselor": {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",  # Rachel — warm female
        "model": "eleven_flash_v2_5",
        "description": "Warm, gentle, empathetic",
    },
    "scientist": {
        "voice_id": "pNInz6obpgDQGcFmaJgB",  # Adam — clear male
        "model": "eleven_flash_v2_5",
        "description": "Precise, measured, analytical",
    },
    "maverick": {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",  # Bella — energetic female
        "model": "eleven_flash_v2_5",
        "description": "Energetic, bold, expressive",
    },
    "leader": {
        "voice_id": "ErXwobaYiN019PkySvjV",  # Antoni — authoritative male
        "model": "eleven_flash_v2_5",
        "description": "Commanding, confident, direct",
    },
    "mentor": {
        "voice_id": "VR6AewLTigWG4xSOukaG",  # Arnold — warm baritone
        "model": "eleven_flash_v2_5",
        "description": "Wise, reassuring, patient",
    },
    "executor": {
        "voice_id": "2EiwWnXFnvU5JabPnv8n",  # Clyde — clipped male
        "model": "eleven_flash_v2_5",
        "description": "Clipped, efficient, minimal",
    },
    "educator": {
        "voice_id": "AZnzlk1XvdvUeBnXmlld",  # Domi — clear female
        "model": "eleven_flash_v2_5",
        "description": "Clear, patient, encouraging",
    },
    "challenger": {
        "voice_id": "yoZ06aMxZJJ28mfd3POQ",  # Sam — intense male
        "model": "eleven_flash_v2_5",
        "description": "Sharp, challenging, provocative",
    },
    "companion": {
        "voice_id": "MF3mGyEYCl7XYWbV9V6O",  # Elli — friendly female
        "model": "eleven_flash_v2_5",
        "description": "Playful, warm, upbeat",
    },
    "philosopher": {
        "voice_id": "TxGEqnHWrfWFTfGW9XjX",  # Josh — thoughtful male
        "model": "eleven_flash_v2_5",
        "description": "Deep, reflective, contemplative",
    },
    "responder": {
        "voice_id": "ErXwobaYiN019PkySvjV",  # Antoni — steady male
        "model": "eleven_flash_v2_5",
        "description": "Calm under pressure, decisive",
    },
    "advocate": {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",  # Bella — sharp female
        "model": "eleven_flash_v2_5",
        "description": "Incisive, contrarian, probing",
    },
    "guardian": {
        "voice_id": "pNInz6obpgDQGcFmaJgB",  # Adam — precise male
        "model": "eleven_flash_v2_5",
        "description": "Methodical, vigilant, precise",
    },
    "negotiator": {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",  # Rachel — warm female
        "model": "eleven_flash_v2_5",
        "description": "Diplomatic, composed, bridge-building",
    },
}

# ---------------------------------------------------------------------------
# Fallbacks
# ---------------------------------------------------------------------------
DEFAULT_CARTESIA_VOICE = {
    "voice_id": "a0e99841-438c-4a64-b679-ae501e7d6091",
    "speed": "normal",
    "emotion": [],
    "description": "Default neutral voice",
}

DEFAULT_ELEVENLABS_VOICE = {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",  # Rachel
    "model": "eleven_flash_v2_5",
    "description": "Default neutral voice",
}


def get_voice_config(archetype_id: str, provider: str = "cartesia") -> dict:
    """Get the TTS voice configuration for an archetype and provider."""
    if provider == "elevenlabs":
        return ELEVENLABS_VOICE_MAP.get(archetype_id, DEFAULT_ELEVENLABS_VOICE)
    return CARTESIA_VOICE_MAP.get(archetype_id, DEFAULT_CARTESIA_VOICE)
