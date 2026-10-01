/**
 * DASHBOARD DE REGULAÇÃO RHCCC - MINISTÉRIO PÚBLICO DE SÃO PAULO
 * Core Application Engine & Reactive State Management
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    data: Array.isArray(RHCCC_RAW_DATA) ? RHCCC_RAW_DATA : [],
    filters: {
      period: 'ALL',
      specialty: 'ALL',
      solicitante: 'ALL',
      cutoff180: true,
      metricMode: 'mean', // 'mean' or 'median'
    },
    table: {
      search: '',
      statusFilter: 'ALL',
      currentPage: 1,
      pageSize: 25,
      sortColumn: 'id',
      sortAsc: true,
    },
    theme: localStorage.getItem('rhccc_theme') || 'dark',
    charts: {},
  };

  // Setup Theme
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();

  // Populate Select Dropdowns
  initFilterOptions();

  // Attach Event Listeners
  initEventListeners();

  // Initial Calculation & Render
  renderDashboard();

  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  /* ==========================================================================
     DATA FILTERING & STATS PIPELINE
     ========================================================================== */

  function getFilteredData(options = {}) {
    const { applyCutoff = true, includeSearchAndStatus = false } = options;

    return state.data.filter(item => {
      // Period filter
      if (state.filters.period !== 'ALL' && item.periodo !== state.filters.period) {
        return false;
      }
      // Specialty filter
      if (state.filters.specialty !== 'ALL' && item.especialidade !== state.filters.specialty) {
        return false;
      }
      // Solicitante filter
      if (state.filters.solicitante !== 'ALL' && item.unidade_solicitante !== state.filters.solicitante) {
        return false;
      }
      // 180-Day Cutoff filter (applied to diagnostic calculations)
      if (applyCutoff && state.filters.cutoff180 && item.outlier_180d) {
        return false;
      }
      // Table-specific text search & status filters
      if (includeSearchAndStatus) {
        if (state.table.statusFilter !== 'ALL') {
          if (state.table.statusFilter === 'OK' && (!item.cons_ins_le_60 || (item.dias_consulta_diagnostico !== null && item.dias_consulta_diagnostico >= 0 && !item.cons_diag_le_60))) {
            return false;
          }
          if (state.table.statusFilter === 'OVER' && !(item.dias_consulta_insercao > 60 || (item.dias_consulta_diagnostico !== null && item.dias_consulta_diagnostico > 60))) {
            return false;
          }
          if (state.table.statusFilter === 'SUSP' && !item.alta_suspeicao) {
            return false;
          }
          if (state.table.statusFilter === 'OUT180' && !item.outlier_180d) {
            return false;
          }
        }

        if (state.table.search.trim() !== '') {
          const q = state.table.search.toLowerCase().trim();
          const match = 
            (item.especialidade && item.especialidade.toLowerCase().includes(q)) ||
            (item.unidade_solicitante && item.unidade_solicitante.toLowerCase().includes(q)) ||
            (item.periodo && item.periodo.toLowerCase().includes(q)) ||
            (item.id && String(item.id).includes(q));
          if (!match) return false;
        }
      }

      return true;
    });
  }

  /* ==========================================================================
     STATISTICAL CALCULATIONS (MEAN, MEDIAN, PERCENTILES)
     ========================================================================== */

  function calcMean(arr) {
    const valid = arr.filter(n => typeof n === 'number' && !isNaN(n));
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, val) => acc + val, 0);
    return sum / valid.length;
  }

  function calcMedian(arr) {
    const valid = arr.filter(n => typeof n === 'number' && !isNaN(n)).sort((a, b) => a - b);
    if (valid.length === 0) return 0;
    const mid = Math.floor(valid.length / 2);
    return valid.length % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  }

  function calcPercentile(arr, p) {
    const valid = arr.filter(n => typeof n === 'number' && !isNaN(n)).sort((a, b) => a - b);
    if (valid.length === 0) return 0;
    const index = (p / 100) * (valid.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= valid.length) return valid[lower];
    return valid[lower] * (1 - weight) + valid[upper] * weight;
  }

  function getValueByMetric(arr) {
    return state.filters.metricMode === 'median' ? calcMedian(arr) : calcMean(arr);
  }

  function formatNumber(num, decimals = 1) {
    if (typeof num !== 'number' || isNaN(num)) return '-';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatPercent(num, decimals = 1) {
    if (typeof num !== 'number' || isNaN(num)) return '0,0%';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
  }

  /* ==========================================================================
     MAIN DASHBOARD RENDERER
     ========================================================================== */

  function renderDashboard() {
    updateActiveFilterPills();
    renderKPIs();
    renderOverviewCharts();
    renderPeriodTab();
    renderContinuousTab();
    renderSpecialtiesTab();
    renderSolicitantesTab();
    renderSuspeicaoTab();
    renderMainTable();

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /* ==========================================================================
     ACTIVE FILTER PILLS & BADGES
     ========================================================================== */

  function updateActiveFilterPills() {
    let periodText = 'Todos os Períodos';
    if (state.filters.period !== 'ALL') {
      periodText = state.filters.period;
    }

    document.getElementById('pillPeriod').textContent = `Período: ${state.filters.period === 'ALL' ? 'Todos' : state.filters.period}`;
    document.getElementById('pillSpecialty').textContent = `Especialidade: ${state.filters.specialty === 'ALL' ? 'Todas' : state.filters.specialty}`;
    document.getElementById('pillSolicitante').textContent = `Solicitante: ${state.filters.solicitante === 'ALL' ? 'Todos' : state.filters.solicitante}`;
    document.getElementById('pillCutoff').textContent = `Corte 180d nas Médias: ${state.filters.cutoff180 ? 'Ativo (isola casos com mais de 180 dias)' : 'Desativado'}`;

    // Update all period indicator badges on charts across the dashboard
    document.querySelectorAll('.period-indicator-badge').forEach(el => {
      el.textContent = `Período: ${periodText}`;
    });

    // Update Cutoff Badge
    const unadjusted = getFilteredData({ applyCutoff: false });
    const cutoffCount = unadjusted.filter(d => d.outlier_180d).length;
    document.getElementById('cutoffCountBadge').textContent = `${cutoffCount} casos não considerados nas médias`;
  }

  /* ==========================================================================
     KPI SUMMARY CARDS (12 CARDS: 4 VOLUMETRIA, 4 INSERÇÃO, 4 DIAGNÓSTICO)
     ========================================================================== */

  function renderKPIs() {
    // Raw filtered dataset for all case counts, percentages, medians and percentiles
    const rawFiltered = getFilteredData({ applyCutoff: false });
    // Filtered dataset for calculating time averages (excluding >180d when cutoff active)
    const calcFiltered = getFilteredData({ applyCutoff: true });

    const totalCount = rawFiltered.length;
    document.getElementById('kpiTotalCases').textContent = totalCount.toLocaleString('pt-BR');
    document.getElementById('kpiTotalCasesSub').textContent = state.filters.period === 'ALL' 
      ? `100% dos encaminhamentos da base` 
      : `${totalCount} casos em ${state.filters.period}`;

    // LINHA 1: VOLUMETRIA E CONFORMIDADE
    // Interval 1: Consulta - Inserção (A partir da Inserção na Rede)
    const consInsLe60Count = rawFiltered.filter(d => d.dias_consulta_insercao !== null && d.dias_consulta_insercao <= 60).length;
    const consInsGt60Count = rawFiltered.filter(d => d.dias_consulta_insercao !== null && d.dias_consulta_insercao > 60).length;
    const consInsLe60Perc = totalCount > 0 ? (consInsLe60Count / totalCount) * 100 : 0;
    const consInsGt60Perc = totalCount > 0 ? (consInsGt60Count / totalCount) * 100 : 0;

    document.getElementById('kpiConsInsLe60Perc').textContent = formatPercent(consInsLe60Perc);
    document.getElementById('kpiConsInsLe60Count').textContent = `${consInsLe60Count} de ${totalCount} casos (Fila da Regulação)`;
    document.getElementById('kpiConsInsBar').style.width = `${Math.min(100, consInsLe60Perc)}%`;

    document.getElementById('kpiConsInsGt60Perc').textContent = formatPercent(consInsGt60Perc);
    document.getElementById('kpiConsInsGt60Count').textContent = `${consInsGt60Count} casos acima de 60 dias`;
    document.getElementById('kpiConsInsGtBar').style.width = `${Math.min(100, consInsGt60Perc)}%`;

    // Card 4: Do Diagnóstico à Consulta <= 60d (Lei nº 12.732/12)
    // Base de cálculo legal: laudos prévios com data informada válida (1.015 laudos válidos na base total)
    const validDiagList = rawFiltered.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
    const consDiagLe60Count = validDiagList.filter(d => d.dias_consulta_diagnostico <= 60).length;
    const consDiagTotal = validDiagList.length;
    const consDiagLe60Perc = consDiagTotal > 0 ? (consDiagLe60Count / consDiagTotal) * 100 : 0;
    const missingDiagCount = totalCount - consDiagTotal;
    const missingNote = missingDiagCount > 0 ? ` (${missingDiagCount} sem laudo prévio à consulta)` : '';

    document.getElementById('kpiConsDiagLe60Perc').textContent = formatPercent(consDiagLe60Perc);
    document.getElementById('kpiConsDiagLe60Count').textContent = `${consDiagLe60Count} de ${consDiagTotal} laudos válidos (Lei nº 12.732/12)${missingNote}`;
    document.getElementById('kpiConsDiagBar').style.width = `${Math.min(100, consDiagLe60Perc)}%`;

    // LINHA 2, 3 & 4: TEMPOS DE ESPERA (MÉDIA, MEDIANA P50, P75, P90)
    // Médias respeitam o botão de nota de corte de 180 dias
    const consInsDaysArr = (state.filters.cutoff180 ? calcFiltered : rawFiltered)
      .map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0);
    const insDiagDaysArr = (state.filters.cutoff180 ? calcFiltered : rawFiltered)
      .map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0);
    const consDiagDaysArr = (state.filters.cutoff180 ? calcFiltered : rawFiltered)
      .map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0);

    const meanConsIns = calcMean(consInsDaysArr);
    const meanInsDiag = calcMean(insDiagDaysArr);
    const meanConsDiag = calcMean(consDiagDaysArr);

    // Medianas e Percentis são SEMPRE calculados sobre a base bruta (1.030 casos sem exclusão)
    const rawConsInsDaysArr = rawFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0);
    const rawInsDiagDaysArr = rawFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0);
    const rawConsDiagDaysArr = rawFiltered.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0);

    const medConsIns = calcMedian(rawConsInsDaysArr);
    const p75ConsIns = calcPercentile(rawConsInsDaysArr, 75);
    const p90ConsIns = calcPercentile(rawConsInsDaysArr, 90);

    const medInsDiag = calcMedian(rawInsDiagDaysArr);
    const p75InsDiag = calcPercentile(rawInsDiagDaysArr, 75);
    const p90InsDiag = calcPercentile(rawInsDiagDaysArr, 90);

    const medConsDiag = calcMedian(rawConsDiagDaysArr);
    const p75ConsDiag = calcPercentile(rawConsDiagDaysArr, 75);
    const p90ConsDiag = calcPercentile(rawConsDiagDaysArr, 90);

    // Popula Linha 2 (Da Inserção à Consulta - Central de Regulação)
    document.getElementById('kpiWaitConsInsMean').innerHTML = `${formatNumber(meanConsIns)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsMed').innerHTML = `${formatNumber(medConsIns)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsP75').innerHTML = `${formatNumber(p75ConsIns)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsP90').innerHTML = `${formatNumber(p90ConsIns)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;

    // Popula Linha 3 (Do Diagnóstico à Inserção - Unidade Municipal)
    document.getElementById('kpiWaitInsDiagMean').innerHTML = `${formatNumber(meanInsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitInsDiagMed').innerHTML = `${formatNumber(medInsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitInsDiagP75').innerHTML = `${formatNumber(p75InsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitInsDiagP90').innerHTML = `${formatNumber(p90InsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;

    // Popula Linha 4 (Do Diagnóstico à Consulta - Jornada Total Lei 60d)
    const card13Val = document.getElementById('kpiWaitConsDiagMean');
    if (card13Val) card13Val.innerHTML = `${formatNumber(meanConsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    const card14Val = document.getElementById('kpiWaitConsDiagMed');
    if (card14Val) card14Val.innerHTML = `${formatNumber(medConsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    const card15Val = document.getElementById('kpiWaitConsDiagP75');
    if (card15Val) card15Val.innerHTML = `${formatNumber(p75ConsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    const card16Val = document.getElementById('kpiWaitConsDiagP90');
    if (card16Val) card16Val.innerHTML = `${formatNumber(p90ConsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;

    // Progress Bars Linha 2
    const barConsInsMean = document.getElementById('kpiWaitConsInsMeanBar');
    if (barConsInsMean) barConsInsMean.style.width = `${Math.min(100, (meanConsIns / 60) * 100)}%`;
    const barConsInsMed = document.getElementById('kpiWaitConsInsMedBar');
    if (barConsInsMed) barConsInsMed.style.width = `${Math.min(100, (medConsIns / 60) * 100)}%`;
    const barConsInsP75 = document.getElementById('kpiWaitConsInsP75Bar');
    if (barConsInsP75) barConsInsP75.style.width = `${Math.min(100, (p75ConsIns / 60) * 100)}%`;
    const barConsInsP90 = document.getElementById('kpiWaitConsInsP90Bar');
    if (barConsInsP90) barConsInsP90.style.width = `${Math.min(100, (p90ConsIns / 60) * 100)}%`;

    // Progress Bars Linha 3
    const barInsDiagMean = document.getElementById('kpiWaitInsDiagMeanBar');
    if (barInsDiagMean) barInsDiagMean.style.width = `${Math.min(100, (meanInsDiag / 60) * 100)}%`;
    const barInsDiagMed = document.getElementById('kpiWaitInsDiagMedBar');
    if (barInsDiagMed) barInsDiagMed.style.width = `${Math.min(100, (medInsDiag / 60) * 100)}%`;
    const barInsDiagP75 = document.getElementById('kpiWaitInsDiagP75Bar');
    if (barInsDiagP75) barInsDiagP75.style.width = `${Math.min(100, (p75InsDiag / 60) * 100)}%`;
    const barInsDiagP90 = document.getElementById('kpiWaitInsDiagP90Bar');
    if (barInsDiagP90) barInsDiagP90.style.width = `${Math.min(100, (p90InsDiag / 60) * 100)}%`;

    // Progress Bars Linha 4
    const barConsDiagMean = document.getElementById('kpiWaitConsDiagMeanBar');
    if (barConsDiagMean) barConsDiagMean.style.width = `${Math.min(100, (meanConsDiag / 60) * 100)}%`;
    const barConsDiagMed = document.getElementById('kpiWaitConsDiagMedBar');
    if (barConsDiagMed) barConsDiagMed.style.width = `${Math.min(100, (medConsDiag / 60) * 100)}%`;
    const barConsDiagP75 = document.getElementById('kpiWaitConsDiagP75Bar');
    if (barConsDiagP75) barConsDiagP75.style.width = `${Math.min(100, (p75ConsDiag / 60) * 100)}%`;
    const barConsDiagP90 = document.getElementById('kpiWaitConsDiagP90Bar');
    if (barConsDiagP90) barConsDiagP90.style.width = `${Math.min(100, (p90ConsDiag / 60) * 100)}%`;

    // Subtextos dinâmicos Linha 2
    const card5Sub = document.getElementById('kpiWaitConsInsMeanSub');
    if (card5Sub) {
      card5Sub.textContent = state.filters.cutoff180 
        ? `Tempo médio de ${consInsDaysArr.length.toLocaleString('pt-BR')} casos (corte de 180d)` 
        : `Tempo médio de ${consInsDaysArr.length.toLocaleString('pt-BR')} casos (base bruta)`;
    }
    const card6Sub = document.getElementById('kpiWaitConsInsMedSub');
    if (card6Sub) {
      card6Sub.textContent = `50% atendidos em até ${formatNumber(medConsIns)} dias`;
    }
    const card7Sub = document.getElementById('kpiWaitConsInsP75Sub');
    if (card7Sub) {
      card7Sub.textContent = `75% atendidos em até ${formatNumber(p75ConsIns)} dias`;
    }
    const card8Sub = document.getElementById('kpiWaitConsInsP90Sub');
    if (card8Sub) {
      card8Sub.textContent = `90% atendidos em até ${formatNumber(p90ConsIns)} dias`;
    }

    // Subtextos dinâmicos Linha 3
    const card9Sub = document.getElementById('kpiWaitInsDiagMeanSub');
    if (card9Sub) {
      card9Sub.textContent = state.filters.cutoff180 
        ? `Tempo médio de ${insDiagDaysArr.length.toLocaleString('pt-BR')} casos (corte de 180d)` 
        : `Tempo médio de ${insDiagDaysArr.length.toLocaleString('pt-BR')} casos (base bruta)`;
    }
    const card10Sub = document.getElementById('kpiWaitInsDiagMedSub');
    if (card10Sub) {
      card10Sub.textContent = `50% cadastrados em até ${formatNumber(medInsDiag)} dias`;
    }
    const card11Sub = document.getElementById('kpiWaitInsDiagP75Sub');
    if (card11Sub) {
      card11Sub.textContent = `75% cadastrados em até ${formatNumber(p75InsDiag)} dias`;
    }
    const card12Sub = document.getElementById('kpiWaitInsDiagP90Sub');
    if (card12Sub) {
      card12Sub.textContent = `90% cadastrados em até ${formatNumber(p90InsDiag)} dias`;
    }

    // Subtextos dinâmicos Linha 4
    const card13Sub = document.getElementById('kpiWaitConsDiagMeanSub');
    if (card13Sub) {
      card13Sub.textContent = state.filters.cutoff180 
        ? `Tempo médio de ${consDiagDaysArr.length.toLocaleString('pt-BR')} casos (corte de 180d)` 
        : `Tempo médio de ${consDiagDaysArr.length.toLocaleString('pt-BR')} casos (base bruta)`;
    }
    const card14Sub = document.getElementById('kpiWaitConsDiagMedSub');
    if (card14Sub) {
      card14Sub.textContent = `50% atendidos em até ${formatNumber(medConsDiag)} dias`;
    }
    const card15Sub = document.getElementById('kpiWaitConsDiagP75Sub');
    if (card15Sub) {
      card15Sub.textContent = `75% atendidos em até ${formatNumber(p75ConsDiag)} dias`;
    }
    const card16Sub = document.getElementById('kpiWaitConsDiagP90Sub');
    if (card16Sub) {
      card16Sub.textContent = `90% atendidos em até ${formatNumber(p90ConsDiag)} dias`;
    }
  }

  /* ==========================================================================
     CHART HELPER & THEME PALETTE
     ========================================================================== */

  function getChartThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#94a3b8' : '#475569',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: isDark ? '#1e293b' : '#ffffff',
      tooltipText: isDark ? '#f8fafc' : '#0f172a',
      fontFamily: "'Inter', sans-serif",
    };
  }

  function createOrUpdateChart(canvasId, config) {
    if (state.charts[canvasId]) {
      state.charts[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    state.charts[canvasId] = new Chart(ctx, config);
    return state.charts[canvasId];
  }

  /* ==========================================================================
     TAB 1: VISÃO GERAL & JORNADA CHARTS
     ========================================================================== */

  function renderOverviewCharts() {
    const rawFiltered = getFilteredData({ applyCutoff: false });
    const calcFiltered = getFilteredData({ applyCutoff: true });
    const theme = getChartThemeColors();

    // Chart 1: Donut Compliance
    const regLe60 = rawFiltered.filter(d => d.dias_consulta_insercao <= 60).length;
    const regGt60 = rawFiltered.filter(d => d.dias_consulta_insercao > 60).length;

    // Denominador: laudos com data informada na amostra (1.015 laudos válidos)
    const diagValid = rawFiltered.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
    const diagLe60 = diagValid.filter(d => d.dias_consulta_diagnostico <= 60).length;
    const diagGt60 = diagValid.filter(d => d.dias_consulta_diagnostico > 60).length;

    createOrUpdateChart('overviewComplianceChart', {
      type: 'bar',
      data: {
        labels: [
          ['Da Inserção à Consulta', '(Fila da Regulação)'],
          ['Do Diagnóstico à Consulta', '(Lei Federal nº 12.732/12)']
        ],
        datasets: [
          {
            label: 'Dentro do Prazo (≤ 60 dias)',
            data: [
              rawFiltered.length > 0 ? (regLe60 / rawFiltered.length) * 100 : 0,
              diagValid.length > 0 ? (diagLe60 / diagValid.length) * 100 : 0,
            ],
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
          },
          {
            label: 'Acima do Prazo (> 60 dias)',
            data: [
              rawFiltered.length > 0 ? (regGt60 / rawFiltered.length) * 100 : 0,
              diagValid.length > 0 ? (diagGt60 / diagValid.length) * 100 : 0,
            ],
            backgroundColor: 'rgba(239, 68, 68, 0.85)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${c.raw.toFixed(1)}%`
            }
          }
        },
        scales: {
          x: { 
            stacked: true, 
            grid: { display: false }, 
            ticks: { 
              color: theme.textColor, 
              font: { family: theme.fontFamily, size: 11, weight: '500' },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false
            } 
          },
          y: { stacked: true, max: 100, grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + '%' } }
        }
      }
    });

    // Chart 2: 3 Intervals Waiting Times (Showing Média and Mediana side-by-side)
    // Médias (afetadas pelo botão de nota de corte):
    const cInsArr = (state.filters.cutoff180 ? calcFiltered : rawFiltered).map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0);
    const iDiagArr = (state.filters.cutoff180 ? calcFiltered : rawFiltered).map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0);
    const cDiagArr = (state.filters.cutoff180 ? calcFiltered : rawFiltered).map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0);

    const meanConsIns = calcMean(cInsArr);
    const meanInsDiag = calcMean(iDiagArr);
    const meanConsDiag = calcMean(cDiagArr);

    // Medianas (SEMPRE calculadas sobre TODOS os dados brutos sem exclusão dos 37 casos):
    const rawCInsArr = rawFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0);
    const rawIDiagArr = rawFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0);
    const rawCDiagArr = rawFiltered.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0);

    const medConsIns = calcMedian(rawCInsArr);
    const medInsDiag = calcMedian(rawIDiagArr);
    const medConsDiag = calcMedian(rawCDiagArr);

    createOrUpdateChart('overviewIntervalsChart', {
      type: 'bar',
      data: {
        labels: [
          ['1. Do Diagnóstico à Inserção', '(Unidade Municipal / Solicitante)'],
          ['2. Da Inserção à Consulta', '(Central de Regulação RHCCC)'],
          ['3. Do Diagnóstico à Consulta', '(Lei Federal nº 12.732/12)']
        ],
        datasets: [
          {
            label: 'Média (dias)',
            data: [meanInsDiag, meanConsIns, meanConsDiag],
            backgroundColor: 'rgba(59, 130, 246, 0.85)',
            borderRadius: 6,
          },
          {
            label: 'Mediana P50 (dias)',
            data: [medInsDiag, medConsIns, medConsDiag],
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${c.raw.toFixed(1)} dias`
            }
          }
        },
        scales: {
          x: { 
            grid: { display: false }, 
            ticks: { 
              color: theme.textColor, 
              font: { family: theme.fontFamily, size: 11, weight: '500' },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false
            } 
          },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + ' d' } }
        }
      }
    });

    // Dynamic Rendering of Impact of 180 Days Cutoff Table
    const cutoffTbody = document.getElementById('cutoffImpactTableBody');
    if (cutoffTbody) {
      const totalRaw = rawFiltered.length;
      const validDiagRaw = rawFiltered.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
      const validDiagCount = validDiagRaw.length;
      const outliersCount = rawFiltered.filter(d => d.outlier_180d).length;

      // Raw metrics
      const rawInsMean = calcMean(rawFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const rawInsMed = calcMedian(rawFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));

      const rawDiagInsMean = calcMean(rawFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const rawDiagInsMed = calcMedian(rawFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));

      const rawDiagConsMean = calcMean(validDiagRaw.map(d => d.dias_consulta_diagnostico));
      const rawDiagConsMed = calcMedian(validDiagRaw.map(d => d.dias_consulta_diagnostico));

      const diagGt60Count = validDiagRaw.filter(d => d.dias_consulta_diagnostico > 60).length;
      const diagGt60Perc = validDiagCount > 0 ? (diagGt60Count / validDiagCount) * 100 : 0;

      // Cutoff metrics
      const validDiagCut = calcFiltered.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
      const cutInsMean = calcMean(calcFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const cutInsMed = calcMedian(calcFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));

      const cutDiagInsMean = calcMean(calcFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const cutDiagInsMed = calcMedian(calcFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));

      const cutDiagConsMean = calcMean(validDiagCut.map(d => d.dias_consulta_diagnostico));
      const cutDiagConsMed = calcMedian(validDiagCut.map(d => d.dias_consulta_diagnostico));

      // Deltas
      const deltaIns = cutInsMean - rawInsMean;
      const deltaDiagIns = cutDiagInsMean - rawDiagInsMean;
      const percDiagIns = rawDiagInsMean > 0 ? (deltaDiagIns / rawDiagInsMean) * 100 : 0;

      const deltaDiagCons = cutDiagConsMean - rawDiagConsMean;
      const percDiagCons = rawDiagConsMean > 0 ? (deltaDiagCons / rawDiagConsMean) * 100 : 0;

      cutoffTbody.innerHTML = `
        <tr>
          <td><strong>Base Bruta (Sem Corte)</strong></td>
          <td style="text-align: center;">${validDiagCount} válidos (${totalRaw} tot)</td>
          <td style="text-align: center;">${formatNumber(rawInsMean)} dias (Mediana: ${formatNumber(rawInsMed)}d)</td>
          <td style="text-align: center;">${formatNumber(rawDiagInsMean)} dias (Mediana: ${formatNumber(rawDiagInsMed)}d)</td>
          <td style="text-align: center;">${formatNumber(rawDiagConsMean)} dias (Mediana: ${formatNumber(rawDiagConsMed)}d)</td>
          <td style="text-align: center;"><span class="badge badge-danger">${formatPercent(diagGt60Perc)} (${diagGt60Count} laudos)</span></td>
        </tr>
        <tr>
          <td><strong>Com Corte &le; 180d nas Médias (Rede)</strong></td>
          <td style="text-align: center;">${validDiagCount} válidos (${outliersCount} isolados)</td>
          <td style="text-align: center;">${formatNumber(cutInsMean)} dias (Mediana: ${formatNumber(cutInsMed)}d)</td>
          <td style="text-align: center;"><strong>${formatNumber(cutDiagInsMean)} dias</strong> (Mediana: ${formatNumber(cutDiagInsMed)}d)</td>
          <td style="text-align: center;"><strong>${formatNumber(cutDiagConsMean)} dias</strong> (Mediana: ${formatNumber(cutDiagConsMed)}d)</td>
          <td style="text-align: center;"><span class="badge badge-danger">${formatPercent(diagGt60Perc)} (${diagGt60Count} laudos)</span></td>
        </tr>
        <tr style="background: rgba(16, 185, 129, 0.08);">
          <td><strong>Variação / Casos Isolados</strong></td>
          <td style="text-align: center;"><strong>${outliersCount} casos com mais de 180 dias</strong></td>
          <td style="text-align: center;">${Math.abs(deltaIns) < 0.05 ? '0,0 dias (Inalterado)' : formatNumber(deltaIns) + ' dias'}</td>
          <td style="text-align: center;"><strong style="color: #10b981;">${formatNumber(deltaDiagIns)} dias (${formatPercent(percDiagIns)})</strong></td>
          <td style="text-align: center;"><strong style="color: #10b981;">${formatNumber(deltaDiagCons)} dias (${formatPercent(percDiagCons)})</strong></td>
          <td style="text-align: center;"><strong>${outliersCount} casos com mais de 180 dias</strong></td>
        </tr>
      `;
    }
  }

  /* ==========================================================================
     TAB 2: COMPARATIVO POR PERÍODO
     ========================================================================== */

  function renderPeriodTab() {
    // Base filtrada por Especialidade e Solicitante (mas NÃO por Período, pois esta aba compara períodos)
    const baseData = state.data.filter(item => {
      if (state.filters.specialty !== 'ALL' && item.especialidade !== state.filters.specialty) return false;
      if (state.filters.solicitante !== 'ALL' && item.unidade_solicitante !== state.filters.solicitante) return false;
      return true;
    });

    const periods = [...new Set(baseData.map(d => d.periodo))].filter(p => p && p !== 'Outro');
    const theme = getChartThemeColors();

    const periodData = periods.map(p => {
      const pRaw = baseData.filter(d => d.periodo === p);
      const pCalc = state.filters.cutoff180 ? pRaw.filter(d => !d.outlier_180d) : pRaw;

      const total = pRaw.length;
      const regLe60 = pRaw.filter(d => d.dias_consulta_insercao <= 60).length;
      const regGt60 = pRaw.filter(d => d.dias_consulta_insercao > 60).length;

      // Denominador: laudos prévios com data válida no período
      const diagValid = pRaw.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
      const diagLe60 = diagValid.filter(d => d.dias_consulta_diagnostico <= 60).length;
      const diagGt60 = diagValid.filter(d => d.dias_consulta_diagnostico > 60).length;

      const cIns = getValueByMetric(pCalc.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const iDiag = getValueByMetric(pCalc.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const cDiag = getValueByMetric(pCalc.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      return {
        period: p,
        total,
        diagTotal: diagValid.length,
        regLe60,
        regGt60,
        diagLe60,
        diagGt60,
        regLe60Perc: total > 0 ? (regLe60 / total) * 100 : 0,
        regGt60Perc: total > 0 ? (regGt60 / total) * 100 : 0,
        diagLe60Perc: diagValid.length > 0 ? (diagLe60 / diagValid.length) * 100 : 0,
        diagGt60Perc: diagValid.length > 0 ? (diagGt60 / diagValid.length) * 100 : 0,
        cIns,
        iDiag,
        cDiag,
      };
    });

    // Chart 1: Compliance Rate per Period
    createOrUpdateChart('periodComplianceChart', {
      type: 'bar',
      data: {
        labels: periods,
        datasets: [
          {
            label: 'Da Inserção à Consulta ≤ 60d (%)',
            data: periodData.map(d => d.regLe60Perc),
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
          },
          {
            label: 'Do Diagnóstico à Consulta ≤ 60d (%)',
            data: periodData.map(d => d.diagLe60Perc),
            backgroundColor: 'rgba(6, 182, 212, 0.85)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily } } },
          tooltip: {
            callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw.toFixed(1)}%` }
          }
        },
        scales: {
          x: { 
            grid: { display: false }, 
            ticks: { 
               color: theme.textColor, 
              font: { family: theme.fontFamily, size: 11, weight: '500' },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false
            } 
          },
          y: { min: 0, max: 100, grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + '%' } }
        }
      }
    });

    // Chart 2: Waiting Times by Period
    createOrUpdateChart('periodWaitTimesChart', {
      type: 'bar',
      data: {
        labels: periods,
        datasets: [
          {
            label: '1. Do Diagnóstico à Inserção',
            data: periodData.map(d => d.iDiag),
            backgroundColor: 'rgba(139, 92, 246, 0.85)',
            borderRadius: 6,
          },
          {
            label: '2. Da Inserção à Consulta',
            data: periodData.map(d => d.cIns),
            backgroundColor: 'rgba(245, 158, 11, 0.85)',
            borderRadius: 6,
          },
          {
            label: '3. Do Diagnóstico à Consulta',
            data: periodData.map(d => d.cDiag),
            backgroundColor: 'rgba(59, 130, 246, 0.85)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily } } },
          tooltip: {
            callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw.toFixed(1)} dias` }
          }
        },
        scales: {
          x: { 
            grid: { display: false }, 
            ticks: { 
              color: theme.textColor, 
              font: { family: theme.fontFamily, size: 11, weight: '500' },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false
            } 
          },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + ' d' } }
        }
      }
    });

    // Table Rendering with absolute counts and percentages
    const tbody = document.getElementById('periodSummaryTableBody');
    if (tbody) {
      tbody.innerHTML = periodData.map(d => `
        <tr>
          <td><strong>${d.period}</strong></td>
          <td align="center"><span class="badge badge-purple">${d.total.toLocaleString('pt-BR')} casos</span></td>
          <td align="center"><span class="badge badge-success">${d.regLe60.toLocaleString('pt-BR')} (${formatPercent(d.regLe60Perc)})</span></td>
          <td align="center"><span class="badge ${d.regGt60Perc > 15 ? 'badge-danger' : 'badge-warning'}">${d.regGt60.toLocaleString('pt-BR')} (${formatPercent(d.regGt60Perc)})</span></td>
          <td align="center"><span class="badge badge-cyan">${d.diagLe60.toLocaleString('pt-BR')} (${formatPercent(d.diagLe60Perc)})</span></td>
          <td align="center">${formatNumber(d.cIns)} dias</td>
          <td align="center">${formatNumber(d.iDiag)} dias</td>
          <td align="center"><strong>${formatNumber(d.cDiag)} dias</strong></td>
        </tr>
      `).join('');
    }

    const tfoot = document.getElementById('periodSummaryTableFoot');
    if (tfoot) {
      const allRaw = baseData;
      const allCalc = state.filters.cutoff180 ? allRaw.filter(d => !d.outlier_180d) : allRaw;
      const allTotal = allRaw.length;
      const allRegLe60 = allRaw.filter(d => d.dias_consulta_insercao <= 60).length;
      const allRegGt60 = allRaw.filter(d => d.dias_consulta_insercao > 60).length;
      const allDiagValid = allRaw.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
      const allDiagLe60 = allDiagValid.filter(d => d.dias_consulta_diagnostico <= 60).length;

      const allCIns = getValueByMetric(allCalc.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const allIDiag = getValueByMetric(allCalc.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const allCDiag = getValueByMetric(allCalc.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      const allRegLe60Perc = allTotal > 0 ? (allRegLe60 / allTotal) * 100 : 0;
      const allRegGt60Perc = allTotal > 0 ? (allRegGt60 / allTotal) * 100 : 0;
      const allDiagLe60Perc = allDiagValid.length > 0 ? (allDiagLe60 / allDiagValid.length) * 100 : 0;

      tfoot.innerHTML = `
        <tr style="background: var(--bg-elevated); font-weight: 700; border-top: 2px solid var(--border-focus);">
          <td><strong>CONSOLIDADO</strong></td>
          <td align="center"><span class="badge badge-purple">${allTotal.toLocaleString('pt-BR')} casos</span></td>
          <td align="center"><span class="badge badge-success">${allRegLe60.toLocaleString('pt-BR')} (${formatPercent(allRegLe60Perc)})</span></td>
          <td align="center"><span class="badge ${allRegGt60Perc > 15 ? 'badge-danger' : 'badge-warning'}">${allRegGt60.toLocaleString('pt-BR')} (${formatPercent(allRegGt60Perc)})</span></td>
          <td align="center"><span class="badge badge-cyan">${allDiagLe60.toLocaleString('pt-BR')} (${formatPercent(allDiagLe60Perc)})</span></td>
          <td align="center">${formatNumber(allCIns)} dias</td>
          <td align="center">${formatNumber(allIDiag)} dias</td>
          <td align="center"><strong>${formatNumber(allCDiag)} dias</strong></td>
        </tr>
      `;
    }

    // Render Enhanced Ordered Specialty Rows (Linear Rows with Highlights and Trends)
    renderSpecialtyPeriodBoard('periodSpecConsInsList', 'periodSpecConsInsFooter', 'dias_consulta_insercao', true);
    renderSpecialtyPeriodBoard('periodSpecConsDiagList', 'periodSpecConsDiagFooter', 'dias_consulta_diagnostico', true);
  }

  /* ==========================================================================
     SPECIALTY PERIOD COMPARISON BOARD (ORDERED ROWS)
     ========================================================================== */

  function renderSpecialtyPeriodBoard(listId, footerId, metricKey, useCutoff) {
    const listEl = document.getElementById(listId);
    const footerEl = document.getElementById(footerId);
    if (!listEl || !footerEl) return;

    // Base filtrada por Especialidade e Solicitante (mas NÃO por Período)
    const baseData = state.data.filter(item => {
      if (state.filters.specialty !== 'ALL' && item.especialidade !== state.filters.specialty) return false;
      if (state.filters.solicitante !== 'ALL' && item.unidade_solicitante !== state.filters.solicitante) return false;
      return true;
    });

    const p1Raw = baseData.filter(d => d.periodo === 'Jan-Mar 2025');
    const p2Raw = baseData.filter(d => d.periodo === 'Ago-Set 2025');
    const p3Raw = baseData.filter(d => d.periodo === 'Jan-Fev 2026');

    const p1 = (useCutoff && state.filters.cutoff180) ? p1Raw.filter(d => !d.outlier_180d) : p1Raw;
    const p2 = (useCutoff && state.filters.cutoff180) ? p2Raw.filter(d => !d.outlier_180d) : p2Raw;
    const p3 = (useCutoff && state.filters.cutoff180) ? p3Raw.filter(d => !d.outlier_180d) : p3Raw;

    // Base filtrada com corte se ativo para cálculo da média global ponderada
    const baseCalc = (useCutoff && state.filters.cutoff180) ? baseData.filter(d => !d.outlier_180d) : baseData;

    // Todas as especialidades presentes na base (11 no total)
    const allSpecialties = [...new Set(baseData.map(d => d.especialidade))].filter(Boolean);

    const rows = allSpecialties.map(sp => {
      const getVal = (list) => {
        const vals = list.filter(d => d.especialidade === sp).map(d => d[metricKey]).filter(n => n !== null && n >= 0);
        return vals.length > 0 ? getValueByMetric(vals) : null;
      };

      const v1 = getVal(p1);
      const v2 = getVal(p2);
      const v3 = getVal(p3);

      // Média Global Ponderada (ou Mediana) consolidada da especialidade em toda a base
      const allVals = baseCalc.filter(d => d.especialidade === sp).map(d => d[metricKey]).filter(n => n !== null && n >= 0);
      const overallVal = allVals.length > 0 ? getValueByMetric(allVals) : 0;
      const cleanName = sp.replace(/^Oncologia\s*-\s*/i, '').replace(/^Oncologia\s+/i, '');

      return {
        fullName: sp,
        name: cleanName,
        v1,
        v2,
        v3,
        overallVal,
        totalCases: allVals.length,
      };
    });

    // Ordenar da maior Média Global Ponderada (ou Mediana) para a menor, com desempate por volume
    rows.sort((a, b) => b.overallVal - a.overallVal || b.totalCases - a.totalCases);

    const allPillVals = rows.flatMap(r => [r.v1, r.v2, r.v3]).filter(v => v !== null && v > 0);
    const globalMax = Math.max(...allPillVals, 60);

    listEl.innerHTML = rows.map((r, index) => {
      const rank = index + 1;
      const w1 = r.v1 !== null ? Math.max((r.v1 / (globalMax * 1.05)) * 100, 8) : 0;
      const w2 = r.v2 !== null ? Math.max((r.v2 / (globalMax * 1.05)) * 100, 8) : 0;
      const w3 = r.v3 !== null ? Math.max((r.v3 / (globalMax * 1.05)) * 100, 8) : 0;

      return `
        <div class="spec-row">
          <div class="spec-info">
            <span class="spec-rank-badge">${rank}</span>
            <span class="spec-name" title="${r.fullName} (Geral: ${formatNumber(r.overallVal)} dias | ${r.totalCases} casos)">${r.name}</span>
          </div>
          <div class="spec-bars-track">
            ${r.v1 !== null ? `<div class="spec-bar-seg bar-p1" style="width: ${w1.toFixed(1)}%;" title="Jan-Mar/2025 (1º): ${r.v1.toFixed(1)} dias">${Math.round(r.v1)}</div>` : ''}
            ${r.v2 !== null ? `<div class="spec-bar-seg bar-p2" style="width: ${w2.toFixed(1)}%;" title="Ago-Set/2025 (2º): ${r.v2.toFixed(1)} dias">${Math.round(r.v2)}</div>` : ''}
            ${r.v3 !== null ? `<div class="spec-bar-seg bar-p3" style="width: ${w3.toFixed(1)}%;" title="Jan-Fev/2026 (3º): ${r.v3.toFixed(1)} dias">${Math.round(r.v3)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Médias ou Medianas Globais
    const avgP1 = p1.length > 0 ? getValueByMetric(p1.map(d => d[metricKey]).filter(n => n !== null && n >= 0)) : 0;
    const avgP2 = p2.length > 0 ? getValueByMetric(p2.map(d => d[metricKey]).filter(n => n !== null && n >= 0)) : 0;
    const avgP3 = p3.length > 0 ? getValueByMetric(p3.map(d => d[metricKey]).filter(n => n !== null && n >= 0)) : 0;

    const labelFooter = state.filters.metricMode === 'median' ? 'Tempo Mediano Geral' : 'Tempo Médio Geral';

    footerEl.className = 'spec-summary-footer';
    footerEl.innerHTML = `
      <div style="font-size: 0.825rem; color: var(--text-primary);">${labelFooter}</div>
      <div class="summary-values">
        <span class="val-p1" title="Jan-Mar/2025 (1º Bloco)">${Math.round(avgP1)}d</span>
        <span class="val-p2" title="Ago-Set/2025 (2º Bloco)">${Math.round(avgP2)}d</span>
        <span class="val-p3" title="Jan-Fev/2026 (3º Bloco)">${Math.round(avgP3)}d</span>
      </div>
    `;
  }

  /* ==========================================================================
     TAB 3: VISÃO CONTÍNUA (MÊS A MÊS)
     ========================================================================== */

  function renderContinuousTab() {
    const months = ['2025-01', '2025-02', '2025-03', '2025-08', '2025-09', '2026-01', '2026-02'];
    const monthLabels = ['Jan/25', 'Fev/25', 'Mar/25', 'Ago/25', 'Set/25', 'Jan/26', 'Fev/26'];
    const theme = getChartThemeColors();

    // Base filtrada por Especialidade e Solicitante (mas NÃO por Período)
    const baseData = state.data.filter(item => {
      if (state.filters.specialty !== 'ALL' && item.especialidade !== state.filters.specialty) return false;
      if (state.filters.solicitante !== 'ALL' && item.unidade_solicitante !== state.filters.solicitante) return false;
      return true;
    });

    const monthData = months.map(m => {
      const mRaw = baseData.filter(d => d.ano_mes_consulta === m);
      const mCalc = state.filters.cutoff180 ? mRaw.filter(d => !d.outlier_180d) : mRaw;

      const total = mRaw.length;
      const gt60Reg = mRaw.filter(d => d.dias_consulta_insercao > 60).length;
      const cIns = getValueByMetric(mCalc.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const iDiag = getValueByMetric(mCalc.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const cDiag = getValueByMetric(mCalc.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      return {
        month: m,
        total,
        gt60Reg,
        cIns,
        iDiag,
        cDiag,
      };
    });

    // Chart 1: Line Chart for Waiting Times
    createOrUpdateChart('monthlyWaitChart', {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'A partir da Inserção (Cons-Ins)',
            data: monthData.map(d => d.cIns),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 5,
          },
          {
            label: 'Do Diagnóstico à Inserção (Ins-Diag)',
            data: monthData.map(d => d.iDiag),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 5,
          },
          {
            label: 'A partir do Diagnóstico (Cons-Diag)',
            data: monthData.map(d => d.cDiag),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 5,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily } } },
          tooltip: {
            callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw.toFixed(1)} dias` }
          }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, font: { family: theme.fontFamily } } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + ' d' } }
        }
      }
    });

    // Chart 2: Monthly Volume
    createOrUpdateChart('monthlyVolumeChart', {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'Dentro do prazo (≤ 60d da inserção)',
            data: monthData.map(d => d.total - d.gt60Reg),
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderRadius: 4,
          },
          {
            label: 'Casos > 60d a partir da inserção',
            data: monthData.map(d => d.gt60Reg),
            backgroundColor: 'rgba(239, 68, 68, 0.85)',
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily } } },
          tooltip: {
            callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw} casos` }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily } } },
          y: { stacked: true, grid: { color: theme.gridColor }, ticks: { color: theme.textColor } }
        }
      }
    });
  }

  /* ==========================================================================
     TAB 4: ESPECIALIDADES
     ========================================================================== */

  function renderSpecialtiesTab() {
    const rawFiltered = getFilteredData({ applyCutoff: false });
    const calcFiltered = getFilteredData({ applyCutoff: true });
    const theme = getChartThemeColors();

    const uniqueSpecialties = [...new Set(rawFiltered.map(d => d.especialidade))].filter(Boolean);

    const specData = uniqueSpecialties.map(sp => {
      const spRaw = rawFiltered.filter(d => d.especialidade === sp);
      const spCalc = state.filters.cutoff180 ? calcFiltered.filter(d => d.especialidade === sp) : spRaw;

      const total = spRaw.length;
      const regLe60 = spRaw.filter(d => d.dias_consulta_insercao <= 60).length;
      const regGt60 = spRaw.filter(d => d.dias_consulta_insercao > 60).length;

      // Todos os laudos informados da especialidade
      const diagValid = spRaw.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
      const diagLe60 = diagValid.filter(d => d.dias_consulta_diagnostico <= 60).length;
      const diagGt60 = diagValid.filter(d => d.dias_consulta_diagnostico > 60).length;

      const cIns = getValueByMetric(spCalc.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const iDiag = getValueByMetric(spCalc.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const cDiag = getValueByMetric(spCalc.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      const cleanName = sp.replace(/^Oncologia\s*-\s*/i, '').replace(/^Oncologia\s+/i, '');

      return {
        fullName: sp,
        name: cleanName,
        total,
        regLe60,
        regGt60,
        regGt60Perc: total > 0 ? (regGt60 / total) * 100 : 0,
        diagLe60,
        diagGt60,
        diagGt60Perc: diagValid.length > 0 ? (diagGt60 / diagValid.length) * 100 : 0,
        cIns,
        iDiag,
        cDiag,
      };
    }).sort((a, b) => b.total - a.total);

    // Single bar datalabels plugin for Tab 4 charts
    const singleBarValuePlugin = {
      id: 'singleBarValuePlugin',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textBaseline = 'middle';
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#334155';

        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;
          meta.data.forEach((bar, index) => {
            const val = dataset.data[index];
            if (val === null || val === undefined || isNaN(val)) return;
            const text = String(Math.round(val));
            ctx.fillStyle = textColor;
            ctx.fillText(text, bar.x + 5, bar.y);
          });
        });
        ctx.restore();
      }
    };

    // Chart 1: Over 60 Days by Specialty (Da Inserção à Consulta - Regulação)
    const topOver60Reg = [...specData].sort((a, b) => b.regGt60 - a.regGt60);
    createOrUpdateChart('specialtyOver60Chart', {
      type: 'bar',
      data: {
        labels: topOver60Reg.map(d => d.name),
        datasets: [{
          label: 'Casos > 60 dias (Da Inserção à Consulta)',
          data: topOver60Reg.map(d => d.regGt60),
          backgroundColor: 'rgba(245, 158, 11, 0.85)',
          borderRadius: 6,
          maxBarThickness: 20,
          barPercentage: 0.85,
        }]
      },
      plugins: [singleBarValuePlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 28 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.raw} casos > 60d da inserção (${topOver60Reg[c.dataIndex].regGt60Perc.toFixed(1)}% do total)`
            }
          }
        },
        scales: {
          x: { grace: '15%', grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11, weight: '500' } } }
        }
      }
    });

    // Chart 2: Over 60 Days by Specialty (Do Diagnóstico à Consulta - Lei 60d)
    const topOver60Diag = [...specData].sort((a, b) => b.diagGt60 - a.diagGt60);
    createOrUpdateChart('specialtyConsDiagOver60Chart', {
      type: 'bar',
      data: {
        labels: topOver60Diag.map(d => d.name),
        datasets: [{
          label: 'Casos > 60 dias (Do Diagnóstico à Consulta - Lei 60d)',
          data: topOver60Diag.map(d => d.diagGt60),
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          borderRadius: 6,
          maxBarThickness: 20,
          barPercentage: 0.85,
        }]
      },
      plugins: [singleBarValuePlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 28 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.raw} casos > 60d do diagnóstico (${topOver60Diag[c.dataIndex].diagGt60Perc.toFixed(1)}% dos laudos válidos)`
            }
          }
        },
        scales: {
          x: { grace: '15%', grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11, weight: '500' } } }
        }
      }
    });

    // Update Chart Total Footers for Especialidades
    const totalCasesSpec = rawFiltered.length;
    const totalRegGt60Spec = rawFiltered.filter(d => d.dias_consulta_insercao > 60).length;
    const regGt60PercSpec = totalCasesSpec > 0 ? (totalRegGt60Spec / totalCasesSpec) * 100 : 0;

    const validDiagListSpec = rawFiltered.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
    const totalDiagGt60Spec = validDiagListSpec.filter(d => d.dias_consulta_diagnostico > 60).length;
    const totalDiagSpec = validDiagListSpec.length;
    const diagGt60PercSpec = totalDiagSpec > 0 ? (totalDiagGt60Spec / totalDiagSpec) * 100 : 0;

    const specRegFooterEl = document.getElementById('specialtyRegOver60Footer');
    if (specRegFooterEl) {
      specRegFooterEl.innerHTML = `
        <span class="total-label"><i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: #f59e0b;"></i> Total Acima de 60 Dias (Regulação):</span>
        <span class="total-pill total-pill-amber"><strong>${totalRegGt60Spec} casos</strong> (${formatPercent(regGt60PercSpec)} de ${totalCasesSpec})</span>
      `;
    }

    const specDiagFooterEl = document.getElementById('specialtyDiagOver60Footer');
    if (specDiagFooterEl) {
      specDiagFooterEl.innerHTML = `
        <span class="total-label"><i data-lucide="alert-octagon" style="width: 14px; height: 14px; color: #ef4444;"></i> Total Acima de 60 Dias (Lei nº 12.732/12):</span>
        <span class="total-pill total-pill-red"><strong>${totalDiagGt60Spec} laudos</strong> (${formatPercent(diagGt60PercSpec)} de ${totalDiagSpec} válidos)</span>
      `;
    }

    // Render Board: Wait Times by Specialty (Exact 3-Pill Track Pattern)
    const allSorted = [...specData].sort((a, b) => b.cDiag - a.cDiag);
    const boardListEl = document.getElementById('specWaitTimesBoardList');
    const boardFooterEl = document.getElementById('specWaitTimesBoardFooter');

    if (boardListEl) {
      const globalMax = Math.max(...allSorted.map(d => Math.max(d.iDiag || 0, d.cIns || 0, d.cDiag || 0)), 60);

      boardListEl.innerHTML = allSorted.map((r, index) => {
        const rank = index + 1;
        const wDiag = r.iDiag !== null && r.iDiag > 0 ? Math.max((r.iDiag / (globalMax * 1.05)) * 100, 8) : 0;
        const wIns = r.cIns !== null && r.cIns > 0 ? Math.max((r.cIns / (globalMax * 1.05)) * 100, 8) : 0;
        const wDiagCons = r.cDiag !== null && r.cDiag > 0 ? Math.max((r.cDiag / (globalMax * 1.05)) * 100, 8) : 0;

        return `
          <div class="spec-row">
            <div class="spec-info">
              <span class="spec-rank-badge">${rank}</span>
              <span class="spec-name" title="${r.fullName}">${r.name}</span>
            </div>
            <div class="spec-bars-track">
              ${r.iDiag !== null && r.iDiag > 0 ? `<div class="spec-bar-seg bar-diag-ins" style="width: ${wDiag.toFixed(1)}%;" title="Do Diagnóstico à Inserção (Média): ${r.iDiag.toFixed(1)} dias">${Math.round(r.iDiag)}</div>` : ''}
              ${r.cIns !== null && r.cIns > 0 ? `<div class="spec-bar-seg bar-ins-cons" style="width: ${wIns.toFixed(1)}%;" title="Da Inserção à Consulta (Média): ${r.cIns.toFixed(1)} dias">${Math.round(r.cIns)}</div>` : ''}
              ${r.cDiag !== null && r.cDiag > 0 ? `<div class="spec-bar-seg" style="background: #06b6d4; width: ${wDiagCons.toFixed(1)}%;" title="Do Diagnóstico à Consulta (Média): ${r.cDiag.toFixed(1)} dias">${Math.round(r.cDiag)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    if (boardFooterEl) {
      const overallDiagIns = getValueByMetric(calcFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const overallInsCons = getValueByMetric(calcFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const overallDiagCons = getValueByMetric(calcFiltered.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      const labelFooter = state.filters.metricMode === 'median' ? 'Mediana Geral da Rede' : 'Média Geral da Rede';
      const metricType = state.filters.metricMode === 'median' ? 'Mediana P50' : 'Média';

      boardFooterEl.className = 'spec-summary-footer';
      boardFooterEl.innerHTML = `
        <div style="font-size: 0.825rem; color: var(--text-primary);">${labelFooter}</div>
        <div class="summary-values">
          <span class="val-diag-ins" title="Do Diagnóstico à Inserção (${metricType})">${Math.round(overallDiagIns)}d</span>
          <span class="val-ins-cons" title="Da Inserção à Consulta (${metricType})">${Math.round(overallInsCons)}d</span>
          <span class="val-diag-cons" title="Do Diagnóstico à Consulta (${metricType})">${Math.round(overallDiagCons)}d</span>
        </div>
      `;
    }

    // Table Rendering
    const tbody = document.getElementById('specialtiesTableBody');
    if (tbody) {
      tbody.innerHTML = specData.map(d => `
        <tr>
          <td><strong>${d.fullName}</strong></td>
          <td><span class="badge badge-purple">${d.total}</span></td>
          <td><span class="badge badge-success">${d.regLe60} (${formatPercent((d.regLe60 / d.total) * 100)})</span></td>
          <td><span class="badge ${d.regGt60 > 0 ? 'badge-danger' : 'badge-success'}">${d.regGt60} (${formatPercent(d.regGt60Perc)})</span></td>
          <td><span class="badge badge-cyan">${d.diagLe60}</span></td>
          <td><span class="badge ${d.diagGt60Perc > 40 ? 'badge-danger' : 'badge-warning'}">${d.diagGt60} (${formatPercent(d.diagGt60Perc)})</span></td>
          <td>${formatNumber(d.cIns)} dias</td>
          <td>${formatNumber(d.iDiag)} dias</td>
          <td><strong>${formatNumber(d.cDiag)} dias</strong></td>
        </tr>
      `).join('');
    }
    if (window.lucide) lucide.createIcons();
  }

  /* ==========================================================================
     TAB 5: SOLICITANTES & MUNICÍPIOS
     ========================================================================== */

  function renderSolicitantesTab() {
    const rawFiltered = getFilteredData({ applyCutoff: false });
    const calcFiltered = getFilteredData({ applyCutoff: true });
    const theme = getChartThemeColors();

    const uniqueSolicitantes = [...new Set(rawFiltered.map(d => d.unidade_solicitante))].filter(Boolean);

    const solData = uniqueSolicitantes.map(sol => {
      const sRaw = rawFiltered.filter(d => d.unidade_solicitante === sol);
      const sCalc = state.filters.cutoff180 ? calcFiltered.filter(d => d.unidade_solicitante === sol) : sRaw;

      const total = sRaw.length;
      const regLe60 = sRaw.filter(d => d.dias_consulta_insercao <= 60).length;
      const regGt60 = sRaw.filter(d => d.dias_consulta_insercao > 60).length;
      
      // Todos os laudos informados do solicitante
      const diagValid = sRaw.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
      const diagLe60 = diagValid.filter(d => d.dias_consulta_diagnostico <= 60).length;
      const diagGt60 = diagValid.filter(d => d.dias_consulta_diagnostico > 60).length;

      const cIns = getValueByMetric(sCalc.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const iDiag = getValueByMetric(sCalc.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const cDiag = getValueByMetric(sCalc.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      const diagGt60Perc = diagValid.length > 0 ? (diagGt60 / diagValid.length) * 100 : 0;
      const regGt60Perc = total > 0 ? (regGt60 / total) * 100 : 0;

      return {
        name: sol,
        total,
        regLe60,
        regGt60,
        regGt60Perc,
        diagLe60,
        diagGt60,
        diagGt60Perc,
        cIns,
        iDiag,
        cDiag,
      };
    }).sort((a, b) => b.total - a.total);

    // Single bar datalabels plugin for Tab 5 charts
    const solSingleBarPlugin = {
      id: 'solSingleBarPlugin',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textBaseline = 'middle';
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#334155';

        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;
          meta.data.forEach((bar, index) => {
            const val = dataset.data[index];
            if (val === null || val === undefined || isNaN(val)) return;
            const text = String(Math.round(val));
            ctx.fillStyle = textColor;
            ctx.fillText(text, bar.x + 5, bar.y);
          });
        });
        ctx.restore();
      }
    };

    // Chart 1 & 2: Over 60 Days by Solicitante (ALL units with cases > 60d)
    const topOver60Reg = [...solData].filter(d => d.regGt60 > 0).sort((a, b) => b.regGt60 - a.regGt60);
    const topOver60Diag = [...solData].filter(d => d.diagGt60 > 0).sort((a, b) => b.diagGt60 - a.diagGt60);

    // Dynamic Chart Height Calculation per chart:
    // Calculates height strictly based on each chart's bar count (28px per bar + 45px for axes/padding)
    // This keeps bar spacing tight, consistent, and top-aligned without vertical stretching.
    const regChartHeight = Math.max(90, topOver60Reg.length * 28 + 45);
    const diagChartHeight = Math.max(90, topOver60Diag.length * 28 + 45);

    const regWrapper = document.getElementById('solicitantesOver60Wrapper');
    if (regWrapper) {
      regWrapper.style.height = `${regChartHeight}px`;
      regWrapper.style.minHeight = `${regChartHeight}px`;
    }

    const diagWrapper = document.getElementById('solicitantesConsDiagOver60Wrapper');
    if (diagWrapper) {
      diagWrapper.style.height = `${diagChartHeight}px`;
      diagWrapper.style.minHeight = `${diagChartHeight}px`;
    }

    createOrUpdateChart('solicitantesOver60Chart', {
      type: 'bar',
      data: {
        labels: topOver60Reg.map(d => d.name),
        datasets: [{
          label: 'Casos > 60 dias (Da Inserção à Consulta)',
          data: topOver60Reg.map(d => d.regGt60),
          backgroundColor: 'rgba(245, 158, 11, 0.85)',
          borderRadius: 6,
          maxBarThickness: 20,
          barPercentage: 0.85,
        }]
      },
      plugins: [solSingleBarPlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 28 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.raw} casos > 60d da inserção (${topOver60Reg[c.dataIndex].regGt60Perc.toFixed(1)}% da unidade)`
            }
          }
        },
        scales: {
          x: { grace: '15%', grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11, weight: '500' } } }
        }
      }
    });

    createOrUpdateChart('solicitantesConsDiagOver60Chart', {
      type: 'bar',
      data: {
        labels: topOver60Diag.map(d => d.name),
        datasets: [{
          label: 'Casos > 60 dias (Do Diagnóstico à Consulta - Lei 60d)',
          data: topOver60Diag.map(d => d.diagGt60),
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          borderRadius: 6,
          maxBarThickness: 20,
          barPercentage: 0.85,
        }]
      },
      plugins: [solSingleBarPlugin],
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 28 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.raw} casos > 60d do diagnóstico (${topOver60Diag[c.dataIndex].diagGt60Perc.toFixed(1)}% dos laudos válidos)`
            }
          }
        },
        scales: {
          x: { grace: '15%', grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11, weight: '500' } } }
        }
      }
    });

    // Update Chart Total Footers for Solicitantes
    const totalCasesSol = rawFiltered.length;
    const totalRegGt60Sol = rawFiltered.filter(d => d.dias_consulta_insercao > 60).length;
    const regGt60PercSol = totalCasesSol > 0 ? (totalRegGt60Sol / totalCasesSol) * 100 : 0;

    const validDiagListSol = rawFiltered.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
    const totalDiagGt60Sol = validDiagListSol.filter(d => d.dias_consulta_diagnostico > 60).length;
    const totalDiagSol = validDiagListSol.length;
    const diagGt60PercSol = totalDiagSol > 0 ? (totalDiagGt60Sol / totalDiagSol) * 100 : 0;

    const solRegFooterEl = document.getElementById('solicitantesRegOver60Footer');
    if (solRegFooterEl) {
      solRegFooterEl.innerHTML = `
        <span class="total-label"><i data-lucide="alert-triangle" style="width: 14px; height: 14px; color: #f59e0b;"></i> Total Acima de 60 Dias (Regulação):</span>
        <span class="total-pill total-pill-amber"><strong>${totalRegGt60Sol} casos</strong> (${formatPercent(regGt60PercSol)} de ${totalCasesSol})</span>
      `;
    }

    const solDiagFooterEl = document.getElementById('solicitantesDiagOver60Footer');
    if (solDiagFooterEl) {
      solDiagFooterEl.innerHTML = `
        <span class="total-label"><i data-lucide="alert-octagon" style="width: 14px; height: 14px; color: #ef4444;"></i> Total Acima de 60 Dias (Lei nº 12.732/12):</span>
        <span class="total-pill total-pill-red"><strong>${totalDiagGt60Sol} laudos</strong> (${formatPercent(diagGt60PercSol)} de ${totalDiagSol} válidos)</span>
      `;
    }

    // Render Board: Wait Times by Solicitante (ALL active units with cases in period)
    const allWaitSol = [...solData].filter(d => d.total > 0).sort((a, b) => (b.cDiag || 0) - (a.cDiag || 0));
    const solBoardListEl = document.getElementById('solicitantesWaitTimesBoardList');
    const solBoardFooterEl = document.getElementById('solicitantesWaitTimesBoardFooter');

    if (solBoardListEl) {
      const globalMax = Math.max(...allWaitSol.map(d => Math.max(d.iDiag || 0, d.cIns || 0, d.cDiag || 0)), 60);

      solBoardListEl.innerHTML = allWaitSol.map((r, index) => {
        const rank = index + 1;
        const wDiag = r.iDiag !== null && r.iDiag > 0 ? Math.max((r.iDiag / (globalMax * 1.05)) * 100, 8) : 0;
        const wIns = r.cIns !== null && r.cIns > 0 ? Math.max((r.cIns / (globalMax * 1.05)) * 100, 8) : 0;
        const wDiagCons = r.cDiag !== null && r.cDiag > 0 ? Math.max((r.cDiag / (globalMax * 1.05)) * 100, 8) : 0;

        return `
          <div class="spec-row">
            <div class="spec-info">
              <span class="spec-rank-badge">${rank}</span>
              <span class="spec-name" title="${r.name}">${r.name}</span>
            </div>
            <div class="spec-bars-track">
              ${r.iDiag !== null && r.iDiag > 0 ? `<div class="spec-bar-seg bar-diag-ins" style="width: ${wDiag.toFixed(1)}%;" title="Do Diagnóstico à Inserção (Média): ${r.iDiag.toFixed(1)} dias">${Math.round(r.iDiag)}</div>` : ''}
              ${r.cIns !== null && r.cIns > 0 ? `<div class="spec-bar-seg bar-ins-cons" style="width: ${wIns.toFixed(1)}%;" title="Da Inserção à Consulta (Média): ${r.cIns.toFixed(1)} dias">${Math.round(r.cIns)}</div>` : ''}
              ${r.cDiag !== null && r.cDiag > 0 ? `<div class="spec-bar-seg" style="background: #06b6d4; width: ${wDiagCons.toFixed(1)}%;" title="Do Diagnóstico à Consulta (Média): ${r.cDiag.toFixed(1)} dias">${Math.round(r.cDiag)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    if (solBoardFooterEl) {
      const overallDiagIns = getValueByMetric(calcFiltered.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
      const overallInsCons = getValueByMetric(calcFiltered.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
      const overallDiagCons = getValueByMetric(calcFiltered.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

      const labelFooter = state.filters.metricMode === 'median' ? 'Mediana Geral da Rede' : 'Média Geral da Rede';
      const metricType = state.filters.metricMode === 'median' ? 'Mediana P50' : 'Média';

      solBoardFooterEl.className = 'spec-summary-footer';
      solBoardFooterEl.innerHTML = `
        <div style="font-size: 0.825rem; color: var(--text-primary);">${labelFooter}</div>
        <div class="summary-values">
          <span class="val-diag-ins" title="Do Diagnóstico à Inserção (${metricType})">${Math.round(overallDiagIns)}d</span>
          <span class="val-ins-cons" title="Da Inserção à Consulta (${metricType})">${Math.round(overallInsCons)}d</span>
          <span class="val-diag-cons" title="Do Diagnóstico à Consulta (${metricType})">${Math.round(overallDiagCons)}d</span>
        </div>
      `;
    }

    // Table Rendering
    const tbody = document.getElementById('solicitantesTableBody');
    if (tbody) {
      tbody.innerHTML = solData.map(d => {
        let riskBadge = '<span class="badge badge-success">Baixo Risco</span>';
        if (d.diagGt60Perc > 40) {
          riskBadge = '<span class="badge badge-danger">Crítico (>40%)</span>';
        } else if (d.diagGt60Perc > 25) {
          riskBadge = '<span class="badge badge-warning">Atenção (>25%)</span>';
        }

        return `
          <tr>
            <td><strong>${d.name}</strong></td>
            <td><span class="badge badge-purple">${d.total}</span></td>
            <td><span class="badge badge-success">${d.regLe60} (${formatPercent((d.regLe60 / d.total) * 100)})</span></td>
            <td><span class="badge ${d.regGt60 > 0 ? 'badge-danger' : 'badge-success'}">${d.regGt60} (${formatPercent(d.regGt60Perc)})</span></td>
            <td><span class="badge badge-cyan">${d.diagLe60}</span></td>
            <td><span class="badge ${d.diagGt60Perc > 40 ? 'badge-danger' : 'badge-warning'}">${d.diagGt60} (${formatPercent(d.diagGt60Perc)})</span></td>
            <td>${formatNumber(d.cIns)} dias</td>
            <td>${formatNumber(d.iDiag)} dias</td>
            <td><strong>${formatNumber(d.cDiag)} dias</strong></td>
            <td>${riskBadge}</td>
          </tr>
        `;
      }).join('');
    }
    if (window.lucide) lucide.createIcons();
  }

  /* ==========================================================================
     TAB 6: PROTOCOLO DE ALTA SUSPEIÇÃO
     ========================================================================== */

  function renderSuspeicaoTab() {
    const rawFiltered = getFilteredData({ applyCutoff: false });
    const theme = getChartThemeColors();

    const suspCases = rawFiltered.filter(d => d.alta_suspeicao);
    document.getElementById('suspeicaoBadgeCount').textContent = suspCases.length;

    // Suspeicao KPIs
    const waitArr = suspCases.map(d => d.dias_consulta_insercao).filter(n => n !== null);
    const avgWait = getValueByMetric(waitArr);
    const le60Count = suspCases.filter(d => d.dias_consulta_insercao <= 60).length;
    const gt60Count = suspCases.filter(d => d.dias_consulta_insercao > 60).length;
    const le60Perc = suspCases.length > 0 ? (le60Count / suspCases.length) * 100 : 0;
    const gt60Perc = suspCases.length > 0 ? (gt60Count / suspCases.length) * 100 : 0;

    document.getElementById('suspeicaoAvgWait').textContent = `${formatNumber(avgWait)} dias`;
    document.getElementById('suspeicaoLe60').textContent = formatPercent(le60Perc);
    document.getElementById('suspeicaoLe60Count').textContent = `${le60Count} de ${suspCases.length} casos`;
    document.getElementById('suspeicaoGt60').textContent = formatPercent(gt60Perc);
    document.getElementById('suspeicaoGt60Count').textContent = `${gt60Count} de ${suspCases.length} casos`;

    // Specialty breakdown chart
    const suspBySpec = {};
    suspCases.forEach(d => {
      suspBySpec[d.especialidade] = (suspBySpec[d.especialidade] || 0) + 1;
    });

    createOrUpdateChart('suspeicaoSpecialtyChart', {
      type: 'doughnut',
      data: {
        labels: Object.keys(suspBySpec),
        datasets: [{
          data: Object.values(suspBySpec),
          backgroundColor: [
            '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'
          ],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 11 } } },
          tooltip: {
            callbacks: { label: (c) => ` ${c.label}: ${c.raw} caso(s)` }
          }
        }
      }
    });

    // Suspeicao Table
    const tbody = document.getElementById('suspeicaoTableBody');
    if (tbody) {
      tbody.innerHTML = suspCases.map(d => {
        const isPostConsulta = d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico < 0;
        let laudoBadge = '';
        let diagDateCell = d.data_diagnostico ? d.data_diagnostico : '<span style="color: var(--text-muted);">Não informada</span>';

        if (d.sem_diagnostico) {
          laudoBadge = '<span class="badge badge-purple" style="background: rgba(139, 92, 246, 0.15); color: #a855f7;">Sem laudo informado (Suspeição Pura)</span>';
        } else if (isPostConsulta) {
          const diasPosCons = Math.abs(d.dias_consulta_diagnostico);
          const diasPosIns = Math.abs(d.dias_insercao_diagnostico);
          diagDateCell = `<strong style="color: #ef4444;" title="Laudo emitido ${diasPosCons} dias após a primeira consulta médica">${d.data_diagnostico}</strong> <span class="badge badge-danger" style="font-size: 0.65rem; padding: 1px 5px; margin-left: 4px;">Pós-Consulta</span>`;
          laudoBadge = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
              <span class="badge badge-danger" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.35); font-weight: 700;" title="Laudo emitido após o início do atendimento">
                <i data-lucide="alert-octagon" style="width: 12px; height: 12px; display: inline-block;"></i> Laudo emitido ${diasPosCons}d após consulta
              </span>
              <span class="badge badge-cyan" style="font-size: 0.72rem;">(${diasPosIns}d após inserção)</span>
            </div>
          `;
        } else if (d.diagnostico_posterior_insercao) {
          laudoBadge = `<span class="badge badge-cyan">Laudo emitido ${Math.abs(d.dias_insercao_diagnostico)}d após inserção</span>`;
        }

        return `
          <tr ${isPostConsulta ? 'style="background: rgba(239, 68, 68, 0.04);"' : ''}>
            <td style="text-align: center;"><strong>#${d.id}</strong></td>
            <td style="text-align: center;">${d.data_insercao_date || '-'}</td>
            <td style="text-align: center;">${d.data_consulta_date || '-'}</td>
            <td style="text-align: center;">${diagDateCell}</td>
            <td>${d.especialidade}</td>
            <td>${d.unidade_solicitante}</td>
            <td style="text-align: center;"><strong style="color: ${d.dias_consulta_insercao > 60 ? '#ef4444' : '#10b981'};">${d.dias_consulta_insercao} dias</strong></td>
            <td style="text-align: center;">${laudoBadge}</td>
          </tr>
        `;
      }).join('');
    }
    if (window.lucide) lucide.createIcons();
  }

  /* ==========================================================================
     TAB 7: MAIN DATA TABLE & PAGINATION
     ========================================================================== */

  function renderMainTable() {
    const tableData = getFilteredData({ applyCutoff: false, includeSearchAndStatus: true });

    // Update counter
    document.getElementById('tableTotalCount').textContent = tableData.length.toLocaleString('pt-BR');

    // Sorting
    tableData.sort((a, b) => {
      let valA = a[state.table.sortColumn];
      let valB = b[state.table.sortColumn];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return state.table.sortAsc ? valA - valB : valB - valA;
      }
      return state.table.sortAsc 
        ? String(valA).localeCompare(String(valB)) 
        : String(valB).localeCompare(String(valA));
    });

    // Pagination calculations
    const totalRecords = tableData.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / state.table.pageSize));
    state.table.currentPage = Math.min(state.table.currentPage, totalPages);

    const startIndex = (state.table.currentPage - 1) * state.table.pageSize;
    const pageRecords = tableData.slice(startIndex, startIndex + state.table.pageSize);

    // Update Pagination UI
    const endRecord = Math.min(startIndex + state.table.pageSize, totalRecords);
    document.getElementById('tableRecordCount').textContent = totalRecords > 0 
      ? `Mostrando ${startIndex + 1} a ${endRecord} de ${totalRecords.toLocaleString('pt-BR')} registros`
      : 'Nenhum registro encontrado';

    document.getElementById('pageIndicator').textContent = `Página ${state.table.currentPage} de ${totalPages}`;
    document.getElementById('btnPrevPage').disabled = state.table.currentPage <= 1;
    document.getElementById('btnNextPage').disabled = state.table.currentPage >= totalPages;

    // Render Table Rows
    const tbody = document.getElementById('mainTableBody');
    if (!tbody) return;

    if (pageRecords.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Nenhum registro correspondente aos filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageRecords.map(item => {
      let statusBadge = '';
      if (item.alta_suspeicao) {
        statusBadge = '<span class="badge badge-purple">Alta Suspeição</span>';
      } else if (item.outlier_180d) {
        statusBadge = '<span class="badge badge-warning">Atraso Paciente (>180d)</span>';
      } else if (item.cons_ins_le_60 && item.cons_diag_le_60) {
        statusBadge = '<span class="badge badge-success">Conforme (≤60d)</span>';
      } else {
        statusBadge = '<span class="badge badge-danger">Prazo Excedido</span>';
      }

      return `
        <tr>
          <td><strong>#${item.id}</strong></td>
          <td><span class="badge badge-cyan">${item.periodo}</span></td>
          <td>${item.especialidade}</td>
          <td>${item.unidade_solicitante}</td>
          <td>${item.data_diagnostico || '<span style="color: var(--text-muted);">-</span>'}</td>
          <td>${item.data_insercao_date || '-'}</td>
          <td>${item.data_consulta_date || '-'}</td>
          <td>
            <strong style="color: ${item.dias_consulta_insercao > 60 ? '#ef4444' : '#10b981'};">
              ${item.dias_consulta_insercao !== null ? item.dias_consulta_insercao + ' d' : '-'}
            </strong>
          </td>
          <td>${item.dias_insercao_diagnostico !== null ? item.dias_insercao_diagnostico + ' d' : '-'}</td>
          <td>
            <strong style="color: ${item.dias_consulta_diagnostico > 60 ? '#ef4444' : '#10b981'};">
              ${item.dias_consulta_diagnostico !== null ? item.dias_consulta_diagnostico + ' d' : '-'}
            </strong>
          </td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  /* ==========================================================================
     FILTER DROPDOWN POPULATION
     ========================================================================== */

  function initFilterOptions() {
    const specialties = [...new Set(state.data.map(d => d.especialidade))].filter(Boolean).sort();
    const solicitantes = [...new Set(state.data.map(d => d.unidade_solicitante))].filter(Boolean).sort();

    const specSelect = document.getElementById('specialtyFilter');
    specialties.forEach(sp => {
      const opt = document.createElement('option');
      opt.value = sp;
      opt.textContent = sp;
      specSelect.appendChild(opt);
    });

    const solSelect = document.getElementById('solicitanteFilter');
    solicitantes.forEach(sol => {
      const opt = document.createElement('option');
      opt.value = sol;
      opt.textContent = sol;
      solSelect.appendChild(opt);
    });
  }

  /* ==========================================================================
     EVENT LISTENERS & INTERACTION
     ========================================================================== */

  function initEventListeners() {
    // Theme Toggle
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem('rhccc_theme', state.theme);
      updateThemeIcon();
      renderOverviewCharts();
      renderPeriodTab();
      renderContinuousTab();
      renderSpecialtiesTab();
      renderSolicitantesTab();
      renderSuspeicaoTab();
    });

    // Period Select
    document.getElementById('periodFilter').addEventListener('change', (e) => {
      state.filters.period = e.target.value;
      state.table.currentPage = 1;
      renderDashboard();
    });

    // Specialty Select
    document.getElementById('specialtyFilter').addEventListener('change', (e) => {
      state.filters.specialty = e.target.value;
      state.table.currentPage = 1;
      renderDashboard();
    });

    // Solicitante Select
    document.getElementById('solicitanteFilter').addEventListener('change', (e) => {
      state.filters.solicitante = e.target.value;
      state.table.currentPage = 1;
      renderDashboard();
    });

    // Reset Filters Button
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      state.filters.period = 'ALL';
      state.filters.specialty = 'ALL';
      state.filters.solicitante = 'ALL';
      state.filters.cutoff180 = true;
      state.table.search = '';
      state.table.statusFilter = 'ALL';
      state.table.currentPage = 1;

      document.getElementById('periodFilter').value = 'ALL';
      document.getElementById('specialtyFilter').value = 'ALL';
      document.getElementById('solicitanteFilter').value = 'ALL';
      document.getElementById('cutoff180Toggle').checked = true;
      document.getElementById('tableSearchInput').value = '';
      document.getElementById('tableStatusFilter').value = 'ALL';

      renderDashboard();
    });

    // 180 Days Cutoff Toggle
    document.getElementById('cutoff180Toggle').addEventListener('change', (e) => {
      state.filters.cutoff180 = e.target.checked;
      renderDashboard();
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetTabId = btn.getAttribute('data-tab');
        const targetPanel = document.getElementById(targetTabId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }

        // Re-render charts of active tab to recalculate exact dimensions
        if (targetTabId === 'tab-overview') renderOverviewCharts();
        else if (targetTabId === 'tab-periods') renderPeriodTab();
        else if (targetTabId === 'tab-continuous') renderContinuousTab();
        else if (targetTabId === 'tab-specialties') renderSpecialtiesTab();
        else if (targetTabId === 'tab-solicitantes') renderSolicitantesTab();
        else if (targetTabId === 'tab-suspeicao') renderSuspeicaoTab();
        else if (targetTabId === 'tab-dados') renderMainTable();

        // Trigger chart resize on tab switch
        Object.values(state.charts).forEach(chart => {
          if (chart && typeof chart.resize === 'function') {
            chart.resize();
          }
        });
      });
    });

    // Table Search Input
    document.getElementById('tableSearchInput').addEventListener('input', (e) => {
      state.table.search = e.target.value;
      state.table.currentPage = 1;
      renderMainTable();
    });

    // Table Status Filter
    document.getElementById('tableStatusFilter').addEventListener('change', (e) => {
      state.table.statusFilter = e.target.value;
      state.table.currentPage = 1;
      renderMainTable();
    });

    // Table Sorting
    document.querySelectorAll('#mainDataTable th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (state.table.sortColumn === col) {
          state.table.sortAsc = !state.table.sortAsc;
        } else {
          state.table.sortColumn = col;
          state.table.sortAsc = true;
        }
        renderMainTable();
      });
    });

    // Table Pagination
    document.getElementById('btnPrevPage').addEventListener('click', () => {
      if (state.table.currentPage > 1) {
        state.table.currentPage--;
        renderMainTable();
      }
    });

    document.getElementById('btnNextPage').addEventListener('click', () => {
      state.table.currentPage++;
      renderMainTable();
    });

    // Export CSV
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
    document.getElementById('tableExportBtn').addEventListener('click', exportCsv);

    // Print Dashboard Handler
    const printBtn = document.getElementById('printBtn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} às ${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
        
        const metaDate = document.getElementById('printMetaDate');
        const metaTab = document.getElementById('printMetaTab');
        const metaPeriod = document.getElementById('printMetaPeriod');
        const metaSpec = document.getElementById('printMetaSpec');

        const activeTabBtn = document.querySelector('.tab-btn.active');
        const activeTabName = activeTabBtn ? activeTabBtn.innerText.trim() : 'Visão Geral';
        const periodSelect = document.getElementById('periodFilter');
        const specSelect = document.getElementById('specialtyFilter');

        if (metaDate) metaDate.textContent = dateStr;
        if (metaTab) metaTab.textContent = activeTabName;
        if (metaPeriod && periodSelect) metaPeriod.textContent = periodSelect.options[periodSelect.selectedIndex]?.text || 'Todos';
        if (metaSpec && specSelect) metaSpec.textContent = specSelect.options[specSelect.selectedIndex]?.text || 'Todas';

        setPrintPageOrientation('landscape');
        document.body.classList.remove('print-report-mode');
        document.body.classList.add('print-dashboard-mode');
        setTimeout(() => window.print(), 50);
      });
    }

    // Relatório Técnico Formal Modal Handlers
    const relatorioModal = document.getElementById('relatorioModal');
    const relatorioBtn = document.getElementById('relatorioTecnicoBtn');
    const closeRelatorioBtn = document.getElementById('closeRelatorioBtn');
    const printRelatorioBtn = document.getElementById('printRelatorioBtn');
    const copyRelatorioBtn = document.getElementById('copyRelatorioBtn');

    if (relatorioBtn && relatorioModal) {
      relatorioBtn.addEventListener('click', () => {
        updateRelatorioModalData();
        relatorioModal.classList.add('active');
      });
    }

    if (closeRelatorioBtn && relatorioModal) {
      closeRelatorioBtn.addEventListener('click', () => {
        relatorioModal.classList.remove('active');
      });
      relatorioModal.addEventListener('click', (e) => {
        if (e.target === relatorioModal) {
          relatorioModal.classList.remove('active');
        }
      });
    }

    if (printRelatorioBtn) {
      printRelatorioBtn.addEventListener('click', () => {
        updateRelatorioModalData();
        setPrintPageOrientation('portrait');
        document.body.classList.remove('print-dashboard-mode');
        document.body.classList.add('print-report-mode');
        setTimeout(() => window.print(), 50);
      });
    }

    window.addEventListener('afterprint', () => {
      document.body.classList.remove('print-dashboard-mode', 'print-report-mode');
    });

    if (copyRelatorioBtn) {
      copyRelatorioBtn.addEventListener('click', () => {
        const area = document.getElementById('reportPrintArea');
        if (area) {
          navigator.clipboard.writeText(area.innerText).then(() => {
            alert('Texto do Relatório Técnico copiado para a área de transferência com sucesso!');
          }).catch(err => {
            console.error('Erro ao copiar:', err);
          });
        }
      });
    }

    // Live Excel File Upload
    const uploadBtn = document.getElementById('uploadExcelBtn');
    const fileInput = document.getElementById('excelFileInput');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', handleExcelUpload);
    }
  }

  function setPrintPageOrientation(orientation) {
    let styleEl = document.getElementById('dynamicPrintOrientation');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamicPrintOrientation';
      document.head.appendChild(styleEl);
    }
    if (orientation === 'landscape') {
      styleEl.textContent = '@media print { @page { size: A4 landscape; margin: 6mm 8mm; } }';
    } else {
      styleEl.textContent = '@media print { @page { size: A4 portrait; margin: 6mm 8mm; } }';
    }
  }

  /* ==========================================================================
     RELATÓRIO TÉCNICO FORMAL DYNAMIC UPDATER
     ========================================================================== */

  function updateRelatorioModalData() {
    const rawData = state.data;
    const calcData = rawData.filter(d => !d.outlier_180d);

    const totalCount = rawData.length;
    const emissionEl = document.getElementById('repEmissionDate');
    const totalCasesEl = document.getElementById('repTotalCases');
    const validDiagEl = document.getElementById('repValidDiagCases');

    const validDiagCases = rawData.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);
    const validDiagCount = validDiagCases.length;
    const missingDiagCount = totalCount - validDiagCount;

    if (emissionEl) {
      const today = new Date();
      emissionEl.textContent = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    }
    if (totalCasesEl) {
      totalCasesEl.textContent = `${totalCount.toLocaleString('pt-BR')} casos cadastrados`;
    }
    if (validDiagEl) {
      validDiagEl.textContent = `${validDiagCount.toLocaleString('pt-BR')} laudos (${missingDiagCount} sem laudo prévio)`;
    }

    // Dynamic metrics calculation
    const regLe60Count = rawData.filter(d => d.dias_consulta_insercao <= 60).length;
    const regLe60Perc = totalCount > 0 ? (regLe60Count / totalCount) * 100 : 0;

    const insConsRawMean = calcMean(rawData.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
    const insConsCutMean = calcMean(calcData.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
    const insConsMedian = calcMedian(rawData.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
    const insConsP90 = calcPercentile(rawData.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0), 90);

    const diagInsRawMean = calcMean(rawData.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
    const diagInsCutMean = calcMean(calcData.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
    const diagInsMedian = calcMedian(rawData.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
    const diagInsP90 = calcPercentile(rawData.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0), 90);

    const diagConsRawMean = calcMean(rawData.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));
    const diagConsCutMean = calcMean(calcData.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));
    const diagConsMedian = calcMedian(rawData.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));
    const diagConsP90 = calcPercentile(rawData.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0), 90);

    const diagLe60Count = validDiagCases.filter(d => d.dias_consulta_diagnostico <= 60).length;
    const diagLe60Perc = validDiagCount > 0 ? (diagLe60Count / validDiagCount) * 100 : 0;
    const diagGt60Perc = 100 - diagLe60Perc;

    const repTableBody = document.getElementById('repTableBody');
    if (repTableBody) {
      repTableBody.innerHTML = `
        <tr>
          <td><strong>Fila da Regulação &le; 60 dias (Cons-Ins)</strong></td>
          <td align="center">${formatPercent(regLe60Perc)} (${regLe60Count})</td>
          <td align="center">${formatPercent(regLe60Perc)} (${regLe60Count})</td>
          <td align="center">—</td>
          <td align="center">—</td>
          <td align="center"><span style="color: #059669; font-weight: 700;">Satisfatório (&gt;85%)</span></td>
        </tr>
        <tr>
          <td><strong>Tempo na Fila da Regulação (Cons-Ins)</strong></td>
          <td align="center">${formatNumber(insConsRawMean)} dias</td>
          <td align="center">${formatNumber(insConsCutMean)} dias</td>
          <td align="center"><strong>${formatNumber(insConsMedian)} dias</strong></td>
          <td align="center">${formatNumber(insConsP90)} dias</td>
          <td align="center"><span style="color: #059669; font-weight: 700;">Célere (50% em 14d)</span></td>
        </tr>
        <tr>
          <td><strong>Retenção Municipal / Solicitante (Ins-Diag)</strong></td>
          <td align="center">${formatNumber(diagInsRawMean)} dias</td>
          <td align="center"><strong>${formatNumber(diagInsCutMean)} dias</strong></td>
          <td align="center"><strong>${formatNumber(diagInsMedian)} dias</strong></td>
          <td align="center">${formatNumber(diagInsP90)} dias</td>
          <td align="center"><span style="color: #d97706; font-weight: 700;">Ponto Crítico de Atraso</span></td>
        </tr>
        <tr>
          <td><strong>Tempo Total da Jornada (Cons-Diag)</strong></td>
          <td align="center">${formatNumber(diagConsRawMean)} dias</td>
          <td align="center"><strong>${formatNumber(diagConsCutMean)} dias</strong></td>
          <td align="center"><strong>${formatNumber(diagConsMedian)} dias</strong></td>
          <td align="center">${formatNumber(diagConsP90)} dias</td>
          <td align="center"><span style="color: #2563eb; font-weight: 700;">Dentro da meta na média</span></td>
        </tr>
        <tr>
          <td><strong>Cumprimento Lei 60d (Cons-Diag &le; 60d)</strong></td>
          <td align="center"><strong>${formatPercent(diagLe60Perc)}</strong> (${diagLe60Count})</td>
          <td align="center"><strong>${formatPercent(diagLe60Perc)}</strong> (${diagLe60Count})</td>
          <td align="center">—</td>
          <td align="center">—</td>
          <td align="center"><span style="color: #dc2626; font-weight: 700;">${formatPercent(diagGt60Perc)} em desconformidade</span></td>
        </tr>
      `;
    }

    // Dynamic Period-by-Period Evolution Summary
    const periodSummaryEl = document.getElementById('repPeriodSummary');
    if (periodSummaryEl) {
      const periods = [...new Set(rawData.map(d => d.periodo))].filter(p => p && p !== 'Outro');
      periodSummaryEl.innerHTML = periods.map(p => {
        const pRaw = rawData.filter(d => d.periodo === p);
        const pCalc = pRaw.filter(d => !d.outlier_180d);
        const pTotal = pRaw.length;
        const pValidDiag = pRaw.filter(d => d.dias_consulta_diagnostico !== null && d.dias_consulta_diagnostico >= 0);

        const pRegLe60 = pRaw.filter(d => d.dias_consulta_insercao <= 60).length;
        const pRegPerc = pTotal > 0 ? (pRegLe60 / pTotal) * 100 : 0;

        const pConsInsMean = calcMean(pCalc.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));
        const pConsInsMed = calcMedian(pRaw.map(d => d.dias_consulta_insercao).filter(n => n !== null && n >= 0));

        const pInsDiagMean = calcMean(pCalc.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));
        const pInsDiagMed = calcMedian(pRaw.map(d => d.dias_insercao_diagnostico).filter(n => n !== null && n >= 0));

        const pConsDiagMean = calcMean(pCalc.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));
        const pConsDiagMed = calcMedian(pRaw.map(d => d.dias_consulta_diagnostico).filter(n => n !== null && n >= 0));

        const pDiagLe60 = pValidDiag.filter(d => d.dias_consulta_diagnostico <= 60).length;
        const pDiagPerc = pValidDiag.length > 0 ? (pDiagLe60 / pValidDiag.length) * 100 : 0;

        return `
          <li>
            <strong>${p} (${pTotal} casos / ${pValidDiag.length} laudos válidos):</strong> 
            Fila de regulação &le; 60d em <strong>${formatPercent(pRegPerc)}</strong> (tempo médio: ${formatNumber(pConsInsMean)}d, med: ${formatNumber(pConsInsMed)}d) | 
            Retenção municipal média: <strong>${formatNumber(pInsDiagMean)}d</strong> (med: ${formatNumber(pInsDiagMed)}d) | 
            Jornada total média: <strong>${formatNumber(pConsDiagMean)}d</strong> (med: ${formatNumber(pConsDiagMed)}d) | 
            Conformidade Lei 60d: <strong>${formatPercent(pDiagPerc)}</strong> (${pDiagLe60} casos).
          </li>
        `;
      }).join('');
    }
  }

  /* ==========================================================================
     IN-BROWSER EXCEL PARSING (SHEETJS)
     ========================================================================== */

  function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.XLSX) {
      alert('Biblioteca de leitura Excel não carregada. Verifique sua conexão com a internet.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        if (rawJson.length === 0) {
          alert('A planilha carregada está vazia.');
          return;
        }

        const newRecords = parseRawExcelRows(rawJson);
        if (newRecords.length === 0) {
          alert('Não foi possível identificar as colunas necessárias na planilha.');
          return;
        }

        state.data = newRecords;
        initFilterOptions();
        renderDashboard();
        alert(`Sucesso! ${newRecords.length} registros foram carregados e o painel foi recalculado.`);
      } catch (err) {
        console.error('Erro ao ler Excel:', err);
        alert('Erro ao processar planilha Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Reset input
  }

  function parseRawExcelRows(rows) {
    function cleanStr(s) {
      if (!s) return '';
      s = String(s).trim();
      const replacements = {
        'Clnica': 'Clínica',
        'Cabea e Pescoo': 'Cabeça e Pescoço',
        'Trax': 'Tórax',
        'Dermatologia/Plstica': 'Dermatologia/Plástica',
        'Hemodilise': 'Hemodiálise',
        'PATROCINiO': 'PATROCÍNIO',
        'PATROCINIO': 'PATROCÍNIO',
        'RIBEIRO': 'RIBEIRÃO',
        'RIBEIRAO': 'RIBEIRÃO',
      };
      for (const [k, v] of Object.entries(replacements)) {
        s = s.replaceAll(k, v);
      }
      return s;
    }

    function toDateObj(val) {
      if (!val) return null;
      if (val instanceof Date && !isNaN(val)) return val;
      const d = new Date(val);
      return !isNaN(d) ? d : null;
    }

    function formatDateStr(d) {
      if (!d) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function getPeriod(d) {
      if (!d) return 'Outro';
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (y === 2025 && m >= 1 && m <= 3) return 'Jan-Mar 2025';
      if (y === 2025 && m >= 8 && m <= 9) return 'Ago-Set 2025';
      if (y === 2026 && m >= 1 && m <= 2) return 'Jan-Fev 2026';
      return `Mês ${String(m).padStart(2, '0')}/${y}`;
    }

    return rows.map((row, idx) => {
      // Find matching keys regardless of casing
      const getVal = (candidates) => {
        for (const c of candidates) {
          if (row[c] !== undefined) return row[c];
          const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === c.toLowerCase());
          if (foundKey) return row[foundKey];
        }
        return null;
      };

      const dtDiag = toDateObj(getVal(['Data_Diagnostico', 'Data_Diagnóstico', 'Data Diagnostico', 'Data Diagnóstico']));
      const dtIns = toDateObj(getVal(['Data_Insercao_RHCC', 'Data_Inserção_RHCC', 'Data Insercao', 'Data Inserção']));
      const dtCons = toDateObj(getVal(['Data_Consulta', 'Data Consulta']));
      const esp = cleanStr(getVal(['Especialidade']));
      const sol = cleanStr(getVal(['Unidade_Solicitante', 'Unidade Solicitante', 'Solicitante']));

      const diffDays = (dEnd, dStart) => {
        if (!dEnd || !dStart) return null;
        const diffTime = dEnd.getTime() - dStart.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
      };

      const diasConsIns = diffDays(dtCons, dtIns);
      const diasConsDiag = diffDays(dtCons, dtDiag);
      const diasInsDiag = diffDays(dtIns, dtDiag);

      const semDiag = !dtDiag;
      const diagPosIns = diasInsDiag !== null && diasInsDiag < 0;
      const diagPosCons = diasConsDiag !== null && diasConsDiag < 0;
      const altaSuspeicao = semDiag || diagPosIns;
      const outlier180 = diasInsDiag !== null && diasInsDiag > 180;

      const periodo = getPeriod(dtCons);
      const mesAnoCons = dtCons ? `${dtCons.getFullYear()}-${String(dtCons.getMonth() + 1).padStart(2, '0')}` : null;

      return {
        id: idx + 1,
        data_diagnostico: formatDateStr(dtDiag),
        data_insercao: formatDateStr(dtIns),
        data_insercao_date: formatDateStr(dtIns),
        data_consulta: formatDateStr(dtCons),
        data_consulta_date: formatDateStr(dtCons),
        ano_mes_consulta: mesAnoCons,
        especialidade: esp,
        unidade_solicitante: sol,
        periodo: periodo,
        dias_consulta_insercao: diasConsIns,
        dias_consulta_diagnostico: diasConsDiag,
        dias_insercao_diagnostico: diasInsDiag,
        sem_diagnostico: semDiag,
        diagnostico_posterior_insercao: diagPosIns,
        diagnostico_posterior_consulta: diagPosCons,
        alta_suspeicao: altaSuspeicao,
        outlier_180d: outlier180,
        cons_ins_le_60: diasConsIns !== null && diasConsIns <= 60,
        cons_diag_le_60: diasConsDiag !== null && diasConsDiag <= 60,
      };
    });
  }

  function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    if (state.theme === 'dark') {
      icon.setAttribute('data-lucide', 'sun');
    } else {
      icon.setAttribute('data-lucide', 'moon');
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /* ==========================================================================
     CSV EXPORT FUNCTIONALITY
     ========================================================================== */

  function exportCsv() {
    const filtered = getFilteredData({ applyCutoff: false, includeSearchAndStatus: true });
    if (filtered.length === 0) {
      alert('Nenhum registro para exportar com os filtros atuais.');
      return;
    }

    const headers = [
      'ID', 'Periodo', 'Especialidade', 'Unidade_Solicitante',
      'Data_Diagnostico', 'Data_Insercao_RHCC', 'Data_Consulta',
      'Dias_Consulta_Insercao', 'Dias_Insercao_Diagnostico', 'Dias_Consulta_Diagnostico',
      'Alta_Suspeicao', 'Outlier_180d_Paciente', 'Status_Regulacao_60d'
    ];

    const rows = filtered.map(d => [
      d.id,
      `"${d.periodo}"`,
      `"${d.especialidade}"`,
      `"${d.unidade_solicitante}"`,
      d.data_diagnostico || '',
      d.data_insercao || '',
      d.data_consulta || '',
      d.dias_consulta_insercao !== null ? d.dias_consulta_insercao : '',
      d.dias_insercao_diagnostico !== null ? d.dias_insercao_diagnostico : '',
      d.dias_consulta_diagnostico !== null ? d.dias_consulta_diagnostico : '',
      d.alta_suspeicao ? 'SIM' : 'NAO',
      d.outlier_180d ? 'SIM' : 'NAO',
      d.cons_ins_le_60 ? 'CONFORME_LE_60D' : 'ACIMA_60D'
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_rhccc_mpsp_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
});
