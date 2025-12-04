"""
Test TTS with different voices
"""
import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from voice.tts import ElevenLabsTTS, get_tts_instance
from dotenv import load_dotenv

load_dotenv()

async def test_voice(voice_name: str, test_text: str = "Hello, I'm testing the new voice system."):
    """Test a single voice"""
    print(f"\n{'='*60}")
    print(f"Testing voice: {voice_name}")
    print(f"{'='*60}")
    
    try:
        # Get TTS instance
        tts = get_tts_instance()
        
        # Check if voice exists
        if voice_name not in ElevenLabsTTS.DEFAULT_VOICES and voice_name not in ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]:
            print(f"❌ Voice '{voice_name}' not found in DEFAULT_VOICES")
            return False
        
        # Get voice ID
        from voice.tts import map_voice
        mapped_voice = map_voice(voice_name)
        voice_id = ElevenLabsTTS.DEFAULT_VOICES.get(mapped_voice, mapped_voice)
        
        print(f"Voice: {voice_name} → {mapped_voice} (ID: {voice_id})")
        print(f"Text: {test_text}")
        
        # Generate speech
        result = await tts.synthesize(test_text, voice_id=voice_id)
        
        print(f"✅ Success!")
        print(f"   Audio size: {len(result['audio_data'])} bytes")
        print(f"   Duration: {result['duration']:.2f}s")
        print(f"   Format: {result['format']}")
        
        # Save to file
        output_dir = Path("./tts_output")
        output_dir.mkdir(exist_ok=True)
        output_file = output_dir / f"test_{voice_name}.mp3"
        
        with open(output_file, "wb") as f:
            f.write(result["audio_data"])
        
        print(f"   Saved to: {output_file}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_all_voices():
    """Test all available voices"""
    print("\n" + "="*60)
    print("Testing All ElevenLabs Voices")
    print("="*60)
    
    # Test new voices (sample)
    test_voices = [
        "sarah",    # New default
        "adam",     # Male
        "laura",    # Young female
        "george",   # British male
        "river",    # Neutral
    ]
    
    # Test legacy OpenAI voice mapping
    legacy_voices = [
        "alloy",    # Should map to sarah
        "echo",     # Should map to adam
    ]
    
    print("\n📋 Testing New ElevenLabs Voices:")
    success_count = 0
    for voice in test_voices:
        if await test_voice(voice, f"Hello, I'm {voice}."):
            success_count += 1
        await asyncio.sleep(0.5)  # Rate limiting
    
    print("\n📋 Testing Legacy OpenAI Voice Mapping:")
    for voice in legacy_voices:
        if await test_voice(voice, f"Testing legacy voice {voice}."):
            success_count += 1
        await asyncio.sleep(0.5)
    
    print("\n" + "="*60)
    print(f"Test Results: {success_count}/{len(test_voices) + len(legacy_voices)} passed")
    print("="*60)
    
    if success_count == len(test_voices) + len(legacy_voices):
        print("✅ All tests passed!")
        return True
    else:
        print("⚠️  Some tests failed")
        return False


async def main():
    """Main test function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test ElevenLabs TTS voices")
    parser.add_argument("--voice", type=str, help="Test specific voice")
    parser.add_argument("--text", type=str, default="Hello, I'm testing the new voice system.", help="Test text")
    parser.add_argument("--all", action="store_true", help="Test all voices")
    
    args = parser.parse_args()
    
    # Check API key
    if not os.getenv("ELEVENLABS_API_KEY"):
        print("❌ ELEVENLABS_API_KEY not set")
        print("Set it with: export ELEVENLABS_API_KEY='your-key-here'")
        return
    
    print("✅ ELEVENLABS_API_KEY is configured")
    
    if args.all:
        await test_all_voices()
    elif args.voice:
        await test_voice(args.voice, args.text)
    else:
        print("\nQuick test with default voice (sarah):")
        await test_voice("sarah", "Hello, I'm Sarah, the new default voice for the shopping assistant.")


if __name__ == "__main__":
    asyncio.run(main())

