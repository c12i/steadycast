/** Encode an AudioBuffer as a 16-bit PCM WAV ArrayBuffer. */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const ch = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const frames = buffer.length;
  const dataSize = frames * ch * 2;
  const out = new ArrayBuffer(44 + dataSize);

  const v = new DataView(out);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);

  const pcm = new Int16Array(out, 44);
  const ch0 = buffer.getChannelData(0);
  const ch1 = ch > 1 ? buffer.getChannelData(1) : ch0;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, ch0[i]));
    const r = Math.max(-1, Math.min(1, ch1[i]));
    pcm[i * 2] = l < 0 ? l * 32768 : l * 32767;
    pcm[i * 2 + 1] = r < 0 ? r * 32768 : r * 32767;
  }
  return out;
}

/** Encode an ArrayBuffer as a base64 string without mid-string padding issues. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunk)));
  }
  return btoa(parts.join(""));
}
