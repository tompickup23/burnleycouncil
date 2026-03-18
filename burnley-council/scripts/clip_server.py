#!/usr/bin/env python3
"""
clip_server.py — On-demand council meeting clip extraction API.

Runs on vps-main. Serves pre-clipped high-value moments and extracts
on-demand clips from Mediasite webcasts.

Endpoints:
    GET /clips/{meeting_id}/{clip_id}.mp4     — serve pre-clipped file
    GET /clip?meeting=ID&start=S&end=E        — on-demand extraction
    GET /meetings                              — list available meetings
    GET /health                                — health check

On-demand workflow:
    1. Look up webcast URL from meeting metadata
    2. yt-dlp --download-sections to grab just the needed chunk
    3. ffmpeg to trim precisely and re-encode
    4. Cache for 24h, then auto-delete
    5. Serve the clip

Pre-clipped clips live in /opt/clips/{meeting_id}/ and are served directly.

Usage:
    python3 clip_server.py                     # Start on port 8420
    python3 clip_server.py --port 8420         # Custom port

Designed for vps-main (8 vCPU, 32GB RAM, 400GB NVMe).
"""

import os
import sys
import json
import time
import hashlib
import subprocess
import threading
import re
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import mimetypes

# Directories
CLIPS_DIR = Path("/opt/clips")
CACHE_DIR = Path("/opt/clips/_cache")
MEETINGS_DIR = Path("/opt/transcripts")
CLIPS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Config
PORT = 8420
CACHE_TTL_HOURS = 24
MAX_CLIP_SECONDS = 300  # 5 minute max per clip
FFMPEG = "ffmpeg"
YTDLP = "yt-dlp"

# Lock for concurrent clip generation
_clip_locks = {}
_locks_lock = threading.Lock()


def load_meeting_metadata(meeting_id):
    """Load meeting metadata from transcripts directory."""
    meta_path = MEETINGS_DIR / meeting_id / "meeting_meta.json"
    if meta_path.exists():
        with open(meta_path) as f:
            return json.load(f)

    # Fallback: check tier2 output for webcast URL
    tier2_path = MEETINGS_DIR / meeting_id / "tier2_v2.json"
    if not tier2_path.exists():
        tier2_path = MEETINGS_DIR / meeting_id / "tier2_analysis.json"
    if tier2_path.exists():
        with open(tier2_path) as f:
            data = json.load(f)
        return data.get("meeting_meta", {})

    return None


# Known meeting webcast URLs (populated from transcripts data)
MEETING_URLS = {
    "lcc-full-council-2025-07-17": "https://auditelsystems.mediasite.com/Mediasite/Play/7b2a963a016945b29ef6a6c63be50fd51d",
}


def get_webcast_url(meeting_id):
    """Get webcast URL for a meeting."""
    if meeting_id in MEETING_URLS:
        return MEETING_URLS[meeting_id]
    meta = load_meeting_metadata(meeting_id)
    if meta and meta.get("webcast_url"):
        return meta["webcast_url"]
    return None


def clip_cache_key(meeting_id, start, end):
    """Generate cache filename for an on-demand clip."""
    raw = f"{meeting_id}_{start:.1f}_{end:.1f}"
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{meeting_id}_{int(start)}_{int(end)}_{h}.mp4"


def get_clip_lock(key):
    """Get or create a lock for a specific clip to prevent duplicate generation."""
    with _locks_lock:
        if key not in _clip_locks:
            _clip_locks[key] = threading.Lock()
        return _clip_locks[key]


