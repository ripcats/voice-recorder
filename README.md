# voice-recorder

Запись голоса в браузере: Ogg/Opus через WebCodecs и AudioWorklet, пауза и продолжение, превью.
Файл собирает `mediabunny` (RFC 3533 / RFC 7845). Пауза не создаёт отдельных файлов: все отрезки идут одним потоком.

## Использование

```js
import { createVoiceRecorder, isSupported } from 'voice-recorder'

const support = await isSupported('opus')   // { supported, issues, label, engine }

const rec = createVoiceRecorder({ engine: 'opus', autoPauseOnHidden: false })
rec.on('state', (s) => console.log(s))      // idle | recording | paused | stopped
rec.on('time', (ms) => console.log(ms))     // таймер, мс
rec.on('error', (e) => console.log(e?.message))

await rec.start()
await rec.pause()
const preview = await rec.preview()         // { blob, duration, waveform } или null
await rec.resume()
const file = await rec.stop()               // { blob, duration, waveform } или null
rec.destroy()
```

Для Vue — отдельный вход:

```js
import { useVoiceRecorder } from 'voice-recorder/vue'
const { status, elapsedMs, error, busy, preview, start, pause, resume, stop, discard } =
  useVoiceRecorder({ autoPauseOnHidden: true })
```

## Опции

| Опция | По умолчанию | Что делает |
|---|---|---|
| `engine` | `'opus'` | движок записи (реестр в `src/engines.ts`) |
| `autoPauseOnHidden` | `false` | пауза, когда вкладка уходит в фон |
| `settings.bitrate` | `32000` | битрейт Opus, бит/с |
| `settings.frameMs` | `20` | длительность кадра Opus, мс |
| `settings.pauseReleaseMs` | `30000` | через сколько отпускать микрофон на паузе |
| `settings.tailTimeoutMs` | `500` | сколько ждать остаток кадра при остановке |

## Сборка приложения

Модуль захвата `pcm-capture.worklet.js` должен остаться отдельным файлом. В Vite для этого нужна настройка
`assetsInlineLimit` (см. `vite.config.js` стенда): встроенный `data:`-URL блокируется CSP (`script-src 'self'`).

## Тесты

```bash
npm test -w voice-recorder
```

Сейчас покрыты чистая логика (волна, проверка поддержки). Тесты записи и файла нужно добавить с заглушками
`AudioEncoder`, `AudioWorklet` и `mediabunny`.

## Планы

Публикация в npm: сборка в `dist/` с типами (`.d.ts`) и явным списком файлов. Пока пакет подключается как workspace-пакет.
