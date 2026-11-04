/*
 * 직업 데이터 (정체성 · 연출)
 * ------------------------------------------------------------
 * 수치(능력치, 능력 위력 등)는 balance.js 에 따로 있다.
 * 순서를 바꾸면 직업 선택 화면의 표시 순서가 바뀐다.
 *
 * 항목
 *   id              고유 ID (balance.js, 이미지 파일명과 일치)
 *   name            직업명
 *   tagline         한 줄 소개
 *   role            전투 성향 (짧은 태그)
 *   style           전투 성향 설명
 *   signatureAbility 대표 능력 ID (balance.js 의 ABILITIES)
 *   initialAbilities 각성 시 등록되는 능력 ID 목록
 *   strengths       장점과 특징
 *   color / colorLight  강조색
 *   awakening       각성 효과 (particle: heart|butterfly|star|petal|bell)
 *   (변신 후 도트는 tools/dots.py 의 draw_<id> 함수에서 그린다)
 *   unlock          해금 조건 (progression.js 의 조건 형식). 없으면 항상 선택 가능
 *   draft           true 면 설정 미확정 임시 데이터 (화면에 '임시' 표시)
 */
window.WS = window.WS || {};

WS.JOBS = [
  {
    id: 'morganite',
    name: '핑크 모르가나이트',
    tagline: '상처를 보듬는 분홍빛 심장의 수호자.',
    role: '회복 · 수호',
    style: '아군을 치유하고 보호막을 둘러 전열을 유지한다. 직접 공격력은 낮지만 오래 버틴다.',
    signatureAbility: 'heart_bloom',
    initialAbilities: ['heart_bloom'],
    strengths: ['파티 전체 회복', '피해를 흡수하는 보호막', '긴 전투에서 안정적'],
    color: '#e2477c',
    colorLight: '#ffc2d8',
    awakening: { particle: 'heart', colors: ['#ff8fb8', '#ffd6e6', '#e2477c'], shake: 2 },
    portrait: 'assets/portraits/morganite.jpg',
    card: 'assets/jobs/morganite.jpg',
    unlock: { type: 'always' },
    draft: true,
  },
  {
    id: 'aquamarine',
    name: '아쿠아 마린',
    tagline: '고요한 물결과 나비의 날개로 흐름을 묶는 자.',
    role: '제어 · 방어',
    style: '적의 움직임을 늦추고 얼려 전장의 흐름을 통제한다. 방어력이 높아 버티는 힘도 좋다.',
    signatureAbility: 'tide_veil',
    initialAbilities: ['tide_veil'],
    strengths: ['광역 둔화 · 빙결', '높은 방어력', '위험한 적을 묶어 두기'],
    color: '#3f7fd6',
    colorLight: '#cfe2ff',
    awakening: { particle: 'butterfly', colors: ['#9cc4ff', '#ffffff', '#3f7fd6'], shake: 2 },
    portrait: 'assets/portraits/aquamarine.jpg',
    card: 'assets/jobs/aquamarine.jpg',
    unlock: { type: 'always' },
    draft: true,
  },
  {
    id: 'amethyst',
    name: '퍼플 애머시스트',
    tagline: '달과 별을 불러내리는 보랏빛 몽상가.',
    role: '원거리 · 광역 마법',
    style: '멀리서 강력한 마법을 퍼부어 여러 적을 한꺼번에 공격한다. 마나 소모가 크고 몸은 약하다.',
    signatureAbility: 'crescent_fall',
    initialAbilities: ['crescent_fall'],
    strengths: ['최고 수준의 마법 화력', '여러 적을 동시에 공격', '사거리가 길다'],
    color: '#8a5ad8',
    colorLight: '#e4d6ff',
    awakening: { particle: 'star', colors: ['#c9b0ff', '#f6e7a8', '#8a5ad8'], shake: 2 },
    portrait: 'assets/portraits/amethyst.jpg',
    card: 'assets/jobs/amethyst.jpg',
    unlock: { type: 'always' },
    draft: true,
  },
  {
    id: 'ruby',
    name: '로즈 루비',
    tagline: '가시 돋친 장미처럼, 다가오는 모든 것을 베어 낸다.',
    role: '근접 · 연속 공격',
    style: '적에게 파고들어 연속 공격을 퍼붓는다. 체력을 대가로 위력을 끌어올리는 고위험 고화력형.',
    signatureAbility: 'thorn_waltz',
    initialAbilities: ['thorn_waltz'],
    strengths: ['단일 대상 최고 화력', '가한 피해 일부를 체력으로 흡수', '체력이 낮을수록 강해짐'],
    color: '#c4283a',
    colorLight: '#ffc9cf',
    awakening: { particle: 'petal', colors: ['#e0384a', '#ff8a96', '#5a1018'], shake: 3 },
    portrait: 'assets/portraits/ruby.jpg',
    card: 'assets/jobs/ruby.jpg',
    unlock: { type: 'always' },
    draft: true,
  },
  {
    id: 'heliodor',
    name: '옐로 헬리오도르',
    tagline: '황금 종을 울려 시간의 박자를 바꾸는 자.',
    role: '강화 · 교란',
    style: '종소리로 아군의 행동을 앞당기고 적의 박자를 흐트러뜨린다. 판을 짜는 전략형.',
    signatureAbility: 'golden_chime',
    initialAbilities: ['golden_chime'],
    strengths: ['아군 속도 · 공격력 강화', '적 행동 지연', '다른 직업과 조합이 좋다'],
    color: '#d9a21e',
    colorLight: '#fff0b8',
    awakening: { particle: 'bell', colors: ['#ffd65a', '#fff6cf', '#b07a12'], shake: 2 },
    portrait: 'assets/portraits/heliodor.jpg',
    card: 'assets/jobs/heliodor.jpg',
    unlock: { type: 'always' },
    draft: true,
  },
];

WS.getJob = function (id) {
  return WS.JOBS.find(j => j.id === id) || null;
};
