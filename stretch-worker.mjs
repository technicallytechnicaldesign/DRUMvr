import { stretchLoop } from './stretch.mjs?v=6';
self.onmessage = ({data}) => {
  try {
    const channels = stretchLoop(data.channels, data.sampleRate, data.rate);
    self.postMessage({channels}, channels.map(c => c.buffer));
  } catch (error) { self.postMessage({error: error.message}); }
};
