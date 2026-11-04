/*
 * 대사 스크립트(텍스트) → 실행 노드 배열
 * 문법은 js/data/script.js 머리말 참고
 */
window.WS = window.WS || {};

WS.parseScript = function (source) {
  const nodes = [];
  const labels = {};
  let speaker = null;
  let choiceBlock = null;
  const lines = source.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const lineNo = i + 1;
    if (!line || line.startsWith('//')) return;

    if (choiceBlock) {
      if (line === '@endchoice') { nodes.push(choiceBlock); choiceBlock = null; return; }
      const m = line.match(/^-\s*(.+?)(?:\s*->\s*(\S+))?(?:\s+@if\s+(\S+))?$/);
      if (!m) throw new Error(`스크립트 ${lineNo}행: 선택지 형식 오류 "${line}"`);
      choiceBlock.options.push({ text: m[1].trim(), goto: m[2] ? m[2].trim() : null, cond: m[3] || null });
      return;
    }

    if (line.startsWith('#')) { nodes.push({ type: 'heading', title: line.replace(/^#+\s*/, ''), line: lineNo }); return; }

    const tag = line.match(/^\[(.+)\]$/);
    if (tag) {
      speaker = tag[1].trim();
      return;
    }

    if (line.startsWith('@')) {
      const sp = line.indexOf(' ');
      const name = (sp < 0 ? line.slice(1) : line.slice(1, sp)).toLowerCase();
      const args = sp < 0 ? '' : line.slice(sp + 1).trim();
      if (name === 'choice') {
        choiceBlock = { type: 'choice', id: args || `choice_${lineNo}`, options: [], line: lineNo };
        return;
      }
      if (name === 'label') { labels[args] = nodes.length; return; }
      nodes.push({ type: 'cmd', name, args, line: lineNo });
      return;
    }

    nodes.push({ type: 'say', speaker, text: line, line: lineNo });
  });

  if (choiceBlock) throw new Error('스크립트: @choice 블록이 @endchoice 로 닫히지 않았습니다.');
  return { nodes, labels };
};
