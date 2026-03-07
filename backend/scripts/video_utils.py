"""
Video Utilities Module

FFmpeg wrappers and video operations including:
- Audio extraction
- Video rotation
- Duration/dimension detection
- Video concatenation
- B-roll montage building
- Universal video format support
"""

import subprocess
import os
import tempfile
from pathlib import Path
from typing import Optional, Tuple, List, Dict
import cv2


# Universal video format support
SUPPORTED_VIDEO_FORMATS = (
    '.mp4', '.mov', '.avi', '.mkv', '.webm', 
    '.m4v', '.3gp', '.flv', '.wmv', '.ts', '.mts'
)

# Hardware encoding codec priorities
HW_ENCODERS = [
    ('h264_nvenc', 'NVIDIA NVENC'),      # NVIDIA GPUs
    ('h264_qsv', 'Intel QuickSync'),     # Intel CPUs
    ('h264_amf', 'AMD AMF'),             # AMD GPUs
    ('h264_videotoolbox', 'Apple VideoToolbox'),  # macOS
]

# Hardware encoder quality presets (codec-specific)
# Note: Order matters - first is fastest/lowest quality, last is slowest/best quality
HW_ENCODE_PRESETS = {
    'h264_nvenc': ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],  # p1=fast, p7=quality
    'h264_qsv': ['veryfast', 'faster', 'fast', 'medium', 'slow'],  # Intel QuickSync
    'h264_amf': ['speed', 'balanced', 'quality'],  # AMD AMF
    'h264_videotoolbox': [],  # macOS doesn't use presets
}


def detect_hardware_encoder() -> Optional[str]:
    """
    Detect available hardware video encoder.
    
    Returns:
        Best available encoder name or None for software
    """
    try:
        # Check each encoder
        for codec, name in HW_ENCODERS:
            cmd = ['ffmpeg', '-hide_banner', '-encoders']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if codec in result.stdout:
                print(f"[HW Encode] Detected: {name} ({codec})")
                return codec
    except Exception as e:
        print(f"[HW Encode] Detection failed: {e}")
    
    print("[HW Encode] Using software encoding (libx264)")
    return None


