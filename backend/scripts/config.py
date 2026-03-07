"""
Configuration Module

All constants, paths, word lists, and styling rules for the caption system.
Modify this file to customize caption behavior without changing code.
"""

import os
from typing import Dict, Set

# =============================================================================
# PATHS & FOLDERS
# =============================================================================

import os

# Get the scripts directory path (where this config file is located)
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Backend root directory (parent of scripts)
BACKEND_DIR = os.path.dirname(SCRIPTS_DIR)

# Fonts directory
FONTS_DIR = os.path.join(BACKEND_DIR, 'fonts')

DEFAULT_MASKS_FOLDER = "video_masks"

# Movie clips folders - horizontal (landscape) and portrait
MOVIE_CLIPS_FOLDER = os.path.join(BACKEND_DIR, "movie_clips")
MOVIE_CLIPS_PORTRAIT_FOLDER = os.path.join(BACKEND_DIR, "movie_clips_potrait")

# Metadata paths for movie clips
METADATA_PATH = os.path.join(BACKEND_DIR, "metadata", "movie_clips_metadata.json")
METADATA_PORTRAIT_PATH = os.path.join(BACKEND_DIR, "metadata", "movie_clips_potrait_metadata.json")

TEMP_FOLDER = "temp"

# Font file paths (all relative to FONTS_DIR)
# Only using the two fonts that exist in backend/fonts/:
# - Coolvetica Rg.otf (for regular, bold, extra-bold, impact)
# - Runethia.otf (for cursive)
FONT_PATHS = {
    'regular': [
        os.path.join(FONTS_DIR, 'Coolvetica Rg.otf'),
    ],
    'bold': [
        os.path.join(FONTS_DIR, 'Coolvetica Rg.otf'),
    ],
    'extra-bold': [
        os.path.join(FONTS_DIR, 'Coolvetica Rg.otf'),
    ],
    'cursive': [
        os.path.join(FONTS_DIR, 'Runethia.otf'),
    ],
    'impact': [
        os.path.join(FONTS_DIR, 'Coolvetica Rg.otf'),
    ]
}

# =============================================================================
# STYLING WORD SETS
# =============================================================================

EMPHASIS_WORDS: Set[str] = {
    # Original set
    'alright', 'say', 'head', 'day', 'not', 'everything', 'sense',
    'immediately', 'some', 'things', 'only', 'click', 'mess', 'up',
    'few', 'times', 'yeah', 'frustrating', 'doing', 'lot',
    'nothing', 'happening', 'but', 'trust', 'me', 'that', 'phase',
    'usually', 'right', 'before', 'changing', 'so', 'doubting',
    'yourself', 'pause', 'second', 'learning', 'productive',
    'keep', 'going', 'wasting', 'time', 'never', 'always',
    # Extended from COMPLETE_SYSTEM.py
    'must', 'focus', 'amazing', 'incredible', 'perfect', 'important',
    'stop', 'start', 'change', 'biggest', 'mistake', 'kills', 'carefully',
    'immediately', 'suddenly', 'completely', 'absolutely', 'definitely',
    'exactly', 'precisely', 'literally', 'actually', 'basically',
    'seriously', 'honestly', 'literally', 'totally', 'completely'
}

EMOTIONAL_WORDS: Set[str] = {
    'believe', 'dream', 'love', 'hope', 'wish', 'feel', 'heart',
    'soul', 'passion', 'happy', 'blessed', 'grateful', 'beautiful',
    'special', 'precious', 'care', 'cherish', 'adore', 'inspire',
    'faith', 'joy', 'peace', 'listen',
    # Extended emotional words
    'wonderful', 'amazing', 'incredible', 'fantastic', 'awesome',
    'excited', 'thrilled', 'delighted', 'pleased', 'content',
    'satisfied', 'fulfilled', 'complete', 'whole', 'connected',
    'understood', 'accepted', 'loved', 'valued', 'appreciated'
}

BRAND_NAMES: Set[str] = {
    'obula', 'zypit', 'openai', 'google', 'instagram', 'youtube',
    'facebook', 'meta', 'apple', 'amazon', 'netflix', 'spotify',
}

# =============================================================================
# B-ROLL CONFIGURATION
# =============================================================================

SCORE_WEIGHTS = {
    "emotion": 4,        # Emotion match is most important
    "energy": 3,         # Energy level matters
    "keywords": 5,       # Keyword matching is highest priority
    "lighting": 1,
    "camera": 1,
    "setting": 2,
}

