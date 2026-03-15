# Steadycast

A desktop app for broadcasting lofi live streams to YouTube and Twitch without any streaming software setup.

![Stream configuration](docs/screenshot-1.png)
![Preview with playlist](docs/screenshot-2.png)

Built with Tauri, React, and a bundled FFmpeg binary.

## What it does

Steadycast takes a video loop (or still image), a music playlist, and an optional ambient sound layer, and combines them into a single RTMP stream. Everything runs locally — no external services, no OBS configuration.

## Features

**Streaming**
- Stream to YouTube or Twitch via RTMP
- Configurable video bitrate, audio bitrate, frame rate, and H.264 encoding preset
- Smooth crossfade transitions between playlist tracks (no hard cuts)
- Ambient sound layer with independent volume control
- Still image support as a video source (loops indefinitely)

**Audio**
- Music playlist with automatic track cycling
- 3-second crossfade between tracks in both the live stream and the preview
- Built-in synthesizer for generating ambient/music tracks
- Upload your own audio files

**Preview**
- In-app preview panel with live audio playback
- Pop-out preview window showing the exact video + audio mix
- Preview accurately reflects the stream output including crossfades

**Asset management**
- Upload video loops, still images, and audio files
- Organize music into playlists per stream preset
- Save and load stream presets (video, music, ambient, volume levels)
- Export and import presets via URL for sharing

**System**
- System tray with live status indicator
- "End Stream" and "Quit" tray menu actions
- On macOS, closing the window hides it rather than quitting — the app keeps running in the tray
- Cache management with per-type breakdown (music, ambient, video)
- Stream keys stored locally per platform

## Requirements

- macOS (primary target; Windows and Linux are untested)
- No external FFmpeg installation needed — it is bundled as a sidecar binary

## Development

```sh
pnpm install
pnpm tauri dev
```

```sh
pnpm tauri build
```