def extract_clip_ondemand(meeting_id, start, end, padding=2):
    """Extract a clip on-demand from Mediasite.

    Uses yt-dlp --download-sections to grab only the needed chunk,
    then ffmpeg to trim precisely. Caches result for 24h.
    """
    # Validate
    duration = end - start
    if duration <= 0 or duration > MAX_CLIP_SECONDS:
        return None, f"Invalid duration: {duration:.0f}s (max {MAX_CLIP_SECONDS}s)"

    # Check cache first
    cache_key = clip_cache_key(meeting_id, start, end)
    cache_path = CACHE_DIR / cache_key
    if cache_path.exists():
        age_hours = (time.time() - cache_path.stat().st_mtime) / 3600
        if age_hours < CACHE_TTL_HOURS:
            return str(cache_path), None

    # Get webcast URL
    url = get_webcast_url(meeting_id)
    if not url:
        return None, f"No webcast URL for meeting: {meeting_id}"

    # Lock to prevent duplicate extraction
    lock = get_clip_lock(cache_key)
    if not lock.acquire(timeout=120):
        return None, "Clip extraction already in progress"

    try:
        # Download just the needed section with padding
        dl_start = max(0, start - padding)
        dl_end = end + padding
        section_spec = f"*{dl_start:.0f}-{dl_end:.0f}"

        # Temp file for yt-dlp output
        tmp_dl = CACHE_DIR / f"_dl_{cache_key}"

        print(f"  Downloading section [{dl_start:.0f}-{dl_end:.0f}] from {meeting_id}...")
        cmd_dl = [
            YTDLP,
            url,
            "--download-sections", section_spec,
            "-o", str(tmp_dl),
            "--no-check-certificates",
            "--quiet",
        ]
        result = subprocess.run(cmd_dl, capture_output=True, text=True, timeout=120)

        # yt-dlp may add extension
        actual_dl = None
        for ext in ['.mkv', '.mp4', '.webm', '']:
            candidate = Path(str(tmp_dl) + ext)
            if candidate.exists():
                actual_dl = candidate
                break
        # Also check without extension
        if not actual_dl and tmp_dl.exists():
            actual_dl = tmp_dl

        if not actual_dl:
            # Fallback: download full and extract with ffmpeg
            print(f"  Section download failed, trying ffmpeg direct extraction...")
            cmd_ff = [
                FFMPEG, "-y",
                "-ss", str(dl_start),
                "-i", url,
                "-t", str(dl_end - dl_start),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                str(cache_path),
            ]
            result = subprocess.run(cmd_ff, capture_output=True, text=True, timeout=300)
            if result.returncode == 0 and cache_path.exists():
                size_mb = cache_path.stat().st_size / (1024 * 1024)
                print(f"  Clip ready: {cache_key} ({size_mb:.1f}MB)")
                return str(cache_path), None
            return None, f"ffmpeg extraction failed: {result.stderr[-200:]}"

        # Trim precisely with ffmpeg
        trim_start = start - dl_start  # Offset within downloaded chunk
        trim_duration = end - start

        print(f"  Trimming to {trim_duration:.1f}s...")
        cmd_trim = [
            FFMPEG, "-y",
            "-ss", str(trim_start),
            "-i", str(actual_dl),
            "-t", str(trim_duration),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(cache_path),
        ]
        result = subprocess.run(cmd_trim, capture_output=True, text=True, timeout=120)

        # Cleanup temp download
        if actual_dl.exists():
            actual_dl.unlink()

        if result.returncode != 0:
            return None, f"ffmpeg trim failed: {result.stderr[-200:]}"

        if not cache_path.exists():
            return None, "Clip file not created"

        size_mb = cache_path.stat().st_size / (1024 * 1024)
        print(f"  Clip ready: {cache_key} ({size_mb:.1f}MB)")
        return str(cache_path), None

    except subprocess.TimeoutExpired:
        return None, "Extraction timed out"
    except Exception as e:
        return None, str(e)
    finally:
        lock.release()


def cleanup_cache():
    """Remove cached clips older than CACHE_TTL_HOURS."""
    now = time.time()
    removed = 0
    for f in CACHE_DIR.iterdir():
        if f.name.startswith('_'):
            continue
        age_hours = (now - f.stat().st_mtime) / 3600
        if age_hours > CACHE_TTL_HOURS:
            f.unlink()
            removed += 1
    if removed:
        print(f"  Cache cleanup: removed {removed} expired clips")


