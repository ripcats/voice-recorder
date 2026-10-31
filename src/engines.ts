import { createEngine } from './voice/engine/engine';
import { checkOpus } from './voice/support';
import type { EngineFactory } from './voice/types';

export type EngineEntry = { label: string; create: EngineFactory; check: () => Promise<string[]> };

/** Реестр движков. Новый движок — одна запись здесь: фабрика записи и проверка браузера. */
export const ENGINES: Record<string, EngineEntry> = {
  opus: { label: 'Opus', create: createEngine, check: checkOpus },
};

/** Что умеет браузер для движка. `supported` — всё ли есть, `issues` — список проблем. */
export async function isSupported(name = 'opus') {
  const entry = ENGINES[name];
  if (!entry) throw new Error(`Неизвестный движок: ${name}`);
  const issues = await entry.check();
  return { engine: name, label: entry.label, supported: issues.length === 0, issues };
}
