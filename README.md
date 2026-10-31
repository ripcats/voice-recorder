<div align="center">

# 🎙️ @ripcats/voice-recorder

**Запись голоса прямо в браузере — без серверов и без сторонних сервисов.**

Ogg/Opus через WebCodecs и AudioWorklet · пауза и продолжение · превью · реактивная обёртка для Vue

[![npm](https://img.shields.io/npm/v/@ripcats/voice-recorder?color=cb3837&logo=npm)](https://www.npmjs.com/package/@ripcats/voice-recorder)
[![npm downloads](https://img.shields.io/npm/dm/@ripcats/voice-recorder?color=cb3837&logo=npm)](https://www.npmjs.com/package/@ripcats/voice-recorder)
[![GitHub](https://img.shields.io/badge/GitHub-ripcats%2Fvoice--recorder-181717?logo=github)](https://github.com/ripcats/voice-recorder)
[![Telegram](https://img.shields.io/badge/Telegram-@ripcats-26A5E4?logo=telegram&logoColor=white)](https://t.me/ripcats)

</div>

---

## ✨ Возможности

- **Ogg/Opus прямо в браузере.** Кодирование через WebCodecs (`AudioEncoder`), без `MediaRecorder` — формат одинаковый на всех устройствах.
- **Одна запись — один файл.** Пауза не плодит отдельные файлы: все отрезки собираются в один поток.
- **Пауза и продолжение**, а также **превью** уже записанного, не останавливая запись.
- **Живая волна и громкость** — события `peaks` и `level` для визуализации во время записи.
- **Итоговая волна** в результате — готова для отрисовки сообщения.
- **Автопауза** при уходе вкладки в фон.
- **Устойчивость к прерываниям.** Звонок, Siri или отключённый микрофон не теряют записанное — запись просто встаёт на паузу.
- **Vue 3 composable** — состояние уже в `ref`.
- **Типы TypeScript** из коробки.
- **Ноль зависимостей, кроме `mediabunny`** для упаковки контейнера (RFC 3533 / RFC 7845).

---

## 📦 Установка

```bash
npm install @ripcats/voice-recorder
```

Для Vue дополнительно понадобится `vue` ≥ 3.5 (это опциональная peer-зависимость).

---

## 🚀 Быстрый старт

```js
import { createVoiceRecorder, isSupported } from '@ripcats/voice-recorder'

// 1. Проверяем, что браузер умеет писать Opus
const support = await isSupported('opus')
// → { engine: 'opus', label: 'Opus', supported: true, issues: [] }

// 2. Создаём рекордер и подписываемся на события
const rec = createVoiceRecorder({ engine: 'opus' })
rec.on('state', (s) => console.log('состояние:', s))  // idle → recording → paused → stopped
rec.on('time', (ms) => console.log('таймер:', ms))
rec.on('error', (e) => e && console.error(e.message))

// 3. Записываем
await rec.start()
await rec.pause()                    // микрофон отпущен, записанное сохранено
const preview = await rec.preview()  // послушать то, что уже есть
await rec.resume()
const file = await rec.stop()        // { blob, duration, waveform } или null

// 4. Освобождаем ресурсы, когда рекордер больше не нужен
rec.destroy()
```

---

## ⚛️ Vue 3

```vue
<script setup>
import { useVoiceRecorder } from '@ripcats/voice-recorder/vue'

const {
  status,     // 'idle' | 'recording' | 'paused' | 'stopped'
  elapsedMs,  // таймер, мс
  error,      // текст ошибки или ''
  busy,       // идёт переход состояния
  preview,    // { blob, url, durationMs, waveform } | null
  start, pause, resume, stop, discard,
} = useVoiceRecorder({ autoPauseOnHidden: true })
</script>

<template>
  <button @click="status === 'idle' ? start() : null">● Запись</button>
  <button v-if="status === 'recording'" @click="pause">⏸ Пауза</button>
  <button v-if="status === 'paused'" @click="resume">▶ Продолжить</button>
  <button v-if="status !== 'idle'" @click="stop">■ Готово</button>

  <audio v-if="preview" :src="preview.url" controls />
  <p v-if="error">{{ error }}</p>
</template>
```

`useVoiceRecorder` сам создаёт и уничтожает рекордер, отзывает `object URL` превью и подписывается на все события.

---

## 🧭 Жизненный цикл

```
           start()              pause()              stop()
  idle ───────────▶ recording ───────────▶ paused ───────────▶ stopped
    ▲                  ▲                    │  ▲                  │
    │                  └──── resume() ──────┘  │                  │
    │                                  preview()                  │
    └──────────────────────── cancel() / destroy() ◀──────────────┘
```

- `pause()` отпускает микрофон, но ничего не теряет.
- `preview()` работает только в состоянии `paused` и возвращает всё записанное к этому моменту.
- `stop()` завершает запись и возвращает готовый файл.
- Во время перехода `busy === true`, повторные вызовы игнорируются.

---

## 📚 API

### `isSupported(engine?)`

Проверяет возможности браузера для движка (по умолчанию `'opus'`).

```ts
{ engine: string; label: string; supported: boolean; issues: string[] }
```

`issues` содержит понятные причины, если что-то не работает: нет WebCodecs/Opus для записи или нет воспроизведения Ogg/Opus (тогда файл можно только скачать).

### `createVoiceRecorder(options?)`

Возвращает экземпляр рекордера.

| Метод | Возвращает | Описание |
|---|---|---|
| `start()` | `Promise<void>` | запрашивает микрофон и начинает запись |
| `pause()` | `Promise<void>` | ставит запись на паузу |
| `resume()` | `Promise<void>` | продолжает запись после паузы |
| `preview()` | `Promise<VoiceResult \| null>` | всё записанное на паузе; только в состоянии `paused` |
| `stop()` | `Promise<VoiceResult \| null>` | завершает запись и возвращает файл |
| `cancel()` | `void` | сбрасывает запись без результата |
| `prewarm()` | `void` | подготовка до нажатия на кнопку (можно вызывать многократно) |
| `destroy()` | `void` | снимает обработчики и освобождает микрофон |

Свойства: `state` и `busy` (только чтение).

### `VoiceResult`

```ts
{
  blob: Blob;        // файл audio/ogg; codecs=opus
  duration: number;  // длительность, секунды
  waveform: number[]; // 48 столбиков, значения 0–1 — для отрисовки волны
}
```

### События

| Событие | Значение | Когда |
|---|---|---|
| `state` | `RecorderState` | смена состояния |
| `time` | `number` (мс) | во время записи примерно каждые 50 мс, а также при паузе и остановке |
| `level` | `number` (0–1) | громкость, примерно каждые 50 мс |
| `peaks` | `number[]` | хвост живой волны |
| `busy` | `boolean` | начало и конец перехода состояния |
| `error` | `{ code, message } \| null` | ошибка или сброс ошибки |

Подписка возвращает функцию отписки:

```js
const off = rec.on('level', (v) => drawMeter(v))
off()
```

**Коды ошибок** в `error.code`:

- `permission` — нет доступа к микрофону;
- `interrupted` — микрофон отключился (звонок, Siri, смена устройства); запись на паузе, её можно продолжить;
- `failed` — прочие ошибки, текст в `message`.

### Опции `createVoiceRecorder`

| Опция | По умолчанию | Описание |
|---|---|---|
| `engine` | `'opus'` | движок записи (реестр — `src/engines.ts`) |
| `autoPauseOnHidden` | `false` | ставить на паузу, когда вкладка уходит в фон |
| `settings.bitrate` | `32000` | битрейт Opus, бит/с |
| `settings.frameMs` | `20` | длительность кадра Opus: 2.5, 5, 10, 20, 40 или 60 мс |
| `settings.pauseReleaseMs` | `30000` | через сколько отпускать микрофон на паузе* |
| `settings.tailTimeoutMs` | `500` | сколько ждать остаток кадра при остановке |

\* используется только если в `voice/engine/config.ts` включён `KEEP_MIC_ON_PAUSE`. По умолчанию микрофон отпускается сразу.

### Вспомогательные функции

- `preferPlaybackSession()` — **для iOS.** После записи аудиосессия остаётся `play-and-record`, и воспроизведение уходит на динамик, а не на Bluetooth. Вызовите перед проигрыванием записи.

```js
import { preferPlaybackSession } from '@ripcats/voice-recorder'

audio.addEventListener('play', preferPlaybackSession)
```

---

## 🛠️ Настройка сборки

Модуль захвата `pcm-capture.worklet.js` должен остаться **отдельным файлом**: строгий CSP (`script-src 'self'`) блокирует встроенный `data:`-URL, поэтому сборщик не должен инлайнить этот файл.

Для Vite:

```js
// vite.config.js
export default {
  build: {
    assetsInlineLimit: 0, // worklet слишком мал и иначе будет встроен как data:-URL
  },
}
```

Для других сборщиков — то же правило: файл `dist/voice/engine/pcm-capture.worklet.js` должен попасть в выдачу как отдельный ассет.

---

## 🌐 Требования к среде

- **HTTPS** (или `localhost`) — браузер разрешает доступ к микрофону только в безопасном контексте.
- **WebCodecs** с поддержкой Opus (`AudioEncoder`).
- **AudioWorklet** и **Web Audio API**.
- Воспроизведение Ogg/Opus в `<audio>` — для превью в браузере.

Проверяйте через `isSupported()` и показывайте пользователю запасной вариант (например, кнопку «скачать»), если `supported === false`.

---

## 🧪 Разработка

```bash
git clone https://github.com/ripcats/voice-recorder.git
cd voice-recorder
npm install

npm test     # тесты на node:test
npm run build  # сборка в dist/ с .d.ts
```

Тесты покрывают чистую логику: волну, проверку поддержки, сегменты, конфигурацию. Тесты записи и файла используют заглушки `AudioEncoder`, `AudioWorklet` и `mediabunny`.

Структура:

```
src/
├── index.ts              # createVoiceRecorder, isSupported (публичный API)
├── vue.ts                # useVoiceRecorder для Vue 3
├── engines.ts            # реестр движков
├── voice/
│   ├── types.ts          # публичные типы
│   ├── shared.ts         # общее: формат, волна, аудиосессия iOS
│   ├── support.ts        # проверка Opus в браузере
│   └── engine/           # движок записи, микрофон, сегменты, AudioWorklet
└── utils/
    └── ogg-opus-encoder.ts
```

Новый движок записи — одна запись в `src/engines.ts`: фабрика записи и функция проверки браузера.

---

## 🗺️ Планы

- [x] Публикация в npm с типами `.d.ts` и явным списком файлов
- [ ] Тесты записи и файла с заглушками
- [ ] Проверка на реальных iPhone и Android (сессии, Bluetooth, прерывания)

---

## 👤 Автор

**ripcats**

- ✈️ Telegram: [t.me/ripcats](https://t.me/ripcats)
- 📦 npm: [@ripcats/voice-recorder](https://www.npmjs.com/package/@ripcats/voice-recorder)
- 🐙 GitHub: [github.com/ripcats/voice-recorder](https://github.com/ripcats/voice-recorder)

Если пакет оказался полезен, поставьте ⭐ на GitHub и напишите в Telegram, если нашли баг или есть идея.
