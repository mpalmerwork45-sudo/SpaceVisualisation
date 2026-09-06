/** Original generative score: slow suspended harmonies, a cold bass interval,
 * distant inharmonic bells and filtered air. No samples or network assets. */
export class CosmicSoundscape {
  private sources = new Set<AudioScheduledSourceNode>();
  private voices: OscillatorNode[][] = [];
  private pressure: GainNode;
  private dry: GainNode;
  private nextChord: number;
  private nextBell: number;
  private chordIndex = 0;
  private bellIndex = 0;
  private stopped = false;

  constructor(private ctx: BaseAudioContext, destination: AudioNode) {
    const now = ctx.currentTime;
    this.nextChord = now + 32;
    this.nextBell = now + 7;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.08;
    compressor.release.value = 1.1;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass'; highpass.frequency.value = 28;
    compressor.connect(highpass).connect(destination);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.75;
    this.dry.connect(compressor);

    const reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 6), ctx.sampleRate);
    let seed = 0x5a17;
    const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296*2-1; };
    for (let channel=0; channel<2; channel++) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i=0; i<data.length; i++) {
        smooth = smooth*0.72+random()*0.28;
        data[i] = smooth*Math.exp(-i/(ctx.sampleRate*1.35))*Math.min(1,i/(ctx.sampleRate*0.04));
      }
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain(); wet.gain.value = 0.65;
    const damp = ctx.createBiquadFilter(); damp.frequency.value = 2600;
    this.dry.connect(reverb).connect(damp).connect(wet).connect(compressor);

    // Unequal echoes open the stereo field without a loud rhythmic pulse.
    for (const [delayTime, pan] of [[0.73,-0.7],[1.09,0.7]]) {
      const delay = ctx.createDelay(2); delay.delayTime.value = delayTime;
      const feedback = ctx.createGain(); feedback.gain.value = 0.22;
      const level = ctx.createGain(); level.gain.value = 0.14;
      const panner = ctx.createStereoPanner(); panner.pan.value = pan;
      this.dry.connect(delay).connect(feedback).connect(delay);
      delay.connect(level).connect(panner).connect(compressor);
    }

    const frequencies = [55,110,164.8138,220,261.6256,329.6276,493.8833];
    frequencies.forEach((frequency,index) => {
      const pan = ctx.createStereoPanner(); pan.pan.value = (index%2 ? 1 : -1)*(0.15+index*0.07);
      const filter = ctx.createBiquadFilter(); filter.frequency.value = 650+index*190;
      const gain = ctx.createGain(); gain.gain.value = 0.06/(1+index*0.25);
      gain.connect(filter).connect(pan).connect(this.dry);
      const swell = this.oscillator(0.012+index*0.0021,'sine');
      const swellDepth = ctx.createGain(); swellDepth.gain.value = gain.gain.value*0.38;
      swell.connect(swellDepth).connect(gain.gain);
      const pair = [-1,1].map(side => {
        const osc = this.oscillator(frequency, index < 2 ? 'sine' : 'triangle');
        osc.detune.value = side*(2.5+index*0.4);
        const level = ctx.createGain(); level.gain.value = 0.5;
        osc.connect(level).connect(gain);
        return osc;
      });
      this.voices.push(pair);
    });

    this.pressure = ctx.createGain();
    const pressureFilter = ctx.createBiquadFilter(); pressureFilter.frequency.value = 260;
    const undertone = this.oscillator(55*Math.SQRT2,'triangle');
    undertone.connect(pressureFilter).connect(this.pressure).connect(this.dry);
    this.setIntensity(0.45);

    const air = ctx.createBuffer(2,ctx.sampleRate*8,ctx.sampleRate);
    for (let c=0;c<2;c++) {
      const data = air.getChannelData(c);
      let value = 0;
      for (let i=0;i<data.length;i++) { value = 0.98*value+random()*0.02; data[i]=value; }
    }
    const noise = ctx.createBufferSource(); noise.buffer=air; noise.loop=true;
    const airFilter = ctx.createBiquadFilter(); airFilter.type='bandpass'; airFilter.frequency.value=340; airFilter.Q.value=0.45;
    const airGain = ctx.createGain(); airGain.gain.value=0.09;
    noise.connect(airFilter).connect(airGain).connect(this.dry);
    this.track(noise); noise.start(now);
  }

  private oscillator(frequency: number, type: OscillatorType) {
    const osc = this.ctx.createOscillator();
    osc.type = type; osc.frequency.value=frequency;
    this.track(osc); osc.start(this.ctx.currentTime);
    return osc;
  }

  private track(source: AudioScheduledSourceNode) {
    this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); };
  }

  public setIntensity(value: number) {
    const intensity = Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : 0.45;
    this.pressure.gain.setTargetAtTime(0.005+intensity*0.035,this.ctx.currentTime,2);
  }

  /** Audio-clock lookahead, also usable with OfflineAudioContext for validation. */
  public scheduleUntil(end: number) {
    if (this.stopped) return;
    const chords = [
      [55,110,164.8138,246.9417,293.6648,349.2282,440],
      [49,98,146.8324,196,261.6256,329.6276,440],
      [55,110,164.8138,220,261.6256,311.127,493.8833],
      [55,110,164.8138,220,261.6256,329.6276,493.8833]
    ];
    while (this.nextChord < end) {
      const chord = chords[this.chordIndex++%chords.length];
      this.voices.forEach((pair,index) => pair.forEach(osc => {
        // Hold the last scheduled pitch until this transition starts.
        const previous = this.chordIndex === 1 ? [55,110,164.8138,220,261.6256,329.6276,493.8833]
          : chords[(this.chordIndex-2)%chords.length];
        osc.frequency.setValueAtTime(previous[index],this.nextChord);
        osc.frequency.exponentialRampToValueAtTime(chord[index],this.nextChord+10);
      }));
      this.nextChord += 48;
    }
    while (this.nextBell < end) {
      const notes = [659.255,440,987.767,523.251,739.989];
      const index = this.bellIndex++;
      const frequency = notes[index%notes.length];
      const pan = this.ctx.createStereoPanner(); pan.pan.value = Math.sin(index*2.4)*0.7;
      pan.connect(this.dry);
      [1,2.003,2.756,4.12].forEach((partial,i) => {
        const osc = this.ctx.createOscillator(); osc.frequency.value = frequency*partial;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0,this.nextBell);
        gain.gain.linearRampToValueAtTime(0.032/(1+i*2),this.nextBell+0.1);
        gain.gain.exponentialRampToValueAtTime(0.00001,this.nextBell+7-i);
        osc.connect(gain).connect(pan);
        this.track(osc);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); this.sources.delete(osc); if (i===0) pan.disconnect(); };
        osc.start(this.nextBell); osc.stop(this.nextBell+8);
      });
      this.nextBell += 13 + index%3*3;
    }
  }

  public stop(when: number) {
    if (this.stopped) return;
    this.stopped = true;
    this.sources.forEach(source => { try { source.stop(when); } catch { /* already ended */ } });
  }
}
