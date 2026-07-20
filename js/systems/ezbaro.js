// ============================================================
// systems/ezbaro.js
// 이지바로 어댑터.
// ============================================================

(() => {
  const { cellText, parseAmount, lastColOfGrid, findHeaderRow, findColumnInRow, lastRowByColumn } = window.GridUtils;
  const { EZBARO_CATEGORY_MAP, UNCLASSIFIED, classifyBy, emptySums } = window.CategoryMap;

  function classifyEzbaro(semok) {
    return classifyBy(EZBARO_CATEGORY_MAP, semok, true);
  }

  // 원본 detectFileType의 이지바로 판별 조건 그대로:
  // 첫 15행 안에 "연구비예실대비표" 문자열이 있으면 이지바로로 판정.
  function detect(grid) {
    const lastCol = lastColOfGrid(grid);
    const maxRow = Math.min(15, grid.length);
    for (let r = 1; r <= maxRow; r++) {
      for (let c = 1; c <= lastCol; c++) {
        if (cellText(grid, r, c).includes("연구비예실대비표")) return true;
      }
    }
    return false;
  }

  function locate(grid) {
    const headerRow = findHeaderRow(grid, "세목", 10); // level1 행 (예: 3행)
    if (!headerRow) {
      return { ok: false, error: "이지바로 헤더 행을 찾지 못했습니다. (세목 텍스트 없음)" };
    }
    const cols = {
      semok: findColumnInRow(grid, headerRow, "세목"),
      carry: findColumnInRow(grid, headerRow + 1, "전년도이월액"),
      exec: findColumnInRow(grid, headerRow + 1, "현금"),
      actual: findColumnInRow(grid, headerRow, "실사용액"),
    };
    if (!cols.semok || !cols.carry || !cols.exec || !cols.actual) {
      return {
        ok: false,
        error: "이지바로 파일에서 필수 컬럼(세목/전년도이월액/현금/실사용액)을 찾지 못했습니다. " +
               "다운로드 양식이 변경되었을 수 있습니다."
      };
    }
    return { ok: true, headerRow, dataStartRow: headerRow + 3, cols };
  }

  function aggregate(grid, loc) {
    const sums = emptySums();
    const unclassifiedLabels = new Set();
    const lastRow = lastRowByColumn(grid, loc.cols.semok);
    for (let r = loc.dataStartRow; r <= lastRow; r++) {
      const semok = cellText(grid, r, loc.cols.semok);
      const cat = classifyEzbaro(semok);
      if (!cat) continue;
      if (cat === UNCLASSIFIED) unclassifiedLabels.add(semok);
      sums[cat].carry += parseAmount(cellText(grid, r, loc.cols.carry));
      sums[cat].exec += parseAmount(cellText(grid, r, loc.cols.exec));
      sums[cat].actual += parseAmount(cellText(grid, r, loc.cols.actual));
    }
    return { sums, lastRow, unclassifiedLabels: [...unclassifiedLabels] };
  }

  window.SystemRegistry.register("EZBARO", {
    label: "이지바로",
    isExternal: true,
    detect, locate, aggregate,
  });
})();
