from langchain_core.prompts import PromptTemplate
from graph.models.llm import get_llm
from loguru import logger

TRANSLATE_TEMPLATE = """<|im_start|>system
You are a professional translator. Translate the following text to {target_language}.
Do not add any explanations or extra text, just provide the translation.
<|im_end|>
<|im_start|>user
Text: {text}
<|im_end|>
<|im_start|>assistant
"""

translate_prompt = PromptTemplate(
    input_variables=["text", "target_language"],
    template=TRANSLATE_TEMPLATE
)

DETECT_AND_TRANSLATE_TEMPLATE = """<|im_start|>system
You are a helpful assistant that translates text to English.
If the text is already in English, return it exactly as is.
If the text is in another language, translate it to English.
Return ONLY the English text.
<|im_end|>
<|im_start|>user
Text: {text}
<|im_end|>
<|im_start|>assistant
"""

detect_and_translate_prompt = PromptTemplate(
    input_variables=["text"],
    template=DETECT_AND_TRANSLATE_TEMPLATE
)

# Map common language codes to full English names for better LLM prompting
LANGUAGE_CODE_MAP = {
    "zh": "Chinese (Simplified)",
    "cn": "Chinese (Simplified)",
    "ja": "Japanese",
    "jp": "Japanese",
    "ko": "Korean",
    "kr": "Korean",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "hi": "Hindi",
    "ru": "Russian",
    "id": "Indonesian",
    "nl": "Dutch",
    "tr": "Turkish",
    "pl": "Polish",
    "sv": "Swedish",
    "bg": "Bulgarian",
    "ro": "Romanian",
    "ar": "Arabic",
    "cs": "Czech",
    "el": "Greek",
    "fi": "Finnish",
    "hr": "Croatian",
    "ms": "Malay",
    "sk": "Slovak",
    "da": "Danish",
    "ta": "Tamil",
    "uk": "Ukrainian"
}

def translate_text(text: str, target_language: str = "Chinese") -> str:
    """
    Translate text using the LLM.
    
    Args:
        text: Text to translate
        target_language: Target language code or name (e.g., "zh" or "Chinese")
        
    Returns:
        Translated text
    """
    if not text or not text.strip():
        return text

    # Normalize target language
    lang_key = target_language.lower().strip()
    
    # Skip translation if target language is English
    if lang_key in ["en", "english", "us", "uk"]:
        return text
    
    # Map code to full name if possible
    full_lang_name = LANGUAGE_CODE_MAP.get(lang_key, target_language)

    try:
        llm = get_llm()
        chain = translate_prompt | llm
        
        logger.info(f"Translating text to {full_lang_name}...")
        result = chain.invoke({"text": text, "target_language": full_lang_name})
        
        # Clean up result if needed (sometimes LLMs add quotes or extra whitespace)
        translated_text = result.strip()
        # Remove surrounding quotes if present
        if translated_text.startswith('"') and translated_text.endswith('"'):
            translated_text = translated_text[1:-1]
            
        logger.info(f"Translation complete: {translated_text[:50]}...")
        return translated_text
        
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return text  # Fallback to original text

def translate_to_english(text: str) -> str:
    """
    Translate any text to English using LLM.
    If already English, returns as is.
    """
    if not text or not text.strip():
        return text
        
    try:
        llm = get_llm()
        chain = detect_and_translate_prompt | llm
        
        logger.info(f"Ensuring text is in English: {text[:50]}...")
        result = chain.invoke({"text": text})
        
        translated_text = result.strip()
        if translated_text.startswith('"') and translated_text.endswith('"'):
            translated_text = translated_text[1:-1]
            
        logger.info(f"English text: {translated_text[:50]}...")
        return translated_text
        
    except Exception as e:
        logger.error(f"Translation to English failed: {e}")
        return text
