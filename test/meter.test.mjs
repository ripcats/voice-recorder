import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeter } from '../src/voice/engine/meter.ts';

// Аналайзер с постоянным сигналом: отклонение от 128 даёт RMS 4/128 = 0.03125, усиление ×4 → уровень 0.125
function fakeContext(byteValue = 132) {
  const analyser = {
    fftSize: 512,
    getByteTimeDomainData(buffer) { buffer.fill(byteValue); },
    connect() {}, disconnect() {},
  };
  return {
    createAnalyser: () => analyser,
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  };
}

function setup(t) {
  globalThis.window = globalThis;
  t.mock.timers.enable({ apis: ['setInterval'] });
}

test('замеры накапливаются каждые 50 мс', (t) => {
  setup(t);
  const sink = { level() {}, peaks() {} };
  const meter = createMeter(sink);
  meter.attach(fakeContext(), {}, false);
  meter.start(() => {});
  t.mock.timers.tick(150);
  assert.equal(meter.getSamples().length, 3);
  meter.stop();
});

test('уровень считается из RMS и усиливается ×4', (t) => {
  setup(t);
  const levels = [];
  const meter = createMeter({ level: (v) => levels.push(v), peaks() {} });
  meter.attach(fakeContext(132), {}, false);
  meter.start(() => {});
  t.mock.timers.tick(50);
  meter.stop();
  assert.ok(Math.abs(levels[0] - 0.125) < 1e-9);
});

test('уровень не выходит за 1', (t) => {
  setup(t);
  const levels = [];
  const meter = createMeter({ level: (v) => levels.push(v), peaks() {} });
  meter.attach(fakeContext(255), {}, false);
  meter.start(() => {});
  t.mock.timers.tick(50);
  meter.stop();
  assert.equal(levels[0], 1);
});

test('столбики живой волны появляются раз в два замера (100 мс)', (t) => {
  setup(t);
  const peaks = [];
  const meter = createMeter({ level() {}, peaks: (v) => peaks.push(v) });
  meter.attach(fakeContext(), {}, false);
  meter.start(() => {});
  t.mock.timers.tick(100);
  meter.stop();
  const last = peaks[peaks.length - 1];
  assert.equal(last.length, 1);
});

test('onTick вызывается на каждом замере (для таймера записи)', (t) => {
  setup(t);
  let ticks = 0;
  const meter = createMeter({ level() {}, peaks() {} });
  meter.attach(fakeContext(), {}, false);
  meter.start(() => ticks++);
  t.mock.timers.tick(100);
  meter.stop();
  assert.equal(ticks, 2);
});

test('reset очищает замеры и столбики', (t) => {
  setup(t);
  const meter = createMeter({ level() {}, peaks() {} });
  meter.attach(fakeContext(), {}, false);
  meter.start(() => {});
  t.mock.timers.tick(100);
  meter.stop();
  meter.reset();
  assert.equal(meter.getSamples().length, 0);
});

test('stop останавливает замеры: после паузы сэмплы не растут', (t) => {
  setup(t);
  const meter = createMeter({ level() {}, peaks() {} });
  meter.attach(fakeContext(), {}, false);
  meter.start(() => {});
  t.mock.timers.tick(100);
  meter.stop();
  t.mock.timers.tick(500);
  assert.equal(meter.getSamples().length, 2);
});

test('reuse=true сохраняет узлы и не создаёт новые', () => {
  let created = 0;
  const analyser = { fftSize: 512, getByteTimeDomainData() {}, connect() {}, disconnect() {} };
  const ctx = {
    createAnalyser: () => { created++; return analyser; },
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
  };
  const meter = createMeter({ level() {}, peaks() {} });
  meter.attach(ctx, {}, false);
  meter.attach(ctx, {}, true);
  assert.equal(created, 1);
});
