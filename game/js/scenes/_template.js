/*
 * 새 장면 템플릿 (이 파일은 게임에 로드되지 않는다. 복사해서 쓸 것)
 *
 * 1. 이 파일을 js/scenes/<장면ID>.js 로 복사하고 내용을 채운다.
 * 2. index.html 의 "장면" 구역에  <script src="js/scenes/<장면ID>.js"></script>  한 줄 추가.
 * 3. 앞 장면 스크립트 끝에서  @end 다음 장면으로 -> <장면ID>  (또는 앞 장면의 next 를 이 ID 로)
 *
 * 이전 장면에서 고른 직업 · 능력 · 선택 기록은 game.state 로 그대로 넘어온다.
 * 대사 안에서 {job.name} {ability.name} 을 쓸 수 있고, @choice 의 "@if 조건" 으로 분기할 수도 있다.
 */
WS.SCRIPTS.cafe = String.raw`
# 장면 1. 골목 끝의 카페
@fadein 1200

[주인공]
……여긴 아까와는 다르네.

[시스템]
{job.name}의 힘이 희미하게 반응한다.

@choice cafe_door
- 문을 연다 -> open
- 잠시 기다린다 -> wait
@endchoice

@label wait
[주인공]
조금만 더 있다가 들어가자.

@label open
[주인공]
들어가 볼까.

@end 다음으로 -> chapter2
`;

WS.defineScriptScene('cafe', {
  script: 'cafe',
  next: 'chapter2',
  // props: false,                 // 흰 공간의 테이블 · 의자 · 인물을 그리지 않음
  // backdrop(ctx, W, H, stage) {  // 배경을 직접 그림 (예: 노을 하늘)
  //   ctx.fillStyle = '#f6c9a8'; ctx.fillRect(0, 0, W, H);
  // },
  // setup(game, payload) {},      // 시작할 때 추가 처리
  // teardown(game) {},            // 나갈 때 추가 처리
});
