import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { createVoiceRecorder } from './index';
import type { RecorderState, VoiceRecorderOptions, VoiceResult } from './voice/types';

// Привязка к Vue: состояние рекордера в refs. Файл превью оборачивается в object URL (создаётся и отзывается здесь).
type Preview = { blob: Blob; url: string; durationMs: number; waveform: number[] } | null;

export function useVoiceRecorder(options: VoiceRecorderOptions = {}) {
  const recorder = createVoiceRecorder(options);
  const status = ref<RecorderState>('idle');
  const elapsedMs = ref(0);
  const error = ref('');
  const busy = ref(false);
  const preview = shallowRef<Preview>(null);

  function setPreview(result: VoiceResult | null): void {
    if (preview.value) URL.revokeObjectURL(preview.value.url);
    preview.value = result && result.blob.size
      ? { blob: result.blob, url: URL.createObjectURL(result.blob), durationMs: result.duration * 1000, waveform: result.waveform }
      : null;
  }

  recorder.on('state', async (next) => {
    status.value = next;
    if (next === 'paused') setPreview(await recorder.preview()); // в том числе при автопаузе и прерывании микрофона
    if (next === 'recording') setPreview(null);
    if (next === 'idle') setPreview(null);
  });
  recorder.on('time', (ms) => (elapsedMs.value = ms));
  recorder.on('busy', (value) => (busy.value = value));
  recorder.on('error', (e) => (error.value = e?.message ?? ''));

  async function stop(): Promise<void> {
    const result = await recorder.stop();
    if (result) setPreview(result);
  }

  onBeforeUnmount(() => {
    recorder.destroy();
    if (preview.value) URL.revokeObjectURL(preview.value.url);
  });

  return {
    status,
    elapsedMs,
    error,
    busy,
    preview,
    start: () => recorder.start(),
    pause: () => recorder.pause(),
    resume: () => recorder.resume(),
    stop,
    discard: () => {
      recorder.cancel();
      setPreview(null);
    },
    prewarm: () => recorder.prewarm(),
  };
}
