/**
 * 마스터링 엔진. 화면과 상관없는 계산만 모아 둡니다.
 *
 * 브라우저에서는 worker.js 가 이 파일을 불러 백그라운드에서 돌리고,
 * check-mastering.mjs 는 Node 에서 바로 불러 숫자를 검사합니다.
 *
 * 흐름은 분석 → 판단 → 처리 → 마감입니다.
 * - analyze  : 음량(ITU-R BS.1770 LUFS), 트루피크(4배 오버샘플), 대역 밸런스, 위상을 잽니다.
 * - decide   : 기준에서 벗어난 것만 골라 처리 계획을 세웁니다.
 * - master   : 계획대로 EQ · 스테레오 · 고역 제어 · 컴프레션 · 리미터를 걸고 목표 음량에 맞춥니다.
 *
 * 기준값과 처리량은 heywavv 의 공개 데모 4쌍과 실제 곡 1쌍(원본 · heywavv 결과)을
 * 같은 원본에 이 엔진을 돌린 결과와 비교해 맞췄습니다. 근거가 다섯 곡뿐이라
 * 곡을 더 비교할 때마다 decide 의 숫자를 다시 맞추는 것이 정상입니다.
 */
const dbA = x => 20 * Math.log10(Math.max(x, 1e-9));
const dbP = x => 10 * Math.log10(Math.max(x, 1e-12));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r1 = x => Math.round(x * 10) / 10;
const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

// Reference band levels relative to the 500 Hz–2 kHz band, centred on measured released masters across genres;
// the spread between genres is wide, so decisions only act outside a broad tolerance.
const BANDS = [['sub', 20, 60], ['low', 60, 200], ['mud', 200, 500], ['mid', 500, 2000], ['himid', 2000, 6000], ['air', 6000, 16000]];
const REF = { sub: 4, low: 6, mud: 0, mid: 0, himid: -5, air: -9 };

function biq(type, f, Q, g, sr) {
  const A = Math.pow(10, g / 40), w = 2 * Math.PI * Math.min(f, sr * 0.49) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else if (type === 'lowshelf') { const q = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * c + q); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - q); a0 = (A + 1) + (A - 1) * c + q; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - q; }
  else { const q = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * c + q); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - q); a0 = (A + 1) - (A - 1) * c + q; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - q; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function runBiq(x, k, out) {
  out = out || x; const b0 = k[0], b1 = k[1], b2 = k[2], a1 = k[3], a2 = k[4]; let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; out[i] = y; }
  return out;
}

// ITU-R BS.1770 K-weighting for any sample rate.
function kWeight(sr) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
  const s1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr); a0 = 1 + K / Q + K * K;
  const s2 = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  return [s1, s2];
}
function loudness(chs, sr) {
  const [p, q] = kWeight(sr), hop = Math.round(sr * 0.1), n = chs[0].length, nseg = Math.floor(n / hop), seg = new Float64Array(nseg);
  for (const x of chs) {
    let z1 = 0, z2 = 0, w1 = 0, w2 = 0, i = 0;
    for (let s = 0; s < nseg; s++) {
      let acc = 0; const end = (s + 1) * hop;
      for (; i < end; i++) {
        const v = x[i], y = p[0] * v + z1; z1 = p[1] * v - p[3] * y + z2; z2 = p[2] * v - p[4] * y;
        const u = q[0] * y + w1; w1 = q[1] * y - q[3] * u + w2; w2 = q[2] * y - q[4] * u; acc += u * u;
      }
      seg[s] += acc;
    }
  }
  const blocks = [];
  for (let s = 0; s + 4 <= nseg; s++) blocks.push((seg[s] + seg[s + 1] + seg[s + 2] + seg[s + 3]) / (4 * hop));
  const L = e => -0.691 + dbP(e);
  const abs = blocks.filter(e => L(e) > -70);
  if (!abs.length) return -70;
  const rel = L(mean(abs)) - 10, g = abs.filter(e => L(e) > rel);
  return L(mean(g.length ? g : abs));
}

