/**
 * 마스터링 계산을 화면과 따로 돌리는 Web Worker.
 * 긴 곡은 몇 초가 걸리므로, 화면에서 돌리면 그동안 버튼도 스크롤도 멈춥니다.
 *
 * 받는 것: { id, op: 'analyze' | 'master' | 'sample', ... }
 * 보내는 것: 진행 중이면 { id, type: 'progress' }, 끝나면 { id, type: 'done' | 'error' }
 */
import { analyze, master, makeSample } from './engine.js';

// npm test 의 불러오기 검사는 Node 에서 이 파일을 열어 봅니다. 거기에는 self 가 없습니다.
if (typeof self !== 'undefined') {
  self.onmessage = (e) => {
    const m = e.data, id = m.id;
    const prog = (stage, plan, text) => self.postMessage({ id, type: 'progress', stage, plan, text });
    try {
      if (m.op === 'analyze') {
        self.postMessage({ id, type: 'done', result: analyze(m.L, m.R, m.sr) });
      } else if (m.op === 'master') {
        const r = master(m.L, m.R, m.sr, m.analysis, m.opts, prog);
        self.postMessage({ id, type: 'done', result: r }, [r.L.buffer, r.R.buffer]);
      } else if (m.op === 'sample') {
        const s = makeSample(m.sr);
        self.postMessage({ id, type: 'done', result: s }, [s.L.buffer, s.R.buffer]);
      }
    } catch (err) {
      self.postMessage({ id, type: 'error', message: String((err && err.message) || err) });
    }
  };
}
