// =============================================================
//  적(이상체) 데이터
//  - speed: 1초에 몇 칸 이동, interval: 공격 간격(초)
//  - range: 0 이면 근접(저지당했을 때만 공격), 0보다 크면 원거리(이동하면서 사거리 안 캐릭터 공격)
//  - baseDamage: 기지에 닿았을 때 깎는 기지 체력
//  - flying: true 면 저지 불가
//  - size: 임시 그래픽 크기 (칸 단위 반지름)
//  - slam: 보스 범위 공격 { every: 주기(초), warn: 예고(초), radius: 반경(칸), mult: 공격력 배율 }
//  이미지: assets/enemies/<id>.png 가 있으면 사용
// =============================================================
window.ENEMY_GRADES = {
  '원형': { color: '#8fa3b8', dark: '#56677a' },
  '야형': { color: '#e39a52', dark: '#9c5f2a' },
  '괴형': { color: '#a585d6', dark: '#67509a' },
  '흉형': { color: '#5fa59a', dark: '#346a62' },
  '지형': { color: '#d9b84c', dark: '#8f7425' }
};

window.ENEMIES = [
  { id: 'fuzz', name: '잔털이', grade: '원형', type: '일반',
    hp: 550, atk: 150, def: 0, res: 0, interval: 1.5, range: 0, speed: 1.0, baseDamage: 1,
    size: 0.26, look: 'fuzz', desc: '기본 잡몹' },
  { id: 'rusher', name: '돌진충', grade: '야형', type: '돌격',
    hp: 800, atk: 200, def: 50, res: 0, interval: 1.2, range: 0, speed: 2.0, baseDamage: 1,
    size: 0.26, look: 'horn', desc: '빠름' },
  { id: 'mask', name: '가면쟁이', grade: '괴형', type: '일반',
    hp: 2000, atk: 300, def: 150, res: 10, interval: 1.8, range: 0, speed: 0.8, baseDamage: 1,
    size: 0.3, look: 'mask', desc: '단단함' },
  { id: 'spitter', name: '가시뿜이', grade: '괴형', type: '원거리',
    hp: 1400, atk: 260, def: 80, res: 10, interval: 2.0, range: 2.5, speed: 0.7, baseDamage: 1,
    size: 0.28, look: 'spike', desc: '언덕 캐릭터도 공격, 저지되면 막은 캐릭터 공격' },
  { id: 'papermoth', name: '종이나비', grade: '괴형', type: '비행',
    hp: 900, atk: 0, def: 0, res: 20, interval: 0, range: 0, speed: 1.2, baseDamage: 1,
    size: 0.24, look: 'moth', flying: true, desc: '저지 불가, 공격 안 함, 레인저가 우선 공격' },
  { id: 'ironbug', name: '철갑충', grade: '흉형', type: '중장갑',
    hp: 4000, atk: 450, def: 600, res: 0, interval: 2.5, range: 0, speed: 0.5, baseDamage: 2,
    size: 0.36, look: 'shell', desc: '물리 공격이 잘 안 먹힘 → 미스틱 필요' },
  { id: 'toadking', name: '왕관 두꺼비', grade: '지형', type: '보스',
    hp: 15000, atk: 600, def: 300, res: 30, interval: 2.0, range: 0, speed: 0.4, baseDamage: 3,
    size: 0.5, look: 'toad', boss: true,
    slam: { every: 12, warn: 2, radius: 2, mult: 2.0 },
    entryLine: '개굴! 이 길은 짐의 산책로다. 비켜라, 엽사들!',
    desc: '12초마다 2초 예고 후 반경 2칸 아군 전체에 공격력 200% 피해' }
];
