/** Проверки поддержки Opus в текущем браузере: запись (WebCodecs) и воспроизведение Ogg в `<audio>`.
    Возвращают список проблем; пустой список — всё поддерживается. */

const OPUS_CONFIG: AudioEncoderConfig = { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 };

export async function checkOpus(): Promise<string[]> {
  const issues: string[] = [];

  let canEncode = false;
  if (typeof AudioEncoder !== 'undefined') {
    try {
      canEncode = (await AudioEncoder.isConfigSupported(OPUS_CONFIG)).supported === true;
    } catch {
      canEncode = false;
    }
  }
  if (!canEncode) issues.push('Запись недоступна: браузер не поддерживает кодек Opus в WebCodecs');

  const canPlayOgg = new Audio().canPlayType('audio/ogg; codecs="opus"') !== '';
  if (!canPlayOgg) issues.push('Воспроизведение Ogg/Opus в браузере недоступно: файл можно только скачать');

  return issues;
}
