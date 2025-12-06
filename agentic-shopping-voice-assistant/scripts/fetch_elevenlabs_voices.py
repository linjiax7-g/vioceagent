"""
Fetch available voices from ElevenLabs API and generate code
"""
import os
import asyncio
import aiohttp
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def fetch_voices():
    """Fetch all available voices from ElevenLabs"""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key:
        print("❌ ELEVENLABS_API_KEY not set in environment")
        print("Please set it with: export ELEVENLABS_API_KEY='your-key-here'")
        return None
    
    base_url = "https://api.elevenlabs.io"
    url = f"{base_url}/v1/voices"
    headers = {"xi-api-key": api_key}
    
    print("🔍 Fetching voices from ElevenLabs API...")
    print(f"URL: {url}\n")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"❌ API Error ({response.status}): {error_text}")
                    return None
                
                data = await response.json()
                voices = data.get("voices", [])
                
                print(f"✅ Found {len(voices)} voices\n")
                print("=" * 80)
                print("Available Voices:")
                print("=" * 80)
                
                # Organize voices
                voice_dict = {}
                
                for voice in voices:
                    voice_id = voice.get("voice_id")
                    name = voice.get("name")
                    labels = voice.get("labels", {})
                    category = voice.get("category", "generated")
                    
                    gender = labels.get("gender", "unknown")
                    accent = labels.get("accent", "")
                    age = labels.get("age", "")
                    use_case = labels.get("use case", "")
                    
                    # Print voice info
                    print(f"\n{name}")
                    print(f"  ID: {voice_id}")
                    print(f"  Gender: {gender}")
                    if accent:
                        print(f"  Accent: {accent}")
                    if age:
                        print(f"  Age: {age}")
                    if use_case:
                        print(f"  Use Case: {use_case}")
                    print(f"  Category: {category}")
                    
                    # Add to dictionary (prioritize premade voices)
                    # Use lowercase name as key for easy access
                    key = name.lower().replace(" ", "_").replace("-", "_")
                    
                    # Only include premade voices or popular generated ones
                    if category == "premade" or category == "professional":
                        voice_dict[key] = {
                            "id": voice_id,
                            "name": name,
                            "gender": gender,
                            "accent": accent,
                            "category": category
                        }
                
                print("\n" + "=" * 80)
                print("Python Code for DEFAULT_VOICES:")
                print("=" * 80)
                print("\nDEFAULT_VOICES = {")
                
                # Generate Python dictionary code
                for key, info in sorted(voice_dict.items()):
                    comment = f"# {info['gender']}"
                    if info['accent']:
                        comment += f", {info['accent']}"
                    print(f'    "{key}": "{info["id"]}",  {comment}')
                
                print("}")
                
                print("\n" + "=" * 80)
                print("Summary:")
                print("=" * 80)
                print(f"Total voices: {len(voices)}")
                print(f"Premade/Professional voices: {len(voice_dict)}")
                print("\nRecommended voices for assistant:")
                
                # Recommend some voices
                recommended = []
                for key, info in voice_dict.items():
                    if info['gender'] in ['female', 'male']:
                        recommended.append((key, info))
                        if len(recommended) >= 10:
                            break
                
                for key, info in recommended:
                    print(f"  - {key}: {info['name']} ({info['gender']})")
                
                return voice_dict
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    asyncio.run(fetch_voices())



