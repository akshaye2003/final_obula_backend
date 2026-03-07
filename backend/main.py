#!/usr/bin/env python3
"""
Viral Caption System - Main Entry Point

Unified interface for the new modular caption pipeline.
Replaces COMPLETE_SYSTEM.py with a cleaner, more maintainable architecture.

Usage:
    # Full AI pipeline (Whisper + GPT styling + B-roll)
    python main.py --input my_video.mp4 --output output.mp4 --whisper --broll
    
    # Simple mode (manual transcript, no API needed)
    python main.py --input my_video.mp4 --output output.mp4 \
                   --transcript "Your caption text here"
    
    # With all features
    python main.py --input my_video.mp4 --output output.mp4 \
                   --whisper --broll --intro --instagram

Author: Viral Caption System
Version: 2.0.0
"""

import os
import sys
import argparse
from pathlib import Path

# Add scripts package to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[INFO] Loaded environment from: {env_path}")
except ImportError:
    pass  # python-dotenv not installed

from scripts.pipeline import Pipeline, process_video, process_video_simple
from scripts.config import DEFAULT_CONFIG
from scripts.video_utils import get_aspect_ratio_choices


def create_parser():
    """Create command line argument parser."""
    parser = argparse.ArgumentParser(
        description="Viral Caption System - AI-powered video captioning (Universal Format Support)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Universal Video Format Support:
  Supports: .mp4, .mov, .avi, .mkv, .webm, .m4v, .3gp, .flv, .wmv
  Auto-detects orientation (portrait/landscape/square)
  Auto-rotates phone videos based on metadata
  Output: Universal MP4 (H.264 + AAC), preserves original resolution and FPS

Performance Optimizations (New!):
  Hardware Encoding (5x faster): Enabled by default (NVIDIA NVENC/Intel QuickSync)
  Frame Interpolation (80% faster mask gen): Enabled by default (skip=5)
  Preview Mode (10x faster iteration): Use --preview for quick drafts

Examples:
  # Full AI pipeline with all features
  python main.py -i input.mp4 -o output.mp4 --whisper --broll --intro --instagram
  
  # Simple mode with manual transcript (any format)
  python main.py -i input.mov -o output.mp4 -t "Your caption text here"
  
  # Whisper transcription, no B-roll (vertical video)
  python main.py -i iphone_video.mov -o output.mp4 --whisper
  
  # Preview mode for fast iteration (low-res, quick render)
  python main.py -i input.mp4 -o preview.mp4 --whisper --preview
  
  # Full quality with custom mask skip (every 3rd frame)
  python main.py -i input.mp4 -o output.mp4 --whisper --mask-skip 3
  
  # Process 4K or any resolution
  python main.py -i 4k_video.mp4 -o output.mp4 --whisper
  
  # Process with existing masks
  python main.py -i input.mp4 -o output.mp4 -m my_masks/ --whisper
        """
    )
    
    # Required arguments (unless running tests)
    parser.add_argument(
        '-i', '--input',
        help='Input video file (supports: mp4, mov, avi, mkv, webm, m4v, 3gp, flv, wmv)'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output video file path (MP4 format)'
    )
    
    # Input options
    input_group = parser.add_argument_group('Input Options')
    input_group.add_argument(
        '-t', '--transcript',
        help='Manual transcript text (skips Whisper)'
    )
    input_group.add_argument(
        '-m', '--masks',
        help='Path to masks folder (auto-generated if not provided)'
    )
    
    # Feature toggles
    features_group = parser.add_argument_group('Feature Toggles')
    features_group.add_argument(
        '--whisper',
        action='store_true',
        help='Use Whisper for automatic transcription'
    )
    features_group.add_argument(
        '--broll',
        action='store_true',
        help='Enable B-roll footage insertion'
    )
    features_group.add_argument(
        '--noise-isolate',
        action='store_true',
        help='Remove background noise/music before transcription (cleans audio using AI)'
    )
    features_group.add_argument(
        '--intro',
        action='store_true',
        default=True,
        help='Add vertical split intro effect (default: True)'
    )
    features_group.add_argument(
        '--no-intro',
        action='store_true',
        help='Disable intro effect'
    )
    features_group.add_argument(
        '--instagram',
        action='store_true',
        help='Apply Instagram clarity preset'
    )
    features_group.add_argument(
        '--rotate',
        action='store_true',
        help='Enable auto-rotation for portrait videos (default: disabled)'
    )
    features_group.add_argument(
        '--lut',
        metavar='PATH',
        help='Apply .cube LUT color grading (e.g., --lut path/to/file.cube)'
    )
    features_group.add_argument(
        '--rounded-corners',
        choices=['none', 'subtle', 'medium', 'heavy'],
        default='none',
        help='Apply rounded corners to video: none (0px), subtle (20px), medium (40px), heavy (80px)'
    )
    features_group.add_argument(
        '--aspect-ratio',
        choices=get_aspect_ratio_choices(),
        default=None,
        help='Convert output to target aspect ratio (1:1=Square, 4:5=Portrait, 2:3=Tall, 9:16=Vertical)'
    )
    
    # Caption styling
    style_group = parser.add_argument_group('Caption Styling')
    style_group.add_argument(
        '--font-size',
        type=int,
        default=DEFAULT_CONFIG['font_size'],
        help=f'Base font size (default: {DEFAULT_CONFIG["font_size"]})'
    )
    style_group.add_argument(
        '--transparency',
        type=float,
        default=DEFAULT_CONFIG['transparency'],
        help=f'Text transparency 0-1 (default: {DEFAULT_CONFIG["transparency"]})'
    )
    style_group.add_argument(
        '--position',
        choices=['left', 'center', 'right'],
        default=DEFAULT_CONFIG['position'],
        help=f'Caption position (default: {DEFAULT_CONFIG["position"]})'
    )
    style_group.add_argument(
        '--words-per-line',
        type=int,
        default=DEFAULT_CONFIG['words_per_line'],
        help=f'Words per caption line (default: {DEFAULT_CONFIG["words_per_line"]})'
    )
    style_group.add_argument(
        '--animation',
        choices=['fade_in', 'slide_up', 'hard_cut_fade_out', 'marquee_scroll', 'split_caption', 'styled', 'styled_layout', 'caption_renderer', 'centered_styled', 'vertical_smart'],
        default=DEFAULT_CONFIG['animation'],
        help=f'Animation type (default: {DEFAULT_CONFIG["animation"]})'
    )
    style_group.add_argument(
        '--font-regular',
        default='',
        help='Path to regular font file (e.g., fonts/Coolvetica.ttf)'
    )
    style_group.add_argument(
        '--font-emphasis',
        default='',
        help='Path to emphasis/cursive font file (e.g., fonts/Runethia.ttf)'
    )
    
    # Mask processing
    mask_group = parser.add_argument_group('Mask Processing')
    mask_group.add_argument(
        '--erode',
        type=int,
        default=0,
        help='Mask erosion pixels (0 = auto)'
    )
    mask_group.add_argument(
        '--blur',
        type=int,
        default=0,
        help='Mask blur radius'
    )
    mask_group.add_argument(
        '--no-smart-placement',
        action='store_true',
        help='Disable smart position detection'
    )
    mask_group.add_argument(
        '--no-adaptive-erosion',
        action='store_true',
        help='Disable adaptive erosion'
    )
    
    # Red Hook configuration
    hook_group = parser.add_argument_group('Red Hook Text (Background)')
    hook_group.add_argument(
        '--max-hook-words',
        type=int,
        default=DEFAULT_CONFIG['max_hook_words'],
        help=f'Maximum words per red hook caption (default: {DEFAULT_CONFIG["max_hook_words"]})'
    )
    hook_group.add_argument(
        '--no-exclusive-hooks',
        action='store_true',
        help='Show normal captions even when red hook is displayed (default: hooks are exclusive)'
    )
    
    # GPT Correction configuration
    correction_group = parser.add_argument_group('GPT Transcription Correction')
    correction_group.add_argument(
        '--no-gpt-correction',
        action='store_true',
        help='Disable GPT-powered word correction (default: enabled)'
    )
    correction_group.add_argument(
        '--correction-confidence',
        choices=['low', 'medium', 'high'],
        default=DEFAULT_CONFIG['correction_confidence_threshold'],
        help=f'Minimum confidence level for corrections (default: {DEFAULT_CONFIG["correction_confidence_threshold"]})'
    )
    correction_group.add_argument(
        '--no-combine-gpt',
        action='store_true',
        help='Use separate GPT calls for correction and hooks (slower, more expensive)'
    )
    correction_group.add_argument(
        '--no-gpt-cache',
        action='store_true',
        help='Disable GPT result caching (default: caching enabled)'
    )
    
    # Performance optimizations
    perf_group = parser.add_argument_group('Performance Optimizations')
    perf_group.add_argument(
        '--no-hw-encode',
        action='store_true',
        help='Disable hardware video encoding (default: NVENC/QuickSync enabled)'
    )
    perf_group.add_argument(
        '--hw-quality',
        choices=['fast', 'medium', 'slow'],
        default=DEFAULT_CONFIG['hw_encode_quality'],
        help=f'Hardware encoder quality (default: {DEFAULT_CONFIG["hw_encode_quality"]})'
    )
    perf_group.add_argument(
        '--mask-skip',
        type=int,
        default=DEFAULT_CONFIG['mask_frame_skip'],
        help=f'Generate mask every N frames (1=all frames, 5=80%% reduction) (default: {DEFAULT_CONFIG["mask_frame_skip"]})'
    )
    perf_group.add_argument(
        '--preview',
        action='store_true',
        help='Preview mode: fast low-res processing for testing (default: off)'
    )
    perf_group.add_argument(
        '--preview-scale',
        type=float,
        default=DEFAULT_CONFIG['preview_scale'],
        help=f'Preview resolution scale 0.1-0.9 (default: {DEFAULT_CONFIG["preview_scale"]})'
    )
    perf_group.add_argument(
        '--split-captions',
        action='store_true',
        help='Enable split caption mode with word-by-word highlighting (left/right split)'
    )
    
    # Presets
    preset_group = parser.add_argument_group('Presets')
    preset_group.add_argument(
        '--preset',
        choices=['minimal', 'viral', 'fast', 'cinematic', 'marquee', 'split', 'broll_heavy', 'styled', 'styled_layout', 'caption_renderer', 'dynamic_smart'],
        default=None,
        help='Use a preset configuration (minimal, viral, fast, cinematic)'
    )
    preset_group.add_argument(
        '--list-presets',
        action='store_true',
        help='List all available presets and their descriptions'
    )
    
    # API configuration
    api_group = parser.add_argument_group('API Configuration')
    api_group.add_argument(
        '--api-key',
        help='OpenAI API key (or set OPENAI_API_KEY env var)'
    )
    
    # Other options
    parser.add_argument(
        '--test',
        action='store_true',
        help='Run test suite instead of processing'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )
    
    return parser


def validate_args(args):
    """Validate command line arguments including video format."""
    errors = []
    
    # Check input file exists
    if not os.path.exists(args.input):
        errors.append(f"Input file not found: {args.input}")
    else:
        # Check video format
        from scripts.video_utils import is_video_file, SUPPORTED_VIDEO_FORMATS
        if not is_video_file(args.input):
            ext = Path(args.input).suffix.lower()
            errors.append(f"Unsupported video format: {ext}")
            errors.append(f"Supported formats: {', '.join(SUPPORTED_VIDEO_FORMATS)}")
    
    # Check API key if needed
    if args.whisper and not args.transcript:
        api_key = args.api_key or os.getenv('OPENAI_API_KEY')
        if not api_key:
            errors.append("OpenAI API key required for Whisper. Use --api-key or set OPENAI_API_KEY env var")
    
    # Check masks folder if provided
    if args.masks and not os.path.exists(args.masks):
        errors.append(f"Masks folder not found: {args.masks}")
    
    if errors:
        print("\n[ERROR] Validation failed:")
        for error in errors:
            print(f"  - {error}")
        print()
        return False
    
    return True


def load_preset(preset_name):
    """Load preset configuration from JSON file."""
    import json
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


def list_presets():
    """List all available presets."""
    import json
    presets_dir = Path(__file__).parent / 'presets'
    
    print("\n" + "="*60)
    print("AVAILABLE PRESETS")
    print("="*60)
    
    for preset_file in sorted(presets_dir.glob('*.json')):
        try:
            with open(preset_file, 'r') as f:
                preset = json.load(f)
            name = preset_file.stem
            display_name = preset.get('name', name)
            desc = preset.get('description', 'No description')
            print(f"\n  {name:12} - {display_name}")
            print(f"               {desc}")
        except:
            pass
    
    print("\nUsage: python main.py -i video.mp4 --preset viral")
    print("="*60 + "\n")


def build_config(args):
    """Build configuration dict from arguments and presets."""
    # Start with defaults
    config = {}
    
    # Load preset if specified
    if args.preset:
        preset_config = load_preset(args.preset)
        config.update(preset_config)
    
    # Override with CLI arguments (only if explicitly provided, not defaults)
    # Animation: only override if different from default
    if args.animation != DEFAULT_CONFIG['animation'] or 'animation' not in config:
        config['animation'] = args.animation
    
    # Position: only override if different from default
    if args.position != DEFAULT_CONFIG['position'] or 'position' not in config:
        config['position'] = args.position
    
    # Font size: only override if different from default
    if args.font_size != DEFAULT_CONFIG['font_size'] or 'font_size' not in config:
        config['font_size'] = args.font_size
    
    # Transparency: only override if different from default
    if args.transparency != DEFAULT_CONFIG['transparency'] or 'transparency' not in config:
        config['transparency'] = args.transparency
    
    # Font paths: use CLI args if provided
    if args.font_regular:
        config['font_regular'] = args.font_regular
    if args.font_emphasis:
        config['font_emphasis'] = args.font_emphasis
    
    # Words per line: only override if different from default
    if args.words_per_line != DEFAULT_CONFIG['words_per_line'] or 'words_per_line' not in config:
        config['words_per_line'] = args.words_per_line
    
    # Boolean flags: Only override preset if explicitly changed via CLI
    # Check if --no-exclusive-hooks was used (args.no_exclusive_hooks would be True)
    if args.no_exclusive_hooks:
        config['exclusive_hooks'] = False
    elif 'exclusive_hooks' not in config:
        config['exclusive_hooks'] = DEFAULT_CONFIG['exclusive_hooks']
    
    if args.no_smart_placement:
        config['smart_placement'] = False
    elif 'smart_placement' not in config:
        config['smart_placement'] = DEFAULT_CONFIG['smart_placement']
    
    if args.no_adaptive_erosion:
        config['adaptive_erosion'] = False
    elif 'adaptive_erosion' not in config:
        config['adaptive_erosion'] = DEFAULT_CONFIG['adaptive_erosion']
    
    if args.no_gpt_correction:
        config['gpt_correction'] = False
    elif 'gpt_correction' not in config:
        config['gpt_correction'] = DEFAULT_CONFIG['gpt_correction']
    
    if args.no_combine_gpt:
        config['combine_gpt_calls'] = False
    elif 'combine_gpt_calls' not in config:
        config['combine_gpt_calls'] = DEFAULT_CONFIG['combine_gpt_calls']
    
    if args.no_gpt_cache:
        config['cache_gpt_results'] = False
    elif 'cache_gpt_results' not in config:
        config['cache_gpt_results'] = DEFAULT_CONFIG['cache_gpt_results']
    
    # Hardware encoding (default True, --no-hw-encode to disable)
    if args.no_hw_encode:
        config['hw_encode'] = False
    elif 'hw_encode' not in config:
        config['hw_encode'] = True
    
    # Split captions mode (default False, --split-captions to enable)
    if args.split_captions:
        config['split_caption_mode'] = True
    elif 'split_caption_mode' not in config:
        config['split_caption_mode'] = DEFAULT_CONFIG['split_caption_mode']
    
    # Always apply these non-boolean CLI flags
    config.update({
        'mask_erode_pixels': args.erode,
        'mask_blur_radius': args.blur,
        'max_hook_words': args.max_hook_words,
        'correction_confidence_threshold': args.correction_confidence,
        'hw_encode_quality': args.hw_quality,
        'mask_frame_skip': args.mask_skip,
        'preview_mode': args.preview,
        'preview_scale': max(0.1, min(0.9, args.preview_scale)),
    })
    return config


def print_banner():
    """Print application banner."""
    print("""
======================================================================
                    VIRAL CAPTION SYSTEM v2.0
                     Modular Pipeline

         AI-powered video captioning for short-form social media
======================================================================
    """)


def print_settings(args, config):
    """Print processing settings."""
    from scripts.video_utils import VideoUtils
    
    print("=" * 70)
    print("PROCESSING SETTINGS")
    print("=" * 70)
    print(f"Input:  {args.input}")
    print(f"Output: {args.output}")
    
    # Print video info if available
    if os.path.exists(args.input):
        try:
            video_info = VideoUtils.get_video_info(args.input)
            aspect = "Portrait" if video_info['is_portrait'] else "Landscape"
            if abs(video_info['aspect_ratio'] - 1.0) < 0.1:
                aspect = "Square"
            print(f"Video:  {video_info['display_width']}x{video_info['display_height']} @ {video_info['fps']:.2f}fps ({aspect})")
            if video_info['rotation'] != 0:
                print(f"        Rotation: {video_info['rotation']}° (will auto-rotate)")
        except:
            pass
    
    if args.masks:
        print(f"Masks:  {args.masks}")
    print()
    print("Features:")
    print(f"  - Whisper transcription: {'Yes' if args.whisper else 'No'}")
    print(f"  - B-roll insertion: {'Yes' if args.broll else 'No'}")
    print(f"  - Noise isolation: {'Yes' if args.noise_isolate else 'No'}")
    print(f"  - Intro effect: {'Yes' if not args.no_intro else 'No'}")
    print(f"  - Instagram export: {'Yes' if args.instagram else 'No'}")
    print(f"  - Auto-rotation: {'Yes' if args.rotate else 'No'} (disabled by default)")
    if args.lut:
        print(f"  - LUT color grade: {Path(args.lut).name}")
    if args.rounded_corners != 'none':
        print(f"  - Rounded corners: {args.rounded_corners}")
    if args.aspect_ratio:
        print(f"  - Aspect ratio: {args.aspect_ratio}")
    print()
    print("Caption Style:")
    print(f"  - Font size: {config['font_size']}")
    print(f"  - Transparency: {config['transparency']}")
    print(f"  - Position: {config['position']}")
    print(f"  - Words per line: {config['words_per_line']}")
    print(f"  - Animation: {config['animation']}")
    if args.preset:
        print(f"  - Preset: {args.preset}")
    print()
    print("Mask Processing:")
    print(f"  - Smart placement: {config['smart_placement']}")
    print(f"  - Adaptive erosion: {config['adaptive_erosion']}")
    print(f"  - Erosion pixels: {config['mask_erode_pixels'] or 'auto'}")
    print(f"  - Blur radius: {config['mask_blur_radius'] or 'none'}")
    print()
    print("Red Hook Text (Background):")
    print(f"  - Max words per hook: {config['max_hook_words']}")
    print(f"  - Exclusive mode: {config['exclusive_hooks']} (hides normal captions when hook shows)")
    print()
    print("GPT Transcription Correction:")
    print(f"  - Enabled: {config['gpt_correction']}")
    print(f"  - Confidence threshold: {config['correction_confidence_threshold']}")
    print(f"  - Combined calls: {config['combine_gpt_calls']} (saves 1 API call)")
    print(f"  - Caching: {config['cache_gpt_results']} (skips API on re-process)")
    print()
    print("Performance Optimizations:")
    print(f"  - Hardware encoding: {config['hw_encode']} (5x faster export)")
    print(f"  - HW encoder quality: {config['hw_encode_quality']}")
    print(f"  - Mask frame skip: {config['mask_frame_skip']} (generates every Nth frame)")
    print(f"  - Preview mode: {config['preview_mode']} (low-res for fast iteration)")
    if config['preview_mode']:
        print(f"  - Preview scale: {config['preview_scale']:.0%}")
    print(f"  - Split caption mode: {config.get('split_caption_mode', False)} (word-by-word highlighting)")
    print("=" * 70)
    print()


def main():
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args()
    
    # List presets if requested
    if args.list_presets:
        list_presets()
        return 0
    
    # Run tests if requested (bypass validation)
    if args.test:
        import test_new_pipeline
        return test_new_pipeline.main()
    
    # Check required arguments
    if not args.input or not args.output:
        parser.error("arguments -i/--input and -o/--output are required (unless using --test)")
    
    # Validate arguments
    if not validate_args(args):
        return 1
    
    # Print banner
    print_banner()
    
    # Build configuration
    config = build_config(args)
    api_key = args.api_key or os.getenv('OPENAI_API_KEY', '')
    
    # Print settings
    print_settings(args, config)
    
    # Determine processing mode
    use_whisper = args.whisper and not args.transcript
    add_intro = not args.no_intro
    auto_rotate = args.rotate  # Disabled by default, must use --rotate to enable
    
    try:
        if args.transcript:
            # Simple mode with manual transcript
            print("[MODE] Simple processing with manual transcript\n")
            
            success = process_video_simple(
                input_video=args.input,
                output_video=args.output,
                transcript=args.transcript,
                masks_folder=args.masks,
                **config
            )
        else:
            # Full pipeline mode
            print("[MODE] Full AI pipeline" + (" with Whisper" if use_whisper else "") + "\n")
            
            pipeline = Pipeline(api_key=api_key, config=config)
            
            # Enable B-roll if CLI flag used OR preset has broll_enabled
            enable_broll = args.broll or config.get('broll_enabled', False)
            
            success = pipeline.process(
                input_video=args.input,
                output_video=args.output,
                masks_folder=args.masks,
                use_whisper=use_whisper,
                enable_broll=enable_broll,
                noise_isolate=args.noise_isolate,
                add_intro=add_intro,
                instagram_export=args.instagram,
                auto_rotate=auto_rotate,
                lut_path=args.lut,
                rounded_corners=args.rounded_corners,
                aspect_ratio=args.aspect_ratio
            )
        
        if success:
            print("\n" + "=" * 70)
            print("SUCCESS! Output saved to:")
            print(f"  {args.output}")
            print("=" * 70 + "\n")
            return 0
        else:
            print("\n[ERROR] Processing failed!\n")
            return 1
            
    except KeyboardInterrupt:
        print("\n\n[INTERRUPTED] Processing cancelled by user\n")
        return 130
    except Exception as e:
        print(f"\n[ERROR] {e}\n")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
