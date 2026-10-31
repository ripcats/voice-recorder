import test from 'node:test';
import assert from 'node:assert/strict';
import { resampleWaveform } from '../src/voice/shared.ts';

test('пустой ввод даёт заполнитель нужной длины', () => {
  const result = resampleWaveform([], 4);
  assert.equal(result.length, 4);
  assert.ok(result.every((v) => v === 0.05));
});

test('сжимает до count столбиков и берёт максимум в каждой корзине', () => {
  assert.deepEqual(resampleWaveform([0.1, 0.9, 0.2, 0.3], 2), [0.9, 0.3]);
});

test('всегда возвращает ровно count значений', () => {
  for (const count of [1, 3, 48]) {
    const values = Array.from({ length: 100 }, (_, i) => (i % 7) / 10);
    assert.equal(resampleWaveform(values, count).length, count);
  }
});

test('значения меньше 0.05 поднимаются до 0.05', () => {
  assert.deepEqual(resampleWaveform([0.01, 0.02], 1), [0.05]);
});

test('если значений меньше count, они повторяются, а не теряются', () => {
  assert.deepEqual(resampleWaveform([0.5], 3), [0.5, 0.5, 0.5]);
});

test('одна корзина видит весь максимум записи', () => {
  assert.deepEqual(resampleWaveform([0.2, 0.8, 0.4], 1), [0.8]);
});
