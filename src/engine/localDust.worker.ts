import { prepareLocalDust } from './LocalDustGrid';

self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  const grid = prepareLocalDust(new Uint8Array(data));
  self.postMessage(grid.buffer, { transfer: [grid.buffer] });
};
