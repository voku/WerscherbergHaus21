#!/usr/bin/env python3
"""
MP3 Lyrics Synchronisation Analyser
====================================
Analyses public/Haus_am_Werscherberg.mp3 to detect audio-energy onsets and
produces recommended cue-time (in seconds) for each lyric entry.

The output can be pasted directly into the LYRICS array in src/App.tsx.

Requirements
------------
    pip install numpy scipy soundfile

Usage
-----
    python3 scripts/analyze-mp3.py

How it works
------------
1. Reads the stereo MP3 into a mono float32 array (via soundfile's libsndfile).
2. Computes a smoothed RMS-energy envelope with 25 ms hops / 100 ms windows.
3. For every lyric entry the script searches a ±3 s window around the current
   timestamp and finds the frame with the largest *positive* energy derivative
   (the steepest energy rise), weighted to prefer a location close to the
   original cue.  This corresponds to the moment the vocals enter.
4. The result is rounded to the nearest integer second, which is precise enough
   for scroll-sync purposes.
"""

from __future__ import annotations

import sys
import os
import json
from pathlib import Path

try:
    import numpy as np
    from scipy.ndimage import uniform_filter1d
    import soundfile as sf
except ImportError as exc:
    sys.exit(
        f"Missing dependency: {exc}\n"
        "Install with:  pip install numpy scipy soundfile"
    )

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
AUDIO_PATH = REPO_ROOT / "public" / "Haus_am_Werscherberg.mp3"

# Lyric entries: (current_cue_seconds, text)
# Text uses \n for line-breaks exactly as in src/App.tsx.
LYRICS: list[tuple[int, str]] = [
    (0,   "Im Haus am Werscherberg, wo Türen schwingen,\nwo Kinder durch die Gänge springen,"),
    (8,   "wo der Fußball gegen Wände prallt\nund der Tischkicker durch Räume hallt,"),
    (14,  "am Morgen man den Therapieplan erblickt,\nder Schreiner das Internet wieder flickt."),
    (26,  "Hier wohnen keine Diagnosen.\nHier wohnen Geschichten."),
    (32,  "Von denen werde ich hier kurz berichten."),
    (41,  "Ein Vater, längst im Leben weit,\nbegann erneut – nutzte seine Zeit."),
    (47,  "Nicht weil er musste.\nNicht aus Pflicht."),
    (52,  "Sondern weil sein Herz es spricht."),
    (57,  "Familie wächst nicht nur im Blut,\nsie wächst im Mut."),
    (69,  "Und im Ja, das einer wagt,\nnoch mehr im Tun, das mehr als Worte sagt."),
    (78,  "Im nächsten Zimmer dann\nträgt man mehr als Koffer ran,"),
    (90,  "mehr als Taschen, mehr als Zeit,\nsie tragen Hoffnung, Pflicht und Vergangenheit."),
    (95,  "Eltern mit Arbeit im Gepäck,\ndoch Pläne treten leis zurück,"),
    (103, "denn Arbeit lässt sich neu sortieren,\ndoch Kindheit lässt sich nicht pausieren."),
    (109, "Eine Tür weiter, Schritt für Schritt,\nrichtet jemand den Blick."),
    (116, "Nicht laut, nicht inszeniert,\naber innerlich neu justiert."),
    (124, "Man kann sich selbst ganz leise verlieren,\nzwischen Müssen und Funktionieren."),
    (138, "Und findet zurück, ganz ohne Plan,\nam Küchentisch irgendwann."),
    (144, "So wie die Tochter,\ndie macht, was sie macht."),
    (154, "Das nächste Kind rennt, als wäre es leicht,\nals hätte Angst sie nie ganz erreicht."),
    (161, "Vor Jahren stand ein Wort im Raum,\ndas keiner will, in keinem Traum."),
    (167, "Doch heute trägt sie Kleid und Glanz,\nals Anna beim Karnevalstanz."),
    (178, "Ihre Eltern teilen sich die Rehazeit\nund stehen beide für die Tochter bereit."),
    (190, "Unsere Tochter lernt mehr, als Laute sagen,\nstellt ihre Fragen ohne Fragen."),
    (196, "Und wenn wir wieder heimwärts fahren,\nbleibt etwas da aus diesen Tagen:"),
    (204, "Man wächst nicht nur\ndurch das,\nwas man sagen kann."),
]

# Window size around each current cue to search for a better onset (seconds)
SEARCH_BEFORE_S = 3.0
SEARCH_AFTER_S  = 4.0

# Gaussian weight sigma: prefer candidates close to the original cue (seconds)
PROXIMITY_SIGMA_S = 2.0


