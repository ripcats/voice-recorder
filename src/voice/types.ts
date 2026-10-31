/** Результат `pause()`/`stop()`: всё записанное одним файлом. */
export type VoiceResult = { blob: Blob; duration: number; waveform: number[] };

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

export type RecorderError = { code: 'permission' | 'interrupted' | 'failed'; message: string };

/** Настройки записи. Значения по умолчанию — в `DEFAULT_SETTINGS` (`voice/engine/config.ts`). */
export type VoiceSettings = {
  /** битрейт Opus, бит/с */
  bitrate: number;
  /** длительность кадра Opus, мс (2.5, 5, 10, 20, 40, 60) */
  frameMs: number;
  /** через сколько мс паузы отпускать микрофон (используется, только если KEEP_MIC_ON_PAUSE = true) */
  pauseReleaseMs: number;
  /** сколько ждать остаток кадра при остановке, мс */
  tailTimeoutMs: number;
};

/** События публичного рекордера. `time` — миллисекунды, `busy` — идёт переход состояния. */
export type RecorderEvents = {
  state: RecorderState;
  time: number;
  level: number;
  peaks: number[];
  busy: boolean;
  error: RecorderError | null;
};

export type VoiceRecorderOptions = {
  /** движок записи, по умолчанию `opus` */
  engine?: string;
  /** пауза, когда вкладка уходит в фон (как кнопка «Пауза») */
  autoPauseOnHidden?: boolean;
  /** переопределения настроек, остальные берутся из `DEFAULT_SETTINGS` */
  settings?: Partial<VoiceSettings>;
};

export interface VoiceRecorderInstance {
  readonly state: RecorderState;
  readonly busy: boolean;
  /** подписка на событие; возвращает функцию отписки */
  on<K extends keyof RecorderEvents>(type: K, fn: (value: RecorderEvents[K]) => void): () => void;
  start(): Promise<void>;
  /** пауза: микрофон отпускается, записанное остаётся; превью — `preview()` */
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** завершение: возвращает готовый файл или `null` (ошибка уйдёт в событие `error`) */
  stop(): Promise<VoiceResult | null>;
  /** файл всего записанного на паузе или `null`; вызывать только в состоянии `paused` */
  preview(): Promise<VoiceResult | null>;
  /** сбросить запись без результата */
  cancel(): void;
  /** подготовка по касанию (до тапа по микрофону), безопасно вызывать сколько угодно раз */
  prewarm(): void;
  /** снять обработчики, отключить автопаузу и освободить микрофон */
  destroy(): void;
}

/** Куда движок отдаёт состояние записи. Движок не знает о подписчиках: фасад превращает эти вызовы в события. */
export interface VoiceSink {
  recording(value: boolean): void;
  duration(seconds: number): void;
  /** только хвост для живой визуализации */
  peaks(values: number[]): void;
  /** мгновенная громкость 0–1 (каждые SAMPLE_MS) */
  level(value: number): void;
}

/** Движок записи. Один экземпляр — одна запись (от `start()` до `stop()`/`cancel()`, пауза внутри). */
export interface VoiceEngine {
  start(): Promise<void>;
  /** Продолжает запись после `pause()`; ничего не делает, если продолжать нечего. */
  resume(): Promise<void>;
  /** Конец отрезка без конца записи: микрофон отпущен, записанное остаётся. */
  pause(): Promise<void>;
  stop(): Promise<VoiceResult>;
  /** Всё записанное к этому моменту (без текущего отрезка). */
  preview(): Promise<VoiceResult | null>;
  /** Полный сброс без результата; безопасен на любом этапе. */
  cancel(): void;
  prewarm(): void;
  prefetch(): void;
}

export type EngineFactory = (
  sink: VoiceSink,
  opts: { settings: VoiceSettings; onInterrupt?: () => void },
) => VoiceEngine;
