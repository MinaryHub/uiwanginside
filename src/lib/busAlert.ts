/**
 * 버스 도착 알림 (클라이언트 전용).
 *
 * 별도 오디오 파일 없이 Web Audio API 로 짧은 2음 차임벨을 만들고,
 * 지원하는 모바일 기기에서는 진동을 함께 울린다.
 */

export interface BusAlertTarget {
  stationId: string;
  stationName: string;
  routeId: string;
  routeName: string;
  /** 이 시간(초) 이하로 줄어들면 알림을 울린다 */
  thresholdSec: number;
  setAt: number;
}

export interface FiredBusAlert {
  stationName: string;
  routeName: string;
  predictSec: number;
}

export function playArrivalChime() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([220, 100, 220, 100, 260]);
    }
  } catch {
    /* 진동 미지원 기기는 조용히 넘어간다 */
  }

  try {
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.14);

      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.36);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    /* 자동재생 정책으로 막히면 화면 배너로만 알린다 */
  }
}
