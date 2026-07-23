// ============================================================
// ui/render.js
// 화면 렌더링 전담 - 파일 칩, 짝 목록, 결과 테이블/요약 카드, 토스트 등
// 모든 렌더 함수는 AppState.state를 "읽기"만 하고, 상태 변경은 하지 않는다.
// (단, 사용자가 X 버튼을 누르면 main.js의 removeFile/removePair를 호출한다.)
// ============================================================

// 스텝 표시는 공용 AppCore.stepper.set()을 사용 (shared/app-core.js)

function badgeInfo(type) {
  if (type === "PMS") return { text: "PMS(내부망)", cls: "badge-pms" };
  if (type === "EZBARO") return { text: "이지바로(외부)", cls: "badge-ezbaro" };
  if (type === "RCMS") return { text: "RCMS(외부)", cls: "badge-rcms" };
  return { text: "⚠ 예산 파일이 맞는지 확인해주세요", cls: "unknown" };
}

function renderChips() {
  const wrap = $("#fileChips");
  wrap.innerHTML = AppState.state.files.map((f) => {
    let badge;
    if (f.type === "분석중") {
      badge = `<span class="dz-badge">분석 중...</span>`;
    } else if (f.type === "ERROR") {
      badge = `<span class="dz-badge unknown">⚠ 파일을 읽을 수 없어요</span>`;
    } else {
      const b = badgeInfo(f.type);
      badge = `<span class="dz-badge ${b.cls}">${b.text}</span>`;
    }
    return `
      <div class="file-chip">
        <span class="fc-icon">📄</span>
        <span class="fc-name">${escapeHtml(f.name)}</span>
        ${badge}
        <button class="fc-remove" data-remove="${f.id}" title="제거" aria-label="${escapeHtml(f.name)} 파일 제거">✕</button>
      </div>
    `;
  }).join("");
  wrap.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.remove)));
  });
}

function updateRunState() {
  const hint = $("#uploadHint");
  const btn = $("#runBtn");
  const btnLabel = btn.querySelector(".btn-label");
  const pairSelect = $("#pairSelect");
  const pairListEl = $("#pairList");
  const pmsFiles = AppState.state.files.filter((f) => f.type === "PMS");
  const ezFiles = AppState.state.files.filter((f) => AppState.isExternalType(f.type));

  if (AppState.state.files.length === 0) {
    hint.textContent = "";
    pairSelect.style.display = "none";
    pairListEl.style.display = "none";
    btnLabel.textContent = "검증 실행";
    btn.disabled = true;
    AppCore.stepper.set(1);
    return;
  }

  if (pmsFiles.length === 1 && ezFiles.length === 1) {
    hint.textContent = "";
    pairSelect.style.display = "none";
    pairListEl.style.display = "none";
    btnLabel.textContent = "검증 실행";
    btn.disabled = false;
    AppCore.stepper.set(2);
    return;
  }

  if (pmsFiles.length >= 1 && ezFiles.length >= 1) {
    hint.textContent = "여러 파일이 인식됐어요. 검증할 PMS·외부시스템(이지바로/RCMS) 짝을 아래에서 만들어주세요. 여러 쌍을 만들면 한 번에 전체 검증합니다.";
    pairSelect.style.display = "flex";
    pairListEl.style.display = AppState.state.pairs.length ? "flex" : "none";
    populatePairSelect(pmsFiles, ezFiles);
    btnLabel.textContent = AppState.state.pairs.length ? `여러 과제 검증 실행 (${AppState.state.pairs.length}개)` : "여러 과제 검증 실행";
    btn.disabled = AppState.state.pairs.length === 0;
    AppCore.stepper.set(2);
    return;
  }

  hint.textContent = "PMS(ETRIware)·외부시스템(이지바로/RCMS) 파일이 각각 1개 이상 필요합니다.";
  pairSelect.style.display = "none";
  pairListEl.style.display = "none";
  btnLabel.textContent = "검증 실행";
  btn.disabled = true;
  AppCore.stepper.set(1);
}

