"""
Viral Video Caption System - Modular Package

A comprehensive AI-powered video captioning pipeline for creating 
engaging, viral-style captions for short-form social media videos.

Modules:
    config: Configuration constants and styling rules
    font_manager: Font loading with caching
    video_utils: FFmpeg wrappers and video operations
    mask_utils: Mask processing and placement analysis
    animator: Text animation calculations
    text_effects: Glossy text rendering effects
    caption_formatter: Transcript parsing and caption formatting
    hook_renderer: Giant red background text rendering
    broll_engine: B-roll scene planning and montage creation
    caption_renderer: Main caption rendering engine
    pipeline: Full video processing pipeline

Usage:
    # Full pipeline
    from scripts.pipeline import process_video
    process_video("input.mp4", "output.mp4")
    
    # Individual components
    from scripts.caption_renderer import CaptionRenderer
    renderer = CaptionRenderer()
    renderer.apply_captions(video, masks, output)

Author: Viral Caption System
Version: 2.0.0
"""

__version__ = "2.0.0"
__all__ = [
    "config",
    "font_manager",
    "video_utils", 
    "mask_utils",
    "animator",
    "text_effects",
    "caption_formatter",
    "hook_renderer",
    "broll_engine",
    "caption_renderer",
    "pipeline",
]

# Convenient imports
from .config import (
    EMPHASIS_WORDS,
    EMOTIONAL_WORDS,
    BRAND_NAMES,
    THEME_KEYWORDS,
    SCORE_WEIGHTS,
    DEFAULT_CONFIG,
)

from .font_manager import FontManager
from .video_utils import VideoUtils
from .mask_utils import MaskProcessor
from .animator import TextAnimator
from .caption_formatter import CaptionFormatter
from .hook_renderer import HookRenderer
from .broll_engine import BrollEngine
from .caption_renderer import CaptionRenderer
from .pipeline import process_video, process_video_simple
