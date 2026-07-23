// ============================================================
// systems/pms.js
// PMS(ETRIware, 내부망) 어댑터.
// registry에 { detect, locate, aggregate } 형태로 등록한다.
// ============================================================

(() => {
  const { cellText, parseAmount, findHeaderRow, findColumnInRow, lastRowByColumn } = window.GridUtils;
  const { PMS_CATEGORY_MAP, UNCLASSIFIED, BASIC_PROJECT_SIGNATURE, classifyBy, emptySums } = window.CategoryMap;

  function classifyPMS(semok) {
    return classifyBy(PMS_CATEGORY_MAP, semok, false);
  }

  // 원본 detectFileType의 PMS 판별 조건 그대로: "세세세목"/"발의액" 헤더가 있으면 PMS
  function detect(grid) {
    return findHeaderRow(grid, "세세세목", 10) > 0 && findHeaderRow(grid, "발의액", 10) > 0;
  }

  function locate(grid) {
    const headerRow = findHeaderRow(grid, "세세세목", 10);
    if (!headerRow) {
      return { ok: false, error: "PMS 헤더 행을 찾지 못했습니다. (세세세목 텍스트 없음)" };
    }
    const cols = {
      semok: findColumnInRow(grid, headerRow, "세세세목"),
      exec: findColumnInRow(grid, headerRow, "실행예산"),
      carry: findColumnInRow(grid, headerRow, "이월예산"),
      actual: findColumnInRow(grid, headerRow, "실적계"),
    };
    if (!cols.semok || !cols.exec || !cols.carry || !cols.actual) {
      return {
        ok: false,
        error: "PMS 파일에서 필수 컬럼(세세세목/실행예산/이월예산/실적계)을 찾지 못했습니다. " +
               "다운로드 양식이 변경되었을 수 있습니다."
      };
    }
    return { ok: true, headerRow, dataStartRow: headerRow + 1, cols };
  }

  function aggregate(grid, loc) {
    const sums = emptySums();
    const unclassifiedLabels = new Set();
    const lastRow = lastRowByColumn(grid, loc.cols.semok);
    for (let r = loc.dataStartRow; r <= lastRow; r++) {
      const semok = cellText(grid, r, loc.cols.semok);
      const cat = classifyPMS(semok);
      if (!cat) continue;
      if (cat === UNCLASSIFIED) unclassifiedLabels.add(semok);
      sums[cat].carry += parseAmount(cellText(grid, r, loc.cols.carry));
      sums[cat].exec += parseAmount(cellText(grid, r, loc.cols.exec));
      sums[cat].actual += parseAmount(cellText(grid, r, loc.cols.actual));
    }
    const looksLikeBasicProject = [...unclassifiedLabels].some((label) => BASIC_PROJECT_SIGNATURE.has(label));
    return { sums, lastRow, unclassifiedLabels: [...unclassifiedLabels], looksLikeBasicProject };
  }

  window.SystemRegistry.register("PMS", {
    label: "PMS(내부망)",
    isExternal: false,
    detect, locate, aggregate,
  });
})();
