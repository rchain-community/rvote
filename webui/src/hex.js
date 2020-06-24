export const Base16 = Object.freeze({
  encode(bytes) {
    return Array.from(bytes)
      .map((x) => (x & 0xff).toString(16).padStart(2, '0'))
      .join('');
  },
});
