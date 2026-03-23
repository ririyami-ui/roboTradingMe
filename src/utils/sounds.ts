/**
 * SaktiBot Sound Effects
 * Uses Web Audio API to generate synthetic sounds — no external files needed.
 */

const getAudioContext = (): AudioContext | null => {
    try {
        return new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
        return null;
    }
};

const playTone = (
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainLevel = 0.3,
    startTime = 0,
    ctx?: AudioContext
) => {
    const audioCtx = ctx || getAudioContext();
    if (!audioCtx) return;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime + startTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.8, audioCtx.currentTime + startTime + duration);

    gainNode.gain.setValueAtTime(gainLevel, audioCtx.currentTime + startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);

    oscillator.start(audioCtx.currentTime + startTime);
    oscillator.stop(audioCtx.currentTime + startTime + duration);
};

/** 🛒 BUY — Upward ascending chord: cheerful ping */
export const playBuySound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(523, 0.15, 'sine', 0.3, 0.00, ctx);   // C5
    playTone(659, 0.15, 'sine', 0.3, 0.10, ctx);   // E5
    playTone(784, 0.20, 'sine', 0.3, 0.20, ctx);   // G5
    playTone(1047, 0.30, 'sine', 0.25, 0.35, ctx); // C6
};

/** 💰 TAKE PROFIT — Triumphant ascending fanfare */
export const playTPSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(523, 0.12, 'sine', 0.3, 0.00, ctx);  // C5
    playTone(659, 0.12, 'sine', 0.3, 0.10, ctx);  // E5
    playTone(784, 0.12, 'sine', 0.3, 0.20, ctx);  // G5
    playTone(1047, 0.12, 'sine', 0.3, 0.30, ctx); // C6
    playTone(1319, 0.40, 'sine', 0.35, 0.42, ctx); // E6 — peak note
    playTone(1047, 0.20, 'sine', 0.2, 0.60, ctx); // C6 — resolve
};

/** 🛑 STOP LOSS — Descending warning tones */
export const playSLSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(440, 0.18, 'sawtooth', 0.25, 0.00, ctx); // A4
    playTone(349, 0.18, 'sawtooth', 0.25, 0.20, ctx); // F4
    playTone(294, 0.30, 'sawtooth', 0.3,  0.40, ctx); // D4 — final low
};
