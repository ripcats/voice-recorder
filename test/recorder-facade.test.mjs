import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceRecorder, isSupported } from '../src/index.ts';
import { ENGINES } from '../src/engines.ts';

// Подставной движок: фасад тестируем без микрофона и AudioWorklet.
function registerFakeEngine({ failStart = null, emptyStop = false } = {}) {
  const calls = [];
  let created = 0;
  const create = (sink, opts) => {
    created++;
    const engine = {
      start: async () => {
        calls.push('start');
        if (failStart) throw failStart;
      },
      resume: async () => calls.push('resume'),
      pause: async () => calls.push('pause'),
      stop: async () => {
        calls.push('stop');
        return { blob: emptyStop ? new Blob() : new Blob(['ogg']), duration: 2, waveform: [0.5] };
      },
      preview: async () => ({ blob: new Blob(['p']), duration: 1, waveform: [0.3] }),
      cancel: () => calls.push('cancel'),
      prewarm() {},
      prefetch() {},
      // для проверки прерывания: фасад передаёт onInterrupt в опции
      _opts: opts,
      _sink: sink,
    };
    calls.engine = engine; // последний созданный движок — для проверки прерывания
    return engine;
  };
  ENGINES.fake = { label: 'Fake', create, check: async () => [] };
  return { calls, get created() { return created; }, get engine() { return calls.engine; } };
}

function collect(rec) {
  const log = { states: [], busy: [], time: [], errors: [] };
  rec.on('state', (s) => log.states.push(s));
  rec.on('busy', (b) => log.busy.push(b));
  rec.on('time', (t) => log.time.push(t));
  rec.on('error', (e) => log.errors.push(e));
  return log;
}

test('start переводит в recording и показывает busy на время запуска', async () => {
  registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  assert.equal(rec.state, 'recording');
  assert.deepEqual(log.busy, [true, false]);
  assert.deepEqual(log.states, ['recording']);
});

test('pause → paused, preview отдаёт записанное, resume → recording', async () => {
  const fake = registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  await rec.start();
  await rec.pause();
  assert.equal(rec.state, 'paused');
  const preview = await rec.preview();
  assert.equal(preview.waveform[0], 0.3);
  await rec.resume();
  assert.equal(rec.state, 'recording');
  assert.ok(fake.calls.includes('pause') && fake.calls.includes('resume'));
});

test('stop возвращает файл, переводит в stopped и отдаёт время в мс', async () => {
  registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  const result = await rec.stop();
  assert.equal(result.duration, 2);
  assert.equal(rec.state, 'stopped');
  assert.ok(log.time.includes(2000));
});

test('пустой файл при stop — null, ошибка «Запись пустая», состояние idle', async () => {
  registerFakeEngine({ emptyStop: true });
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  assert.equal(await rec.stop(), null);
  assert.equal(rec.state, 'idle');
  assert.equal(log.errors.at(-1).message, 'Запись пустая');
});

test('отказ в микрофоне (NotAllowedError) — код permission и понятный текст', async () => {
  registerFakeEngine({ failStart: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) });
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  assert.equal(rec.state, 'idle');
  assert.deepEqual(log.errors.at(-1), { code: 'permission', message: 'Нет доступа к микрофону' });
});

test('прочая ошибка старта — код failed с текстом ошибки', async () => {
  registerFakeEngine({ failStart: new Error('no worklet') });
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  assert.deepEqual(log.errors.at(-1), { code: 'failed', message: 'no worklet' });
});

test('повторный start во время запуска не создаёт второй движок', async () => {
  const fake = registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  await Promise.all([rec.start(), rec.start()]);
  assert.equal(fake.created, 1);
});

test('прерывание микрофона ставит на паузу и показывает код interrupted', async () => {
  const fake = registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  fake.engine._opts.onInterrupt();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(rec.state, 'paused');
  assert.equal(log.errors.at(-1).code, 'interrupted');
});

test('preview вне паузы — null', async () => {
  registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  assert.equal(await rec.preview(), null);
  await rec.start();
  assert.equal(await rec.preview(), null);
});

test('cancel сбрасывает в idle и время в 0', async () => {
  const fake = registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  await rec.start();
  rec.cancel();
  assert.equal(rec.state, 'idle');
  assert.ok(fake.calls.includes('cancel'));
  assert.equal(log.time.at(-1), 0);
});

test('после destroy подписчики не получают событий', async () => {
  registerFakeEngine();
  const rec = createVoiceRecorder({ engine: 'fake' });
  const log = collect(rec);
  rec.destroy();
  await rec.start();
  assert.deepEqual(log.states, []);
});

test('неизвестный движок — ошибка при создании', () => {
  assert.throws(() => createVoiceRecorder({ engine: 'nope' }), /Неизвестный движок/);
});

test('isSupported: поддерживается, если проверка не нашла проблем', async () => {
  registerFakeEngine();
  const result = await isSupported('fake');
  assert.deepEqual(result, { engine: 'fake', label: 'Fake', supported: true, issues: [] });
});

test('isSupported неизвестного движка — ошибка', async () => {
  await assert.rejects(isSupported('nope'), /Неизвестный движок/);
});

test('автопауза: скрытие вкладки ставит запись на паузу', async () => {
  registerFakeEngine();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.document = doc;
  const rec = createVoiceRecorder({ engine: 'fake', autoPauseOnHidden: true });
  await rec.start();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(rec.state, 'paused');
  rec.destroy();
  delete globalThis.document;
});

test('без autoPauseOnHidden скрытие вкладки ничего не меняет', async () => {
  registerFakeEngine();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.document = doc;
  const rec = createVoiceRecorder({ engine: 'fake' });
  await rec.start();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(rec.state, 'recording');
  delete globalThis.document;
});
