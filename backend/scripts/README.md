# Viral Caption System - Scripts Package

Modular Python package for AI-powered video captioning.

## Installation

```bash
# Install dependencies
pip install opencv-python mediapipe pillow openai python-dotenv numpy

# Use the package
from scripts.pipeline import process_video
```

## Quick Start

### Simple Usage (Full Pipeline)

```python
from scripts.pipeline import process_video

# Process with Whisper transcription and B-roll
process_video(
    input_video="my_video.mp4",
    output_video="output.mp4",
    api_key="sk-your-openai-key",
    use_whisper=True,
    enable_broll=True,
    add_intro=True,
    instagram_export=True
)
```

### Manual Transcript (No API needed)

```python
from scripts.pipeline import process_video_simple

process_video_simple(
    input_video="my_video.mp4",
    output_video="output.mp4",
    transcript="Hello world this is my video caption",
    font_size=110,
    position="left"
)
```

### Advanced Usage (Component-based)

```python
from scripts.caption_renderer import CaptionRenderer
from scripts.mask_utils import MaskProcessor
from scripts.broll_engine import BrollEngine

# Create renderer with custom settings
renderer = CaptionRenderer(
    font_size=120,
    transparency=0.95,
    animation='slide_up',
    smart_placement=True
)

# Apply captions
renderer.apply_captions(
    input_video="input.mp4",
    masks_folder="masks/",
    output_video="output.mp4",
    timed_captions=my_captions,
    styled_words=my_styled_words
)
```

## Module Overview

| Module | Purpose |
|--------|---------|
| `config.py` | Constants, word lists, styling rules |
| `font_manager.py` | Font loading with caching |
| `video_utils.py` | FFmpeg wrappers, video operations |
| `mask_utils.py` | Person segmentation mask processing |
| `animator.py` | Text animation calculations |
| `text_effects.py` | Glossy text rendering |
| `caption_formatter.py` | Transcript parsing and formatting |
| `hook_renderer.py` | Giant red background text |
| `broll_engine.py` | B-roll scene planning and insertion |
| `caption_renderer.py` | Main caption rendering engine |
| `pipeline.py` | Complete workflow orchestration |

## Configuration

Set environment variables or pass to functions:

```python
import os
os.environ["OPENAI_API_KEY"] = "sk-your-key"

# Or pass directly
from scripts.pipeline import Pipeline
pipeline = Pipeline(api_key="sk-your-key")
```

## Caption Styling

### Automatic (with Whisper + GPT)
- Hooks: GPT-detected attention phrases
- Emphasis: Rule-based important words
- Emotional: Feeling words (believe, dream, love)

### Manual Markers (in transcript)
```
**word**      = Bold + uppercase
*word*        = Cursive
***word***    = Extra-bold + 30% larger
~word~        = Emotional cursive
!!word!!      = DRAMATIC (all caps, 40% bigger)
`word`        = Clean/smaller
^word^        = Superscript
#FF0000#word#/ = Custom color
```

## Architecture

```
Input Video
    ↓
[Orientation Handler] → Rotate if needed
    ↓
[Mask Generator] → Person segmentation masks
    ↓
[Whisper] → Transcription (optional)
    ↓
[GPT Styler] → Hook/emphasis detection (optional)
    ↓
[Caption Renderer] → Apply styled captions
    ↓
[B-roll Engine] → Insert footage (optional)
    ↓
[Intro Effect] → Vertical split reveal (optional)
    ↓
[Instagram Export] → Clarity preset (optional)
    ↓
Output Video
```
