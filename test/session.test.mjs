import test from 'node:test';
import assert from 'node:assert/strict';
import { preferRecordSession, preferPlaybackSession } from '../src/voice/shared.ts';

function setSession(initial) {
  const session = {
    _type: initial,
    sets: 0,
    get type() { return this._type; },
    set type(value) { this.sets++; this._type = value; },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { audioSession: session }, configurable: true });
  return session;
}

test('запись переключает сессию в play-and-record', () => {
  const session = setSession('playback');
  preferRecordSession();
  assert.equal(session.type, 'play-and-record');
});

test('воспроизведение возвращает playback', () => {
  const session = setSession('play-and-record');
  preferPlaybackSession();
  assert.equal(session.type, 'playback');
});

test('если тип уже нужный, сессию не трогаем (переключение перестраивает маршрут)', () => {
  const session = setSession('play-and-record');
  preferRecordSession();
  assert.equal(session.sets, 0);
});

test('без audioSession функции ничего не делают и не падают', () => {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  assert.doesNotThrow(() => preferRecordSession());
  assert.doesNotThrow(() => preferPlaybackSession());
});
