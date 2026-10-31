import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStreamLive, setTracksEnabled, stopStream, watchInterrupt, requestMicrophone,
} from '../src/voice/engine/microphone.ts';
import { MIC_CONSTRAINTS } from '../src/voice/engine/config.ts';

function fakeTrack(readyState = 'live') {
  return { readyState, enabled: true, onmute: null, onended: null, stopped: false, stop() { this.stopped = true; } };
}
function fakeStream(tracks) {
  return { getAudioTracks: () => tracks, getTracks: () => tracks };
}

test('isStreamLive: нет потока — не живой', () => {
  assert.equal(isStreamLive(null), false);
});

test('isStreamLive: все дорожки live — живой', () => {
  assert.equal(isStreamLive(fakeStream([fakeTrack(), fakeTrack()])), true);
});

test('isStreamLive: одна дорожка ended — не живой', () => {
  assert.equal(isStreamLive(fakeStream([fakeTrack(), fakeTrack('ended')])), false);
});

test('setTracksEnabled выключает и включает дорожки, не останавливая их', () => {
  const track = fakeTrack();
  const stream = fakeStream([track]);
  setTracksEnabled(stream, false);
  assert.equal(track.enabled, false);
  assert.equal(track.stopped, false);
  setTracksEnabled(stream, true);
  assert.equal(track.enabled, true);
});

test('setTracksEnabled без потока не падает', () => {
  assert.doesNotThrow(() => setTracksEnabled(null, false));
});

test('watchInterrupt вешает обработчики mute и ended на все дорожки', () => {
  const a = fakeTrack();
  const b = fakeTrack();
  let calls = 0;
  watchInterrupt(fakeStream([a, b]), () => calls++);
  a.onmute();
  b.onended();
  assert.equal(calls, 2);
});

test('stopStream по умолчанию снимает обработчики: собственная остановка не считается прерыванием', () => {
  const track = fakeTrack();
  track.onmute = () => {};
  track.onended = () => {};
  stopStream(fakeStream([track]));
  assert.equal(track.stopped, true);
  assert.equal(track.onmute, null);
  assert.equal(track.onended, null);
});

test('stopStream с quiet=false оставляет обработчики', () => {
  const track = fakeTrack();
  const handler = () => {};
  track.onmute = handler;
  stopStream(fakeStream([track]), false);
  assert.equal(track.stopped, true);
  assert.equal(track.onmute, handler);
});

test('requestMicrophone запрашивает звук с MIC_CONSTRAINTS', async () => {
  let requested = null;
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async (c) => { requested = c; return 'stream'; } } },
    configurable: true,
  });
  const result = await requestMicrophone();
  assert.equal(result, 'stream');
  assert.deepEqual(requested, { audio: MIC_CONSTRAINTS });
});