function populatePairSelect(pmsFiles, ezFiles) {
  const pmsSelect = $("#pmsSelect");
  const ezSelect = $("#ezSelect");
  const prevPms = pmsSelect.value;
  const prevEz = ezSelect.value;

  // 이미 다른 짝에 쓰인 파일은 목록에서 아예 제외 (중복 선택 자체를 막아줌)
  const usedPmsIds = new Set(AppState.state.pairs.map((p) => p.pmsId));
  const usedEzIds = new Set(AppState.state.pairs.map((p) => p.ezId));
  const availablePms = pmsFiles.filter((f) => !usedPmsIds.has(f.id));
  const availableEz = ezFiles.filter((f) => !usedEzIds.has(f.id));

  pmsSelect.innerHTML = availablePms.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  ezSelect.innerHTML = availableEz.map((f) => `<option value="${f.id}">[${escapeHtml(badgeInfo(f.type).text)}] ${escapeHtml(f.name)}</option>`).join("");

  if (availablePms.some((f) => String(f.id) === prevPms)) pmsSelect.value = prevPms;
  if (availableEz.some((f) => String(f.id) === prevEz)) ezSelect.value = prevEz;
}

function renderPairList() {
  const wrap = $("#pairList");
  wrap.innerHTML = AppState.state.pairs.map((p, i) => {
    const pmsFile = AppState.state.files.find((f) => f.id === p.pmsId);
    const ezFile = AppState.state.files.find((f) => f.id === p.ezId);
    const label = `${escapeHtml(pmsFile ? pmsFile.name : "(삭제된 파일)")} ↔ ${escapeHtml(ezFile ? ezFile.name : "(삭제된 파일)")}`;
    return `
      <div class="pair-chip">
        <span class="pc-index">${i + 1}</span>
        <span class="pc-label">${label}</span>
        <button class="pc-remove" data-remove-pair="${p.id}" title="이 짝 제거" aria-label="${label} 짝 제거">✕</button>
      </div>
    `;
  }).join("");
  wrap.style.display = AppState.state.pairs.length ? "flex" : "none";
  wrap.querySelectorAll("[data-remove-pair]").forEach((btn) => {
    btn.addEventListener("click", () => removePair(Number(btn.dataset.removePair)));
  });
}

function fmt(n) {
  return Math.round(n).toLocaleString("ko-KR");
}

function diffCell(diffValue) {
  const mismatch = Math.abs(diffValue) > 0.5;
  const srText = mismatch ? `<span class="sr-only"> (불일치)</span>` : "";
  return `<td class="diff-cell${mismatch ? " mismatch" : ""}"${mismatch ? ' title="불일치"' : ""}>${fmt(diffValue)}${srText}</td>`;
}

function isTotalMismatch(result) {
  return Math.abs(result.total.pmsBalance - result.total.ezBalance) > 0.5
    || Math.abs(result.total.pms.exec - result.total.ez.exec) > 0.5
    || Math.abs(result.total.pms.carry - result.total.ez.carry) > 0.5
    || Math.abs(result.total.pms.actual - result.total.ez.actual) > 0.5;
}

function buildResultTableHtml(result, tableId) {
  const rowsHtml = result.rows.map((r) => `
    <tr>
      <td class="label">${r.category}</td>
      <td class="group-pms">${fmt(r.pms.carry)}</td>
      <td class="group-pms">${fmt(r.pms.exec)}</td>
      <td class="group-pms">${fmt(r.pms.actual)}</td>
      <td class="group-pms">${fmt(r.pmsBalance)}</td>
      <td class="group-ez">${fmt(r.ez.carry)}</td>
      <td class="group-ez">${fmt(r.ez.exec)}</td>
      <td class="group-ez">${fmt(r.ez.actual)}</td>
      <td class="group-ez">${fmt(r.ezBalance)}</td>
      ${diffCell(r.pms.carry - r.ez.carry)}
      ${diffCell(r.pms.exec - r.ez.exec)}
      ${diffCell(r.pms.actual - r.ez.actual)}
      ${diffCell(r.pmsBalance - r.ezBalance)}
    </tr>
  `).join("");

  function subtotalRow(label, block, cls) {
    return `
      <tr class="${cls}">
        <td class="label">${label}</td>
        <td class="group-pms">${fmt(block.pms.carry)}</td>
        <td class="group-pms">${fmt(block.pms.exec)}</td>
        <td class="group-pms">${fmt(block.pms.actual)}</td>
        <td class="group-pms">${fmt(block.pmsBalance)}</td>
        <td class="group-ez">${fmt(block.ez.carry)}</td>
        <td class="group-ez">${fmt(block.ez.exec)}</td>
        <td class="group-ez">${fmt(block.ez.actual)}</td>
        <td class="group-ez">${fmt(block.ezBalance)}</td>
        ${diffCell(block.pms.carry - block.ez.carry)}
        ${diffCell(block.pms.exec - block.ez.exec)}
        ${diffCell(block.pms.actual - block.ez.actual)}
        ${diffCell(block.pmsBalance - block.ezBalance)}
      </tr>
    `;
  }

  return `
    <table class="result" id="${tableId}">
      <thead>
        <tr>
          <th rowspan="2" class="col-label">비목명</th>
          <th colspan="4">PMS (내부망)</th>
          <th colspan="4">${result.externalLabel} (외부)</th>
          <th colspan="4">검증 차액 (PMS - ${result.externalLabel})</th>
        </tr>
        <tr>
          <th>이월예산</th><th>실행예산</th><th>집행실적</th><th>잔액</th>
          <th>이월예산</th><th>실행예산</th><th>집행실적</th><th>잔액</th>
          <th>이월예산</th><th>실행예산</th><th>집행실적</th><th>잔액</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${subtotalRow("직접비", result.direct, "subtotal")}
        ${subtotalRow("간접비", result.indirect, "subtotal")}
        ${subtotalRow("총계", result.total, "total")}
      </tbody>
    </table>
  `;
}

