export async function loadAudioBuffer(
  url: string,
  offlineCtx: OfflineAudioContext,
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Audio request failed (${response.status}) for ${url}`);
  }
  return offlineCtx.decodeAudioData(await response.arrayBuffer());
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const pcm = channels === 2
    ? interleave(buffer.getChannelData(0), buffer.getChannelData(1))
    : buffer.getChannelData(0) ?? new Float32Array();

  const bytes = pcm.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bytes, true);

  for (let index = 0, offset = 44; index < pcm.length; index += 1, offset += 2) {
    const rawSample = pcm[index] ?? 0;
    const sample = Math.max(-1, Math.min(1, rawSample));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const result = new Float32Array(left.length + right.length);
  for (let index = 0; index < left.length; index += 1) {
    result[index * 2] = left[index] ?? 0;
    result[index * 2 + 1] = right[index] ?? 0;
  }
  return result;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
