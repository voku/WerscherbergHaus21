import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Info, X, Volume2, Volume1, VolumeX } from 'lucide-react';

// Cue times (seconds) were derived from RMS-energy onset analysis of
// public/Haus_am_Werscherberg.mp3 using scripts/analyze-mp3.py.
const LYRICS = [
  { time: 0,   text: "Im Haus am Werscherberg, wo Türen schwingen,\nwo Kinder durch die Gänge springen," },
  { time: 10,  text: "wo der Fußball gegen Wände prallt\nund der Tischkicker durch Räume hallt," },
  { time: 14,  text: "am Morgen man den Therapieplan erblickt,\nder Schreiner das Internet wieder flickt." },
  { time: 26,  text: "Hier wohnen keine Diagnosen.\nHier wohnen Geschichten." },
  { time: 32,  text: "Von denen werde ich hier kurz berichten." },
  { time: 40,  text: "Ein Vater, längst im Leben weit,\nbegann erneut – nutzte seine Zeit." },
  { time: 47,  text: "Nicht weil er musste.\nNicht aus Pflicht." },
  { time: 53,  text: "Sondern weil sein Herz es spricht." },
  { time: 56,  text: "Familie wächst nicht nur im Blut,\nsie wächst im Mut." },
  { time: 69,  text: "Und im Ja, das einer wagt,\nnoch mehr im Tun, das mehr als Worte sagt." },
  { time: 78,  text: "Im nächsten Zimmer dann\nträgt man mehr als Koffer ran," },
  { time: 90,  text: "mehr als Taschen, mehr als Zeit,\nsie tragen Hoffnung, Pflicht und Vergangenheit." },
  { time: 94,  text: "Eltern mit Arbeit im Gepäck,\ndoch Pläne treten leis zurück," },
  { time: 102, text: "denn Arbeit lässt sich neu sortieren,\ndoch Kindheit lässt sich nicht pausieren." },
  { time: 108, text: "Eine Tür weiter, Schritt für Schritt,\nrichtet jemand den Blick." },
  { time: 116, text: "Nicht laut, nicht inszeniert,\naber innerlich neu justiert." },
  { time: 124, text: "Man kann sich selbst ganz leise verlieren,\nzwischen Müssen und Funktionieren." },
  { time: 139, text: "Und findet zurück, ganz ohne Plan,\nam Küchentisch irgendwann." },
  { time: 145, text: "So wie die Tochter,\ndie macht, was sie macht." },
  { time: 154, text: "Das nächste Kind rennt, als wäre es leicht,\nals hätte Angst sie nie ganz erreicht." },
  { time: 160, text: "Vor Jahren stand ein Wort im Raum,\ndas keiner will, in keinem Traum." },
  { time: 166, text: "Doch heute trägt sie Kleid und Glanz,\nals Anna beim Karnevalstanz." },
  { time: 179, text: "Ihre Eltern teilen sich die Rehazeit\nund stehen beide für die Tochter bereit." },
  { time: 191, text: "Unsere Tochter lernt mehr, als Laute sagen,\nstellt ihre Fragen ohne Fragen." },
  { time: 195, text: "Und wenn wir wieder heimwärts fahren,\nbleibt etwas da aus diesen Tagen:" },
  { time: 202, text: "Man wächst nicht nur\ndurch das,\nwas man sagen kann." },
];

