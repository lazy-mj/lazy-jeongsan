// ============================================================
// systems/rcms.js
// RCMS 어댑터.
// RCMS는 "사업 > 과제 > 참여기관 > 비목" 구조라, 우리 기관(한국전자통신연구원/ETRI)
// 블록만 찾아서 그 안의 비목별 상세 행만 집계한다.
// ============================================================

(() => {
  const {
    cellText, parseAmount, findHeaderRow, findColumnInRow,
    findColumnInRange, findTopLevelSpans,
  } = window.GridUtils;
  const { RCMS_CATEGORY_MAP, UNCLASSIFIED, classifyBy, emptySums } = window.CategoryMap;

  const RCMS_ORG_MARKERS = ["한국전자통신연구원", "ETRI"];
  // RCMS 파일마다 참여기관 행 앞에 붙는 기호가 조금씩 다르게 나온 사례가 있어
  // (실사용 파일에서 "●"를 확인) 흔한 불릿 문자를 모두 인정한다.
  const RCMS_ORG_BULLETS = ["●", "○", "•", "◎"];

  function classifyRCMS(item) {
    return classifyBy(RCMS_CATEGORY_MAP, item, false);
  }

  function hasOrgBullet(text) {
    return RCMS_ORG_BULLETS.some((b) => text.includes(b));
  }

  // 원본 detectFileType의 RCMS 판별 조건 그대로: "협약한도"/"이체완료금액" 헤더가 있으면 RCMS
  function detect(grid) {
    return findHeaderRow(grid, "협약한도", 5) > 0 && findHeaderRow(grid, "이체완료금액", 5) > 0;
  }

  function findRcmsOrgBlock(grid, searchStartRow) {
    let blockStart = 0;
    for (let r = searchStartRow; r <= grid.length; r++) {
      const a = cellText(grid, r, 1);
      if (hasOrgBullet(a) && RCMS_ORG_MARKERS.some((m) => a.includes(m))) {
        blockStart = r;
        break;
      }
    }
    if (!blockStart) return { ok: false };
    let blockEnd = grid.length;
    for (let r = blockStart + 1; r <= grid.length; r++) {
      const a = cellText(grid, r, 1);
      if (hasOrgBullet(a)) { blockEnd = r - 1; break; }
    }
    return { ok: true, blockStart, blockEnd };
  }

  function locate(grid) {
    const headerRow = findHeaderRow(grid, "협약한도", 5);
    if (!headerRow) {
      return { ok: false, error: "RCMS 헤더 행을 찾지 못했습니다. (협약한도 텍스트 없음)" };
    }
    const subHeaderRow = headerRow + 1;
    const spans = findTopLevelSpans(grid, headerRow);
    const approvalSpan = spans.find((s) => s.label === "승인한도");
    const transferSpan = spans.find((s) => s.label === "이체완료금액");
    const balanceSpan = spans.find((s) => s.label === "사용잔액");
    const itemCol = findColumnInRow(grid, headerRow, "항목");

    if (!approvalSpan || !transferSpan || !balanceSpan || !itemCol) {
      return {
        ok: false,
        error: "RCMS 파일에서 필수 항목(승인한도/이체완료금액/사용잔액/항목)을 찾지 못했습니다. " +
               "다운로드 양식이 변경되었을 수 있습니다."
      };
    }

    const cols = {
      item: itemCol,
      // 사용자 확인: 이월예산=승인한도의 계속비, 실행예산=승인한도의 본예산
      exec: findColumnInRange(grid, subHeaderRow, approvalSpan.startCol, approvalSpan.endCol, "본예산"),
      carry: findColumnInRange(grid, subHeaderRow, approvalSpan.startCol, approvalSpan.endCol, "계속비"),
      // 집행실적 = 이체완료금액(본예산+계속비+이월금 합)
      transferBon: findColumnInRange(grid, subHeaderRow, transferSpan.startCol, transferSpan.endCol, "본예산"),
      transferGye: findColumnInRange(grid, subHeaderRow, transferSpan.startCol, transferSpan.endCol, "계속비"),
      transferIwol: findColumnInRange(grid, subHeaderRow, transferSpan.startCol, transferSpan.endCol, "이월금"),
      // 원본 파일에 적힌 "사용잔액"(본예산+계속비+이월금 합) - 재계산값과 대조용
      balanceBon: findColumnInRange(grid, subHeaderRow, balanceSpan.startCol, balanceSpan.endCol, "본예산"),
      balanceGye: findColumnInRange(grid, subHeaderRow, balanceSpan.startCol, balanceSpan.endCol, "계속비"),
      balanceIwol: findColumnInRange(grid, subHeaderRow, balanceSpan.startCol, balanceSpan.endCol, "이월금"),
    };

    if (!cols.exec || !cols.carry || !cols.transferBon || !cols.transferGye || !cols.transferIwol) {
      return {
        ok: false,
        error: "RCMS 파일에서 필수 세부 컬럼(본예산/계속비/이월금)을 찾지 못했습니다. " +
               "다운로드 양식이 변경되었을 수 있습니다."
      };
    }

    const org = findRcmsOrgBlock(grid, headerRow + 1);
    if (!org.ok) {
      return {
        ok: false,
        error: `RCMS 파일에서 우리 기관(한국전자통신연구원/ETRI) 참여 블록을 찾지 못했습니다. ` +
               `기관명 표기가 다르거나 파일 양식이 변경되었을 수 있습니다.`
      };
    }

    return { ok: true, headerRow, cols, dataStartRow: org.blockStart + 1, dataEndRow: org.blockEnd };
  }

  function aggregate(grid, loc) {
    const sums = emptySums();
    const unclassifiedLabels = new Set();
    let reportedBalanceTotal = 0; // 원본 파일의 "사용잔액" 합 (재계산 잔액과 대조용)
    for (let r = loc.dataStartRow; r <= loc.dataEndRow; r++) {
      const item = cellText(grid, r, loc.cols.item);
      const cat = classifyRCMS(item);
      if (!cat) continue;
      if (cat === UNCLASSIFIED) unclassifiedLabels.add(item);

      const carry = parseAmount(cellText(grid, r, loc.cols.carry));
      const exec = parseAmount(cellText(grid, r, loc.cols.exec));
      const actual = parseAmount(cellText(grid, r, loc.cols.transferBon))
        + parseAmount(cellText(grid, r, loc.cols.transferGye))
        + parseAmount(cellText(grid, r, loc.cols.transferIwol));
      const reportedBalance = parseAmount(cellText(grid, r, loc.cols.balanceBon))
        + parseAmount(cellText(grid, r, loc.cols.balanceGye))
        + parseAmount(cellText(grid, r, loc.cols.balanceIwol));

      sums[cat].carry += carry;
      sums[cat].exec += exec;
      sums[cat].actual += actual;
      reportedBalanceTotal += reportedBalance;
    }
    return { sums, lastRow: loc.dataEndRow, unclassifiedLabels: [...unclassifiedLabels], reportedBalanceTotal };
  }

  window.SystemRegistry.register("RCMS", {
    label: "RCMS",
    isExternal: true,
    detect, locate, aggregate,
  });
})();
