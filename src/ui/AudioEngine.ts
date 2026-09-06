import { CosmicSoundscape } from './CosmicSoundscape';

/** User-initiated soundtrack with gentle fades and bounded resource ownership. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private score: CosmicSoundscape | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private retiring = new Map<AudioContext,ReturnType<typeof setTimeout>>();
  private volume = 0.35;
  private intensity = 0.45;
  private starting = false;
  public isPlaying = false;

  public async toggleAudio(): Promise<boolean> {
    if (this.isPlaying) { this.stop(); return false; }
    await this.start();
    return this.isPlaying;
  }

  public async start() {
    if (this.isPlaying || this.starting) return;
    this.starting = true;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is unavailable in this browser.');
      const ctx: AudioContext = new AudioContextClass();
      this.ctx = ctx;
      await ctx.resume();
      if (this.ctx !== ctx) { await ctx.close(); return; }
      const master = ctx.createGain();
      master.gain.setValueAtTime(0,ctx.currentTime);
      master.gain.linearRampToValueAtTime(this.volume,ctx.currentTime+3);
      master.connect(ctx.destination);
      this.master = master;
      this.score = new CosmicSoundscape(ctx,master);
      this.score.setIntensity(this.intensity);
      this.score.scheduleUntil(ctx.currentTime+60);
      this.scheduler = setInterval(() => this.score?.scheduleUntil(ctx.currentTime+60),8000);
      this.isPlaying = true;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  public setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0,Math.min(1,value));
    if (this.ctx && this.master) {
      this.master.gain.cancelAndHoldAtTime(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,0.25);
    }
  }

  public setIntensity(value: number) {
    if (!Number.isFinite(value)) return;
    this.intensity = Math.max(0,Math.min(1,value));
    this.score?.setIntensity(this.intensity);
  }

  public stop() {
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = null;
    const ctx = this.ctx;
    if (ctx) {
      const end = ctx.currentTime+1.2;
      this.master?.gain.cancelAndHoldAtTime(ctx.currentTime);
      this.master?.gain.linearRampToValueAtTime(0,end);
      this.score?.stop(end);
      const timer = setTimeout(() => {
        void ctx.close().catch(() => {});
        this.retiring.delete(ctx);
      },1400);
      this.retiring.set(ctx,timer);
    }
    this.ctx = null; this.master = null; this.score = null;
    this.isPlaying = false;
  }

  public dispose() {
    this.stop();
    this.retiring.forEach((timer,ctx) => {
      clearTimeout(timer);
      void ctx.close().catch(() => {});
    });
    this.retiring.clear();
  }
}
