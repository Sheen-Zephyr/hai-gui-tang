/**
 * Typewriter.js — 打字机效果
 * 支持中断：多次调用时，之前的会被停止
 */

let currentAbort = null;

export function typewriteText(element, text, speed = 30) {
  // 如果已有正在运行的打字机，中断它
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }

  return new Promise((resolve) => {
    const abort = { aborted: false, _resolve: null };
    abort.abort = () => {
      abort.aborted = true;
      // 立即显示完整文本
      element.textContent = text;
      if (abort._resolve) abort._resolve();
    };
    currentAbort = abort;

    let index = 0;
    element.textContent = '';

    function type() {
      if (abort.aborted) {
        if (abort._resolve) abort._resolve();
        return;
      }
      if (index < text.length) {
        element.textContent += text[index];
        index++;
        setTimeout(type, speed);
      } else {
        currentAbort = null;
        resolve();
      }
    }

    abort._resolve = resolve;
    type();
  });
}