# ---------------------------------------------------------------------------
# Audio loading & feature extraction
# ---------------------------------------------------------------------------

def load_mono(path: Path) -> tuple[np.ndarray, int]:
    """Return (mono_float32_array, sample_rate)."""
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return data.mean(axis=1), sr


def rms_envelope(
    mono: np.ndarray,
    sr: int,
    hop_ms: float = 25.0,
    win_ms: float = 100.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (times_s, rms_energy) arrays."""
    hop = max(1, int(sr * hop_ms / 1000.0))
    win = max(1, int(sr * win_ms / 1000.0))
    energies, times = [], []
    for i in range(0, len(mono) - win, hop):
        rms = float(np.sqrt(np.mean(mono[i : i + win] ** 2)))
        energies.append(rms)
        times.append(i / sr)
    return np.array(times, dtype=np.float32), np.array(energies, dtype=np.float32)


# ---------------------------------------------------------------------------
# Onset refinement
# ---------------------------------------------------------------------------

def refine_cue(
    original_s: float,
    times: np.ndarray,
    smooth: np.ndarray,
    total_dur: float,
) -> int:
    """
    Find the best onset time within [original_s - SEARCH_BEFORE_S,
    original_s + SEARCH_AFTER_S] by locating the frame with the highest
    proximity-weighted positive energy derivative, then round to nearest
    integer second.
    """
    lo = max(0.0, original_s - SEARCH_BEFORE_S)
    hi = min(total_dur, original_s + SEARCH_AFTER_S)

    mask = (times[:-1] >= lo) & (times[:-1] < hi)
    w_times = times[:-1][mask]
    w_onset = np.maximum(0.0, np.diff(smooth)[mask])

    if w_onset.size < 3:
        return int(round(original_s))

    # Weight by Gaussian proximity to original cue
    weights = np.exp(-0.5 * ((w_times - original_s) / PROXIMITY_SIGMA_S) ** 2)
    best_idx = int(np.argmax(w_onset * weights))
    return int(round(float(w_times[best_idx])))


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def ts_array_js(refined: list[int]) -> str:
    return "[" + ", ".join(str(t) for t in refined) + "]"


def lyrics_js(lyrics: list[tuple[int, str]], refined: list[int]) -> str:
    lines = ["const LYRICS = ["]
    for (_, text), t in zip(lyrics, refined):
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'  {{ time: {t}, text: "{escaped}" }},')
    lines.append("];")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not AUDIO_PATH.exists():
        sys.exit(f"Audio file not found: {AUDIO_PATH}")

    print(f"Loading {AUDIO_PATH.name} …")
    mono, sr = load_mono(AUDIO_PATH)
    total_dur = len(mono) / sr
    print(f"  Duration : {total_dur:.2f} s")
    print(f"  Sample rate: {sr} Hz")
    print()

    print("Computing RMS energy envelope …")
    times, energies = rms_envelope(mono, sr)

    # Light smoothing (~250 ms) to suppress per-beat spikes
    smooth = uniform_filter1d(energies, size=10)

    print("Refining cue times …\n")
    print(f"  {'#':>2}  {'original':>8}  {'refined':>8}  {'Δ':>4}  lyric (first 50 chars)")
    print("  " + "-" * 74)

    refined: list[int] = []
    for idx, (orig_t, text) in enumerate(LYRICS):
        new_t = refine_cue(orig_t, times, smooth, total_dur)
        refined.append(new_t)
        delta = new_t - orig_t
        preview = text.replace("\n", " ")[:50]
        print(f"  {idx:>2}  {orig_t:>8}  {new_t:>8}  {delta:>+4}  \"{preview}\"")

    print()
    orig_times = [t for t, _ in LYRICS]
    changed = sum(1 for o, r in zip(orig_times, refined) if o != r)
    print(f"Changed {changed} / {len(LYRICS)} timestamps.")
    print()

    # --- Print updated LYRICS block for copy-paste into src/App.tsx ---
    print("=" * 70)
    print("Updated LYRICS array for src/App.tsx")
    print("=" * 70)
    print(lyrics_js(LYRICS, refined))
    print()

    # --- Also emit a JSON file for tooling / CI use ---
    out_json = REPO_ROOT / "scripts" / "lyrics-timings.json"
    payload = {
        "generatedBy": "scripts/analyze-mp3.py",
        "audioFile": "public/Haus_am_Werscherberg.mp3",
        "durationSeconds": round(total_dur, 2),
        "timings": [
            {"index": i, "original": orig, "refined": ref, "text": text}
            for i, ((orig, text), ref) in enumerate(zip(LYRICS, refined))
        ],
    }
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"Timings also saved to {out_json.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
