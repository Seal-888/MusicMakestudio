/**
 * 스테레오 Float32 두 채널을 PCM WAV 파일 바이트로 만듭니다.
 *
 * 24-bit · 16-bit 모두 TPDF 디더를 겁니다. 소수 값을 정수로 자를 때 생기는
 * 일그러짐을 아주 작은 잡음으로 바꿔, 조용한 꼬리 부분이 지저분해지지 않게 합니다.
 */
export function wavBytes(L, R, sampleRate, bits = 24) {
  const n = L.length, bps = bits / 8, dataSize = n * 2 * bps;
  const buf = new ArrayBuffer(44 + dataSize), v = new DataView(buf), u8 = new Uint8Array(buf);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2 * bps, true); v.setUint16(32, 2 * bps, true); v.setUint16(34, bits, true);
  tag(36, 'data'); v.setUint32(40, dataSize, true);
  const full = Math.pow(2, bits - 1) - 1;
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const ch of [L, R]) {
      let s = Math.round(ch[i] * full + (Math.random() - Math.random()));
      s = s > full ? full : s < -full - 1 ? -full - 1 : s;
      if (bits === 16) { v.setInt16(o, s, true); o += 2; }
      else { u8[o] = s & 255; u8[o + 1] = (s >> 8) & 255; u8[o + 2] = (s >> 16) & 255; o += 3; }
    }
  }
  return u8;
}
