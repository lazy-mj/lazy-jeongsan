// ============================================================
// ui/excel-export.js
// 결과 데이터를 엑셀(xlsx) 파일로 내보내기.
// ============================================================

function rowToArray(label, block) {
  return [
    label,
    Math.round(block.pms.carry), Math.round(block.pms.exec), Math.round(block.pms.actual), Math.round(block.pmsBalance),
    Math.round(block.ez.carry), Math.round(block.ez.exec), Math.round(block.ez.actual), Math.round(block.ezBalance),
    Math.round(block.pms.carry - block.ez.carry),
    Math.round(block.pms.exec - block.ez.exec),
    Math.round(block.pms.actual - block.ez.actual),
    Math.round(block.pmsBalance - block.ezBalance),
  ];
}

// 결과 데이터를 시트용 2차원 배열(aoa)로 변환한다.
// DOM의 <table>을 긁어오지 않고 계산 결과 데이터에서 직접 만드는 이유:
// 렌더링된 표를 스크래핑하는 방식은 여러 쌍을 한꺼번에 내보낼 때 시트가 누락되는
// 문제가 있었다 - 데이터에서 직접 만들면 화면에 몇 개가 그려져 있든 항상 정확하다.
function buildAoaForResult(result) {
  const ext = result.externalLabel;
  const header = [
    "비목명",
    "PMS 이월예산", "PMS 실행예산", "PMS 집행실적", "PMS 잔액",
    `${ext} 이월예산`, `${ext} 실행예산`, `${ext} 집행실적`, `${ext} 잔액`,
    "차액 이월예산", "차액 실행예산", "차액 집행실적", "차액 잔액",
  ];
  const rows = result.rows.map((r) => rowToArray(r.category, r));
  rows.push(rowToArray("직접비", result.direct));
  rows.push(rowToArray("간접비", result.indirect));
  rows.push(rowToArray("총계", result.total));
  return [header, ...rows];
}

function sanitizeSheetName(name, usedNames) {
  let clean = name.replace(/[:\\/?*[\]]/g, "_").slice(0, 28);
  let candidate = clean || "Sheet";
  let n = 1;
  while (usedNames.has(candidate)) {
    candidate = `${clean}_${n++}`.slice(0, 31);
  }
  usedNames.add(candidate);
  return candidate;
}

function downloadAllExcel() {
  if (!AppState.state.lastItems || AppState.state.lastItems.length === 0) return;
  const wb = XLSX.utils.book_new();
  const usedNames = new Set();
  for (const item of AppState.state.lastItems) {
    const sheetName = sanitizeSheetName(item.label, usedNames);
    if (!item.result.ok) {
      const ws = XLSX.utils.aoa_to_sheet([["오류"], [item.result.error]]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      continue;
    }
    const aoa = buildAoaForResult(item.result);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, `예산검증결과_${today}.xlsx`);
  AppCore.toast.show("다운로드 완료", "success");
}

