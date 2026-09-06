# Ambient soundtrack

The optional soundtrack is an original Web Audio synthesis graph, not a
recording or scientific sonification of space. It starts only after a click.

Detuned low sine/triangle voices carry a slow four-part harmonic progression.
The suspended and minor voicings move over ten-second transitions, separated
by long holds. A quiet tritone undertone supplies tension; Intensity changes
that layer smoothly. Sparse bells have slightly inharmonic partials and decay
into a six-second stereo convolution reverb. Unequal low-feedback echoes and
a filtered noise bed provide width and distance.

Volume is independent of Intensity. Playback fades in over three seconds and
out over 1.2 seconds. A compressor and sub-bass high-pass filter sit before
the output gain. Oscillators, LFOs and noise sources are tracked and stopped;
audio-clock lookahead schedules later phrases, and the scheduler/context are
released on stop or page exit. The browser must support Web Audio.

Validation uses a 50-second OfflineAudioContext render covering the entrance,
bells, a chord transition and fade-out, checking finite samples, stereo
separation, peak/RMS levels and silence after the fade. Browser smoke checks
exercise playback start/stop and the controls. Listening taste remains subjective;
the mix is intentionally restrained rather than loud.
