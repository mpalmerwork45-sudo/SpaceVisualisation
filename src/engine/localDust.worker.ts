import { prepareLocalClouds, prepareLocalDust } from './LocalDustGrid';

self.onmessage = ({ data }: MessageEvent<{ packed: ArrayBuffer; clouds: boolean }>) => {
  const prepare = data.clouds ? prepareLocalClouds : prepareLocalDust;
  const grid = prepare(new Uint8Array(data.packed));
  self.postMessage(grid.buffer, { transfer: [grid.buffer] });
};
