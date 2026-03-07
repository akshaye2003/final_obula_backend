"""
Noise Isolation Module - Optional voice cleaning for better transcription
Standalone - no dependencies on other project files

Usage:
    from noise_isolator import NoiseIsolator, quick_clean
    
    # Method 1: Class-based
    isolator = NoiseIsolator(output_dir="temp", model_file_dir="models")
    cleaned_video = isolator.process_video("input.mp4", "output.mp4")
    
    # Method 2: Quick function
    cleaned_video = quick_clean("input.mp4", "output.mp4")
"""
import os
import subprocess
import glob
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class NoiseIsolator:
    """
    Isolates voice from background noise using AI.
    Completely self-contained - just drop in and use.
    """
    
    DEFAULT_MODELS = [
        "3_HP-Vocal-UVR.pth",
        "4_HP-Vocal-UVR.pth", 
        "UVR-MDX-NET-Inst_HQ_1.onnx",
        "1_HP-UVR.pth",
    ]
    
    def __init__(self, output_dir: str = "temp", model_file_dir: str = "models"):
        self.output_dir = Path(output_dir)
        self.model_file_dir = Path(model_file_dir)
        self.separator = None
        self.model_name = None
        
    def _init_separator(self):
        """Initialize the audio separator with available model."""
        try:
            from audio_separator.separator import Separator
        except ImportError:
            raise ImportError(
                "audio_separator not installed.\n"
                "Run: pip install audio-separator"
            )
        
        self.separator = Separator(
            output_dir=str(self.output_dir),
            output_format="wav",
            model_file_dir=str(self.model_file_dir),
            output_single_stem="vocals",
        )
        
        # Try models until one works
        for model in self.DEFAULT_MODELS:
            try:
                self.separator.load_model(model)
                self.model_name = model
                logger.info(f"Loaded noise isolation model: {model}")
                return
            except Exception:
                continue
        
        raise RuntimeError(
            "No noise isolation models available.\n"
            "Run: python download_models.py"
        )
    
    def process_video(self, video_path: str, output_video: Optional[str] = None,
                     volume_boost_db: float = 12.0) -> str:
        """
        Isolate voice from video and return cleaned video path.
        
        Args:
            video_path: Input video with noisy audio
            output_video: Where to save cleaned video (optional)
            volume_boost_db: Boost volume after isolation (AI often reduces it)
            
        Returns:
            Path to video with cleaned audio
        """
        video_path = Path(video_path)
        
        if output_video is None:
            output_video = self.output_dir / f"{video_path.stem}_cleaned.mp4"
        else:
            output_video = Path(output_video)
        
        # Lazy init
        if self.separator is None:
            self._init_separator()
        
        # Step 1: Extract audio
        logger.info("Extracting audio for noise isolation...")
        temp_audio = self.output_dir / f"{video_path.stem}_temp_audio.wav"
        self._run_ffmpeg([
            'ffmpeg', '-y', '-i', str(video_path),
            '-vn', '-acodec', 'pcm_s16le', '-ac', '2', '-ar', '44100',
            str(temp_audio)
        ])
        
        # Step 2: Isolate vocals
        logger.info("Isolating voice with AI (this may take a minute)...")
        output_files = self.separator.separate(str(temp_audio))
        
        if not output_files:
            raise RuntimeError("Voice isolation produced no output")
        
        # Find the output file
        vocals_path = self._find_output_file(output_files, temp_audio)
        
        # Step 3: Merge cleaned audio back with video
        logger.info("Merging cleaned audio back to video...")
        self._run_ffmpeg([
            'ffmpeg', '-y',
            '-i', str(video_path),
            '-i', str(vocals_path),
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '192k',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-af', f'volume={volume_boost_db}dB',
            '-shortest',
            str(output_video)
        ])
        
        # Cleanup temp files
        try:
            temp_audio.unlink()
            vocals_path.unlink()
        except:
            pass
            
        logger.info(f"Cleaned video saved: {output_video}")
        return str(output_video)
    
    def _find_output_file(self, output_files, original_audio: Path) -> Path:
        """Find the actual output file from separator."""
        if output_files:
            path = Path(output_files[0])
            if not path.is_absolute():
                path = self.output_dir / path.name
            
            if path.exists():
                return path
        
        # Fallback: search with glob
        pattern = str(self.output_dir / f"*{original_audio.stem}*(Vocals)*.wav")
        matches = glob.glob(pattern)
        if matches:
            return Path(matches[0])
        
        raise FileNotFoundError(f"Could not find isolated vocals file")
    
    def _run_ffmpeg(self, cmd):
        """Run ffmpeg command."""
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg error: {result.stderr}")


def quick_clean(video_path: str, output_path: Optional[str] = None) -> str:
    """Quick function to clean a video."""
    isolator = NoiseIsolator()
    return isolator.process_video(video_path, output_path)


if __name__ == "__main__":
    # Test mode
    import sys
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        print(f"Processing: {input_file}")
        result = quick_clean(input_file, output_file)
        print(f"Done: {result}")
    else:
        print("Usage: python noise_isolator.py <input_video.mp4> [output_video.mp4]")
