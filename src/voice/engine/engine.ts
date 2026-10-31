import type { VoiceRecorder as Recorder } from './recorder';
import { sharedAudioContext } from '../audio-context';
import { preferRecordSession } from '../shared';
import type { EngineFactory, VoiceResult } from '../types';
import { KEEP_MIC_ON_PAUSE } from './config';
import { isStreamLive, requestMicrophone, setTracksEnabled, stopStream, watchInterrupt } from './microphone';
import { createMeter } from './meter';
import { closeRecorder, createRecorder, discardRecorder, stopRecorder } from './recorder';
import { createSegments } from './segments';
import { prefetchVoice, warmUpVoice } from './prewarm';

/**
 * Движок записи (Ogg/Opus через WebCodecs, захват PCM в AudioWorklet, живая волна через AudioContext).
 * start() → запрашивает микрофон и начинает запись;
 * pause() → конец отрезка, микрофон отпущен, записанное остаётся;
 * resume() → новый отрезок дописывается к прежним пакетам, время и волна идут дальше;
 * preview() → файл всего записанного к этому моменту (на паузе);
 * stop() → заканчивает запись и возвращает файл;
 * cancel() → сбрасывает всё без возврата данных; безопасен и пока микрофон ещё запрашивается.
 * Рекордер ничего не останавливает сам — решает вызывающий.
 */
export const createEngine: EngineFactory = (sink, { onInterrupt, settings }) => {
  let isRecording = false;
  const setRecording = (value: boolean): void => {
    isRecording = value;
    sink.recording(value);
  };

  const meter = createMeter(sink);
  const segments = createSegments(settings);
  let recorder: Recorder | null = null;
  let stream: MediaStream | null = null;
  let token = 0; // растёт при cancel/cleanup: отменяет start, который ещё ждёт микрофон
  let holding = false; // эта запись держит общий контекст запущенным
  let held = false; // пауза с живым (выключенным) микрофоном — см. KEEP_MIC_ON_PAUSE
  let holdTimer = 0;

  async function start(): Promise<void> {
    await begin(false);
  }

  /** Продолжает запись после pause(); ничего не делает, если продолжать нечего. */
  async function resume(): Promise<void> {
    if (segments.isEmpty()) return;
    await begin(true);
  }

  async function begin(resuming: boolean): Promise<void> {
    if (isRecording) return;
    if (held && !isStreamLive(stream)) release(); // удерживаемый микрофон пропал за время паузы — берём заново
    const reuse = resuming && held && !!stream;
    const myToken = ++token;
    preferRecordSession();
    // контекст будится синхронно, внутри жеста (iOS), и параллельно с запросом микрофона
    const ctx = sharedAudioContext.get();
    if (!holding) {
      sharedAudioContext.addUser();
      holding = true;
    }
    let media: MediaStream;
    try {
      if (reuse && stream) {
        window.clearTimeout(holdTimer);
        held = false;
        media = stream;
        setTracksEnabled(media, true);
        if (ctx.state !== 'running') await ctx.resume();
      } else [media] = await Promise.all([requestMicrophone(), ctx.state === 'running' ? Promise.resolve() : ctx.resume()]);
    } catch (error) {
      if (myToken === token) release(); // отказ в микрофоне: контекст снова паркуем
      throw error;
    }
    if (myToken !== token) {
      // пока ждали разрешение, запись отменили
      stopStream(media, false);
      return;
    }
    stream = media;
    // микрофон выключили / он пропал: сообщаем наверх (только во время записи)
    watchInterrupt(media, () => {
      if (isRecording) onInterrupt?.();
    });

    const source = meter.attach(ctx, media, reuse);
    const rec = createRecorder(source, settings);
    recorder = rec;
    if (!resuming) {
      meter.reset();
      segments.reset();
    }
    try {
      await rec.start();
    } catch (error) {
      if (myToken === token) {
        if (resuming) release(); // продолжить не вышло: прежние отрезки остаются
        else cleanup();
      }
      throw error;
    }
    if (myToken !== token) return; // пока стартовал воркер, запись отменили
    setRecording(true);
    segments.markStart();
    sink.duration(segments.elapsed());
    meter.start(() => sink.duration(segments.now()));
  }

  /** Останавливает текущий отрезок. `final` — запись закончена (всё сбрасывается и возвращается файл); иначе пауза: отрезок остаётся. */
  async function finish(final: boolean): Promise<VoiceResult | null> {
    const rec = recorder;
    if (!rec || !isRecording) {
      // на паузе рекордера уже нет, но записанные отрезки остались: завершаем их, а не теряем
      if (final && !segments.isEmpty()) {
        const result = await segments.build(meter.getSamples(), segments.elapsed());
        cleanup();
        return result;
      }
      if (final) cleanup();
      return emptyResult();
    }
    const data = await stopRecorder(rec);
    segments.append(data);
    const duration = segments.now();
    if (final) {
      const result = await segments.build(meter.getSamples(), duration);
      cleanup();
      return result;
    }
    segments.commit(duration);
    if (KEEP_MIC_ON_PAUSE) hold();
    else release();
    sink.duration(duration);
    return null;
  }

  const pause = async (): Promise<void> => {
    await finish(false);
  };

  const stop = async (): Promise<VoiceResult> => (await finish(true)) ?? emptyResult();

  /** Файл всего записанного к этому моменту. Строится заново только если появились новые пакеты (см. `segments.build`). */
  async function preview(): Promise<VoiceResult | null> {
    if (segments.isEmpty()) return null;
    return segments.build(meter.getSamples(), segments.elapsed());
  }

  function cancel(): void {
    if (recorder) discardRecorder(recorder);
    cleanup();
  }

  /** Пауза с живым микрофоном: рекордер закрыт, дорожки выключены, поток остаётся для быстрого «Продолжить». */
  function hold(): void {
    token++;
    meter.stop();
    closeRecorder(recorder);
    recorder = null;
    setTracksEnabled(stream, false);
    held = true;
    setRecording(false);
    sink.level(0);
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(release, settings.pauseReleaseMs); // ушли надолго — микрофон отпускаем
  }

  /** Отпускает микрофон и рекордер; записанные отрезки, время и замеры громкости остаются (пауза). */
  function release(): void {
    token++;
    meter.stop();
    window.clearTimeout(holdTimer);
    held = false;
    closeRecorder(recorder);
    meter.detach();
    stopStream(stream); // собственная остановка дорожки не должна считаться прерыванием
    stream = null;
    if (holding) {
      holding = false;
      sharedAudioContext.removeUser();
    }
    recorder = null;
    setRecording(false);
    sink.level(0);
    sharedAudioContext.park(); // общий контекст не закрываем, а усыпляем
  }

  /** Полный сброс: микрофон, отрезки, время, волна. */
  function cleanup(): void {
    release();
    segments.reset();
    meter.reset();
    sink.duration(0);
    meter.clearPeaks();
  }

  return { start, resume, pause, stop, preview, cancel, prewarm: warmUpVoice, prefetch: prefetchVoice };
};

function emptyResult(): VoiceResult {
  return { blob: new Blob(), duration: 0, waveform: [] };
}
