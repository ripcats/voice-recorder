import { MIC_CONSTRAINTS } from './config';

/** Работа с микрофоном: запрос устройства, слежение за дорожками, их выключение и остановка. Состояния не хранит — поток держит `engine`. */

export function requestMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
}

/** Все аудиодорожки живы (устройство не отключили за время паузы). */
export function isStreamLive(stream: MediaStream | null): boolean {
  return !!stream && stream.getAudioTracks().every(track => track.readyState === 'live');
}

/** Микрофон выключили / он пропал (дорожка `mute` / `ended`: отозвали разрешение, отключили устройство, звонок или Siri перехватили звук). */
export function watchInterrupt(stream: MediaStream, onInterrupt: () => void): void {
  stream.getAudioTracks().forEach(track => {
    track.onmute = onInterrupt;
    track.onended = onInterrupt;
  });
}

/** Включает/выключает дорожки, не останавливая поток (пауза с живым микрофоном). */
export function setTracksEnabled(stream: MediaStream | null, enabled: boolean): void {
  stream?.getAudioTracks().forEach(track => (track.enabled = enabled));
}

/** Останавливает дорожки. `quiet` — собственная остановка не должна считаться прерыванием: обработчики снимаются. */
export function stopStream(stream: MediaStream | null, quiet = true): void {
  stream?.getTracks().forEach(track => {
    if (quiet) track.onmute = track.onended = null;
    track.stop();
  });
}
