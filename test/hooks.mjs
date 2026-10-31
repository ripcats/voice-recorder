// Хуки для тестов (только для запуска тестов, в сборку не попадают).
// 1) Исходники пакета, как и Vite, импортируют без расширения ('./config'): дописываем .ts или /index.ts.
// 2) `mediabunny` подменяем заглушкой: тесты проверяют логику пакета, а не сам Ogg-кодер.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB_URL = 'stub:mediabunny';
const STUB_SOURCE = `
export class BufferTarget { constructor() { this.buffer = null; } }
export class OggOutputFormat {}
export class EncodedPacket { constructor(data) { this.data = data; } }
export class EncodedAudioPacketSource { constructor() {} async add() {} close() {} }
export class Output {
  constructor({ target }) { this.target = target; }
  addAudioTrack() {}
  async start() {}
  async finalize() {
    globalThis.__encodeCount = (globalThis.__encodeCount || 0) + 1;
    this.target.buffer = new ArrayBuffer(8);
  }
}
`;

export async function resolve(specifier, context, next) {
  if (specifier === 'mediabunny') return { url: STUB_URL, shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !context.parentURL || !specifier.startsWith('.')) throw error;
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    throw error;
  }
}

export async function load(url, context, next) {
  if (url === STUB_URL) return { format: 'module', source: STUB_SOURCE, shortCircuit: true };
  return next(url, context);
}
