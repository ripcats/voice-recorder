import { sharedAudioContext } from '../audio-context';
import { CAPTURE_WORKLET_URL } from './config';
import { loadCapture } from './recorder';

let captureModulePrefetched = false;
/** Кладёт модуль захвата (AudioWorklet, крошечный) в HTTP-кэш заранее: к первой записи он уже на диске, а не в сети. Вызывать в простое, жест не нужен. */
export function prefetchVoice(): void {
  if (captureModulePrefetched) return;
  captureModulePrefetched = true;
  fetch(CAPTURE_WORKLET_URL).then(response => response.arrayBuffer()).catch(() => {
    captureModulePrefetched = false; // не вышло (нет сети) — попробуем при следующем касании
  });
}

/** Прогрев: контекст создаётся приостановленным (микрофон не занят, индикатор не горит), модуль захвата регистрируется в нём.
 *  Жест не нужен; микрофон здесь не запрашивается. Безопасно вызывать сколько угодно раз: регистрация модуля кэшируется. */
export function warmUpVoice(): void {
  prefetchVoice();
  try {
    const ctx = sharedAudioContext.get();
    void loadCapture(ctx).catch(() => {
      /* не вышло — `start()` повторит регистрацию и покажет ошибку */
    });
    sharedAudioContext.park();
  } catch {
    /* нет Web Audio — запись всё равно сообщит об ошибке на старте */
  }
}