// True peak: 4x polyphase windowed-sinc interpolation (12 taps per phase).
let TPK = null;
function tpKernel() {
  if (TPK) return TPK;
  const ph = 4, per = 12, taps = ph * per, h = new Float64Array(taps);
  for (let i = 0; i < taps; i++) { const t = (i - (taps - 1) / 2) / ph; h[i] = (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / taps)); }
  TPK = [];
  for (let p = 0; p < ph; p++) { const k = new Float64Array(per); let s = 0; for (let j = 0; j < per; j++) { k[j] = h[j * ph + p]; s += k[j]; } for (let j = 0; j < per; j++) k[j] /= s; TPK.push(k); }
  return TPK;
}
function peaks(chs) {
  const P = tpKernel(); let sp = 0;
  for (const x of chs) for (let i = 0; i < x.length; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > sp) sp = a; }
  let tp = sp; const thr = sp * 0.5;
  for (const x of chs) {
    for (let i = 11; i < x.length; i++) {
      const c = x[i - 6] < 0 ? -x[i - 6] : x[i - 6], d = x[i - 5] < 0 ? -x[i - 5] : x[i - 5];
      if (c < thr && d < thr) continue;
      for (let p = 0; p < 4; p++) { const k = P[p]; let s = 0; for (let j = 0; j < 12; j++) s += k[j] * x[i - j]; if (s < 0) s = -s; if (s > tp) tp = s; }
    }
  }
  return { sample: sp, tp };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function spectrum(L, R, sr) {
  const N = 4096, n = L.length, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const total = Math.max(1, Math.floor((n - N) / (N / 2))), frames = Math.min(total, 700), step = Math.max(N / 2, Math.floor((n - N) / frames));
  const pow = new Float64Array(N / 2 + 1), re = new Float64Array(N), im = new Float64Array(N);
  let used = 0;
  for (let s = 0; s + N <= n && used < frames; s += step) {
    let e = 0;
    for (let i = 0; i < N; i++) { const v = (L[s + i] + R[s + i]) * 0.5; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    if (e / N < 1e-8) continue;
    fft(re, im);
    for (let k = 0; k <= N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    used++;
  }
  const hz = sr / N, bands = {};
  for (const [name, lo, hi] of BANDS) { let t = 0; for (let k = 0; k <= N / 2; k++) { const f = k * hz; if (f >= lo && f < hi) t += pow[k]; } bands[name] = r1(dbP(t / Math.max(used, 1))); }
  return { bands, frames: used };
}

function analyze(L, R, sr) {
  const n = L.length, pk = peaks([L, R]), lufs = loudness([L, R], sr);
  let clip = 0, run = 0, sumM = 0, sumS = 0, sumLR = 0;
  const blk = Math.round(0.4 * sr), corrs = [], rmsDb = [];
  for (let t = 0; t + blk <= n; t += blk) {
    let sl = 0, sr2 = 0, slr = 0, ml = 0, mr = 0;
    for (let i = t; i < t + blk; i++) {
      const a = L[i], b = R[i], m = Math.max(a < 0 ? -a : a, b < 0 ? -b : b);
      if (m >= 0.999) { if (++run === 4) clip++; } else run = 0;
      sl += a * a; sr2 += b * b; slr += a * b; ml += a; mr += b;
      const M = (a + b) / 2, S = (a - b) / 2; sumM += M * M; sumS += S * S; sumLR += (a * a + b * b) / 2;
    }
    const rms = Math.sqrt((sl + sr2) / (2 * blk)); rmsDb.push(dbA(rms));
    const cov = slr / blk - (ml / blk) * (mr / blk), va = sl / blk - (ml / blk) ** 2, vb = sr2 / blk - (mr / blk) ** 2;
    if (rms > 1e-4 && va > 0 && vb > 0) corrs.push(cov / Math.sqrt(va * vb));
  }
  const sorted = rmsDb.slice().sort((a, b) => a - b), top = sorted[Math.floor(sorted.length * 0.95)] ?? -60;
  const loudRms = mean(sorted.filter(v => v > top - 30));
  // Low-frequency side energy (below 120 Hz) relative to low mid energy.
  const lp = biq('lp', 120, 0.707, 0, sr); let lm = 0, ls = 0; { let z1 = 0, z2 = 0, y1 = 0, y2 = 0; const [b0, b1, b2, a1, a2] = lp;
    for (let i = 0; i < n; i += 2) { const M = (L[i] + R[i]) / 2, S = (L[i] - R[i]) / 2;
      const ym = b0 * M + z1; z1 = b1 * M - a1 * ym + z2; z2 = b2 * M - a2 * ym;
      const ys = b0 * S + y1; y1 = b1 * S - a1 * ys + y2; y2 = b2 * S - a2 * ys; lm += ym * ym; ls += ys * ys; } }
  const sp = spectrum(L, R, sr), B = sp.bands, maxB = Math.max(...Object.values(B)), tilt = [];
  if (B.mid > maxB - 30) for (const k of ['sub', 'low', 'himid', 'air']) { if (B[k] < maxB - 40) continue; const d = r1(B[k] - B.mid - REF[k]); if (d > 6) tilt.push({ band: k, dev: d }); }
  const airDev = (B.air - B.mid) - REF.air;
  const tpDb = dbA(pk.tp), spDb = dbA(pk.sample);
  return {
    sr, seconds: n / sr, lufs: r1(lufs), samplePeak: r1(spDb), truePeak: r1(tpDb), plr: r1(tpDb - lufs), crest: r1(spDb - loudRms),
    clipHits: clip, correlation: corrs.length ? Math.round(mean(corrs) * 100) / 100 : 1,
    width: sumM > 1e-9 ? Math.min(9.99, Math.round(100 * Math.sqrt(sumS / sumM)) / 100) : 0,
    monoLoss: r1(Math.min(40, dbP(sumLR) - dbP(sumM))), bands: B, mudRatio: r1(B.mud - B.mid), tilt,
    lowSide: r1(dbP(ls) - dbP(lm)), airDev: r1(airDev),
    isMono: sumS < 1e-9 * Math.max(sumM, 1e-9)
  };
}

function loudKey(a) { return a.lufs < -20 ? 'quiet' : a.lufs <= -12 ? 'ok' : a.plr < 7 ? 'crushed' : 'loud'; }

function decide(a, o) {
  const c = Object.assign({ tone: 0, low: 0, dynamics: 0, loudness: 0 }, o.custom || {});
  const ai = !!o.ai, strong = ai && a.airDev > 6;
  const eq = [], steps = [];
  eq.push({ t: 'hp', f: 24, q: 0.707, g: 0 }); steps.push(['초저역 럼블 제거', 'HPF 24 Hz']);
  const dev = k => (a.bands[k] - a.bands.mid) - REF[k], tol = 5;
  const amt = (d, maxCut, maxBoost) => d > 0 ? -Math.min(maxCut, (d - tol) * 0.3 + 0.5) : Math.min(maxBoost, (-d - tol) * 0.25 + 0.3);
  const plan = [['sub', 'lowshelf', 50, 0.707, '초저역'], ['low', 'peak', 100, 0.9, '저역'], ['himid', 'peak', 3200, 0.9, '중고역']];
  for (const [k, t, f, q, label] of plan) { const d = dev(k); if (Math.abs(d) > tol) { const g = r1(amt(d, 2, 1)); eq.push({ t, f, q, g }); steps.push([`${label} ${g < 0 ? '정리' : '보강'} (기준 대비 ${d > 0 ? '+' : ''}${r1(d)} dB)`, `${t === 'peak' ? 'Bell' : 'Shelf'} ${f} Hz ${g > 0 ? '+' : ''}${g} dB`]); } }
  const md = a.mudRatio - REF.mud;
  if (md > tol) { const g = -r1(Math.min(1.5, (md - tol) * 0.3 + 0.5)); eq.push({ t: 'peak', f: 300, q: 1.1, g }); steps.push(['저중역 탁함 정리 (200–500 Hz)', `Bell 300 Hz ${g} dB`]); }
  const ad = dev('air');
  if (ad < -tol && !ai) { const g = r1(Math.min(1, (-ad - tol) * 0.25 + 0.3)); eq.push({ t: 'highshelf', f: 10000, q: 0.707, g }); steps.push(['공기감 보강', `Shelf 10 kHz +${g} dB`]); }
  else if (ad > tol + 2 && !ai) { const g = -r1(Math.min(1.5, (ad - tol) * 0.3 + 0.3)); eq.push({ t: 'highshelf', f: 10000, q: 0.707, g }); steps.push(['과한 고역 정리', `Shelf 10 kHz ${g} dB`]); }
  if (Math.abs(c.tone) > 0.01) { eq.push({ t: 'highshelf', f: 3000, q: 0.707, g: r1(2.5 * c.tone) }); steps.push(['커스텀: 톤', `Shelf 3 kHz ${c.tone > 0 ? '+' : ''}${r1(2.5 * c.tone)} dB`]); }
  if (Math.abs(c.low) > 0.01) { eq.push({ t: 'lowshelf', f: 120, q: 0.707, g: r1(2.5 * c.low) }); steps.push(['커스텀: 저역', `Shelf 120 Hz ${c.low > 0 ? '+' : ''}${r1(2.5 * c.low)} dB`]); }

  // 아래 숫자는 heywavv 비교 곡에 맞춘 기본값입니다. o.tune 은 비교 스크립트가 값을 바꿔 보려고 쓰는 통로입니다.
  const T = Object.assign({ W: 1, wC: 0.6, wS: 0.33, lowF: 180, lowK: 1.5, lowS: 0.4, lowCap: 4, lev: 1, lOff: -2, lRatio: 2, lAtk: 0.01, lRel: 0.1, lMk: 0.7, target: -9 }, o.tune || {});
  const hd = dev('himid');
  const deharsh = ai || hd > tol || ad > tol ? { f: ai ? 7000 : 5000, off: strong ? 2 : ai ? 4 : 6, ratio: strong ? 4 : ai ? 3 : 2, maxGR: strong ? 8 : ai ? 6 : 4, atk: 0.001, rel: 0.05 } : null;
  if (deharsh) steps.push([ai ? 'AI 고역 금속성 잡음 제어 (다이내믹)' : '거친 고역 제어 (다이내믹)', `> ${r1(deharsh.f / 1000)} kHz · ${deharsh.ratio}:1 · 최대 ${deharsh.maxGR} dB`]);
  // Top-end leveller: lift the band above 3 kHz and give the lift back when the band is loud, so quiet passages
  // gain air and loud ones stay put (measured on heywavv masters: about +3 dB quiet vs 0 dB loud above 5 kHz).
  const level = T.lev && !ai ? { f: 3000, off: T.lOff, ratio: T.lRatio, maxGR: 6, atk: T.lAtk, rel: T.lRel, makeup: T.lMk } : null;
  if (level) steps.push(['고역 다이내믹 레벨링', `> 3 kHz · ${T.lRatio}:1 · 조용한 구간 공기감 보강`]);

  // Mid/side: tighten the low end, open the mids. Measured on heywavv's demo masters: side −2…−5 dB below 120 Hz,
  // +2…+4 dB between 120 Hz and 2 kHz, about half that for generated tracks. Skipped when the phase is already fragile.
  // Narrow mixes get opened up more than mixes that are already wide (correlation 0.95 → full, 0.8 → about half).
  const wide = !a.isMono && a.correlation >= 0.3 ? r1(T.W * clamp((a.correlation - T.wC) / T.wS, 0, 1) * 100) / 100 : 0;
  const lowCut = !a.isMono && a.lowSide > -34 ? -r1(T.lowK * (3 + clamp((a.lowSide + 26) * T.lowS, 0, T.lowCap))) : 0;
  const stereo = { lowCut, lowF: T.lowF, wide, shrink: !a.isMono && a.correlation < 0.15 ? 0.85 : 1 };
  if (lowCut) steps.push(['저역 스테레오 조이기 (< 180 Hz)', `사이드 ${lowCut} dB`]);
  if (wide) steps.push(['중역 스테레오 넓히기 (120 Hz–4 kHz)', `사이드 최대 +${r1(3.5 * wide)} dB`]);
  if (stereo.shrink < 1) steps.push(['위상 문제 완화', `스테레오 폭 ${Math.round(stereo.shrink * 100)}%`]);

  let glue = a.plr > 14 ? 3 : a.plr > 10 ? 2 : a.plr > 8 ? 1 : 0;
  glue = clamp(glue + 1.5 * c.dynamics, 0, 5);
  const ratio = r1(1.6 + 0.6 * Math.max(0, c.dynamics) + (a.plr > 14 ? 0.4 : 0));
  const comp = glue > 0.2 ? { amount: r1(glue), ratio, attack: c.dynamics > 0 ? 0.035 : 0.025, release: 0.18 } : null;
  if (comp) steps.push(['글루 컴프레션', `${ratio}:1 · 평균 ${comp.amount} dB`]);

  const key = loudKey(a);
  let target = T.target;
  if (key === 'loud') target = Math.max(T.target, Math.min(a.lufs, -8));
  if (key === 'crushed') target = Math.max(-11, Math.min(a.lufs, -9));
  target = r1(clamp(target + 2.5 * c.loudness, -16, -6.5));
  const ceil = -0.5;
  steps.push(['트루피크 리미터 + 음량 맞춤', `${target} LUFS · ${ceil} dBTP`]);
  return { ai, strong, eq, deharsh, level, stereo, comp, target, ceil, steps, key, custom: c };
}

function deharshBand(L, R, sr, p) {
  const n = L.length, k = biq('hp', p.f, 0.707, 0, sr);
  const hL = runBiq(runBiq(L, k, new Float32Array(n)), k), hR = runBiq(runBiq(R, k, new Float32Array(n)), k);
  let e = 0; for (let i = 0; i < n; i++) e += hL[i] * hL[i] + hR[i] * hR[i];
  const thr = dbP(e / (2 * n)) + p.off, af = Math.exp(-1 / (0.003 * sr)), atk = Math.exp(-1 / (p.atk * sr)), rel = Math.exp(-1 / (p.rel * sr));
  let env = 0, gr = 0, maxGR = 0, sumGR = 0;
  for (let i = 0; i < n; i++) {
    const x = (hL[i] * hL[i] + hR[i] * hR[i]) * 0.5; env = af * env + (1 - af) * x;
    const lv = dbP(env), want = lv > thr ? Math.min(p.maxGR, (lv - thr) * (1 - 1 / p.ratio)) : 0;
    gr = want > gr ? atk * gr + (1 - atk) * want : rel * gr + (1 - rel) * want;
    if (gr > maxGR) maxGR = gr; sumGR += gr;
    const g = Math.pow(10, -gr / 20) - 1; L[i] += g * hL[i]; R[i] += g * hR[i];
  }
  const avgGR = sumGR / n;
  if (p.makeup && avgGR > 0.05) { const k2 = biq('highshelf', p.f, 0.707, avgGR * p.makeup, sr); runBiq(L, k2); runBiq(R, k2); }
  return { maxGR: r1(maxGR), avgGR: Math.round(avgGR * 100) / 100 };
}

function glueComp(L, R, sr, p) {
  const n = L.length, a = Math.exp(-1 / (0.02 * sr)), env = new Float32Array(n); let e = 0;
  for (let i = 0; i < n; i++) { const x = Math.max(L[i] * L[i], R[i] * R[i]); e = a * e + (1 - a) * x; env[i] = e; }
  const lv = []; const st = Math.round(0.01 * sr); for (let i = 0; i < n; i += st) lv.push(dbP(env[i]));
  lv.sort((x, y) => x - y); const p90 = lv[Math.floor(lv.length * 0.9)] ?? -20;
  const slope = 1 - 1 / p.ratio, thr = p90 - p.amount / slope, knee = 6;
  const atk = Math.exp(-1 / (p.attack * sr)), rel = Math.exp(-1 / (p.release * sr)); let gr = 0, maxGR = 0;
  for (let i = 0; i < n; i++) {
    const l = dbP(env[i]), over = l - thr;
    const want = over <= -knee / 2 ? 0 : over >= knee / 2 ? over * slope : slope * (over + knee / 2) ** 2 / (2 * knee);
    gr = want > gr ? atk * gr + (1 - atk) * want : rel * gr + (1 - rel) * want; if (gr > maxGR) maxGR = gr;
    const g = Math.pow(10, -gr / 20); L[i] *= g; R[i] *= g;
  }
  return { maxGR: r1(maxGR) };
}

// Look-ahead peak limiter with inter-sample estimate; offline, so the window looks forward.
function limiter(L, R, sr, ceilLin) {
  const n = L.length, req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (i > 0 && i + 2 < n && p > ceilLin * 0.7) {
      const mL = (-L[i - 1] + 9 * L[i] + 9 * L[i + 1] - L[i + 2]) / 16, mR = (-R[i - 1] + 9 * R[i] + 9 * R[i + 1] - R[i + 2]) / 16;
      p = Math.max(p, Math.abs(mL), Math.abs(mR));
    }
    req[i] = p > ceilLin ? ceilLin / p : 1;
  }
  const la = Math.max(1, Math.round(0.0015 * sr)), W = 2 * la, m = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) { // forward-looking sliding minimum over [i, i+W]
    while (t > h && req[dq[t - 1]] >= req[i]) t--; dq[t++] = i;
    while (dq[h] > i + W) h++;
    m[i] = req[dq[h]];
  }
  let acc = 0; const rc = 1 - Math.exp(-1 / (0.06 * sr)); let g = 1, minG = 1;
  for (let i = 0; i < n; i++) {
    acc += m[i]; if (i - la - 1 >= 0) acc -= m[i - la - 1];
    const avg = acc / Math.min(i + 1, la + 1);
    g = Math.min(avg, g + (1 - g) * rc); if (g < minG) minG = g;
    L[i] *= g; R[i] *= g;
  }
  return { maxGR: r1(-dbA(minG)) };
}

