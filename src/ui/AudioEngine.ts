/**
 * Web Audio Ambient Soundscape Generator
 * Synthesizes deep cosmic space ambient drones using Web Audio API oscillators.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];

  public toggleAudio(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public start() {
    if (this.isPlaying) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Cosmic chord frequencies (Hz): D minor / F Major celestial pad (55Hz D1, 110Hz D2, 164.8Hz E3, 220Hz A3, 329.6Hz E4)
    const freqs = [55.0, 110.0, 164.8, 220.0, 329.6];

    freqs.forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      // Add gentle LFO detune modulation for organic space ambient swell
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.1 + Math.random() * 0.08, this.ctx.currentTime);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(1.5, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      oscGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start();

      this.oscillators.push(osc);
    });

    this.isPlaying = true;
  }

  public stop() {
    if (!this.isPlaying) return;
    this.oscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.oscillators = [];
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.isPlaying = false;
  }
}