THEME_KEYWORDS = {
    "work": ["work", "working", "office", "business", "typing", "computer", "desk"],
    "success": ["success", "win", "victory", "achieve", "accomplish", "triumph"],
    "struggle": ["struggle", "fight", "hard", "difficult", "challenge", "effort"],
    "belief": ["believe", "faith", "trust", "confidence", "hope"],
    "learning": ["learn", "smart", "sharper", "growth", "improve"],
    "results": ["result", "outcome", "effect", "consequence"],
}

BROLL_SYSTEM_PROMPT = """You are a video editor AI that analyzes timestamped transcripts for short-form social media videos.

Your job:
1. Read the transcript carefully including the timestamps
2. Identify MULTIPLE moments where B-roll would enhance the video (2-4 moments)
3. Space them throughout the video - not all at once
4. Return each placement with timing and cinematic metadata for clip matching

Rules:
- Return 2 to 4 placements distributed throughout the video
- Each placement should be at a meaningful moment
- Space them at least 3 seconds apart
- Never place B-roll in the first 3 seconds or last 3 seconds
- Output ONLY valid JSON, no explanation, no markdown

Output format:
{
  "video_concept": "one sentence summary of what this video is about",
  "placements": [
    {
      "timestamp_seconds": 5,
      "theme": "the key topic at this moment",
      "reason": "why this moment was chosen",
      "emotion": "tense",
      "energy": "high",
      "lighting": "dark",
      "camera": "closeup",
      "setting": "office",
      "duration": 2
    }
  ]
}

Allowed values ONLY:
- emotion: neutral, happy, tense, sad, energetic, calm
- energy: low, medium, high
- lighting: dark, neutral, bright
- camera: wide, mid, closeup
- setting: office, outdoor, home, boardroom, urban, neutral
- duration: 1, 2, or 3 (seconds for each B-roll clip)
"""

# =============================================================================
# COLORS
# =============================================================================

COLORS = {
    'gold': (255, 200, 80),           # Hook/Emphasis/Emotional
    'steel_blue': (180, 210, 235),    # Regular words
    'warm_glow': (255, 220, 100),     # Glow effect
    'bright_red': (255, 25, 0),       # Hook background text
    'dark_red_shadow': (0, 0, 140),
    'white': (255, 255, 255),
    'black': (0, 0, 0),
}

# =============================================================================
# GPT HOOK DETECTION PROMPT
# =============================================================================

HOOK_DETECTION_PROMPT = """You are a video caption hook detector.

Your task: Identify up to 3 hook phrases in the transcript.
A hook is: attention-grabbing opening, key punchline, or dramatic pause phrase.

Requirements:
- 1-5 words max per hook
- Return ONLY valid JSON
- No explanation text
- Use 0-based word indices

Output format:
{
  "hook_spans": [
    {"start": 0, "end": 2},
    {"start": 5, "end": 7}
  ]
}

If no hooks detected, return: {"hook_spans": []}"""

# =============================================================================
# GPT TRANSCRIPTION CORRECTION PROMPT
# =============================================================================

TRANSCRIPTION_CORRECTION_PROMPT = """You are a transcription corrector for video captions.

Your task: Review the transcript and fix words that were likely misheard by Whisper.
Common issues:
- Brand names pronounced oddly ("zipit" -> "Zypit")
- Technical terms misheard as common words
- Names spelled phonetically
- Words with accents pronounced differently
- Industry jargon vs common words

Rules:
1. ONLY correct words that are CLEARLY wrong based on context
2. Preserve the original meaning - don't change semantics
3. Consider the video topic/domain when evaluating
4. Return corrections as a mapping: {"misheard": "correction"}
5. If no corrections needed, return empty object {}
6. Return ONLY valid JSON, no explanation

Output format:
{
  "corrections": {
    "zipit": "Zypit",
    "orbula": "Obula",
    "saver": "savour"
  },
  "confidence": "high"  // or "medium" or "low"
}

Examples:
- "I use zipit daily" -> {"corrections": {"zipit": "Zypit"}, "confidence": "high"}
- "The obula system works" -> {"corrections": {"obula": "Obula"}, "confidence": "high"}
- "That makes sense" -> {"corrections": {}, "confidence": "high"}  // no change needed
"""

# =============================================================================
# COMBINED GPT PROMPT (Correction + Hook Detection in one call)
# =============================================================================