const NOTE_ICONS = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<polyline points="20 6 9 17 4 12"/>'
};
function iconSvg(name){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${NOTE_ICONS[name]}</svg>`;
}

function buildResultBlockHtml(item, index) {
  const tableId = `resultTable_${index}`;
  const idxLabel = String(index + 1).padStart(2, "0");
  const filesHtml = escapeHtml(item.label).replace(/ ↔ /g, ' <span class="sep">↔</span> ');

  if (!item.result.ok) {
    return `
      <div class="strip-card">
        <div class="strip-head">
          <span class="strip-idx">${idxLabel}</span>
          <span class="strip-files">${filesHtml}</span>
        </div>
        <div class="error-card">${escapeHtml(item.result.error)}</div>
      </div>
    `;
  }

  const result = item.result;
  const mismatch = isTotalMismatch(result);
  const pmsLabels = result.unclassifiedLabels.pms;
  const ezLabels = result.unclassifiedLabels.ez;
  let noteHtml = "";
  if (pmsLabels.length || ezLabels.length) {
    noteHtml = `<div class="note-box info">
      <span class="n-icon">${iconSvg("info")}</span>
      <div><b>미분류 세목 안내</b> — 아래 항목은 현재 비목 분류표에 없어 "기타(미분류)" 행으로 집계되었습니다.
      비목 체계가 바뀌어 새로 생긴 항목일 수 있으니 확인해주세요.<br>
      ${pmsLabels.length ? `PMS: ${pmsLabels.map(escapeHtml).join(", ")}<br>` : ""}
      ${ezLabels.length ? `${escapeHtml(result.externalLabel)}: ${ezLabels.map(escapeHtml).join(", ")}` : ""}</div>
    </div>`;
  }

  let balanceCheckHtml = "";
  if (result.externalBalanceCheck) {
    const bc = result.externalBalanceCheck;
    const cls = bc.mismatch ? "note-box check mismatch" : "note-box check";
    balanceCheckHtml = `<div class="${cls}">
      <span class="n-icon">${iconSvg("search")}</span>
      <div><b>${result.externalLabel} 잔액 원본 대조</b> — 저희가 재계산한 잔액(이월+실행−실적)과
      ${result.externalLabel} 파일에 원래 적혀있는 "사용잔액"을 비교했습니다.<br>
      원본: ${fmt(bc.reported)}원 · 재계산: ${fmt(bc.recalculated)}원 ·
      차이: <b>${fmt(bc.diff)}원</b>
      ${bc.mismatch ? " — 차이가 있어요. 이월금(계속비 외 별도) 반영 방식 등을 확인해보세요." : " — 일치합니다."}</div>
    </div>`;
  }

  let basicProjectWarningHtml = "";
  if (result.looksLikeBasicProject) {
    basicProjectWarningHtml = `<div class="note-box warn basic-project">
      <span class="n-icon">${iconSvg("alert")}</span>
      <div><b>기본사업 예산으로 보여요</b> — 이 도구는 현재 이지바로/RCMS 적용 정부수탁 사업만 지원합니다.
      기본사업 파일은 결과가 정확하지 않을 수 있습니다.</div>
    </div>`;
  }

  let pairingWarningHtml = "";
  if (result.pairingSuspicious) {
    const pct = Math.round(result.pairingDiffRatio * 100);
    const reason = result.pairingNoOverlap
      ? "겹치는 비목이 하나도 없어요."
      : `실행예산 합계가 약 ${pct}% 차이나요.`;
    pairingWarningHtml = `<div class="note-box warn">
      <span class="n-icon">${iconSvg("alert")}</span>
      <div><b>다른 과제 파일 아닐까요?</b> ${reason} 짝을 다시 확인해보세요.</div>
    </div>`;
  }

  return `
    <div class="strip-card">
      <div class="strip-head${mismatch ? "" : " ok"}">
        <span class="strip-idx">${idxLabel}</span>
        <span class="strip-files">${filesHtml}</span>
        <span class="strip-status">${iconSvg(mismatch ? "alert" : "check")}${mismatch ? "불일치 항목 있음" : "완전 일치"}</span>
        <span class="strip-divider"></span>
        <div class="strip-stats">
          <div class="strip-stat"><div class="l">PMS 총계</div><div class="v">${fmt(result.total.pms.exec)}원</div></div>
          <div class="strip-stat"><div class="l">${escapeHtml(result.externalLabel)} 총계</div><div class="v">${fmt(result.total.ez.exec)}원</div></div>
        </div>
      </div>
      ${basicProjectWarningHtml}
      ${pairingWarningHtml}
      <div class="table-wrap">${buildResultTableHtml(result, tableId)}</div>
      ${noteHtml}
      ${balanceCheckHtml}
    </div>
  `;
}

function buildOverviewHtml(items) {
  const rows = items.map((item, i) => {
    if (!item.result.ok) {
      return `<tr><td>${i + 1}</td><td>${escapeHtml(item.label)}</td><td class="status-bad">⚠ 오류</td><td colspan="4" class="overview-error-msg">${escapeHtml(item.result.error)}</td></tr>`;
    }
    const r = item.result;
    const mismatch = isTotalMismatch(r);
    const carryDiff = r.total.pms.carry - r.total.ez.carry;
    const execDiff = r.total.pms.exec - r.total.ez.exec;
    const actualDiff = r.total.pms.actual - r.total.ez.actual;
    const balanceDiff = r.total.pmsBalance - r.total.ezBalance;
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.label)}</td>
        <td class="${mismatch ? "status-bad" : "status-ok"}">${mismatch ? "⚠ 불일치" : "✔ 일치"}${r.pairingSuspicious ? '<br><span class="pairing-flag">⚠ 짝 확인?</span>' : ""}</td>
        <td>${fmt(carryDiff)}</td>
        <td>${fmt(execDiff)}</td>
        <td>${fmt(actualDiff)}</td>
        <td>${fmt(balanceDiff)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="overview">
      <thead>
        <tr><th>순번</th><th>비교 대상</th><th>결과</th><th>이월예산 차액</th><th>실행예산 차액</th><th>집행실적 차액</th><th>잔액 차액</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderResults(items) {
  $("#errorArea").innerHTML = "";
  AppState.state.resultShown = true;
  AppState.state.lastItems = items; // 엑셀 내보내기는 DOM이 아니라 이 원본 데이터로 만든다
  AppCore.stepper.set(3);

  $("#overviewArea").innerHTML = buildOverviewHtml(items);
  $("#resultsContainer").innerHTML = items.map((item, i) => buildResultBlockHtml(item, i)).join("");

  $("#uploadCard").style.display = "none";
  $("#resultCard").style.display = "block";
  $("#resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

// 토스트는 공용 AppCore.toast.show()를 사용 (shared/app-core.js)

// 확인 버튼 하나만 있는 경고 모달 (native alert() 대체).
// 짝짓기 중복 선택처럼, 사용자가 반드시 인지해야 하는 경고에 사용한다.
function showWarningModal(title, message) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="modal-message">${escapeHtml(message)}</div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-modal-ok>확인</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // 트랜지션 적용을 위해 한 프레임 뒤에 show 클래스 추가
  requestAnimationFrame(() => overlay.classList.add("show"));

  function close() {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 180);
  }
  overlay.querySelector("[data-modal-ok]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

