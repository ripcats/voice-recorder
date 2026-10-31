import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, MIC_CONSTRAINTS, CAPTURE_WORKLET_URL, KEEP_MIC_ON_PAUSE } from '../src/voice/engine/config.ts';

test('настройки по умолчанию — Opus 32 кбит/с, кадр 20 мс', () => {
  assert.equal(DEFAULT_SETTINGS.bitrate, 32000);
  assert.equal(DEFAULT_SETTINGS.frameMs, 20);
  assert.equal(DEFAULT_SETTINGS.pauseReleaseMs, 30000);
  assert.equal(DEFAULT_SETTINGS.tailTimeoutMs, 500);
});

test('микрофон моно, с эхо- и шумоподавлением, без автоусиления', () => {
  assert.equal(MIC_CONSTRAINTS.channelCount, 1);
  assert.equal(MIC_CONSTRAINTS.echoCancellation, true);
  assert.equal(MIC_CONSTRAINTS.noiseSuppression, true);
  assert.equal(MIC_CONSTRAINTS.autoGainControl, false);
});

test('модуль захвата — отдельный файл .worklet.js (иначе CSP его блокирует)', () => {
  assert.ok(CAPTURE_WORKLET_URL.href.endsWith('pcm-capture.worklet.js'));
});

test('микрофон на паузе по умолчанию отпускается сразу', () => {
  assert.equal(KEEP_MIC_ON_PAUSE, false);
});