function master(L0, R0, sr, a, o, prog) {
  const d = decide(a, o), n = L0.length; let L = L0, R = R0;
  prog('decide', d);
  prog('process', null, 'EQ로 대역을 정리하는 중');
  for (const f of d.eq) { const k = biq(f.t, f.f, f.q, f.g, sr); runBiq(L, k); runBiq(R, k); }
  const st = d.stereo;
  if (st.lowCut || st.wide || st.shrink < 1) {
    prog('process', null, '스테레오 이미지를 정리하는 중');
    const S = new Float32Array(n);
    for (let i = 0; i < n; i++) S[i] = (L[i] - R[i]) / 2;
    const side = [['lowshelf', st.lowF, 0.707, st.lowCut], ['peak', 350, 0.8, 2.5 * st.wide], ['peak', 1100, 0.8, 3.5 * st.wide], ['peak', 4000, 0.9, 1.5 * st.wide]];
    for (const [t, f, q, g] of side) if (Math.abs(g) > 0.01) runBiq(S, biq(t, f, q, g, sr));
    for (let i = 0; i < n; i++) { const M = (L[i] + R[i]) / 2, s = S[i] * st.shrink; L[i] = M + s; R[i] = M - s; }
  }
  let dh = null;
  if (d.deharsh) { prog('process', null, d.ai ? '고역의 금속성 잡음을 찾아 누르는 중' : '거친 고역을 다듬는 중'); dh = deharshBand(L, R, sr, d.deharsh); }
  let lv = null;
  if (d.level) { prog('process', null, '고역 다이내믹을 다듬는 중'); lv = deharshBand(L, R, sr, d.level); }
  let cp = null;
  if (d.comp) { prog('process', null, '다이내믹을 정돈하는 중'); cp = glueComp(L, R, sr, d.comp); }
  prog('finish', null, '음량을 맞추는 중');
  const pre = loudness([L, R], sr), ceilLin = Math.pow(10, d.ceil / 20);
  let gain = clamp(d.target - pre, -12, 24), outL, outR, lim, meas = pre;
  for (let it = 0; it < 8; it++) {
    const g = Math.pow(10, gain / 20); outL = new Float32Array(n); outR = new Float32Array(n);
    for (let i = 0; i < n; i++) { outL[i] = L[i] * g; outR[i] = R[i] * g; }
    lim = limiter(outL, outR, sr, ceilLin);
    meas = loudness([outL, outR], sr);
    const err = d.target - meas; if (Math.abs(err) < 0.15 || gain >= 24) break;
    gain = clamp(gain + err * 1.25, -12, 24);
  }
  prog('finish', null, '트루피크를 확인하는 중');
  const pk = peaks([outL, outR]);
  if (pk.tp > ceilLin) { const s = ceilLin / pk.tp * 0.999; for (let i = 0; i < n; i++) { outL[i] *= s; outR[i] *= s; } }
  const after = analyze(outL, outR, sr);
  return { L: outL, R: outR, plan: d, after, stats: { deharsh: dh, comp: cp, limiter: lim, gainDb: r1(gain) } };
}

