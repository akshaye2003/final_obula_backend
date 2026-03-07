#!/usr/bin/env python3
"""
Recreate video with existing captions JSON file.
Uses a pre-existing captions JSON and applies it with the viral preset.
"""

import os
import sys
import json
import argparse
from pathlib import Path

# Add scripts package to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scripts.pipeline import Pipeline
from scripts.config import DEFAULT_CONFIG
from scripts.caption_renderer import CaptionRenderer
from scripts.video_utils import VideoUtils
from scripts.mask_utils import MaskInterpolator


def load_captions_json(captions_path: str):
    """Load captions from JSON file."""
    with open(captions_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    styled_words = data.get('styled_words', [])
    timed_captions = data.get('timed_captions', [])
    transcript = data.get('metadata', {}).get('transcript', '')
    
    # Convert timed_captions to tuple format (start, end, text)
    formatted_captions = []
    for cap in timed_captions:
        start = cap.get('start', 0)
        end = cap.get('end', 0)
        text = cap.get('text', '')
        formatted_captions.append((start, end, text))
    
    return styled_words, formatted_captions, transcript


def load_preset(preset_name: str):
    """Load preset configuration from JSON file."""
    preset_path = Path(__file__).parent / 'presets' / f'{preset_name}.json'
    
    if not preset_path.exists():
        print(f"[Preset] Warning: Preset '{preset_name}' not found")
        return {}
    
    try:
        with open(preset_path, 'r') as f:
            preset = json.load(f)
        print(f"[Preset] Loaded: {preset.get('name', preset_name)}")
        print(f"[Preset] {preset.get('description', '')}")
        # Remove metadata fields
        preset.pop('name', None)
        preset.pop('description', None)
        return preset
    except Exception as e:
        print(f"[Preset] Error loading preset: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser(
        description='Recreate video with existing captions JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('-i', '--input', required=True, help='Input video file')
    parser.add_argument('-o', '--output', required=True, help='Output video file')
    parser.add_argument('-c', '--captions', required=True, help='Path to captions JSON file')
    parser.add_argument('-p', '--preset', default='viral', help='Preset to use (default: viral)')
    parser.add_argument('--font-size', type=int, help='Override font size (larger than preset)')
    parser.add_argument('--y-position', type=float, default=0.78, help='Vertical position of captions (0=top, 1=bottom, default: 0.78)')
    parser.add_argument('--max-hook-words', type=int, default=2, help='Max words for red hook background text (0=disabled, default: 2)')
    parser.add_argument('-m', '--masks', help='Path to masks folder (auto-generated if not provided)')
    parser.add_argument('--no-intro', action='store_true', help='Disable intro effect')
    parser.add_argument('--preview', action='store_true', help='Preview mode for faster processing')
    
    args = parser.parse_args()
    
    # Validate inputs
    if not os.path.exists(args.input):
        print(f"ERROR: Input video not found: {args.input}")
        return 1
    
    if not os.path.exists(args.captions):
        print(f"ERROR: Captions file not found: {args.captions}")
        return 1
    
    print("=" * 70)
    print("RECREATE VIDEO WITH EXISTING CAPTIONS")
    print("=" * 70)
    print(f"Input: {args.input}")
    print(f"Output: {args.output}")
    print(f"Captions: {args.captions}")
    print(f"Preset: {args.preset}")
    print("=" * 70)
    
    # Load preset
    config = load_preset(args.preset)
    
    # Override font size if specified (for larger captions)
    if args.font_size:
        config['font_size'] = args.font_size
        print(f"[Config] Font size overridden: {args.font_size}")
    
    # Override y-position (vertical placement of captions)
    config['y_position'] = args.y_position
    print(f"[Config] Caption Y position: {args.y_position} (lower = more down)")
    
    # Enable red hook background text
    config['max_hook_words'] = args.max_hook_words
    config['exclusive_hooks'] = True  # Hide normal captions when hook shows
    config['centered_styled_mode'] = True  # Enable styled mode for hooks
    if args.max_hook_words > 0:
        print(f"[Config] Red hook enabled: max {args.max_hook_words} words per hook")
    
    # Load captions
    print("\n[1/4] Loading captions from JSON...")
    styled_words, timed_captions, transcript = load_captions_json(args.captions)
    print(f"  - Loaded {len(styled_words)} styled words")
    print(f"  - Loaded {len(timed_captions)} timed captions")
    
    # Debug: Show emphasis/hook words
    if args.max_hook_words > 0:
        print("  - Hook candidates (emphasis/hook/emotional styles):")
        for w in styled_words:
            if w.get('style') in ('emphasis', 'hook', 'emotional'):
                print(f"      '{w['word']}' ({w.get('style')}) at {w['start']:.2f}s")
    
    # Initialize pipeline for mask generation
    print("\n[2/4] Initializing pipeline...")
    pipeline = Pipeline(config=config)
    
    # Generate or use existing masks
    print("\n[3/4] Preparing masks...")
    if args.masks and os.path.exists(args.masks):
        masks_folder = args.masks
        print(f"  - Using existing masks: {masks_folder}")
    else:
        masks_folder = pipeline._auto_generate_masks(args.input)
        if not masks_folder:
            print("ERROR: Failed to generate masks")
            return 1
    
    # Apply captions
    print("\n[4/4] Applying captions to video...")
    caption_output = args.output.replace('.mp4', '_captioned.mp4')
    
    renderer = CaptionRenderer(
        font_size=config.get('font_size', 55),
        transparency=config.get('transparency', 1.0),
        color=config.get('color', [255, 255, 255]),
        position=config.get('position', 'center'),
        animation=config.get('animation', 'vertical_smart'),
        mask_erode_pixels=config.get('mask_erode_pixels', 0),
        mask_blur_radius=config.get('mask_blur_radius', 0),
        adaptive_erosion=config.get('adaptive_erosion', True),
        smart_placement=config.get('smart_placement', False),
        auto_words_per_line=config.get('auto_words_per_line', False),
        max_hook_words=config.get('max_hook_words', 0),
        exclusive_hooks=config.get('exclusive_hooks', False),
        hw_encode=config.get('hw_encode', True),
        hw_encode_quality=config.get('hw_encode_quality', 'medium'),
        frame_skip=config.get('mask_frame_skip', 5),
        split_caption_mode=config.get('split_caption_mode', False),
        single_side_mode=config.get('single_side_mode', False),
        vertical_captions=config.get('vertical_captions', False),
        font_regular=config.get('font_regular', ''),
        font_emphasis=config.get('font_emphasis', ''),
        emotional_words=config.get('emotional_words', []),
        emphasis_words=config.get('emphasis_words', []),
        highlight_color=tuple(config.get('highlight_color', [255, 232, 138])),
        y_position=config.get('y_position', 0.65),
        line_spacing=config.get('line_spacing', 8),
    )
    
    success = renderer.apply_captions(
        input_video=args.input,
        masks_folder=masks_folder,
        output_video=caption_output,
        transcript=transcript,
        timed_captions=timed_captions,
        styled_words=styled_words,
        words_per_caption=config.get('words_per_line', 4),
        seconds_per_caption=config.get('seconds_per_caption', 2.0)
    )
    
    if not success:
        print("ERROR: Caption rendering failed")
        return 1
    
    print("[Captions] Applied successfully")
    
    # Add audio back
    print("[Audio] Adding audio back to video...")
    final_output = pipeline._add_audio_to_video(args.input, caption_output)
    
    # Add intro if requested
    video_for_output = caption_output
    if not args.no_intro:
        print("[Intro] Adding intro effect...")
        intro_output = args.output.replace('.mp4', '_with_intro.mp4')
        pipeline._add_vertical_intro(args.input, caption_output, intro_output)
        video_for_output = intro_output
    
    # Move to final output
    if video_for_output != args.output:
        if os.path.exists(video_for_output):
            import shutil
            shutil.move(video_for_output, args.output)
            print(f"[Final] Moved to: {args.output}")
    
    # Cleanup intermediates
    intermediates = [
        caption_output,
        caption_output.replace('.mp4', '_with_audio.mp4'),
        args.output.replace('.mp4', '_with_intro.mp4'),
    ]
    for f in intermediates:
        if f != args.output and os.path.exists(f):
            os.remove(f)
    
    print("\n" + "=" * 70)
    print(f"[SUCCESS] Output saved to: {args.output}")
    print("=" * 70)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
