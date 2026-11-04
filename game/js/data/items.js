/*
 * 아이템 데이터 (공통)
 *  - name: 이름 / desc: 설명 / unique: false 가 아니면 1개만 가질 수 있음 (중복 획득 방지)
 *  - draft: true 면 설정 미확정 임시 아이템
 * 스크립트에서  @give 아이템ID  로 지급한다.
 */
window.WS = window.WS || {};

WS.ITEMS = {
  handkerchief: {
    name: '손수건',
    desc: '책상 서랍에 들어 있던 평범한 손수건.',
    draft: true,
  },
};
