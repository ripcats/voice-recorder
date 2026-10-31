import test from 'node:test';
import assert from 'node:assert/strict';
import { createSegments } from '../src/voice/engine/segments.ts';
import { DEFAULT_SETTINGS } from '../src/voice/engine/config.ts';

const segment = (count = 1) => ({
  packets: Array.from({ length: count }, () => new Uint8Array([1, 2, 3])),
  meta: { decoderConfig: { description: new Uint8Array(19) } },
});
const samples = [0.2, 0.4, 0.6];

test('сразу после создания записи нет', () => {
  assert.equal(createSegments(DEFAULT_SETTINGS).isEmpty(), true);
});

test('append(null) ничего не добавляет', () => {
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.append(null);
  assert.equal(segments.isEmpty(), true);
});

test('append добавляет пакеты, отрезки идут одним списком', () => {
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.append(segment(2));
  segments.append(segment(3));
  assert.equal(segments.isEmpty(), false);
});

test('build без пакетов даёт пустой blob и волну из заглушек', async () => {
  const result = await createSegments(DEFAULT_SETTINGS).build(samples, 0);
  assert.equal(result.blob.size, 0);
  assert.equal(result.waveform.length, 48);
});

test('build собирает файл и возвращает волну на 48 столбиков', async () => {
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.append(segment(2));
  const result = await segments.build(samples, 1.5);
  assert.ok(result.blob.size > 0);
  assert.equal(result.duration, 1.5);
  assert.equal(result.waveform.length, 48);
});

test('повторный build без новых пакетов берёт кэш (кодер не запускается снова)', async () => {
  globalThis.__encodeCount = 0;
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.append(segment(2));
  const first = await segments.build(samples, 1);
  const second = await segments.build(samples, 1);
  assert.equal(globalThis.__encodeCount, 1);
  assert.equal(first.blob, second.blob);
});

test('новый отрезок сбрасывает кэш: файл пересобирается', async () => {
  globalThis.__encodeCount = 0;
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.append(segment(2));
  await segments.build(samples, 1);
  segments.append(segment(1));
  await segments.build(samples, 2);
  assert.equal(globalThis.__encodeCount, 2);
});

test('commit фиксирует длительность записанного на паузе', () => {
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.commit(12.5);
  assert.equal(segments.elapsed(), 12.5);
});

test('reset очищает пакеты, время и кэш', async () => {
  const segments = createSegments(DEFAULT_SETTINGS);
  segments.append(segment(1));
  segments.commit(5);
  await segments.build(samples, 5);
  segments.reset();
  assert.equal(segments.isEmpty(), true);
  assert.equal(segments.elapsed(), 0);
  assert.equal((await segments.build(samples, 0)).blob.size, 0);
});
