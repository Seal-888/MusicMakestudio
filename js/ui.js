/** 화면 아래에 잠깐 뜨는 알림 */
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/**
 * 페이지를 벗어나면 화면에 있던 내용이 사라집니다.
 * 잃으면 아까운 것이 떠 있을 때 한 번 물어보기 위한 장치입니다.
 *
 * app.js가 아니라 여기에 둡니다.
 * 화면 파일이 app.js를 불러오면 라우터가 두 번 도는 문제가 생기기 때문입니다.
 */
let leaveMessage = null;

export function setLeaveGuard(message) {
  leaveMessage = message || null;
}

export function getLeaveGuard() {
  return leaveMessage;
}

export function clearLeaveGuard() {
  leaveMessage = null;
}