// Synthetic demo: a 16-second loop with drums, bass, pad and a deliberate metallic top-end sheen.
function makeSample(sr) {
  const sec = 16, n = sec * sr, L = new Float32Array(n), R = new Float32Array(n), bpm = 96, beat = 60 / bpm;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const hp = biq('hp', 7000, 0.707, 0, sr); let hz1 = 0, hz2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, b = t / beat, bi = Math.floor(b), ph = (b - bi) * beat, bar = Math.floor(bi / 4) % 4;
    let l = 0, r = 0;
    if (bi % 2 === 0 || (bi % 8 === 7 && ph > beat / 2)) { const tt = bi % 2 === 0 ? ph : ph - beat / 2; const f = 45 + 90 * Math.exp(-tt * 30); const k = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 7) * 0.55; l += k; r += k; }
    if (bi % 2 === 1) { const s = (rnd() * 0.5 + Math.sin(2 * Math.PI * 190 * ph) * 0.3) * Math.exp(-ph * 16) * 0.4; l += s * 0.95; r += s; }
    const hph = (b * 2 - Math.floor(b * 2)) * beat / 2; const nz = rnd(); let hv = hp[0] * nz + hz1; hz1 = hp[1] * nz - hp[3] * hv + hz2; hz2 = hp[2] * nz - hp[4] * hv;
    const hh = hv * Math.exp(-hph * 40) * 0.22; l += hh * 0.7; r += hh;
    const root = mtof(chords[bar][0] - 24), bp = (t * root) % 1, bass = (2 * bp - 1) * 0.16 * (0.6 + 0.4 * Math.exp(-ph * 4)); l += bass; r += bass;
    for (let j = 0; j < 3; j++) { const f = mtof(chords[bar][j]); l += Math.sin(2 * Math.PI * f * 1.003 * t) * 0.045 + Math.sin(2 * Math.PI * f * 2 * t) * 0.012; r += Math.sin(2 * Math.PI * f * 0.997 * t) * 0.045 + Math.sin(2 * Math.PI * f * 2.004 * t) * 0.012; }
    const mud = Math.sin(2 * Math.PI * 280 * t) * 0.03 * (0.7 + 0.3 * Math.sin(t * 3)); l += mud; r += mud;
    const fz = (Math.sin(2 * Math.PI * 9400 * t) * 0.011 + Math.sin(2 * Math.PI * 11250 * t) * 0.009 + Math.sin(2 * Math.PI * 12800 * t) * 0.007) * (0.5 + 0.5 * Math.abs(Math.sin(2 * Math.PI * t * bpm / 60)));
    l += fz; r += fz * 0.9;
    L[i] = l * 0.42; R[i] = r * 0.42;
  }
  const f = Math.round(0.01 * sr); for (let i = 0; i < f; i++) { const g = i / f; L[i] *= g; R[i] *= g; L[n - 1 - i] *= g; R[n - 1 - i] *= g; }
  return { L, R };
}

/**
 * 측정값을 좋음 · 확인 · 손보기로 나눕니다.
 * 완성된 마스터(mastered)는 발매 음량 기준으로, 믹스는 마스터링 여유 기준으로 봅니다.
 */
function judge(a, mastered) {
  const tp = a.truePeak;
  const loud = mastered ? (a.lufs >= -14 && a.lufs <= -7 ? 'good' : 'warn') : a.lufs < -20 ? 'warn' : a.lufs <= -12 ? 'good' : a.plr < 7 ? 'bad' : 'warn';
  return {
    loud,
    peak: a.clipHits > 0 || tp > 0 ? 'bad' : tp > -1 ? 'warn' : 'good',
    dyn: a.plr < 6 ? 'bad' : a.plr < 8 ? 'warn' : 'good',
    mud: a.mudRatio > 6 ? 'bad' : a.mudRatio > 4 ? 'warn' : 'good',
    stereo: a.isMono ? 'good' : a.correlation < 0.1 ? 'bad' : a.correlation < 0.4 ? 'warn' : 'good',
    tilt: a.tilt.length >= 2 ? 'bad' : a.tilt.length === 1 ? 'warn' : 'good'
  };
}

export { analyze, decide, master, judge, loudKey, loudness, peaks, makeSample };