class HardwareVideoWriter:
    """
    Hardware-accelerated video writer using FFmpeg.
    
    Supports NVIDIA NVENC, Intel QuickSync, and AMD AMF encoders.
    5-10x faster than OpenCV's software VideoWriter.
    
    Example:
        >>> writer = HardwareVideoWriter("output.mp4", 1920, 1080, 30.0)
        >>> writer.write_frame(frame)
        >>> writer.release()
    """
    
    def __init__(self, output_path: str, width: int, height: int, fps: float,
                 codec: Optional[str] = None, quality: str = "medium"):
        """
        Initialize hardware video writer.
        
        Args:
            output_path: Output video file path
            width: Video width in pixels
            height: Video height in pixels
            fps: Frames per second
            codec: Hardware encoder codec (auto-detect if None)
            quality: 'fast', 'medium', 'slow' (affects quality vs speed)
        """
        self.output_path = output_path
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_count = 0
        
        # Auto-detect encoder if not specified
        self.codec = codec or detect_hardware_encoder()
        self.using_hw = self.codec is not None
        
        # Setup FFmpeg command
        self.process = self._start_ffmpeg_process(quality)
        
        if self.process:
            print(f"[HW Writer] Using {self.codec if self.using_hw else 'libx264'} "
                  f"for {width}x{height}@{fps:.1f}fps")
        else:
            raise RuntimeError("Failed to start FFmpeg process")
    
    def _start_ffmpeg_process(self, quality: str) -> Optional[subprocess.Popen]:
        """Start FFmpeg process with hardware encoding."""
        try:
            # Determine codec and settings
            if self.using_hw:
                video_codec = self.codec
                
                # Map quality to preset
                presets = HW_ENCODE_PRESETS.get(self.codec, [])
                if quality == "fast" and presets:
                    preset = presets[0]  # Fastest
                elif quality == "slow" and presets:
                    preset = presets[-1]  # Best quality
                elif presets:
                    preset = presets[len(presets)//2]  # Middle
                else:
                    preset = None
            else:
                # Software fallback
                video_codec = 'libx264'
                preset = {'fast': 'veryfast', 'medium': 'medium', 'slow': 'slow'}.get(quality, 'medium')
            
            # Build FFmpeg command
            cmd = [
                'ffmpeg', '-y',
                '-hide_banner',
                '-loglevel', 'error',
                '-f', 'rawvideo',
                '-vcodec', 'rawvideo',
                '-pix_fmt', 'bgr24',
                '-s', f'{self.width}x{self.height}',
                '-r', str(self.fps),
                '-i', '-',  # Input from stdin
                '-c:v', video_codec,
            ]
            
            # Add preset/quality settings based on codec
            if self.codec == 'h264_nvenc':
                # NVENC: use preset and bitrate for quality control
                cmd.extend(['-preset', preset or 'p4'])
                # Use VBR mode with reasonable bitrate for screen content
                cmd.extend(['-rc', 'vbr', '-b:v', '5M', '-maxrate:v', '10M'])
            elif self.codec == 'h264_qsv':
                cmd.extend(['-preset', preset or 'medium'])
                cmd.extend(['-global_quality', '23', '-look_ahead', '0'])
            elif self.codec == 'h264_amf':
                cmd.extend(['-quality', preset or 'balanced'])
                cmd.extend(['-rc', 'cqp', '-qp_i', '23', '-qp_p', '23'])
            elif not self.using_hw:
                # Software encoding
                cmd.extend(['-preset', preset])
                cmd.extend(['-crf', '23'])
            
            # Add output settings
            cmd.extend([
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                self.output_path
            ])
            
            # Debug: print command
            print(f"[HW Writer] FFmpeg command: {' '.join(cmd[:12])} ...")
            
            # Start process
            return subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
            
        except Exception as e:
            print(f"[HW Writer] Error starting FFmpeg: {e}")
            return None
    
    def write_frame(self, frame) -> bool:
        """
        Write a frame to the video.
        
        Args:
            frame: OpenCV BGR frame (numpy array)
            
        Returns:
            True if successful
        """
        if self.process is None or self.process.poll() is not None:
            return False
        
        try:
            # Ensure frame is correct size
            if frame.shape[1] != self.width or frame.shape[0] != self.height:
                frame = cv2.resize(frame, (self.width, self.height))
            
            # Write to FFmpeg stdin
            self.process.stdin.write(frame.tobytes())
            self.frame_count += 1
            return True
        except Exception as e:
            print(f"[HW Writer] Write error: {e}")
            return False
    
    def release(self) -> bool:
        """
        Finalize and close the video file.
        
        Returns:
            True if successful
        """
        if self.process is None:
            return False
        
        try:
            # Close stdin to signal EOF
            self.process.stdin.close()
            
            # Wait for FFmpeg to finish (with timeout)
            self.process.wait(timeout=60)
            
            success = self.process.returncode == 0
            if success:
                print(f"[HW Writer] Wrote {self.frame_count} frames to {self.output_path}")
            else:
                stderr = self.process.stderr.read().decode()[-500:] if self.process.stderr else ""
                print(f"[HW Writer] FFmpeg error: {stderr}")
                # Clean up failed output file
                if os.path.exists(self.output_path):
                    try:
                        os.remove(self.output_path)
                    except:
                        pass
            
            return success
        except Exception as e:
            print(f"[HW Writer] Release error: {e}")
            try:
                self.process.kill()
            except:
                pass
            # Clean up failed output file
            if os.path.exists(self.output_path):
                try:
                    os.remove(self.output_path)
                except:
                    pass
            return False
    
    def isOpened(self) -> bool:
        """Check if the writer is still open and working."""
        if self.process is None:
            return False
        return self.process.poll() is None


def is_video_file(path: str) -> bool:
    """Check if file is a supported video format."""
    if not path or not isinstance(path, str):
        return False
    ext = Path(path).suffix.lower()
    return ext in SUPPORTED_VIDEO_FORMATS


class VideoUtils:
    """
    Video utility functions using FFmpeg.
    
    All methods are static - no instance needed.
    
    Example:
        >>> duration = VideoUtils.get_duration("video.mp4")
        >>> width, height = VideoUtils.get_dimensions("video.mp4")
    """
    
    @staticmethod
    def get_duration(video_path: str) -> float:
        """
        Get video duration in seconds using ffprobe.
        
        Args:
            video_path: Path to video file
            
        Returns:
            Duration in seconds (0.0 if error)
            
        Example:
            >>> duration = VideoUtils.get_duration("clip.mp4")
            >>> print(f"Video is {duration:.1f} seconds long")
        """
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return 0.0
        
        try:
            return float(result.stdout.strip())
        except ValueError:
            return 0.0
    
    @staticmethod
    def get_dimensions(video_path: str) -> Tuple[int, int]:
        """
        Get video width and height.
        
        Args:
            video_path: Path to video file
            
        Returns:
            Tuple of (width, height) in pixels
            
        Example:
            >>> w, h = VideoUtils.get_dimensions("video.mp4")
            >>> print(f"Resolution: {w}x{h}")
        """
        # Get width
        w_cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        
        # Get height
        h_cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=height",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]
        
        w_result = subprocess.run(w_cmd, capture_output=True, text=True)
        h_result = subprocess.run(h_cmd, capture_output=True, text=True)
        
        try:
            width = int(w_result.stdout.strip())
            height = int(h_result.stdout.strip())
            return (width, height)
        except ValueError:
            return (1920, 1080)  # Default fallback
    
    @staticmethod
    def get_video_info(video_path: str) -> Dict:
        """
        Get comprehensive video information.
        
        Args:
            video_path: Path to video file
            
        Returns:
            Dictionary with video metadata including:
            - width, height: Stored dimensions
            - display_width, display_height: Display dimensions (after rotation)
            - rotation: Rotation metadata in degrees
            - fps: Frames per second
            - duration: Duration in seconds
            - codec: Video codec name
            - audio_codec: Audio codec name
            - is_portrait: True if display height > width
            - aspect_ratio: Width/height ratio
            - needs_fix: True if rotation fix needed
        """
        result = {
            'width': 1920, 'height': 1080,
            'display_width': 1920, 'display_height': 1080,
            'rotation': 0, 'is_portrait': False,
            'needs_fix': False, 'fps': 30.0,
            'duration': 0.0, 'codec': 'h264',
            'audio_codec': 'aac', 'aspect_ratio': 16/9
        }
        
        if not os.path.exists(video_path):
            return result
        
        # Get stream info using ffprobe
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,codec_name",
            "-of", "json", video_path
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        
        if proc.returncode == 0:
            import json
            try:
                data = json.loads(proc.stdout)
                stream = data.get('streams', [{}])[0]
                result['width'] = stream.get('width', 1920)
                result['height'] = stream.get('height', 1080)
                result['codec'] = stream.get('codec_name', 'h264')
                
                # Parse frame rate (e.g., "30000/1001")
                fps_str = stream.get('r_frame_rate', '30/1')
                if '/' in fps_str:
                    num, den = fps_str.split('/')
                    result['fps'] = float(num) / float(den) if float(den) != 0 else 30.0
                else:
                    result['fps'] = float(fps_str)
            except:
                pass
        
        # Get audio codec
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1", video_path
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and proc.stdout.strip():
            result['audio_codec'] = proc.stdout.strip()
        
        # Get duration
        result['duration'] = VideoUtils.get_duration(video_path)
        
        # Get rotation metadata
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream_side_data=rotation",
            "-of", "default=nw=1:nk=1", video_path
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        rotation_str = proc.stdout.strip()
        
        if rotation_str:
            try:
                if rotation_str.startswith("rotation="):
                    result['rotation'] = int(float(rotation_str.split("=")[1]))
                else:
                    result['rotation'] = int(float(rotation_str))
            except:
                pass
        
        # Also check for displaymatrix side data
        if result['rotation'] == 0:
            cmd = [
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream_side_data=displaymatrix",
                "-of", "default=nw=1:nk=1", video_path
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True)
            matrix_str = proc.stdout.strip()
            if "rotation" in matrix_str.lower() or "-" in matrix_str:
                # Parse rotation from displaymatrix if present
                try:
                    # Typical format: "displaymatrix: rotation of -90.00 degrees"
                    if "rotation of" in matrix_str:
                        rot_part = matrix_str.split("rotation of")[1].split("degrees")[0].strip()
                        result['rotation'] = int(float(rot_part))
                except:
                    pass
        
        # Calculate display dimensions
        if result['rotation'] in [90, -90, 270, -270]:
            result['display_width'] = result['height']
            result['display_height'] = result['width']
        else:
            result['display_width'] = result['width']
            result['display_height'] = result['height']
        
        result['is_portrait'] = result['display_height'] > result['display_width']
        result['aspect_ratio'] = result['display_width'] / result['display_height'] if result['display_height'] > 0 else 1.0
        result['needs_fix'] = result['rotation'] != 0

        return result

    @staticmethod
    def check_video_metadata(video_path: str) -> dict:
        """
        Pre-flight metadata check for a video file.

        Prints a formatted report and returns a dict with:
        - 'ok': bool -- False if any blocking issue was found
        - 'warnings': list[str] -- non-fatal issues
        - 'errors': list[str] -- fatal issues that would break the pipeline
        - all fields from get_video_info
        """
        print(f"\n{'='*60}")
        print("VIDEO METADATA PRE-FLIGHT CHECK")
        print(f"{'='*60}")
        print(f"File : {video_path}")

        if not os.path.exists(video_path):
            print("ERROR: File does not exist.")
            return {'ok': False, 'warnings': [], 'errors': ['File not found']}

        file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
        print(f"Size : {file_size_mb:.1f} MB")

        info = VideoUtils.get_video_info(video_path)

        warnings = []
        errors   = []

        # -- Resolution ------------------------------------------------
        w, h = info['display_width'], info['display_height']
        print(f"\n[Resolution]")
        print(f"  Stored   : {info['width']}x{info['height']}")
        print(f"  Display  : {w}x{h}  ({'portrait' if info['is_portrait'] else 'landscape'})")
        print(f"  Aspect   : {info['aspect_ratio']:.3f}")

        if w == 0 or h == 0:
            errors.append("Zero-dimension video -- cannot process.")

        # -- Rotation -------------------------------------------------
        rot = info['rotation']
        print(f"\n[Rotation Metadata]")
        if rot != 0:
            print(f"  rotate tag : {rot} deg  [WARNING] Pipeline will correct this automatically.")
            warnings.append(f"rotate metadata = {rot} deg (will be corrected by pipeline)")
        else:
            print(f"  rotate tag : none (0 deg)  [OK]")

        # -- Frame-rate ------------------------------------------------
        fps = info['fps']
        print(f"\n[Frame Rate]")
        print(f"  FPS : {fps:.3f}")
        if fps <= 0:
            errors.append("Invalid FPS (0 or negative).")
        elif fps > 120:
            warnings.append(f"Unusually high FPS ({fps:.1f}) -- may slow processing.")

        # -- Duration -------------------------------------------------
        dur = info['duration']
        print(f"\n[Duration]")
        print(f"  Duration : {dur:.2f}s  ({int(dur//60)}m {dur%60:.1f}s)")
        if dur <= 0:
            errors.append("Zero or negative duration -- file may be corrupt.")
        elif dur < 1:
            warnings.append("Very short video (< 1 s).")

        # -- Codecs ----------------------------------------------------
        vcodec = info['codec']
        acodec = info['audio_codec']
        print(f"\n[Codecs]")
        print(f"  Video : {vcodec}")
        print(f"  Audio : {acodec if acodec else 'none (no audio stream)'}")

        UNSUPPORTED_VCODEC = {'hevc', 'av1', 'vp9'}
        if vcodec.lower() in UNSUPPORTED_VCODEC:
            warnings.append(
                f"Video codec '{vcodec}' may require re-encoding. "
                "Pipeline will handle it but processing will be slower."
            )
        if not acodec:
            warnings.append("No audio stream detected -- output will be silent.")

        # -- File-size sanity -----------------------------------------
        print(f"\n[File Size]")
        if file_size_mb < 0.1:
            errors.append(f"File is suspiciously small ({file_size_mb:.2f} MB) -- possibly corrupt.")
            print(f"  {file_size_mb:.1f} MB  [FAIL] (too small)")
        else:
            print(f"  {file_size_mb:.1f} MB  [OK]")

        # -- Summary ---------------------------------------------------
        print(f"\n{'-'*60}")
        if errors:
            print(f"RESULT : [FAIL]  ({len(errors)} error(s), {len(warnings)} warning(s))")
            for e in errors:
                print(f"  ERROR   : {e}")
        else:
            print(f"RESULT : [PASS]  ({len(warnings)} warning(s))")

        for w_msg in warnings:
            print(f"  WARNING : {w_msg}")
        print(f"{'='*60}\n")

        return {
            'ok': len(errors) == 0,
            'warnings': warnings,
            'errors': errors,
            **info,
        }

    @staticmethod
    def get_rotation_info(video_path: str) -> dict:
        """
        Get video rotation metadata (legacy compatibility).
        
        Args:
            video_path: Path to video file
            
        Returns:
            Dictionary with rotation info
        """
        info = VideoUtils.get_video_info(video_path)
        return {
            'width': info['width'],
            'height': info['height'],
            'display_width': info['display_width'],
            'display_height': info['display_height'],
            'rotation': info['rotation'],
            'is_portrait': info['is_portrait'],
            'needs_fix': info['needs_fix']
        }
    
    @staticmethod
    def get_fps(video_path: str) -> float:
        """Get video frame rate."""
        info = VideoUtils.get_video_info(video_path)
        return info['fps']
    
    @staticmethod
    def auto_rotate_video(input_path: str, output_path: str) -> bool:
        """
        Auto-rotate video based on metadata to fix phone orientation.
        
        Args:
            input_path: Input video path
            output_path: Output video path
            
        Returns:
            True if successful
        """
        info = VideoUtils.get_video_info(input_path)
        
        if not info['needs_fix']:
            # No rotation needed, just copy
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", input_path,
                "-c", "copy",
                output_path
            ]
        else:
            # Apply rotation
            transpose_map = {90: 'transpose=1', 270: 'transpose=2', -90: 'transpose=2', -270: 'transpose=1'}
            vf_filter = transpose_map.get(info['rotation'], 'transpose=1')
            
            # Preserve original resolution and fps
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", input_path,
                "-vf", vf_filter,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-r", str(info['fps']),
                "-c:a", "aac", "-b:a", "192k",
                "-metadata:s:v", "rotate=0",
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    
    @staticmethod
    def extract_audio(video_path: str, output_audio: str) -> bool:
        """
        Extract audio from video to WAV file.
        
        Args:
            video_path: Input video path
            output_audio: Output WAV path
            
        Returns:
            True if successful
            
        Example:
            >>> success = VideoUtils.extract_audio("video.mp4", "audio.wav")
        """
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            output_audio
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    
    @staticmethod
    def rotate_video(input_path: str, output_path: str, direction: str = 'cw') -> bool:
        """
        Rotate video 90 degrees.
        
        Args:
            input_path: Input video path
            output_path: Output video path
            direction: 'cw' (clockwise) or 'ccw' (counter-clockwise)
            
        Returns:
            True if successful
            
        Example:
            >>> VideoUtils.rotate_video("input.mp4", "rotated.mp4", "cw")
        """
        # transpose: 1=90cw, 2=90ccw
        transpose = '1' if direction == 'cw' else '2'
        
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", f"transpose={transpose}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "copy",
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    
    @staticmethod
    def concat_videos(video_paths: List[str], output_path: str) -> bool:
        """
        Concatenate multiple videos using FFmpeg concat demuxer.
        
        Args:
            video_paths: List of video file paths
            output_path: Output concatenated video path
            
        Returns:
            True if successful
        """
        if not video_paths:
            return False
        
        # Create temp file list
        temp_list = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
        for path in video_paths:
            temp_list.write(f"file '{os.path.abspath(path)}'\n")
        temp_list.close()
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", temp_list.name,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        os.unlink(temp_list.name)
        
        return result.returncode == 0
    
    @staticmethod
    def add_audio_to_video(video_path: str, audio_source: str, output_path: str) -> bool:
        """
        Add audio from source video to another video.
        
        Args:
            video_path: Video to add audio to (no audio)
            audio_source: Source of audio (video or audio file)
            output_path: Output path
            
        Returns:
            True if successful
        """
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_source,
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-shortest",
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    
    @staticmethod
    def apply_instagram_preset(input_video: str, output_video: str) -> bool:
        """
        Apply Instagram-optimized export settings.
        
        Includes contrast boost, sharpening, and mobile color grading.
        
        Args:
            input_video: Input video path
            output_video: Output video path
            
        Returns:
            True if successful
        """
        filter_chain = (
            "eq=contrast=1.1:brightness=0.05,"
            "unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.5,"
            "format=yuv420p"
        )
        
        cmd = [
            "ffmpeg", "-y",
            "-i", input_video,
            "-vf", filter_chain,
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output_video
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0


# =============================================================================
# Standalone functions
# =============================================================================

def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds."""
    return VideoUtils.get_duration(video_path)


def get_video_dimensions(video_path: str) -> Tuple[int, int]:
    """Get video width and height."""
    return VideoUtils.get_dimensions(video_path)


def extract_audio(video_path: str, output_audio: str) -> bool:
    """Extract audio from video to WAV."""
    return VideoUtils.extract_audio(video_path, output_audio)


# =============================================================================
# Aspect Ratio Conversion
# =============================================================================

# Target canvas sizes for each ratio
ASPECT_RATIO_CANVAS_SIZES = {
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "2:3": (1080, 1620),
    "9:16": (1080, 1920),
}


def get_aspect_ratio_choices() -> list:
    """Get list of available aspect ratio choices."""
    return list(ASPECT_RATIO_CANVAS_SIZES.keys())


def convert_aspect_ratio(input_video: str, output_video: str, target_ratio: str) -> bool:
    """
    Convert video to target aspect ratio with smart crop/pad and blurred background.
    
    Args:
        input_video: Input video path
        output_video: Output video path
        target_ratio: Target aspect ratio (1:1, 4:5, 2:3, 9:16)
        
    Returns:
        True if successful
        
    Example:
        >>> convert_aspect_ratio("input.mp4", "output.mp4", "9:16")
        >>> # Creates vertical video with blurred background if needed
    """
    if target_ratio not in ASPECT_RATIO_CANVAS_SIZES:
        print(f"[Aspect Ratio] Error: Unknown ratio '{target_ratio}'")
        print(f"[Aspect Ratio] Available: {', '.join(ASPECT_RATIO_CANVAS_SIZES.keys())}")
        return False
    
    target_width, target_height = ASPECT_RATIO_CANVAS_SIZES[target_ratio]
    
    # Get input video info
    video_info = VideoUtils.get_video_info(input_video)
    input_width = video_info['display_width']
    input_height = video_info['display_height']
    fps = video_info['fps']
    
    input_ratio = input_width / input_height if input_height > 0 else 1.0
    target_ratio_val = target_width / target_height
    
    # Determine strategy
    if input_ratio > target_ratio_val:
        # Input is wider than target: center crop
        method = "center crop (input wider)"
        needs_padding = False
    elif input_ratio < target_ratio_val:
        # Input is narrower than target: pad with blurred background
        method = "center crop + blurred background (input narrower)"
        needs_padding = True
    else:
        # Same ratio, just scale
        method = "direct scale (same ratio)"
        needs_padding = False
    
    print(f"[Aspect Ratio] Input: {input_width}x{input_height} ({input_ratio:.2f})")
    print(f"[Aspect Ratio] Target: {target_width}x{target_height} ({target_ratio})")
    print(f"[Aspect Ratio] Method: {method}")
    
    if not needs_padding:
        # Simple center crop and scale
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", input_video,
            "-vf",
            f"crop=ih*{target_width}/{target_height}:ih,scale={target_width}:{target_height}:force_original_aspect_ratio=disable",
            "-c:a", "copy",
            "-r", str(fps),
            output_video
        ]
    else:
        # Complex filterchain for blurred background effect
        filter_complex = (
            # Split input into two streams
            "[0:v]split[original][bg];"
            # Create blurred background
            f"[bg]scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
            f"crop={target_width}:{target_height},boxblur=40:20[blurred];"
            # Scale original to fit within target
            f"[original]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease[scaled];"
            # Overlay scaled original on blurred background
            f"[blurred][scaled]overlay=(W-w)/2:(H-h)/2:shortest=1[final]"
        )
        
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", input_video,
            "-filter_complex", filter_complex,
            "-map", "[final]",
            "-map", "0:a?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-r", str(fps),
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            "-pix_fmt", "yuv420p",
            output_video
        ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"[Aspect Ratio] Success: {output_video}")
        return True
    else:
        print(f"[Aspect Ratio] Error: {result.stderr[-500:]}")
        return False

