/**
 * Общий `AudioContext` приложения и его «парковка» (iOS): создаётся один раз, между записями стоит в `suspended`
 * (устройство отпущено, индикатор микрофона не горит, аудиосессия свободна), усыпляется через `PARK_MS` простоя.
 * Состояние — в экземпляре класса, а не в глобальных переменных модуля: так его можно подменить в тестах.
 */
const PARK_MS = 4000;

export class AudioContextManager {
  private context: AudioContext | null = null;
  private users = 0; // сколько записей сейчас держат контекст запущенным
  private parkTimer = 0;

  /** Контекст; создаётся при первом обращении. Отменяет запланированную парковку. */
  get(): AudioContext {
    window.clearTimeout(this.parkTimer);
    if (!this.context || this.context.state === 'closed') {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctx();
    }
    return this.context;
  }

  /** Запись начала держать контекст запущенным. */
  addUser(): void {
    this.users++;
  }

  /** Запись перестала держать контекст. */
  removeUser(): void {
    this.users--;
  }

  /** Контекст свободен: усыпляем (не `close`) после `PARK_MS` простоя — пауза → «Продолжить» за пару секунд не будит устройство заново. */
  park(): void {
    window.clearTimeout(this.parkTimer);
    this.parkTimer = window.setTimeout(() => {
      const ctx = this.context;
      if (ctx && this.users === 0 && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, PARK_MS);
  }
}

/** Контекст приложения. Остальное (`engine.ts`) работает с ним через этот экземпляр. */
export const sharedAudioContext = new AudioContextManager();
