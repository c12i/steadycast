import { useRef, useState } from "react";
import { AppSettings, CacheStats, UserAsset } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  cacheStats: CacheStats;
  userAssets: UserAsset[];
  streamKeys: { youtube: string; twitch: string };
  onSaveSettings: (s: AppSettings) => void;
  onClearCache: (type?: string) => void;
  onRevealCache: () => void;
  onDeleteUserAsset: (id: string) => void;
  onSaveStreamKey: (platform: "youtube" | "twitch", key: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const VIDEO_BITRATES = ["1000k", "2000k", "3000k", "4500k", "6000k", "8000k"];
const AUDIO_BITRATES = ["96k", "128k", "160k", "192k", "256k", "320k"];
const FRAME_RATES = [24, 25, 30, 60];
const ENCODING_PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"];

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-3.5 h-3.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200 flex items-center justify-center text-[9px] font-bold leading-none transition-colors select-none"
        aria-label="More info"
      >
        ?
      </button>
      {visible && (
        <div className="absolute left-5 top-1/2 -translate-y-1/2 z-50 w-56 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl pointer-events-none">
          <p className="text-[11px] text-zinc-300 leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="text-xs text-zinc-400">{label}</label>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPanel({
  open,
  onClose,
  settings,
  cacheStats,
  userAssets,
  streamKeys,
  onSaveSettings,
  onClearCache,
  onRevealCache,
  onDeleteUserAsset,
  onSaveStreamKey,
}: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showYoutubeKey, setShowYoutubeKey] = useState(false);
  const [showTwitchKey, setShowTwitchKey] = useState(false);
  const [ytKeyDraft, setYtKeyDraft] = useState(streamKeys.youtube);
  const [twKeyDraft, setTwKeyDraft] = useState(streamKeys.twitch);

  // Sync drafts when panel opens
  const handleOpen = () => {
    setDraft(settings);
    setYtKeyDraft(streamKeys.youtube);
    setTwKeyDraft(streamKeys.twitch);
  };

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Panel */}
      <div
        onTransitionEnd={() => { if (open) handleOpen(); }}
        className={`fixed top-0 right-0 h-full z-50 bg-zinc-950 border-l border-zinc-800 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: 420 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 shrink-0">
          <span className="text-sm font-semibold text-zinc-100">Settings</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {/* ── Stream Quality ──────────────────────────────────────────────── */}
          <section>
            <SectionHeader>Stream Quality</SectionHeader>
            <div className="flex flex-col gap-3">
              <Row
                label="Video Bitrate"
                tooltip="Controls video quality and file size. 4500k is recommended for 1080p on YouTube. Higher values look better but require more upload bandwidth."
              >
                <select
                  value={draft.video_bitrate}
                  onChange={(e) => set("video_bitrate", e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-purple-500"
                >
                  {VIDEO_BITRATES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Row>
              <Row
                label="Audio Bitrate"
                tooltip="Quality of the music and ambient audio in the stream. 192k is transparent for most listeners. Only increase if you notice audible compression artifacts."
              >
                <select
                  value={draft.audio_bitrate}
                  onChange={(e) => set("audio_bitrate", e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-purple-500"
                >
                  {AUDIO_BITRATES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Row>
              <Row
                label="Frame Rate"
                tooltip="Frames per second sent to the streaming platform. 30 fps is the standard for lofi streams. 60 fps looks smoother but roughly doubles CPU and bandwidth usage."
              >
                <select
                  value={draft.frame_rate}
                  onChange={(e) => set("frame_rate", parseInt(e.target.value))}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-purple-500"
                >
                  {FRAME_RATES.map((r) => (
                    <option key={r} value={r}>{r} fps</option>
                  ))}
                </select>
              </Row>
              <Row
                label="Encoding Preset"
                tooltip="Speed vs. quality trade-off for the H.264 encoder. Faster presets use less CPU but produce larger files at the same bitrate. 'veryfast' is a good default for live streaming."
              >
                <select
                  value={draft.encoding_preset}
                  onChange={(e) => set("encoding_preset", e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-purple-500"
                >
                  {ENCODING_PRESETS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Row>
            </div>
          </section>

          {/* ── Stream Keys ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeader>Stream Keys</SectionHeader>
            <div className="flex flex-col gap-3">
              {/* YouTube */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">YouTube</label>
                <div className="flex gap-2">
                  <input
                    type={showYoutubeKey ? "text" : "password"}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    value={ytKeyDraft}
                    onChange={(e) => setYtKeyDraft(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-purple-500 placeholder-zinc-600 font-mono"
                  />
                  <button
                    onClick={() => setShowYoutubeKey((v) => !v)}
                    className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-400 text-xs transition-colors"
                  >
                    {showYoutubeKey ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={() => onSaveStreamKey("youtube", ytKeyDraft)}
                    className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-white text-xs font-medium transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
              {/* Twitch */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-zinc-400">Twitch</label>
                <div className="flex gap-2">
                  <input
                    type={showTwitchKey ? "text" : "password"}
                    placeholder="live_xxxxxxxxxxxx"
                    value={twKeyDraft}
                    onChange={(e) => setTwKeyDraft(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-purple-500 placeholder-zinc-600 font-mono"
                  />
                  <button
                    onClick={() => setShowTwitchKey((v) => !v)}
                    className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-400 text-xs transition-colors"
                  >
                    {showTwitchKey ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={() => onSaveStreamKey("twitch", twKeyDraft)}
                    className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-white text-xs font-medium transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Cache ───────────────────────────────────────────────────────── */}
          <section>
            <SectionHeader>Cache</SectionHeader>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-300 font-medium">
                  Total: {formatBytes(cacheStats.total_bytes)}
                </span>
                <span className="text-[10px] text-zinc-500">{cacheStats.total_files} files</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Music</span>
                  <span className="text-[11px] text-zinc-400">{formatBytes(cacheStats.music_bytes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Ambient</span>
                  <span className="text-[11px] text-zinc-400">{formatBytes(cacheStats.ambient_bytes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Video</span>
                  <span className="text-[11px] text-zinc-400">{formatBytes(cacheStats.video_bytes)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onClearCache()}
                className="px-3 py-1.5 text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 rounded transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={() => onClearCache("music")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded transition-colors"
              >
                Clear Music
              </button>
              <button
                onClick={() => onClearCache("ambient")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded transition-colors"
              >
                Clear Ambient
              </button>
              <button
                onClick={() => onClearCache("video")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded transition-colors"
              >
                Clear Video
              </button>
              <button
                onClick={onRevealCache}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded transition-colors"
              >
                Reveal Folder
              </button>
            </div>
          </section>

          {/* ── User Library ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeader>User Library</SectionHeader>
            {userAssets.length === 0 ? (
              <p className="text-xs text-zinc-600">No user uploads yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {userAssets.map((ua) => (
                  <div
                    key={ua.id}
                    className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-200 truncate">{ua.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                          {ua.asset_type}
                        </span>
                        {ua.file_size_bytes !== undefined && (
                          <span className="text-[10px] text-zinc-500">
                            {formatBytes(ua.file_size_bytes)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteUserAsset(ua.id)}
                      className="text-zinc-600 hover:text-red-400 text-xs transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── About ───────────────────────────────────────────────────────── */}
          <section>
            <SectionHeader>About</SectionHeader>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-zinc-300 font-medium">Steadycast</p>
              <p className="text-[11px] text-zinc-500">Version 0.1.0</p>
            </div>
          </section>
        </div>

        {/* Footer save button */}
        <div className="px-5 py-3.5 border-t border-zinc-800 shrink-0">
          <button
            onClick={() => {
              onSaveSettings(draft);
              onClose();
            }}
            className="w-full py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </>
  );
}
