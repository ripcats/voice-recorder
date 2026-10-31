import { BufferTarget, EncodedAudioPacketSource, EncodedPacket, OggOutputFormat, Output } from 'mediabunny';

/** Ogg/Opus по стандарту (RFC 3533, RFC 7845) через mediabunny: заголовки, гранулы, pre-skip и EOS пишет библиотека.
    Вход — Opus-пакеты из WebCodecs `AudioEncoder` и его метаданные (там лежит OpusHead). Пакеты идут подряд, пауза в файл не попадает. */

/** Собирает один Ogg/Opus-файл из всех пакетов записи. `frameSeconds` — длительность одного пакета (20 мс). */
export async function encodeOggOpus(packets: Uint8Array[], meta: EncodedAudioChunkMetadata, frameSeconds: number): Promise<Blob> {
  const output = new Output({ format: new OggOutputFormat(), target: new BufferTarget() });
  const source = new EncodedAudioPacketSource('opus');
  output.addAudioTrack(source);
  await output.start();
  for (let i = 0; i < packets.length; i++) {
    // Метаданные передаём с первым пакетом: в них decoderConfig с OpusHead
    await source.add(new EncodedPacket(packets[i], 'key', i * frameSeconds, frameSeconds), i === 0 ? meta : undefined);
  }
  source.close();
  await output.finalize();
  return new Blob([output.target.buffer!], { type: 'audio/ogg; codecs=opus' });
}
