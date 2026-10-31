import { ENGINES, isSupported } from './engines';
import { DEFAULT_SETTINGS } from './voice/engine/config';
import { prefetchVoice, warmUpVoice } from './voice/engine/prewarm';
import type {
  RecorderError,
  RecorderEvents,
  RecorderState,
  VoiceEngine,
  VoiceRecorderInstance,
  VoiceRecorderOptions,
  VoiceResult,
  VoiceSettings,
  VoiceSink,
} from './voice/types';

export { isSupported };
/** iOS: вернуть аудиосессию воспроизведения перед проигрыванием записи (после записи она play-and-record). */
export { preferPlaybackSession } from './voice/shared';
export type {
  RecorderError,
  RecorderEvents,
  RecorderState,
  VoiceRecorderInstance,
  VoiceRecorderOptions,
  VoiceResult,
  VoiceSettings,
} from './voice/types';

type Handler<K extends keyof RecorderEvents> = (value: RecorderEvents[K]) => void;
type Listeners = { [K in keyof RecorderEvents]?: Handler<K>[] };

/** Создаёт рекордер. Одна запись = от `start()` до `stop()`/`cancel()`, пауза внутри. */
export function createVoiceRecorder(options: VoiceRecorderOptions = {}): VoiceRecorderInstance {
  const entry = ENGINES[options.engine ?? 'opus'];
  if (!entry) throw new Error(`Неизвестный движок: ${options.engine}`);
  const settings: VoiceSettings = { ...DEFAULT_SETTINGS, ...options.settings };

  const listeners: Listeners = {};
  let state: RecorderState = 'idle';
  let busy = false;
  let engine: VoiceEngine | null = null;
  let detachAutoPause: () => void = () => {};

  function emit<K extends keyof RecorderEvents>(type: K, value: RecorderEvents[K]): void {
    (listeners[type] as Handler<K>[] | undefined)?.forEach((fn) => fn(value));
  }
  function setState(next: RecorderState): void {
    if (next === state) return;
    state = next;
    emit('state', next);
  }
  function setBusy(value: boolean): void {
    if (value === busy) return;
    busy = value;
    emit('busy', value);
  }

  const sink: VoiceSink = {
    recording: () => {},
    duration: (seconds) => emit('time', seconds * 1000),
    peaks: (values) => emit('peaks', values),
    level: (value) => emit('level', value),
  };

  function toError(e: unknown): RecorderError {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'NotAllowedError') return { code: 'permission', message: 'Нет доступа к микрофону' };
    return { code: 'failed', message: err?.message || String(e) };
  }

  function on<K extends keyof RecorderEvents>(type: K, fn: Handler<K>): () => void {
    const list = (listeners[type] ??= []) as Handler<K>[];
    list.push(fn);
    return () => {
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    };
  }

  async function start(): Promise<void> {
    if (busy || state !== 'idle') return;
    emit('error', null);
    setBusy(true);
    prefetchVoice();
    const current = entry.create(sink, {
      settings,
      onInterrupt: () => {
        // микрофон отозвали / звонок / Siri: не теряем записанное, а ставим на паузу
        if (state !== 'recording') return;
        void pause();
        emit('error', { code: 'interrupted', message: 'Микрофон отключился. Запись на паузе, её можно продолжить' });
      },
    });
    engine = current;
    try {
      await current.start();
    } catch (e) {
      current.cancel();
      if (engine === current) engine = null;
      emit('error', toError(e));
      setBusy(false);
      return;
    }
    if (engine !== current) {
      setBusy(false); // отменили во время запуска
      return;
    }
    setState('recording');
    setBusy(false);
  }

  async function pause(): Promise<void> {
    if (state !== 'recording' || !engine || busy) return;
    setBusy(true);
    try {
      await engine.pause();
      setState('paused');
    } catch (e) {
      emit('error', toError(e));
    } finally {
      setBusy(false);
    }
  }

  async function resume(): Promise<void> {
    if (state !== 'paused' || !engine || busy) return;
    setBusy(true);
    emit('error', null);
    try {
      await engine.resume();
      setState('recording');
    } catch (e) {
      emit('error', toError(e)); // прежние отрезки остаются, можно повторить
    } finally {
      setBusy(false);
    }
  }

  async function stop(): Promise<VoiceResult | null> {
    if (busy || !engine || (state !== 'recording' && state !== 'paused')) return null;
    setBusy(true);
    const current = engine;
    engine = null;
    try {
      const result = await current.stop();
      if (!result.blob.size) throw new Error('Запись пустая');
      emit('time', result.duration * 1000);
      setState('stopped');
      return result;
    } catch (e) {
      emit('error', toError(e));
      emit('time', 0);
      setState('idle');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function preview(): Promise<VoiceResult | null> {
    if (state !== 'paused' || !engine) return null;
    const result = await engine.preview();
    return result && result.blob.size ? result : null;
  }

  function cancel(): void {
    engine?.cancel();
    engine = null;
    emit('time', 0);
    setState('idle');
  }

  function destroy(): void {
    detachAutoPause();
    engine?.cancel();
    engine = null;
    (Object.keys(listeners) as (keyof RecorderEvents)[]).forEach((key) => delete listeners[key]);
  }

  if (options.autoPauseOnHidden && typeof document !== 'undefined') {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && state === 'recording') void pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    detachAutoPause = () => document.removeEventListener('visibilitychange', onVisibility);
  }

  return {
    get state() {
      return state;
    },
    get busy() {
      return busy;
    },
    on,
    start,
    pause,
    resume,
    stop,
    preview,
    cancel,
    prewarm: warmUpVoice,
    destroy,
  };
}
