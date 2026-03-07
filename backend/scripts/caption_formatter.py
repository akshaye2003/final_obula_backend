"""
Caption Formatter Module

Transcript parsing and caption formatting:
- Style marker parsing (**bold**, *cursive*, etc.)
- Word-level styling assignment
- Transcript to timed captions conversion
- Hook/emphasis detection
"""

import re
from typing import List, Dict, Set, Optional, Tuple
from pathlib import Path
from .config import EMPHASIS_WORDS, EMOTIONAL_WORDS, BRAND_NAMES, WORD_CORRECTIONS

# Debug tracer
try:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from debug_tracer import tracer
except ImportError:
    tracer = None


class CaptionFormatter:
    """
    Formats and styles captions from transcripts.
    
    Handles both manual markers and AI-detected styling.
    
    Example:
        >>> formatter = CaptionFormatter()
        >>> styled = formatter.process_text_with_styling("**hello** world")
        >>> captions = formatter.words_to_captions(styled_words, words_per_line=2)
    """
    
    def __init__(self, emphasis_words: Optional[Set[str]] = None,
                 emotional_words: Optional[Set[str]] = None,
                 brand_names: Optional[Set[str]] = None):
        """
        Initialize formatter with word lists.
        
        Args:
            emphasis_words: Set of emphasis words (uses config if None)
            emotional_words: Set of emotional words
            brand_names: Set of brand names
        """
        self.emphasis_words = emphasis_words or EMPHASIS_WORDS
        self.emotional_words = emotional_words or EMOTIONAL_WORDS
        self.brand_names = brand_names or BRAND_NAMES
    
    def parse_style_markers(self, text: str) -> str:
        """
        Parse manual style markers from text.
        
        Markers:
        - *word* -> cursive
        - **word** -> bold
        - ***word*** -> extra-bold + larger
        - ~word~ -> emotional cursive
        - !!word!! -> dramatic (all caps, bigger)
        - `word` -> clean/smaller
        - ^word^ -> superscript
        - #RRGGBB#text#/ -> custom color
        
        Args:
            text: Input text with markers
            
        Returns:
            Text with markers converted to [type:content] format
            
        Example:
            >>> formatter = CaptionFormatter()
            >>> result = formatter.parse_style_markers("**hello** world")
            >>> print(result)
            [bold:hello] world
        """
        # Order matters - process longer patterns first
        text = re.sub(r'\*\*\*([^*]+)\*\*\*', r'[extra-bold:\1]', text)
        text = re.sub(r'\*\*([^*]+)\*\*', r'[bold:\1]', text)
        text = re.sub(r'\*([^*]+)\*', r'[cursive:\1]', text)
        text = re.sub(r'~([^~]+)~', r'[emotional:\1]', text)
        text = re.sub(r'!!([^!]+)!!', r'[dramatic:\1]', text)
        text = re.sub(r'`([^`]+)`', r'[clean:\1]', text)
        text = re.sub(r'\^([^\^]+)\^', r'[small:\1]', text)
        text = re.sub(r'#([0-9A-Fa-f]{6})#([^#]+)#/', r'[color:\1:\2]', text)
        
        return text
    
    def detect_repeated_words(self, text: str) -> Dict[str, int]:
        """
        Detect repeated words for progressive emphasis.
        
        Args:
            text: Input text
            
        Returns:
            Dictionary of word -> count
            
        Example:
            >>> formatter = CaptionFormatter()
            >>> formatter.detect_repeated_words("wait wait wait for it")
            {'wait': 3}
        """
        words = text.lower().split()
        repeated = {}
        
        i = 0
        while i < len(words):
            word = words[i]
            count = 1
            
            while i + count < len(words) and words[i + count] == word:
                count += 1
            
            if count >= 2:
                repeated[word] = count
            
            i += count
        
        return repeated
    
    def detect_list_format(self, text: str) -> Optional[List[Tuple[str, str]]]:
        """
        Detect if text is a vertical list (1. ITEM 2. ITEM).
        
        Args:
            text: Input text
            
        Returns:
            List of (number, item) tuples or None
            
        Example:
            >>> formatter = CaptionFormatter()
            >>> formatter.detect_list_format("1. GOA 2. KERALA 3. TAMIL NADU")
            [('1', 'GOA'), ('2', 'KERALA'), ('3', 'TAMIL NADU')]
        """
        pattern = r'(\d+)\.\s*([^0-9]+?)(?=\d+\.|$)'
        matches = re.findall(pattern, text)
        
        if matches and len(matches) >= 2:
            return matches
        return None
    
    def process_text_with_styling(self, text: str) -> List[Tuple[str, str, float]]:
        """
        Process text with smart styling rules.
        
        Returns styled chunks: [(word, style, size_multiplier), ...]
        
        Args:
            text: Input text
            
        Returns:
            List of styled word tuples
            
        Example:
            >>> formatter = CaptionFormatter()
            >>> styled = formatter.process_text_with_styling("believe in yourself")
            >>> print(styled)
            [('believe', 'cursive', 1.0), ('in', 'regular', 1.0), ('yourself', 'bold', 1.0)]
        """
        # Parse manual markers first
        text = self.parse_style_markers(text)
        
        # Split by markers but preserve them
        pattern = r'\[(extra-bold|bold|cursive|emotional|dramatic|clean|small|color):([^\]]+)\]|(\S+)'
        matches = re.findall(pattern, text)
        
        styled_chunks = []
        repeated = self.detect_repeated_words(text)
        word_counts = {}
        
        for match in matches:
            marker_type, marker_content, regular_word = match
            
            # Handle manual markers
            if marker_type:
                if marker_type == 'extra-bold':
                    styled_chunks.append((marker_content.upper(), 'extra-bold', 1.3))
                elif marker_type == 'bold':
                    styled_chunks.append((marker_content.upper(), 'bold', 1.15))
                elif marker_type == 'cursive':
                    styled_chunks.append((marker_content, 'cursive', 1.0))
                elif marker_type == 'emotional':
                    styled_chunks.append((marker_content, 'cursive', 1.1))
                elif marker_type == 'dramatic':
                    styled_chunks.append((marker_content.upper(), 'extra-bold', 1.4))
                elif marker_type == 'clean':
                    styled_chunks.append((marker_content, 'regular', 0.9))
                elif marker_type == 'small':
                    styled_chunks.append((marker_content, 'regular', 0.7))
                elif marker_type == 'color':
                    parts = marker_content.split(':', 1)
                    if len(parts) == 2:
                        hex_color, content = parts
                        styled_chunks.append((content, f'color:{hex_color}', 1.0))
                continue
            
            # Process regular word
            word = regular_word
            clean_word = re.sub(r'[^\w]', '', word.lower())
            
            if not clean_word:
                continue
            
            # Numbers always bold
            if re.match(r'^\d+', word):
                styled_chunks.append((word.upper(), 'bold', 1.2))
                continue
            
            # Progressive emphasis for repeated words
            if clean_word in repeated and repeated[clean_word] >= 2:
                if clean_word not in word_counts:
                    word_counts[clean_word] = 0
                word_counts[clean_word] += 1
                
                occurrence = word_counts[clean_word]
                
                if occurrence == 1:
                    styled_chunks.append((word, 'regular', 1.0))
                elif occurrence == 2:
                    styled_chunks.append((word.upper(), 'bold', 1.1))
                else:
                    styled_chunks.append((word.upper(), 'extra-bold', 1.2))
                continue
            
            # NO AUTO-STYLING: all words regular (user selects styles in editor)
            styled_chunks.append((word, 'regular', 1.0))
        
        return styled_chunks
    
    def words_to_captions(self, styled_words: List[Dict], 
                         words_per_line: int = 2) -> List[Tuple[float, float, List[str]]]:
        """
        Convert styled words to timed captions - SINGLE LINE ONLY.
        
        Args:
            styled_words: List of word dicts with 'word', 'start', 'end', 'style'
            words_per_line: Words per caption line
            
        Returns:
            List of (start_time, end_time, lines) tuples
        """
        if not styled_words:
            return []
        
        # Remove consecutive duplicate words (stuttering correction)
        cleaned_words = []
        prev_word_lower = None
        for word_dict in styled_words:
            word = word_dict.get("word", "")
            word_lower = word.lower().strip(".,!?")
            
            # Skip if same as previous word (consecutive duplicate)
            if word_lower and word_lower == prev_word_lower:
                continue
            
            cleaned_words.append(word_dict)
            prev_word_lower = word_lower
        
        if len(cleaned_words) < len(styled_words):
            print(f"[Captions] Removed {len(styled_words) - len(cleaned_words)} duplicate word(s)")
        
        styled_words = cleaned_words
        
        timed_captions = []
        # Use words_per_line as total words per caption
        words_per_caption = words_per_line  # Exact words per caption (no multiplier)
        
        i = 0
        while i < len(styled_words):
            group = styled_words[i:i + words_per_caption]
            
            start_time = group[0].get("start", 0.0)
            end_time = group[-1].get("end", start_time + 1.0)
            
            # SINGLE LINE: Join all words with spaces
            caption_text = " ".join([w["word"] for w in group])
            
            # Return as single-item list (one line only)
            timed_captions.append((start_time, end_time, [caption_text]))
            
            i += words_per_caption
        
        # Debug: Check current state
        print(f"Created caption: {len(timed_captions)} groups")
        for i, (s, e, lines) in enumerate(timed_captions[:3]):
            print(f"  Group {i}: {len(lines)} lines - {lines}")
        
        # Debug trace layout grouping
        if tracer:
            # Reconstruct groups for tracing
            groups = []
            i = 0
            while i < len(styled_words):
                groups.append(styled_words[i:i + words_per_caption])
                i += words_per_caption
            tracer.log_layout_decision(groups, "left", words_per_line)
        
        return timed_captions
    
    def split_transcript_to_captions(self, transcript: str,
                                    words_per_caption: int = 3,
                                    seconds_per_caption: float = 2.5) -> List[Tuple[float, float, List[str]]]:
        """
        Split plain transcript into timed captions (no Whisper timestamps).
        
        Args:
            transcript: Plain text transcript
            words_per_caption: Words per caption group
            seconds_per_caption: Duration per caption
            
        Returns:
            List of (start_time, end_time, lines) tuples
        """
        # Protect markers before splitting
        protected = transcript
        protected = re.sub(r'!!([^!]+)!!', r'{{BANG}}\1{{/BANG}}', protected)
        
        # Split sentences
        sentences = protected.replace('?', '.').replace('!', '.').split('.')
        sentences = [s.strip() for s in sentences if s.strip()]
        
        # Restore markers
        sentences = [s.replace('{{BANG}}', '!!').replace('{{/BANG}}', '!!') for s in sentences]
        
        timed_captions = []
        current_time = 0.0
        
        for sentence in sentences:
            words = sentence.split()
            
            i = 0
            while i < len(words):
                line1_words = words[i:i + words_per_caption]
                line1 = ' '.join(line1_words)
                i += words_per_caption
                
                if i < len(words):
                    line2_words = words[i:i + words_per_caption]
                    line2 = ' '.join(line2_words)
                    i += words_per_caption
                    lines = [line1, line2]
                else:
                    lines = [line1]
                
                start_time = current_time
                end_time = current_time + seconds_per_caption
                timed_captions.append((start_time, end_time, lines))
                
                current_time = end_time
        
        return timed_captions
    
    @staticmethod
    def apply_word_corrections(word: str) -> str:
        """
        Apply brand name corrections to word.
        
        Args:
            word: Input word
            
        Returns:
            Corrected word
        """
        return WORD_CORRECTIONS.get(word, word)
    
    def calculate_optimal_words_per_line(self, text: str, 
                                        base_words: int = 2) -> int:
        """
        Calculate optimal words per line based on text characteristics.
        
        Args:
            text: Input text
            base_words: Base words per line
            
        Returns:
            Optimal words per line (1, 2, or 3)
        """
        words = text.split()
        if len(words) <= 2:
            return len(words)
        
        # Calculate average word length
        avg_length = sum(len(w.strip('!@#$%^&*()[]{},.<>?\'"";:')) for w in words) / len(words)
        
        if avg_length <= 4:
            return min(3, base_words + 1)
        elif avg_length <= 7:
            return base_words
        else:
            return 1


# =============================================================================
# Standalone functions
# =============================================================================

def parse_markers(text: str) -> str:
    """Parse style markers in text."""
    formatter = CaptionFormatter()
    return formatter.parse_style_markers(text)


def style_text(text: str) -> List[Tuple[str, str, float]]:
    """Apply smart styling to text."""
    formatter = CaptionFormatter()
    return formatter.process_text_with_styling(text)

