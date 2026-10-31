import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOpus } from '../src/voice/support.ts';

// Браузерные API подменяем: проверяем логику, а не сам браузер.
function setBrowser({ encoder, playOgg }) {
  if (encoder === undefined) delete globalThis.AudioEncoder;
  else globalThis.AudioEncoder = { isConfigSupported: async () => ({ supported: encoder }) };
  globalThis.Audio = class { canPlayType() { return playOgg ? 'probably' : ''; } };
}

test('всё поддерживается — список проблем пустой', async () => {
  setBrowser({ encoder: true, playOgg: true });
  assert.deepEqual(await checkOpus(), []);
});

test('нет воспроизведения Ogg — одна проблема про скачивание', async () => {
  setBrowser({ encoder: true, playOgg: false });
  const issues = await checkOpus();
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Воспроизведение/);
});

test('нет WebCodecs — проблема записи', async () => {
  setBrowser({ encoder: undefined, playOgg: true });
  const issues = await checkOpus();
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Запись недоступна/);
});

test('ошибка isConfigSupported считается отсутствием поддержки', async () => {
  globalThis.AudioEncoder = { isConfigSupported: async () => { throw new Error('boom'); } };
  globalThis.Audio = class { canPlayType() { return 'probably'; } };
  assert.equal((await checkOpus()).length, 1);
});

test('ничего не поддерживается — две проблемы', async () => {
  setBrowser({ encoder: undefined, playOgg: false });
  assert.equal((await checkOpus()).length, 2);
});

test('isConfigSupported получает конфиг Opus, моно, 48 кГц', async () => {
  let received = null;
  globalThis.AudioEncoder = {
    isConfigSupported: async (config) => {
      received = config;
      return { supported: true };
    },
  };
  globalThis.Audio = class { canPlayType() { return 'probably'; } };
  await checkOpus();
  assert.equal(received.codec, 'opus');
  assert.equal(received.numberOfChannels, 1);
  assert.equal(received.sampleRate, 48000);
});
