"""
B-Roll Engine - Generates B-roll suggestions from transcript.

This module extracts visual keywords from transcripts and searches
stock video APIs (Pexels, Pixabay) for relevant B-roll footage.
"""

import os
import re
import asyncio
import requests
from typing import List, Dict, Any, Optional
from pathlib import Path

# API Keys
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")

# Keywords that work well for B-roll (visual nouns)
VISUAL_KEYWORDS = {
    "nature": ["nature", "forest", "mountain", "ocean", "beach", "sunset", "sunrise", 
               "tree", "river", "lake", "sky", "cloud", "flower", "garden"],
    "urban": ["city", "street", "building", "car", "traffic", "downtown", "road",
              "highway", "bridge", "skyscraper", "office", "apartment"],
    "people": ["person", "people", "crowd", "meeting", "office", "working", "talking",
               "walking", "running", "dancing", "eating", "drinking", "shopping"],
    "objects": ["laptop", "phone", "computer", "coffee", "book", "desk", "chair",
                "table", "camera", "microphone", "headphones", "keyboard", "screen"],
    "food": ["food", "meal", "restaurant", "cooking", "kitchen", "dinner", "lunch",
             "breakfast", "coffee", "pizza", "burger", "salad"],
    "travel": ["travel", "airport", "airplane", "train", "bus", "hotel", "map",
               "passport", "luggage", "suitcase", "vacation", "tourism"],
    "abstract": ["technology", "data", "charts", "graph", "light", "dark", "color",
                 "energy", "power", "success", "growth", "innovation"]
}


def extract_keywords(transcript: str, styled_words: List[Dict]) -> List[Dict]:
    """
    Extract visual keywords from transcript with timestamps.
    
    Args:
        transcript: Full transcript text
        styled_words: List of word objects with timing
        
    Returns:
        List of keyword dicts: [{"word": "beach", "timestamp": 5.2, "confidence": 0.9}]
    """
    keywords = []
    visual_words = set()
    
    # Build set of all visual keywords
    for category in VISUAL_KEYWORDS.values():
        visual_words.update(category)
    
    # Check each word in styled_words
    for word_data in styled_words:
        word = word_data.get("word", "").lower().strip(".,!?;:'\"")
        
        if word in visual_words:
            keywords.append({
                "word": word,
                "timestamp": word_data.get("start", 0),
                "confidence": 0.8,
                "category": _get_category(word)
            })
    
    # Also check for multi-word phrases in transcript
    transcript_lower = transcript.lower()
    for category, words in VISUAL_KEYWORDS.items():
        for word in words:
            if " " in word and word in transcript_lower:
                # Find timestamp by searching nearby words
                idx = transcript_lower.find(word)
                if idx > 0:
                    # Rough estimate: divide position by average chars per second
                    estimated_time = idx / 15  # ~15 chars per second
                    keywords.append({
                        "word": word,
                        "timestamp": estimated_time,
                        "confidence": 0.7,
                        "category": category
                    })
    
    # Sort by timestamp
    keywords.sort(key=lambda x: x["timestamp"])
    
    # Deduplicate nearby keywords (within 5 seconds)
    filtered = []
    last_time = -10
    for kw in keywords:
        if kw["timestamp"] - last_time > 5:
            filtered.append(kw)
            last_time = kw["timestamp"]
    
    # Limit to top 5 keywords
    return filtered[:5]


def _get_category(word: str) -> str:
    """Get category for a keyword."""
    for category, words in VISUAL_KEYWORDS.items():
        if word in words:
            return category
    return "general"


