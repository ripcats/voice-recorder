import type { VoiceSettings } from '../types';

/** Модуль захвата PCM (AudioWorklet): отдаёт 20-мс кадры в основной поток, где их кодирует WebCodecs.
    `new URL(..., import.meta.url)` — стандартный способ, его понимают Vite и другие сборщики. */
export const CAPTURE_WORKLET_URL = new URL('./pcm-capture.worklet.js', import.meta.url);

/** Opus через WebCodecs: режим VOIP/речь (лучше разборчивость на малом битрейте, чем «audio»). */
export const OPUS_APPLICATION = 'voip';

/** Обычные (не exact) ограничения: устройство, которое чего-то не умеет, не откажет, а запишет по-своему. Шумо- и эхоподавление включены, автоусиление выключено. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false };

/** Измеритель громкости: размер окна `AnalyserNode` и фиксированное усиление RMS (речь обычно 0.01–0.08). */
export const ANALYSER_FFT_SIZE = 512;
export const LEVEL_GAIN = 4;

/** Микрофон на паузе: `false` — отпускаем сразу. `true` — дорожки выключаются, а отпускаются через `pauseReleaseMs`. Включать только после проверки на iPhone. */
export const KEEP_MIC_ON_PAUSE = false;

/** Параметры по умолчанию. Переопределяются через `createVoiceRecorder({ settings })`. */
export const DEFAULT_SETTINGS: VoiceSettings = {
  bitrate: 32000, // Opus, моно
  frameMs: 20,
  pauseReleaseMs: 30000,
  tailTimeoutMs: 500,
};