def preclip_meeting(meeting_id, min_score=7):
    """Pre-clip high-value moments from a meeting.

    Called after transcription + Tier 2 analysis.
    Extracts clips for all moments scoring >= min_score.
    Stores in /opt/clips/{meeting_id}/
    """
    # Load tier2 analysis
    tier2_path = MEETINGS_DIR / meeting_id / "tier2_v2.json"
    if not tier2_path.exists():
        print(f"  No tier2 data for {meeting_id}")
        return []

    with open(tier2_path) as f:
        data = json.load(f)

    moments = data.get("moments", [])
    high_value = [m for m in moments if m.get("composite_score", 0) >= min_score]

    if not high_value:
        print(f"  No moments scoring {min_score}+ in {meeting_id}")
        return []

    url = get_webcast_url(meeting_id)
    if not url:
        print(f"  No webcast URL for {meeting_id}")
        return []

    # Create clips directory for this meeting
    clips_dir = CLIPS_DIR / meeting_id
    clips_dir.mkdir(parents=True, exist_ok=True)

    # Download full video once
    print(f"  Downloading full meeting for pre-clipping ({len(high_value)} clips)...")
    tmp_video = CACHE_DIR / f"_full_{meeting_id}.mkv"

    if not tmp_video.exists():
        cmd = [YTDLP, url, "-o", str(tmp_video), "--no-check-certificates", "--quiet"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            print(f"  Download failed: {result.stderr[-200:]}")
            return []

    # Check actual file (yt-dlp may add extension)
    actual_video = None
    for ext in ['.mkv', '.mp4', '.webm', '']:
        candidate = Path(str(tmp_video) + ext) if ext else tmp_video
        if candidate.exists() and candidate.stat().st_size > 1000:
            actual_video = candidate
            break

    if not actual_video:
        print(f"  Could not find downloaded video")
        return []

    # Extract each clip
    clipped = []
    for i, moment in enumerate(high_value):
        start = max(0, moment["start"] - 2)  # 2s padding
        end = moment["end"] + 2
        duration = end - start

        score = moment.get("composite_score", 0)
        clip_name = f"clip_{i:03d}_{int(moment['start'])}s_score{score:.0f}.mp4"
        clip_path = clips_dir / clip_name

        if clip_path.exists():
            print(f"    Skip (exists): {clip_name}")
            clipped.append({"path": str(clip_path), "moment": moment})
            continue

        cmd = [
            FFMPEG, "-y",
            "-ss", str(start),
            "-i", str(actual_video),
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(clip_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode == 0 and clip_path.exists():
            size_mb = clip_path.stat().st_size / (1024 * 1024)
            print(f"    Clipped: {clip_name} ({size_mb:.1f}MB)")
            clipped.append({"path": str(clip_path), "moment": moment})
        else:
            print(f"    FAILED: {clip_name}")

    # Save clip manifest
    manifest = {
        "meeting_id": meeting_id,
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "min_score": min_score,
        "clips": [
            {
                "filename": Path(c["path"]).name,
                "start": c["moment"]["start"],
                "end": c["moment"]["end"],
                "score": c["moment"].get("composite_score", 0),
                "text": c["moment"].get("text", "")[:200],
                "category": (c["moment"].get("llm") or {}).get("category", ""),
                "speaker": (c["moment"].get("llm") or {}).get("speaker"),
                "topics": (c["moment"].get("llm") or {}).get("topics", []),
            }
            for c in clipped
        ],
    }
    manifest_path = clips_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    # Delete full video
    if actual_video.exists():
        size_gb = actual_video.stat().st_size / (1024**3)
        actual_video.unlink()
        print(f"  Deleted source video ({size_gb:.1f}GB)")

    print(f"  Pre-clipped {len(clipped)} moments for {meeting_id}")
    return clipped


class ClipHandler(BaseHTTPRequestHandler):
    """HTTP handler for clip requests."""

    def log_message(self, format, *args):
        """Suppress default access log, use custom."""
        pass

    def send_file(self, path, content_type="video/mp4"):
        """Send a file with proper headers."""
        try:
            size = os.path.getsize(path)
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except Exception as e:
            self.send_error(500, str(e))

    def send_json(self, data, status=200):
        """Send JSON response."""
        body = json.dumps(data, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        params = parse_qs(parsed.query)

        # Health check
        if path == '/health':
            self.send_json({"status": "ok", "clips_dir": str(CLIPS_DIR)})
            return

        # List meetings with clips
        if path == '/meetings':
            meetings = []
            for d in CLIPS_DIR.iterdir():
                if d.is_dir() and not d.name.startswith('_'):
                    manifest_path = d / "manifest.json"
                    if manifest_path.exists():
                        with open(manifest_path) as f:
                            manifest = json.load(f)
                        meetings.append({
                            "meeting_id": d.name,
                            "clips": len(manifest.get("clips", [])),
                            "created": manifest.get("created"),
                        })
            self.send_json({"meetings": meetings})
            return

        # Serve pre-clipped file: /clips/{meeting_id}/{filename}.mp4
        clip_match = re.match(r'^/clips/([^/]+)/([^/]+\.mp4)$', path)
        if clip_match:
            meeting_id = clip_match.group(1)
            filename = clip_match.group(2)
            clip_path = CLIPS_DIR / meeting_id / filename
            if clip_path.exists():
                self.send_file(str(clip_path))
            else:
                self.send_error(404, f"Clip not found: {filename}")
            return

        # Clip manifest: /clips/{meeting_id}/manifest.json
        manifest_match = re.match(r'^/clips/([^/]+)/manifest\.json$', path)
        if manifest_match:
            meeting_id = manifest_match.group(1)
            manifest_path = CLIPS_DIR / meeting_id / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path) as f:
                    self.send_json(json.load(f))
            else:
                self.send_error(404, "No manifest for this meeting")
            return

        # On-demand clip: /clip?meeting=ID&start=S&end=E
        if path == '/clip':
            meeting_id = params.get('meeting', [None])[0]
            start = params.get('start', [None])[0]
            end = params.get('end', [None])[0]

            if not all([meeting_id, start, end]):
                self.send_json({"error": "Required: meeting, start, end"}, 400)
                return

            try:
                start = float(start)
                end = float(end)
            except ValueError:
                self.send_json({"error": "start and end must be numbers"}, 400)
                return

            print(f"  On-demand clip: {meeting_id} [{start:.0f}-{end:.0f}]")

            clip_path, error = extract_clip_ondemand(meeting_id, start, end)
            if error:
                self.send_json({"error": error}, 500)
                return

            self.send_file(clip_path)
            return

        # Pre-clip endpoint: /preclip?meeting=ID&min_score=7
        if path == '/preclip':
            meeting_id = params.get('meeting', [None])[0]
            min_score = float(params.get('min_score', ['7'])[0])

            if not meeting_id:
                self.send_json({"error": "Required: meeting"}, 400)
                return

            # Run in thread to not block server
            def do_preclip():
                preclip_meeting(meeting_id, min_score=min_score)

            t = threading.Thread(target=do_preclip, daemon=True)
            t.start()
            self.send_json({"status": "pre-clipping started", "meeting_id": meeting_id})
            return

        self.send_error(404, "Not found")


def run_cache_cleanup_thread():
    """Background thread to clean up expired cache entries."""
    while True:
        time.sleep(3600)  # Every hour
        try:
            cleanup_cache()
        except Exception as e:
            print(f"  Cache cleanup error: {e}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Council meeting clip server")
    parser.add_argument("--port", type=int, default=PORT, help=f"Port (default: {PORT})")
    parser.add_argument("--preclip", help="Pre-clip a meeting ID and exit")
    parser.add_argument("--min-score", type=float, default=7, help="Min score for pre-clipping (default: 7)")
    args = parser.parse_args()

    # One-shot pre-clip mode
    if args.preclip:
        clipped = preclip_meeting(args.preclip, min_score=args.min_score)
        print(f"Done: {len(clipped)} clips extracted")
        return

    # Start cache cleanup thread
    cleanup_thread = threading.Thread(target=run_cache_cleanup_thread, daemon=True)
    cleanup_thread.start()

    # Start server
    server = HTTPServer(("0.0.0.0", args.port), ClipHandler)
    print(f"Clip server running on port {args.port}")
    print(f"  Pre-clips: {CLIPS_DIR}")
    print(f"  Cache: {CACHE_DIR}")
    print(f"  Endpoints:")
    print(f"    GET /clips/{{meeting_id}}/{{clip}}.mp4  — pre-clipped")
    print(f"    GET /clip?meeting=ID&start=S&end=E      — on-demand")
    print(f"    GET /meetings                            — list")
    print(f"    GET /health                              — health")
    print(f"    GET /preclip?meeting=ID                  — trigger pre-clip")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