async def search_pexels(keyword: str, per_page: int = 5) -> List[Dict]:
    """
    Search Pexels API for stock videos.
    
    Args:
        keyword: Search term
        per_page: Number of results to return
        
    Returns:
        List of clip dicts with video info
    """
    if not PEXELS_API_KEY:
        print(f"[B-roll] Pexels API key not configured")
        return []
    
    try:
        response = requests.get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": PEXELS_API_KEY},
            params={
                "query": keyword,
                "per_page": per_page,
                "orientation": "landscape"
            },
            timeout=10
        )
        
        if not response.ok:
            print(f"[B-roll] Pexels API error: {response.status_code}")
            return []
        
        data = response.json()
        clips = []
        
        for video in data.get("videos", []):
            # Get best quality video file
            video_files = sorted(
                video.get("video_files", []),
                key=lambda x: x.get("width", 0),
                reverse=True
            )
            
            if not video_files:
                continue
            
            best_file = video_files[0]
            
            clips.append({
                "id": f"pexels_{video.get('id')}",
                "source": "pexels",
                "url": best_file.get("link"),
                "width": best_file.get("width"),
                "height": best_file.get("height"),
                "duration": video.get("duration"),
                "thumbnail": video.get("image"),
                "description": video.get("url", ""),  # Pexels page URL
            })
        
        return clips
        
    except Exception as e:
        print(f"[B-roll] Pexels search error: {e}")
        return []


async def search_pixabay(keyword: str, per_page: int = 5) -> List[Dict]:
    """
    Search Pixabay API for stock videos (backup source).
    
    Args:
        keyword: Search term
        per_page: Number of results to return
        
    Returns:
        List of clip dicts
    """
    if not PIXABAY_API_KEY:
        return []
    
    try:
        response = requests.get(
            "https://pixabay.com/api/videos/",
            params={
                "key": PIXABAY_API_KEY,
                "q": keyword,
                "per_page": per_page,
                "orientation": "horizontal"
            },
            timeout=10
        )
        
        if not response.ok:
            return []
        
        data = response.json()
        clips = []
        
        for video in data.get("hits", []):
            clips.append({
                "id": f"pixabay_{video.get('id')}",
                "source": "pixabay",
                "url": video.get("videos", {}).get("large", {}).get("url"),
                "width": video.get("videos", {}).get("large", {}).get("width"),
                "height": video.get("videos", {}).get("large", {}).get("height"),
                "duration": video.get("duration"),
                "thumbnail": video.get("picture_id"),
                "description": video.get("pageURL", ""),
            })
        
        return clips
        
    except Exception as e:
        print(f"[B-roll] Pixabay search error: {e}")
        return []


async def generate_broll_suggestions(
    prep_id: str,
    transcript_text: str,
    styled_words: List[Dict]
) -> List[Dict]:
    """
    Generate B-roll suggestions for a video.
    
    Args:
        prep_id: Prep session ID
        transcript_text: Full transcript
        styled_words: Word-level timing data
        
    Returns:
        List of placement suggestions with clips
    """
    print(f"[B-roll] Generating suggestions for prep {prep_id}")
    print(f"[B-roll] Transcript length: {len(transcript_text)}")
    print(f"[B-roll] Styled words: {len(styled_words)}")
    
    # Extract keywords
    keywords = extract_keywords(transcript_text, styled_words)
    print(f"[B-roll] Found {len(keywords)} visual keywords: {[k['word'] for k in keywords]}")
    
    if not keywords:
        print("[B-roll] No visual keywords found")
        return []
    
    # Generate placements for each keyword
    placements = []
    
    for i, keyword_data in enumerate(keywords):
        keyword = keyword_data["word"]
        timestamp = keyword_data["timestamp"]
        
        print(f"[B-roll] Searching for '{keyword}' at {timestamp:.1f}s...")
        
        # Search for clips
        clips = await search_pexels(keyword, per_page=5)
        
        # Fallback to Pixabay if Pexels returns nothing
        if not clips:
            clips = await search_pixabay(keyword, per_page=5)
        
        if clips:
            placement = {
                "id": f"placement_{i}",
                "timestamp": timestamp,
                "keyword": keyword,
                "category": keyword_data["category"],
                "clips": clips[:3],  # Top 3 clips
                "selected_clip_id": clips[0]["id"] if clips else None
            }
            placements.append(placement)
            print(f"[B-roll] Found {len(clips)} clips for '{keyword}'")
        else:
            print(f"[B-roll] No clips found for '{keyword}'")
        
        # Small delay to be nice to APIs
        await asyncio.sleep(0.5)
    
    print(f"[B-roll] Generated {len(placements)} placements")
    return placements


# Backwards compatibility with existing code
async def get_broll_suggestions(prep_id: str, transcript_text: str, styled_words: List[Dict]) -> List[Dict]:
    """Alias for generate_broll_suggestions."""
    return await generate_broll_suggestions(prep_id, transcript_text, styled_words)