const FALLBACK_DURATION = 244;
const NUM_BARS = 48;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCenteredScrollTop(container: HTMLElement, element: HTMLElement) {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const targetScrollTop =
    element.offsetTop + element.offsetHeight / 2 - container.clientHeight / 2;

  return clamp(targetScrollTop, 0, maxScrollTop);
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(FALLBACK_DURATION);
  const [volume, setVolume] = useState(0.8);
  const [showInfo, setShowInfo] = useState(false);
  const [hoverVolume, setHoverVolume] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverTimePos, setHoverTimePos] = useState<number>(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [isBeat, setIsBeat] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const beatCooldownRef = useRef<number>(0);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBeatRef = useRef(false);

  // Initialise the Web Audio API graph (must be called from a user-gesture handler)
  const initAudioContext = () => {
    if (audioContextRef.current || !audioRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;

    const source = ctx.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
  };

  // Spectrum visualiser + beat detection using Web Audio API AnalyserNode
  useEffect(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext('2d') ?? null;

    if (!isPlaying || !analyser || !canvas || !canvasCtx) {
      cancelAnimationFrame(animFrameRef.current);
      // Draw flat idle bars when paused
      if (canvas && canvasCtx) {
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        const barW = canvas.width / NUM_BARS;
        canvasCtx.fillStyle = 'rgba(255,255,255,0.08)';
        for (let i = 0; i < NUM_BARS; i++) {
          canvasCtx.fillRect(i * barW + 1, canvas.height - 2, barW - 2, 2);
        }
      }
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      // Draw spectrum bars
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      const barW = canvas.width / NUM_BARS;
      for (let i = 0; i < NUM_BARS; i++) {
        // Map bar index to a frequency bin, using the lower 70 % of the spectrum (musical range)
        const binIndex = Math.floor((i / NUM_BARS) * bufferLength * 0.7);
        const value = dataArray[binIndex];
        const barHeight = Math.max(2, (value / 255) * canvas.height);
        const x = i * barW + 1;
        const gradient = canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(251,191,36,0.9)');  // amber-400
        gradient.addColorStop(1, 'rgba(234,88,12,0.9)');   // orange-600
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barW - 2, barHeight);
      }

      // Beat detection: average the bass frequency bins (lowest ~15 % of spectrum)
      const bassEnd = Math.floor(bufferLength * 0.15);
      let bassSum = 0;
      for (let i = 0; i < bassEnd; i++) bassSum += dataArray[i];
      const bassAvg = bassEnd > 0 ? bassSum / bassEnd : 0;

      const now = Date.now();
      if (bassAvg > 140 && now - beatCooldownRef.current > 300 && !isBeatRef.current) {
        beatCooldownRef.current = now;
        isBeatRef.current = true;
        setIsBeat(true);
        if (beatTimerRef.current !== null) clearTimeout(beatTimerRef.current);
        beatTimerRef.current = setTimeout(() => {
          isBeatRef.current = false;
          beatTimerRef.current = null;
          setIsBeat(false);
        }, 150);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // MediaSession API — expose rich metadata and playback controls to the OS
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Haus am Werscherberg',
      artist: 'Northern Viking Epic',
      artwork: [
        { src: `${import.meta.env.BASE_URL}cover.jpg`, sizes: '512x512', type: 'image/jpeg' },
      ],
    });

    // Use audioRef directly to avoid stale-closure problems in these handlers
    navigator.mediaSession.setActionHandler('play', () => {
      initAudioContext();
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const offset = details.seekOffset ?? 10;
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - offset);
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const offset = details.seekOffset ?? 10;
      if (audioRef.current) {
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration || FALLBACK_DURATION,
          audioRef.current.currentTime + offset,
        );
      }
    });
  }, []);

  // Keep the OS playback indicator in sync
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingProgress && progressBarRef.current) {
        const rect = progressBarRef.current.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const newTime = Math.max(0, Math.min(pos * duration, duration));
        setCurrentTime(newTime);
        if (audioRef.current) {
          audioRef.current.currentTime = newTime;
        }
      }
      if (isDraggingVolume && volumeBarRef.current) {
        const rect = volumeBarRef.current.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        setVolume(Math.max(0, Math.min(pos, 1)));
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingProgress(false);
      setIsDraggingVolume(false);
    };

    if (isDraggingProgress || isDraggingVolume) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingProgress, isDraggingVolume]);

  const activeLyricIndex = LYRICS.findIndex((lyric, index) => {
    const nextLyric = LYRICS[index + 1];
    return currentTime >= lyric.time && (!nextLyric || currentTime < nextLyric.time);
  });

  useEffect(() => {
    const container = lyricsContainerRef.current;
    const activeElement = activeLyricIndex === -1 ? null : lyricRefs.current[activeLyricIndex];

    if (!container || !activeElement) return;

    const activeLyric = LYRICS[activeLyricIndex];
    const nextLyric = LYRICS[activeLyricIndex + 1];
    const activeScrollTop = getCenteredScrollTop(container, activeElement);

    if (!nextLyric) {
      container.scrollTop = activeScrollTop;
      return;
    }

    const nextElement = lyricRefs.current[activeLyricIndex + 1];
    if (!nextElement) {
      container.scrollTop = activeScrollTop;
      return;
    }

    const segmentDuration = nextLyric.time - activeLyric.time;
    const segmentProgress = segmentDuration > 0
      ? clamp((currentTime - activeLyric.time) / segmentDuration, 0, 1)
      : 0;
    const nextScrollTop = getCenteredScrollTop(container, nextElement);

    container.scrollTop = activeScrollTop + (nextScrollTop - activeScrollTop) * segmentProgress;
  }, [activeLyricIndex, currentTime]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const newTime = Math.max(0, Math.min(pos * duration, duration));
      setCurrentTime(newTime);
      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
      }
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingProgress(true);
    handleProgressClick(e);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      setHoverTimePos(Math.max(0, Math.min(pos, 1)));
      setHoverTime(Math.max(0, Math.min(pos * duration, duration)));
    }
  };

  const handleProgressMouseLeave = () => {
    setHoverTime(null);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (volumeBarRef.current) {
      const rect = volumeBarRef.current.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      setVolume(Math.max(0, Math.min(pos, 1)));
    }
  };

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingVolume(true);
    handleVolumeClick(e);
  };

  const handleVolumeMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (volumeBarRef.current) {
      const rect = volumeBarRef.current.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      setHoverVolume(Math.max(0, Math.min(pos, 1)));
      setHoverPos(Math.max(0, Math.min(pos, 1)));
    }
  };

  const handleVolumeMouseLeave = () => {
    setHoverVolume(null);
  };

  const seekBy = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const toggleMute = () => {
    if (volume > 0) {
      setVolume(0);
    } else {
      setVolume(0.8);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0f14] text-neutral-200 font-sans overflow-hidden relative flex items-center justify-center selection:bg-orange-500/30">
      {/* Audio Element */}
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}Haus_am_Werscherberg.mp3`}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (d && isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          if (!isDraggingProgress) {
            setCurrentTime(e.currentTarget.currentTime);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      {/* Atmospheric Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-blue-900/10 blur-[120px] mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-orange-900/10 blur-[120px] mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] rounded-full bg-amber-700/10 blur-[100px] mix-blend-screen"></div>
      </div>

      <div className="z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12 flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12 items-center h-full lg:max-h-[100dvh] overflow-y-auto lg:overflow-hidden">
        
        {/* Player Section */}
        <div className="flex flex-col items-center lg:items-start space-y-6 lg:space-y-8 lg:col-span-5 relative w-full max-w-md mx-auto lg:max-w-none pt-4 lg:pt-0">
          
          {/* Info Button */}
          <button 
            onClick={() => setShowInfo(true)}
            className="absolute -top-2 -right-2 lg:top-0 lg:-right-4 p-2 text-neutral-500 hover:text-white transition-colors z-20"
            title="Track Info"
          >
            <Info size={24} />
          </button>

          {/* Album Art */}
          <div className="relative w-56 h-56 sm:w-72 sm:h-72 lg:w-96 lg:h-96 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/5 group shrink-0">
            <img 
              src={`${import.meta.env.BASE_URL}cover.jpg`} 
              alt="Haus am Werscherberg" 
              className={`w-full h-full object-cover transition-transform duration-[20s] ease-linear ${isPlaying ? 'scale-110' : 'scale-100'}`}
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f14] via-transparent to-transparent opacity-80"></div>
            
            {/* Play overlay for paused state on image */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => { initAudioContext(); setIsPlaying(true); }}>
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20">
                  <Play size={36} className="text-white ml-2" fill="currentColor" />
                </div>
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="text-center lg:text-left w-full px-4 lg:px-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-white mb-2 lg:mb-3 tracking-wide drop-shadow-lg">Haus am Werscherberg</h1>
            <p className="text-orange-500/80 text-xs sm:text-sm tracking-[0.2em] uppercase font-medium">Northern Viking Epic</p>
          </div>

          {/* Controls */}
          <div className="w-full bg-white/[0.03] backdrop-blur-2xl rounded-3xl p-5 sm:p-6 border border-white/5 shadow-2xl">
            {/* Progress Bar */}
            <div className="mb-6">
              <div 
                ref={progressBarRef}
                className="h-6 flex items-center cursor-pointer relative group"
                onMouseDown={handleProgressMouseDown}
                onMouseMove={handleProgressMouseMove}
                onMouseLeave={handleProgressMouseLeave}
              >
                {/* Hover Tooltip */}
                {hoverTime !== null && (
                  <div 
                    className="absolute bottom-full mb-0 -translate-x-1/2 px-2 py-1 bg-neutral-800 text-white text-[10px] font-mono rounded whitespace-nowrap pointer-events-none border border-white/10 z-10"
                    style={{ left: `${hoverTimePos * 100}%` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
                <div className="w-full h-1.5 bg-white/10 rounded-full relative">
                  <div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-600 to-amber-400 rounded-full transition-all duration-100 ease-linear"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,165,0,1)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-neutral-500 mt-1 font-mono tracking-wider">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Spectrum Visualiser (Web Audio API AnalyserNode) */}
            <canvas
              ref={canvasRef}
              width={400}
              height={40}
              className="w-full h-8 rounded mb-4"
              aria-hidden="true"
            />

            {/* Buttons */}
            <div className="flex items-center justify-between px-2">
              <button className="text-neutral-500 hover:text-white transition-colors">
                <Shuffle size={20} />
              </button>
              <button 
                className="text-neutral-300 hover:text-orange-400 transition-colors"
                onClick={() => seekBy(-10)}
              >
                <SkipBack size={28} fill="currentColor" />
              </button>
              <button 
                className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                onClick={() => {
                  initAudioContext();
                  setIsPlaying(!isPlaying);
                }}
              >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
              </button>
              <button 
                className="text-neutral-300 hover:text-orange-400 transition-colors"
                onClick={() => seekBy(10)}
              >
                <SkipForward size={28} fill="currentColor" />
              </button>
              <button className="text-neutral-500 hover:text-white transition-colors">
                <Repeat size={20} />
              </button>
            </div>

            {/* Volume Control */}
            <div className="mt-8 flex items-center space-x-4 px-2">
              <button onClick={toggleMute} className="text-neutral-500 hover:text-white transition-colors relative group/mute">
                {volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 text-white text-[10px] font-mono rounded opacity-0 group-hover/mute:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
                  {volume === 0 ? 'Unmute' : 'Mute'}
                </div>
              </button>
              <div 
                ref={volumeBarRef}
                className="flex-1 h-6 flex items-center cursor-pointer relative group"
                onMouseDown={handleVolumeMouseDown}
                onMouseMove={handleVolumeMouseMove}
                onMouseLeave={handleVolumeMouseLeave}
              >
                {/* Hover Tooltip */}
                {hoverVolume !== null && (
                  <div 
                    className="absolute bottom-full mb-0 -translate-x-1/2 px-2 py-1 bg-neutral-800 text-white text-[10px] font-mono rounded whitespace-nowrap pointer-events-none border border-white/10 z-10"
                    style={{ left: `${hoverPos * 100}%` }}
                  >
                    {Math.round(hoverVolume * 100)}%
                  </div>
                )}
                <div className="w-full h-1.5 bg-white/10 rounded-full relative">
                  <div 
                    className="absolute top-0 left-0 h-full bg-neutral-400 group-hover:bg-orange-400 rounded-full transition-all duration-100 ease-linear"
                    style={{ width: `${volume * 100}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lyrics Section */}
        <div className="h-[40vh] sm:h-[50vh] lg:h-[85vh] w-full relative overflow-hidden mask-image-linear-gradient lg:col-span-7 mt-4 lg:mt-0">
          <div 
            className="absolute inset-0 overflow-y-auto scrollbar-hide pb-[50vh] pt-[10vh] lg:pt-[30vh] px-4 lg:px-12"
            ref={lyricsContainerRef}
          >
            <div className="flex flex-col space-y-8 lg:space-y-12">
              {LYRICS.map((lyric, idx) => {
                const isActive = idx === activeLyricIndex;
                const isPast = idx < activeLyricIndex;
                
                return (
                  <p 
                    key={idx}
                    ref={(element) => {
                      lyricRefs.current[idx] = element;
                    }}
                    className={`text-xl sm:text-2xl lg:text-4xl font-serif leading-relaxed transition-all duration-1000 cursor-pointer ${
                      isActive 
                        ? `text-white text-shadow-glow origin-left opacity-100 ${isBeat ? 'scale-[1.08]' : 'scale-105'}` 
                        : isPast 
                          ? 'text-neutral-600 hover:text-neutral-400 opacity-60' 
                          : 'text-neutral-700 hover:text-neutral-400 opacity-40'
                    }`}
                    onClick={() => {
                      initAudioContext();
                      setCurrentTime(lyric.time);
                      if (audioRef.current) audioRef.current.currentTime = lyric.time;
                      setIsPlaying(true);
                    }}
                  >
                    {lyric.text.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {line}
                        <br />
                      </React.Fragment>
                    ))}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowInfo(false)}>
          <div 
            className="bg-[#121820] border border-white/10 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <button 
              className="absolute top-6 right-6 text-neutral-500 hover:text-white transition-colors"
              onClick={() => setShowInfo(false)}
            >
              <X size={24} />
            </button>
            <h2 className="text-2xl font-serif font-bold text-white mb-4">Track Info</h2>
            <div className="space-y-4 text-neutral-300 leading-relaxed">
              <p>
                Ein Northern-Viking-Track beginnt mit donnernden Kriegstrommeln und tiefen, dröhnenden Hörnern.
              </p>
              <p>
                Mehrstimmige Männergesänge, raue Streicher und knochenerschütternde Percussion sorgen für zusätzlichen Schwung.
              </p>
              <p>
                Schwere, rhythmische Tribal-Beats, spannungsgeladene Maultrommel und eindringliche Flötenklänge schaffen eine atmosphärische und epische Kulisse.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
