"""
B-Roll Engine - Generates B-roll suggestions from transcript.
"""

import os
import re
import requests
from typing import List, Dict, Any
from observability import logger, metrics

# API Keys
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")

# Keywords that work well for B-roll
VISUAL_KEYWORDS = {
    "nature": ["nature", "forest", "mountain", "ocean", "beach", "sunset", "sunrise"],
    "urban": ["city", "street", "building", "car", "traffic", "downtown"],
    "people": ["person", "people", "crowd", "meeting", "office", "working"],
    "objects": ["laptop", "phone", "coffee", "book", "desk", "computer"],
    "abstract": ["technology", "data", "charts", "light", "dark", "color"]
}


def extract_keywords(transcript: str, styled_words: List[Dict]) -> List[Dict]:
    """
    Extract visual keywords from transcript with timestamps.
    
    Returns: [{"word": "beach", "timestamp": 5.2, "confidence": 0.9}]
    """
    keywords = []
    
    # Simple keyword extraction based on visual nouns
    visual_words = set()
    for category in VISUAL_KEYWORDS.values():
        visual_words.update(category)
    
    # Check each word in styled_words
    for word_data in styled_words:
        word = word_data.get("word", "").lower().strip(".,!?")
        
        if word in visual_words:
            keywords.append({
                "word": word,
                "timestamp": word_data.get("start", 0),
                "confidence": 0.8,
                "category": _get_category(word)
            })
    
    # Deduplicate nearby keywords (within 3 seconds)
    filtered = []
    last_time = -10
    for kw in sorted(keywords, key=lambda x: x["timestamp"]):
        if kw["timestamp"] - last_time > 3:
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
    """Search Pexels for videos."""
    if not PEXELS_API_KEY:
        logger.warning("Pexels API key not configured")
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
            logger.error("Pexels API error", status=response.status_code)
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
            
            best = video_files[0]
            
            clips.append({
                "id": f"pexels_{video['id']}",
                "source": "pexels",
                "external_id": str(video["id"]),
                "keyword": keyword,
                "preview_url": video.get("image"),
                "video_url": best.get("link"),
                "duration": video.get("duration"),
                "width": best.get("width"),
                "height": best.get("height"),
                "author": {
                    "name": video.get("user", {}).get("name"),
                    "url": video.get("user", {}).get("url")
                }
            })
        
        metrics.increment("broll_search_pexels", labels={"keyword": keyword})
        return clips
        
    except Exception as e:
        logger.error("Pexels search failed", error=str(e))
        return []


async def search_pixabay(keyword: str, per_page: int = 5) -> List[Dict]:
    """Search Pixabay for videos."""
    if not PIXABAY_API_KEY:
        return []
    
    try:
        response = requests.get(
            "https://pixabay.com/api/videos/",
            params={
                "key": PIXABAY_API_KEY,
                "q": keyword,
                "per_page": per_page
            },
            timeout=10
        )
        
        if not response.ok:
            return []
        
        data = response.json()
        clips = []
        
        for hit in data.get("hits", []):
            clips.append({
                "id": f"pixabay_{hit['id']}",
                "source": "pixabay",
                "external_id": str(hit["id"]),
                "keyword": keyword,
                "preview_url": hit.get("picture_id"),
                "video_url": hit.get("videos", {}).get("large", {}).get("url"),
                "duration": hit.get("duration"),
                "width": hit.get("videos", {}).get("large", {}).get("width"),
                "height": hit.get("videos", {}).get("large", {}).get("height"),
                "author": {
                    "name": hit.get("user"),
                    "url": f"https://pixabay.com/users/{hit['user']}-{hit['user_id']}"
                }
            })
        
        return clips
        
    except Exception as e:
        logger.error("Pixabay search failed", error=str(e))
        return []


async def generate_broll_suggestions(prep_id: str, transcript_text: str, styled_words: List[Dict]) -> List[Dict]:
    """
    Generate B-roll suggestions for a prep session.
    
    Returns: [{
        "timestamp": 5.0,
        "keyword": "beach",
        "clips": [...]
    }]
    """
    logger.info("broll_generation_started", prep_id=prep_id)
    metrics.increment("broll_generation_started")
    
    # Extract keywords
    keywords = extract_keywords(transcript_text, styled_words)
    
    if not keywords:
        logger.info("no_keywords_found", prep_id=prep_id)
        return []
    
    # Search for clips for each keyword
    suggestions = []
    
    for kw in keywords:
        # Search both sources
        pexels_clips = await search_pexels(kw["word"])
        pixabay_clips = await search_pixabay(kw["word"])
        
        all_clips = pexels_clips + pixabay_clips
        
        if all_clips:
            suggestions.append({
                "timestamp": kw["timestamp"],
                "keyword": kw["word"],
                "confidence": kw["confidence"],
                "clips": all_clips[:5]  # Top 5 clips
            })
    
    logger.info("broll_generation_completed", 
               prep_id=prep_id,
               keyword_count=len(keywords),
               suggestion_count=len(suggestions))
    
    metrics.increment("broll_generation_completed")
    
    return suggestions


def download_broll_clip(clip_id: str, source: str, external_id: str, video_url: str) -> str:
    """
    Download a B-roll clip to local storage.
    
    Returns: Local file path
    """
    import hashlib
    
    # Create unique filename
    clip_hash = hashlib.md5(f"{source}_{external_id}".encode()).hexdigest()[:12]
    local_path = f"data/broll/{clip_hash}.mp4"
    
    # Check if already cached
    if os.path.exists(local_path):
        logger.info("broll_clip_cached", clip_id=clip_id)
        return local_path
    
    # Download
    try:
        os.makedirs("data/broll", exist_ok=True)
        
        response = requests.get(video_url, stream=True, timeout=30)
        response.raise_for_status()
        
        with open(local_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info("broll_clip_downloaded", clip_id=clip_id, path=local_path)
        metrics.increment("broll_clip_downloaded")
        
        return local_path
        
    except Exception as e:
        logger.error("broll_download_failed", clip_id=clip_id, error=str(e))
        raise
