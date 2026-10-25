/**
 * 마스터링 엔진의 숫자가 맞는지 브라우저 없이 확인합니다.
 *
 * 왜 필요한가:
 * 화면은 멀쩡히 떠도 음량 계산이 1 dB만 틀어지면 모든 곡이 그만큼 작거나 크게 나옵니다.
 * 귀로는 알아채기 어렵고, 피크가 천장을 넘으면 스트리밍에서 찌그러집니다.
 * 답이 정해진 신호(사인파)로 측정기를 먼저 확인하고, 그 측정기로 결과를 봅니다.
 *
 * 쓰는 법:
 *   node check-mastering.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.APP_DIR || HERE);
const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const E = await import(appUrl('js/mastering/engine.js'));
const { wavBytes } = await import(appUrl('js/mastering/wav.js'));

const SR = 48000;
let failed = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
function sine(freq, amp, sec, phase = 0) {
  const n = SR * sec, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = amp * Math.sin(2 * Math.PI * freq * i / SR + phase);
  return { L, R: L.slice() };
}
function noise(amp, sec, seed = 1) {
  const n = SR * sec, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; L[i] = amp * (seed / 2147483647 * 2 - 1); seed = (seed * 16807) % 2147483647; R[i] = amp * (seed / 2147483647 * 2 - 1); }
  return { L, R };
}

console.log('측정기:');
{
  // 1 kHz 사인파, 좌우 같은 -20 dBFS → BS.1770 기준 약 -20 LUFS
  const s = sine(997, 0.1, 5);
  const lufs = E.loudness([s.L, s.R], SR);
  check('사인파 -20 dBFS 의 음량이 -20 LUFS 근처', Math.abs(lufs + 20) < 0.3, `${lufs.toFixed(2)} LUFS`);
}
{
  // fs/4 사인파를 45° 어긋나게 잡으면 샘플은 0.707 에 머물지만 실제 파형 꼭대기는 1.0 입니다.
  const s = sine(SR / 4, 1, 1, Math.PI / 4);
  const p = E.peaks([s.L, s.R]);
  const sp = 20 * Math.log10(p.sample), tp = 20 * Math.log10(p.tp);
  check('샘플 사이 피크를 잡아냄 (트루피크 > 샘플 피크)', tp > sp + 2 && Math.abs(tp) < 0.5, `샘플 ${sp.toFixed(2)} · 트루 ${tp.toFixed(2)} dBTP`);
}

console.log('\n마스터링:');
{
  const s = E.makeSample(SR), a = E.analyze(s.L, s.R, SR);
  const r = E.master(s.L.slice(), s.R.slice(), SR, a, { ai: true }, () => {});
  check('트루피크가 천장을 넘지 않음', r.after.truePeak <= r.plan.ceil + 0.05, `${r.after.truePeak} dBTP · 천장 ${r.plan.ceil}`);
  check('조용한 원본을 발매 음량 근처로 올림', r.after.lufs > a.lufs + 8 && r.after.lufs <= r.plan.target + 0.3, `${a.lufs} → ${r.after.lufs} LUFS`);
  check('처리 목록이 비어 있지 않음', r.plan.steps.length >= 3, `${r.plan.steps.length}단계`);
  check('결과 길이가 원본과 같음', r.L.length === s.L.length && r.R.length === s.R.length);
}
{
  const s = noise(0.5, 4), a = E.analyze(s.L, s.R, SR);
  const custom = E.master(s.L.slice(), s.R.slice(), SR, a, { custom: { loudness: -1 } }, () => {});
  const plain = E.master(s.L.slice(), s.R.slice(), SR, a, {}, () => {});
  check('음량 노브를 내리면 목표 음량도 내려감', custom.plan.target < plain.plan.target, `${plain.plan.target} → ${custom.plan.target} LUFS`);
}
{
  const s = sine(220, 0.2, 3), a = E.analyze(s.L, s.R, SR);
  const r = E.master(s.L.slice(), s.R.slice(), SR, a, {}, () => {});
  check('모노 원본은 스테레오를 건드리지 않음', a.isMono && r.after.isMono && !r.plan.stereo.wide && !r.plan.stereo.lowCut);
}
{
  const s = noise(0.9, 3), a = E.analyze(s.L, s.R, SR);
  check('이미 큰 곡은 더 키우지 않음', E.decide(a, {}).target <= Math.max(a.lufs, -8) + 0.05, `원본 ${a.lufs} LUFS · 목표 ${E.decide(a, {}).target}`);
}

console.log('\nWAV 내보내기:');
{
  const L = new Float32Array([0, 0.5, -0.5]), R = new Float32Array([0, 0.25, -1]);
  const b24 = wavBytes(L, R, SR, 24), b16 = wavBytes(L, R, SR, 16);
  const v = new DataView(b24.buffer), tag = (o) => String.fromCharCode(...b24.slice(o, o + 4));
  check('24-bit 머리말이 맞음', tag(0) === 'RIFF' && tag(8) === 'WAVE' && v.getUint16(34, true) === 24 && v.getUint32(24, true) === SR && b24.length === 44 + 3 * 2 * 3);
  const s16 = new DataView(b16.buffer).getInt16(44 + 4, true);
  check('16-bit 값이 맞음 (0.5 → 약 16383)', Math.abs(s16 - 16383) <= 2, `${s16}`);
}

console.log(failed ? `\n${failed}개가 틀렸습니다.` : '\n모두 통과.');
process.exit(failed ? 1 : 0);
