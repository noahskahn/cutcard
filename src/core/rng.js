// Seedable fast PRNG (sfc32) seeded through splitmix32.
function splitmix32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** Returns a function producing floats in [0,1). */
export function makeRng(seed = 12345) {
  const sm = splitmix32(seed);
  let a = sm(), b = sm(), c = sm(), d = sm();
  for (let i = 0; i < 12; i++) next();
  function next() {
    const t0 = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t = (t0 + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  return next;
}
