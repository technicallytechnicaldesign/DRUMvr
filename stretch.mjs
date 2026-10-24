export function stretchLoop(channels, sampleRate, rate) {
  if (!Number.isFinite(rate) || rate < .5 || rate > 4) throw Error('Song speed must be between 50% and 400%.');
  const length = channels[0]?.length;
  if (!length || !channels.every(c => c.length === length) || !Number.isFinite(sampleRate) || sampleRate < 8000) throw Error('Invalid song samples.');
  if (rate === 1) return channels.map(c => c.slice());
  const size = Math.round(length / rate), hop = Math.round(sampleRate * .02), window = hop * 2;
  const search = Math.round(sampleRate * .013), stride = Math.max(1, Math.round(sampleRate / 12000));
  const output = channels.map(() => new Float32Array(size)), weights = new Float32Array(size);

  let reference = 0, energy = -1;
  channels.forEach((c, index) => { let e = 0; for (let i = 0; i < length; i += 32) e += c[i] * c[i]; if (e > energy) { energy = e; reference = index; } });
  const input = channels[reference], wrap = n => ((n % length) + length) % length;
  let previous = 0;
  for (let at = 0; at < size; at += hop) {
    const expected = Math.round((at + hop) * rate - hop);
    let chosen = expected;
    if (at > 0 && energy > 1e-12) {
      let best = -Infinity;
      const score = candidate => {
        let dot = 0, aa = 0, bb = 0;
        for (let j = 0; j < hop; j += stride) {
          const a = input[wrap(previous + hop + j)], b = input[wrap(candidate + j)];
          dot += a * b; aa += a * a; bb += b * b;
        }
        return dot / Math.sqrt(aa * bb + 1e-20) - Math.abs(candidate - expected) * 1e-7;
      };
      for (let candidate = expected - search; candidate <= expected + search; candidate += stride) {
        const value = score(candidate); if (value > best) { best = value; chosen = candidate; }
      }
      const coarse = chosen;
      for (let candidate = coarse - stride + 1; candidate < coarse + stride; candidate++) {
        const value = score(candidate); if (value > best) { best = value; chosen = candidate; }
      }
    }
    for (let j = 0; j < window && at + j < size; j++) {
      const weight = at === 0 && j < hop ? 1 : j < hop ? j / hop : (window - j) / hop;
      weights[at + j] += weight;
      for (let c = 0; c < channels.length; c++) output[c][at + j] += channels[c][wrap(chosen + j)] * weight;
    }
    previous = chosen;
  }
  for (const channel of output) for (let i = 0; i < size; i++) channel[i] /= weights[i] || 1;
  return output;
}
