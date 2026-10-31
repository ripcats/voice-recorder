import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioContextManager } from '../src/voice/audio-context.ts';

class FakeAudioContext {
  constructor() { this.state = 'running'; this.closedFlag = false; }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

function setup(t) {
  globalThis.window = globalThis;
  globalThis.AudioContext = FakeAudioContext;
  t.mock.timers.enable({ apis: ['setTimeout'] });
}

test('get создаёт контекст один раз и возвращает его же', (t) => {
  setup(t);
  const manager = new AudioContextManager();
  assert.equal(manager.get(), manager.get());
});

test('после закрытия get создаёт новый контекст', (t) => {
  setup(t);
  const manager = new AudioContextManager();
  const first = manager.get();
  first.state = 'closed';
  assert.notEqual(manager.get(), first);
});

test('park усыпляет запущенный контекст через 4 секунды простоя', (t) => {
  setup(t);
  const manager = new AudioContextManager();
  const ctx = manager.get();
  manager.park();
  t.mock.timers.tick(3999);
  assert.equal(ctx.state, 'running');
  t.mock.timers.tick(1);
  assert.equal(ctx.state, 'suspended');
});

test('пока есть пользователь записи, park не усыпляет', (t) => {
  setup(t);
  const manager = new AudioContextManager();
  const ctx = manager.get();
  manager.addUser();
  manager.park();
  t.mock.timers.tick(10000);
  assert.equal(ctx.state, 'running');
});

test('removeUser снимает удержание', (t) => {
  setup(t);
  const manager = new AudioContextManager();
  const ctx = manager.get();
  manager.addUser();
  manager.removeUser();
  manager.park();
  t.mock.timers.tick(4000);
  assert.equal(ctx.state, 'suspended');
});

test('get во время ожидания парковки отменяет её', (t) => {
  setup(t);
  const manager = new AudioContextManager();
  const ctx = manager.get();
  manager.park();
  t.mock.timers.tick(2000);
  manager.get();
  t.mock.timers.tick(5000);
  assert.equal(ctx.state, 'running');
});