COMBINED_CORRECTION_AND_HOOKS_PROMPT = """You are a video caption AI that does THREE tasks:

TASK 1: Fix misheard words from Whisper transcription
- Brand names pronounced oddly ("zipit" -> "Zypit")
- Technical terms misheard as common words
- Names spelled phonetically
- Only correct words that are CLEARLY wrong

TASK 2: Identify hook phrases for caption styling
- Hook = attention-grabbing opening, key punchline, dramatic phrase
- Maximum 3 hooks
- 1-2 words per hook (short and punchy)

TASK 3: Identify emphasis words
- Words that carry strong emotional or persuasive weight
- Examples: "never", "always", "massive", "secret", "instantly", "free", "proven", "warning", "finally", "guaranteed"
- These will be styled bold/highlighted in the captions
- Maximum 8 emphasis words, single words only (not phrases)

Output format (return ONLY this JSON):
{
  "corrections": {
    "zipit": "Zypit",
    "orbula": "Obula"
  },
  "confidence": "high",
  "hook_spans": [
    {"start": 0, "end": 1},
    {"start": 5, "end": 6}
  ],
  "emphasis_indices": [3, 12, 45]
}

Rules:
- corrections: empty {} if no fixes needed
- confidence: "high", "medium", or "low" (for corrections)
- hook_spans: 0-based word indices, max 3 hooks, 1-2 words each
- emphasis_indices: 0-based word indices of emphasis words, max 8, empty [] if none
- Return ONLY valid JSON, no explanation"""

# Known domains/topics for better context-aware corrections
DOMAIN_KEYWORDS = {
    'tech': ['software', 'app', 'AI', 'machine learning', 'startup', 'code', 'developer'],
    'business': ['startup', 'entrepreneur', 'revenue', 'profit', 'investment', 'marketing'],
    'health': ['workout', 'fitness', 'diet', 'nutrition', 'exercise', 'gym'],
    'food': ['recipe', 'cooking', 'chef', 'restaurant', 'ingredients', 'flavor'],
}

# =============================================================================
# DEFAULT CONFIGURATION
# =============================================================================

DEFAULT_CONFIG = {
    # Caption settings
    'words_per_line': 3,
    'seconds_per_caption': 1.5,
    'font_size': 110,
    'transparency': 0.90,
    'color': (255, 255, 255),
    'position': 'left',  # 'left', 'center', 'right'
    'animation': 'hard_cut_fade_out',  # 'fade_in', 'slide_up', 'hard_cut_fade_out'
    
    # Mask processing
    'mask_erode_pixels': 0,      # 0 = use adaptive erosion
    'mask_blur_radius': 0,
    'adaptive_erosion': True,
    'smart_placement': True,
    'auto_words_per_line': True,
    
    # Hook text (red background captions)
    'hook_extension': 0.8,       # Extra seconds to show hook text
    'max_hook_words': 1,         # Maximum words per red hook (1 = single word only)
    'exclusive_hooks': True,     # Hide normal captions when red hook shows
    
    # GPT transcription correction
    'gpt_correction': True,      # Use GPT to fix misheard words
    'correction_confidence_threshold': 'medium',  # 'low', 'medium', 'high'
    'combine_gpt_calls': True,   # Combine correction + hook detection (saves 1 API call)
    'cache_gpt_results': True,   # Cache GPT results to skip API on re-process
    'gpt_cache_dir': 'gpt_cache',  # Where to store GPT cache files
    
    # Performance optimizations
    'hw_encode': False,          # Use hardware encoding (NVENC/QuickSync) - disabled by default due to resolution constraints
    'hw_encode_quality': 'medium',  # 'fast', 'medium', 'slow' (affects quality vs speed)
    'mask_frame_skip': 5,        # Generate mask every N frames (1=every, 5=every 5th)
    'preview_mode': False,       # Low-res preview for fast iteration
    'preview_scale': 0.5,        # Preview resolution scale (0.5 = half res)
    'preview_quality': 'fast',   # 'fast' for draft, 'medium' for better preview
    
    # Split caption mode (word-by-word highlighting with left/right split)
    'split_caption_mode': False,  # Enable split caption rendering mode
    
    # B-roll
    'broll_crossfade_duration': 0.5,
    
    # Animation parameters
    'anim_fade_duration': 30,      # frames
    'anim_slide_duration': 45,     # frames
    'anim_slide_distance': 200,    # pixels
    
    # Video
    'fps': 30,
    'render_scale': 1.0,
}

# =============================================================================
# WHISPER CORRECTIONS
# =============================================================================

WORD_CORRECTIONS = {
    "zipit": "Zypit",
    "ZipIt": "Zypit",
    "zipIt": "Zypit",
    "Orbula": "Obula",
    "orbula": "Obula",
    "saved you": "savour",
    "Saved you": "Savour",
}

# HOOK TEXT OVERRIDES - Map detected hooks to display text in background
HOOK_DISPLAY_OVERRIDES = {
    "saved you": "SAVOUR",
    "Saved you": "SAVOUR",
    "saver you": "SAVOUR",
    "Saver You": "SAVOUR",
    "SAVER YOU": "SAVOUR",
    # Add more brand overrides here
    # "Detected Text": "Display Text",
}

