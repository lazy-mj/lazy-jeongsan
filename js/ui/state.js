// ============================================================
// ui/state.js
// 앱의 전역 상태와, 상태만 보고 판단하는 순수 헬퍼 함수들.
// DOM을 직접 건드리지 않는다 (그건 ui/render.js의 역할).
// ============================================================

window.AppState = (() => {
  const state = {
    files: [],  // [{ id, name, grid, type }]
    pairs: [],  // [{ id, pmsId, ezId }] - 배치 모드에서 사용자가 만든 짝 목록
    resultShown: false,
    lastItems: [], // 마지막으로 계산한 결과들 [{ label, result }] - 엑셀 내보내기가 이 데이터를 사용
  };

  let fileIdSeq = 1; // 0으로 시작하면 addPair()의 !pmsId 체크에서 id=0인 파일이 "선택 안 됨"으로 오인됨
  let pairIdSeq = 1;

  function nextFileId() { return fileIdSeq++; }
  function nextPairId() { return pairIdSeq++; }

  // 등록된 시스템 레지스트리를 통해 판별 -> 새 외부시스템이 추가돼도 이 함수는 수정할 필요가 없다.
  function isExternalType(type) {
    const adapter = window.SystemRegistry.get(type);
    return !!adapter && adapter.isExternal === true;
  }

  return { state, nextFileId, nextPairId, isExternalType };
})();
