// =============================================================
//  전투용 SD 애니메이션 설정
//  이미지 위치: assets/sprites/<캐릭터id>/<동작>_<번호>.png   (번호는 1부터)
//    예) assets/sprites/amelie/idle_1.png ~ idle_7.png
//  - frames  : 프레임 수
//  - fps     : 1초에 몇 장 넘길지
//  - hitFrame: 공격이 실제로 맞는(투사체가 나가는) 프레임 번호
//  - loop    : 반복 재생 여부 (idle 만 true)
//  - height  : 전투 화면에서 그림 높이 (칸 단위, 1 = 타일 한 칸)
//  - offsetY : 그림을 위(-)/아래(+)로 옮기기 (칸 단위)
//  동작: idle(대기) attack(공격) skill(스킬) heal(회복) fallen(쓰러짐)
// =============================================================
window.ANIMATIONS = {
  // 데이터가 없을 때 쓰는 기본값
  defaultAction: { frames: 4, fps: 8, hitFrame: 3 },

  characters: {
    amelie: {
      height: 1.5, offsetY: 0,
      actions: {
        idle:   { frames: 7, fps: 6, loop: true },
        attack: { frames: 4, fps: 10, hitFrame: 3 },
        skill:  { frames: 7, fps: 10, hitFrame: 5 },
        fallen: { frames: 6, fps: 8 }
      }
    },
    sheba: {
      height: 1.5, offsetY: 0,
      actions: {
        idle:   { frames: 7, fps: 6, loop: true },
        attack: { frames: 4, fps: 8, hitFrame: 3 },
        skill:  { frames: 6, fps: 8, hitFrame: 4 },
        fallen: { frames: 6, fps: 8 }
      }
    },
    vivian: {
      height: 1.5, offsetY: 0,
      actions: {
        idle:   { frames: 4, fps: 5, loop: true },
        attack: { frames: 6, fps: 12, hitFrame: 3 },
        fallen: { frames: 5, fps: 8 }
      }
    },
    hana: {
      height: 1.5, offsetY: 0,
      actions: {
        idle:   { frames: 4, fps: 5, loop: true },
        heal:   { frames: 6, fps: 8, hitFrame: 4 },
        fallen: { frames: 5, fps: 8 }
      }
    },
    ara: {
      height: 1.5, offsetY: 0,
      actions: {
        idle:   { frames: 3, fps: 4, loop: true },
        attack: { frames: 6, fps: 12, hitFrame: 3 },
        fallen: { frames: 3, fps: 6 }
      }
    },
    riri: {
      height: 1.4, offsetY: 0,
      actions: {
        idle:   { frames: 4, fps: 6, loop: true },
        attack: { frames: 5, fps: 14, hitFrame: 3 },
        skill:  { frames: 5, fps: 10, hitFrame: 2 },
        fallen: { frames: 2, fps: 4 }
      }
    }
  }
};
