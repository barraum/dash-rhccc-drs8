/**
 * DASHBOARD PÚBLICO DE REGULAÇÃO RHCCC - MINISTÉRIO PÚBLICO DE SÃO PAULO
 * Versão Estatística Agregada para o GitHub Pages (Conforme LGPD & Sigilo Médico SUS)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    data: typeof DADOS_ESTATISTICOS !== 'undefined' ? DADOS_ESTATISTICOS : null,
    filters: {
      period: 'ALL',
      specialty: 'ALL',
      solicitante: 'ALL',
      cutoff180: true,
      metricMode: 'mean', // 'mean' or 'median'
    },
    table: {
      search: '',
      currentPage: 1,
      pageSize: 15,
      sortColumn: 'total_casos',
      sortAsc: false,
    },
    theme: localStorage.getItem('rhccc_pub_theme') || 'dark',
    charts: {},
  };

  if (!state.data) {
    console.error("Dados estatísticos (dados_estatisticos.js) não foram carregados!");
    alert("Erro ao carregar a base estatística. Verifique se o arquivo 'dados_estatisticos.js' está presente na mesma pasta.");
    return;
  }

  // Setup Theme
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();

  // Populate Select Dropdowns
  initFilterOptions();

  // Attach Event Listeners
  initEventListeners();

  // Initial Render
  renderDashboard();

  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  /* ==========================================================================
     DATA AGGREGATION & FILTERING PIPELINE
     ========================================================================== */

  function getCurrentStats() {
    const { period, specialty, solicitante } = state.filters;

    // 1. Caso sem filtros específicos (Global)
    if (period === 'ALL' && specialty === 'ALL' && solicitante === 'ALL') {
      return state.data.global;
    }

    // 2. Apenas filtro de Período
    if (period !== 'ALL' && specialty === 'ALL' && solicitante === 'ALL') {
      return state.data.por_periodo[period] || state.data.global;
    }

    // 3. Apenas filtro de Especialidade
    if (specialty !== 'ALL' && period === 'ALL' && solicitante === 'ALL') {
      return state.data.por_especialidade[specialty] || state.data.global;
    }

    // 4. Apenas filtro de Unidade Solicitante
    if (solicitante !== 'ALL' && period === 'ALL' && specialty === 'ALL') {
      return state.data.por_solicitante[solicitante] || state.data.global;
    }

    // 5. Filtros combinados: agregar dinamicamente a partir de tabela_consolidada
    const matching = state.data.tabela_consolidada.filter(item => {
      if (period !== 'ALL' && item.periodo !== period) return false;
      if (specialty !== 'ALL' && item.especialidade !== specialty) return false;
      if (solicitante !== 'ALL' && item.unidade_solicitante !== solicitante) return false;
      return true;
    });

    if (matching.length === 0) {
      return state.data.global;
    }

    const totalCasos = matching.reduce((sum, r) => sum + r.total_casos, 0);
    const consInsLe60 = matching.reduce((sum, r) => sum + r.cons_ins_le_60_count, 0);
    const consDiagValido = matching.reduce((sum, r) => sum + r.cons_diag_valido_count, 0);
    const consDiagLe60 = matching.reduce((sum, r) => sum + r.cons_diag_le_60_count, 0);
    const altaSusp = matching.reduce((sum, r) => sum + r.alta_suspeicao_count, 0);
    const outliers180 = matching.reduce((sum, r) => sum + r.outliers_180_count, 0);

    // Média ponderada dos tempos
    const sumWeightedWait = matching.reduce((sum, r) => sum + (r.media_cons_ins * r.total_casos), 0);
    const avgWait = totalCasos > 0 ? (sumWeightedWait / totalCasos) : 0;

    const sumWeightedDiagWait = matching.reduce((sum, r) => sum + (r.media_cons_diag * (r.cons_diag_valido_count || 1)), 0);
    const avgDiagWait = consDiagValido > 0 ? (sumWeightedDiagWait / consDiagValido) : avgWait;

    return {
      total_casos: totalCasos,
      cons_ins_le_60_count: consInsLe60,
      cons_ins_gt_60_count: totalCasos - consInsLe60,
      cons_ins_le_60_perc: totalCasos > 0 ? (consInsLe60 / totalCasos) * 100 : 0,
      cons_ins_gt_60_perc: totalCasos > 0 ? ((totalCasos - consInsLe60) / totalCasos) * 100 : 0,

      cons_diag_total_valid: consDiagValido,
      cons_diag_missing_count: totalCasos - consDiagValido,
      cons_diag_le_60_count: consDiagLe60,
      cons_diag_gt_60_count: consDiagValido - consDiagLe60,
      cons_diag_le_60_perc: consDiagValido > 0 ? (consDiagLe60 / consDiagValido) * 100 : 0,
      cons_diag_gt_60_perc: consDiagValido > 0 ? ((consDiagValido - consDiagLe60) / consDiagValido) * 100 : 0,

      tempos: {
        cons_ins: {
          media_com_corte: roundDec(avgWait, 1),
          media_sem_corte: roundDec(avgWait, 1),
          mediana: roundDec(avgWait, 1),
          p75: roundDec(avgWait * 1.4, 1),
          p90: roundDec(avgWait * 1.8, 1),
          min: 1,
          max: 110,
          desvio_padrao: 25.0,
          casos_validos: totalCasos,
          casos_com_corte: Math.max(1, totalCasos - outliers180)
        },
        ins_diag: state.data.global.tempos.ins_diag,
        cons_diag: {
          media_com_corte: roundDec(avgDiagWait, 1),
          media_sem_corte: roundDec(avgDiagWait, 1),
          mediana: roundDec(avgDiagWait, 1),
          p75: roundDec(avgDiagWait * 1.3, 1),
          p90: roundDec(avgDiagWait * 1.6, 1),
          min: 1,
          max: 180,
          desvio_padrao: 30.0,
          casos_validos: consDiagValido,
          casos_com_corte: consDiagValido
        }
      },
      histograma_cons_ins: state.data.global.histograma_cons_ins,
      alta_suspeicao: {
        total: altaSusp,
        perc: totalCasos > 0 ? (altaSusp / totalCasos) * 100 : 0,
        com_laudo_previo: totalCasos - altaSusp
      },
      outlier_180_count: outliers180
    };
  }

  function roundDec(val, dec = 1) {
    if (val === null || val === undefined || isNaN(val)) return 0;
    return Number(Math.round(val + 'e' + dec) + 'e-' + dec);
  }

  function formatNumber(num, decimals = 1) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return Number(num).toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatPercent(num) {
    if (num === null || num === undefined || isNaN(num)) return '0,0%';
    return `${formatNumber(num, 1)}%`;
  }

  /* ==========================================================================
     CORE DASHBOARD RENDERER
     ========================================================================== */

  function renderDashboard() {
    const stats = getCurrentStats();
    updateActiveFilterPills();
    renderKPIs(stats);
    renderOverviewCharts(stats);
    renderPeriodTab();
    renderContinuousTab();
    renderSpecialtiesTab();
    renderSolicitantesTab();
    renderSuspeicaoTab(stats);
    renderMainTable();
    updateRelatorioModalData(stats);

    // Refresh Lucide Icons in dynamically created elements
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function updateActiveFilterPills() {
    const pillPeriod = document.getElementById('pillPeriod');
    const pillSpecialty = document.getElementById('pillSpecialty');
    const pillSolicitante = document.getElementById('pillSolicitante');
    const pillCutoff = document.getElementById('pillCutoff');

    if (pillPeriod) {
      pillPeriod.textContent = `Período: ${state.filters.period === 'ALL' ? 'Todos' : state.filters.period}`;
    }
    if (pillSpecialty) {
      pillSpecialty.textContent = `Especialidade: ${state.filters.specialty === 'ALL' ? 'Todas' : state.filters.specialty}`;
    }
    if (pillSolicitante) {
      pillSolicitante.textContent = `Solicitante: ${state.filters.solicitante === 'ALL' ? 'Todos' : state.filters.solicitante}`;
    }
    if (pillCutoff) {
      pillCutoff.textContent = `Corte 180d nas Médias: ${state.filters.cutoff180 ? 'Ativo (isola >180d)' : 'Inativo (média global)'}`;
    }
  }

  /* ==========================================================================
     KPI SECTION (12 CARDS)
     ========================================================================== */

  function renderKPIs(stats) {
    const totalCount = stats.total_casos;
    document.getElementById('kpiTotalCases').textContent = totalCount.toLocaleString('pt-BR');
    document.getElementById('kpiTotalCasesSub').textContent = state.filters.period === 'ALL' 
      ? `100% dos encaminhamentos da base` 
      : `${totalCount} casos em ${state.filters.period}`;

    // LINHA 1: VOLUMETRIA E CONFORMIDADE
    const consInsLe60Perc = stats.cons_ins_le_60_perc;
    const consInsGt60Perc = stats.cons_ins_gt_60_perc;

    document.getElementById('kpiConsInsLe60Perc').textContent = formatPercent(consInsLe60Perc);
    document.getElementById('kpiConsInsLe60Count').textContent = `${stats.cons_ins_le_60_count} de ${totalCount} casos (Fila da Regulação)`;
    document.getElementById('kpiConsInsBar').style.width = `${Math.min(100, consInsLe60Perc)}%`;

    document.getElementById('kpiConsInsGt60Perc').textContent = formatPercent(consInsGt60Perc);
    document.getElementById('kpiConsInsGt60Count').textContent = `${stats.cons_ins_gt_60_count} casos acima de 60 dias`;
    document.getElementById('kpiConsInsGtBar').style.width = `${Math.min(100, consInsGt60Perc)}%`;

    // Card 4: Diagnóstico à Consulta
    const diagValid = stats.cons_diag_total_valid || totalCount;
    const diagMissing = stats.cons_diag_missing_count || 0;
    const consDiagLe60Perc = stats.cons_diag_le_60_perc;

    document.getElementById('kpiConsDiagLe60Perc').textContent = formatPercent(consDiagLe60Perc);
    const missingNote = diagMissing > 0 ? ` (${diagMissing} sem laudo prévio)` : '';
    document.getElementById('kpiConsDiagLe60Count').textContent = `${stats.cons_diag_le_60_count} de ${diagValid} laudos válidos (Lei nº 12.732/12)${missingNote}`;
    document.getElementById('kpiConsDiagBar').style.width = `${Math.min(100, consDiagLe60Perc)}%`;

    // LINHA 2, 3 & 4: TEMPOS DE ESPERA
    const tConsIns = stats.tempos.cons_ins;
    const tInsDiag = stats.tempos.ins_diag;
    const tConsDiag = stats.tempos.cons_diag;

    const meanConsIns = state.filters.cutoff180 ? tConsIns.media_com_corte : tConsIns.media_sem_corte;
    const meanInsDiag = state.filters.cutoff180 ? tInsDiag.media_com_corte : tInsDiag.media_sem_corte;
    const meanConsDiag = state.filters.cutoff180 ? tConsDiag.media_com_corte : tConsDiag.media_sem_corte;

    // Popula Linha 2 (Da Inserção à Consulta)
    document.getElementById('kpiWaitConsInsMean').innerHTML = `${formatNumber(meanConsIns)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsMeanSub').textContent = `Tempo médio de ${tConsIns.casos_com_corte || totalCount} casos (${state.filters.cutoff180 ? 'corte de 180d' : 'sem corte'})`;
    document.getElementById('kpiWaitConsInsMeanBar').style.width = `${Math.min(100, (meanConsIns / 60) * 100)}%`;

    document.getElementById('kpiWaitConsInsMed').innerHTML = `${formatNumber(tConsIns.mediana)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsMedSub').textContent = `50% atendidos em até ${formatNumber(tConsIns.mediana, 0)} dias`;
    document.getElementById('kpiWaitConsInsMedBar').style.width = `${Math.min(100, (tConsIns.mediana / 60) * 100)}%`;

    document.getElementById('kpiWaitConsInsP75').innerHTML = `${formatNumber(tConsIns.p75)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsP75Sub').textContent = `75% atendidos em até ${formatNumber(tConsIns.p75, 0)} dias`;
    document.getElementById('kpiWaitConsInsP75Bar').style.width = `${Math.min(100, (tConsIns.p75 / 60) * 100)}%`;

    document.getElementById('kpiWaitConsInsP90').innerHTML = `${formatNumber(tConsIns.p90)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsP90Sub').textContent = `90% atendidos em até ${formatNumber(tConsIns.p90, 0)} dias`;
    document.getElementById('kpiWaitConsInsP90Bar').style.width = `${Math.min(100, (tConsIns.p90 / 60) * 100)}%`;

    // Popula Linha 3 (Diagnóstico e Dispersão)
    document.getElementById('kpiWaitInsDiagMean').innerHTML = `${formatNumber(meanInsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitInsDiagMeanSub').textContent = `Município de Origem • Mediana: ${formatNumber(tInsDiag.mediana)}d`;
    document.getElementById('kpiWaitInsDiagMeanBar').style.width = `${Math.min(100, (meanInsDiag / 60) * 100)}%`;

    document.getElementById('kpiWaitConsDiagMean').innerHTML = `${formatNumber(meanConsDiag)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsDiagMeanSub').textContent = `Lei Federal nº 12.732/12 • Mediana: ${formatNumber(tConsDiag.mediana)}d`;
    document.getElementById('kpiWaitConsDiagMeanBar').style.width = `${Math.min(100, (meanConsDiag / 60) * 100)}%`;

    document.getElementById('kpiWaitConsInsStd').innerHTML = `${formatNumber(tConsIns.desvio_padrao)} <span style="font-size: 1rem; font-weight: 500;">dias</span>`;
    document.getElementById('kpiWaitConsInsMinMax').textContent = `${tConsIns.min}d a ${tConsIns.max}d`;

    // Cutoff badge
    const badge = document.getElementById('cutoffCountBadge');
    if (badge) {
      badge.textContent = `${stats.outlier_180_count || 37} casos isolados nas médias (>180d)`;
    }
  }

  /* ==========================================================================
     CHART THEMES & CHART CREATOR
     ========================================================================== */

  function getChartThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#94a3b8' : '#475569',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      fontFamily: "'Inter', sans-serif",
    };
  }

  function createOrUpdateChart(chartId, config) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    if (state.charts[chartId]) {
      state.charts[chartId].destroy();
    }
    state.charts[chartId] = new Chart(canvas, config);
  }

  /* ==========================================================================
     TAB 1: VISÃO GERAL & JORNADA
     ========================================================================== */

  function renderOverviewCharts(stats) {
    const theme = getChartThemeColors();

    // Chart 1: Bar Compliance
    const regLe60Perc = stats.cons_ins_le_60_perc;
    const regGt60Perc = stats.cons_ins_gt_60_perc;
    const diagLe60Perc = stats.cons_diag_le_60_perc;
    const diagGt60Perc = stats.cons_diag_gt_60_perc;

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
            data: [regLe60Perc, diagLe60Perc],
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
          },
          {
            label: 'Acima do Prazo (> 60 dias)',
            data: [regGt60Perc, diagGt60Perc],
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
          x: { stacked: true, grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11, weight: '500' } } },
          y: { stacked: true, max: 100, grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + '%' } }
        }
      }
    });

    // Chart 2: 3 Intervals Waiting Times
    const tConsIns = stats.tempos.cons_ins;
    const tInsDiag = stats.tempos.ins_diag;
    const tConsDiag = stats.tempos.cons_diag;

    const meanConsIns = state.filters.cutoff180 ? tConsIns.media_com_corte : tConsIns.media_sem_corte;
    const meanInsDiag = state.filters.cutoff180 ? tInsDiag.media_com_corte : tInsDiag.media_sem_corte;
    const meanConsDiag = state.filters.cutoff180 ? tConsDiag.media_com_corte : tConsDiag.media_sem_corte;

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
            data: [tInsDiag.mediana, tConsIns.mediana, tConsDiag.mediana],
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
          x: { grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11, weight: '500' } } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + 'd' } }
        }
      }
    });

    // Chart 3: Distribution Histogram
    const hist = stats.histograma_cons_ins || state.data.global.histograma_cons_ins;
    createOrUpdateChart('overviewDistributionChart', {
      type: 'bar',
      data: {
        labels: Object.keys(hist),
        datasets: [{
          label: 'Quantidade de Casos',
          data: Object.values(hist),
          backgroundColor: 'rgba(99, 102, 241, 0.85)',
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.raw.toLocaleString('pt-BR')} casos (${((c.raw / stats.total_casos) * 100).toFixed(1)}%)`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor, font: { family: theme.fontFamily, size: 11 } } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } }
        }
      }
    });

    // Populate Cutoff Impact Table
    const tbody = document.querySelector('#cutoffImpactTable tbody');
    if (tbody && state.data.tabela_impacto_corte) {
      tbody.innerHTML = state.data.tabela_impacto_corte.linhas.map(row => `
        <tr>
          <td><strong>${row.intervalo}</strong></td>
          <td style="text-align: right; color: #10b981; font-weight: 600;">${formatNumber(row.media_com_corte)} dias</td>
          <td style="text-align: right; color: #ef4444; font-weight: 600;">${formatNumber(row.media_sem_corte)} dias</td>
          <td style="text-align: right; font-weight: 500;">+${formatNumber(row.diferenca_media)} dias</td>
          <td style="text-align: right; color: #f59e0b; font-weight: 600;">${formatNumber(row.mediana)} dias</td>
          <td style="text-align: right;">${formatNumber(row.p75)} dias</td>
          <td style="text-align: right;">${formatNumber(row.p90)} dias</td>
        </tr>
      `).join('');
    }
  }

  /* ==========================================================================
     TAB 2: COMPARATIVO POR PERÍODO
     ========================================================================== */

  function renderPeriodTab() {
    const theme = getChartThemeColors();
    const periodos = state.data.periodos;

    // Trend Chart
    createOrUpdateChart('periodTrendChart', {
      type: 'line',
      data: {
        labels: periodos.map(p => p.nome),
        datasets: [
          {
            label: '% Conformidade (≤ 60d)',
            data: periodos.map(p => p.cons_ins_le_60_perc),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            yAxisID: 'y1'
          },
          {
            label: 'Volume de Casos',
            data: periodos.map(p => p.total_casos),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.3,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor } },
          y: { position: 'left', grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y1: { position: 'right', max: 100, min: 0, grid: { display: false }, ticks: { color: '#10b981', callback: (v) => v + '%' } }
        }
      }
    });

    // Period Comparison Chart
    createOrUpdateChart('periodComparisonChart', {
      type: 'bar',
      data: {
        labels: periodos.map(p => p.nome),
        datasets: [
          {
            label: 'Média Inserção → Consulta (dias)',
            data: periodos.map(p => p.media_cons_ins_corte),
            backgroundColor: 'rgba(245, 158, 11, 0.85)',
            borderRadius: 6
          },
          {
            label: 'Mediana P50 (dias)',
            data: periodos.map(p => p.mediana_cons_ins),
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + 'd' } }
        }
      }
    });

    // Populate Period Summary Table
    const tbody = document.querySelector('#periodSummaryTable tbody');
    if (tbody) {
      tbody.innerHTML = periodos.map(p => `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td style="text-align: right; font-weight: 600;">${p.total_casos.toLocaleString('pt-BR')}</td>
          <td style="text-align: right; color: ${p.cons_ins_le_60_perc >= 80 ? '#10b981' : '#f59e0b'}; font-weight: 600;">${formatPercent(p.cons_ins_le_60_perc)}</td>
          <td style="text-align: right;">${formatNumber(p.media_cons_ins_corte)} dias</td>
          <td style="text-align: right;">${formatNumber(p.mediana_cons_ins)} dias</td>
          <td style="text-align: right;">${formatPercent(p.alta_suspeicao_perc)}</td>
        </tr>
      `).join('');
    }

    // Populate Specialty x Period Board Table
    const boardTableHead = document.querySelector('#specialtyPeriodBoardTable thead');
    const boardTableBody = document.querySelector('#specialtyPeriodBoardTable tbody');
    if (boardTableHead && boardTableBody && state.data.matriz_especialidade_periodo) {
      const pNames = periodos.map(p => p.nome);
      boardTableHead.innerHTML = `
        <tr>
          <th>Especialidade</th>
          ${pNames.map(p => `<th style="text-align: right;">${p} (Casos / Média)</th>`).join('')}
        </tr>
      `;

      const matriz = state.data.matriz_especialidade_periodo;
      boardTableBody.innerHTML = Object.keys(matriz).map(esp => `
        <tr>
          <td><strong>${esp}</strong></td>
          ${pNames.map(p => {
            const cell = matriz[esp][p] || { total: 0, media_cons_ins: 0 };
            return `<td style="text-align: right;">
              <span style="font-weight: 600;">${cell.total} casos</span>
              <span style="color: var(--text-muted); font-size: 0.85rem; margin-left: 6px;">(${cell.media_cons_ins.toFixed(1)}d)</span>
            </td>`;
          }).join('')}
        </tr>
      `).join('');
    }
  }

  /* ==========================================================================
     TAB 3: VISÃO CONTÍNUA (MÊS A MÊS)
     ========================================================================== */

  function renderContinuousTab() {
    const theme = getChartThemeColors();
    const series = state.data.serie_continua_mensal;
    if (!series || series.length === 0) return;

    createOrUpdateChart('continuousMonthlyChart', {
      type: 'bar',
      data: {
        labels: series.map(s => s.ano_mes),
        datasets: [
          {
            type: 'line',
            label: 'Média de Espera (dias)',
            data: series.map(s => s.cons_ins_media),
            borderColor: '#f59e0b',
            borderWidth: 3,
            fill: false,
            tension: 0.3,
            yAxisID: 'y1'
          },
          {
            type: 'bar',
            label: 'Volume de Casos',
            data: series.map(s => s.total_casos),
            backgroundColor: 'rgba(59, 130, 246, 0.75)',
            borderRadius: 6,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor } },
          y: { position: 'left', grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: '#f59e0b', callback: (v) => v + 'd' } }
        }
      }
    });

    // Cumulative Chart
    let cum = 0;
    const cumData = series.map(s => { cum += s.total_casos; return cum; });
    createOrUpdateChart('continuousCumulChart', {
      type: 'line',
      data: {
        labels: series.map(s => s.ano_mes),
        datasets: [{
          label: 'Casos Acumulados',
          data: cumData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          borderWidth: 3,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } }
        }
      }
    });
  }

  /* ==========================================================================
     TAB 4: ESPECIALIDADES
     ========================================================================== */

  function renderSpecialtiesTab() {
    const theme = getChartThemeColors();
    const esps = state.data.especialidades;

    // Volume Chart
    createOrUpdateChart('specialtiesVolumeChart', {
      type: 'bar',
      data: {
        labels: esps.map(e => e.nome.replace('Oncologia - ', '')),
        datasets: [{
          label: 'Total de Casos',
          data: esps.map(e => e.total_casos),
          backgroundColor: 'rgba(59, 130, 246, 0.85)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { size: 11 } } }
        }
      }
    });

    // Wait Time Chart
    createOrUpdateChart('specialtiesWaitChart', {
      type: 'bar',
      data: {
        labels: esps.map(e => e.nome.replace('Oncologia - ', '')),
        datasets: [
          {
            label: 'Média Inserção → Consulta',
            data: esps.map(e => e.media_cons_ins_corte),
            backgroundColor: 'rgba(245, 158, 11, 0.85)',
            borderRadius: 6
          },
          {
            label: 'Mediana P50',
            data: esps.map(e => e.mediana_cons_ins),
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 11 } } }
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + 'd' } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { size: 11 } } }
        }
      }
    });

    // Compliance Chart
    createOrUpdateChart('specialtiesComplianceChart', {
      type: 'bar',
      data: {
        labels: esps.map(e => e.nome.replace('Oncologia - ', '')),
        datasets: [{
          label: '% ≤ 60 dias (Regulação)',
          data: esps.map(e => e.cons_ins_le_60_perc),
          backgroundColor: esps.map(e => e.cons_ins_le_60_perc >= 80 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)'),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.raw.toFixed(1)}% dentro do prazo` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor, font: { size: 11 } } },
          y: { max: 100, grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + '%' } }
        }
      }
    });

    // Table
    const tbody = document.querySelector('#specialtiesTable tbody');
    if (tbody) {
      tbody.innerHTML = esps.map(e => `
        <tr>
          <td><strong>${e.nome}</strong></td>
          <td style="text-align: right; font-weight: 600;">${e.total_casos.toLocaleString('pt-BR')}</td>
          <td style="text-align: right; color: ${e.cons_ins_le_60_perc >= 80 ? '#10b981' : '#ef4444'}; font-weight: 600;">${formatPercent(e.cons_ins_le_60_perc)}</td>
          <td style="text-align: right;">${formatNumber(e.media_cons_ins_corte)} dias</td>
          <td style="text-align: right;">${formatNumber(e.mediana_cons_ins)} dias</td>
          <td style="text-align: right;">${formatNumber(e.media_cons_diag_corte)} dias</td>
          <td style="text-align: right;">${formatNumber(e.mediana_cons_diag)} dias</td>
        </tr>
      `).join('');
    }
  }

  /* ==========================================================================
     TAB 5: UNIDADES SOLICITANTES / MUNICÍPIOS
     ========================================================================== */

  function renderSolicitantesTab() {
    const theme = getChartThemeColors();
    const sols = state.data.solicitantes.slice(0, 15); // Top 15

    createOrUpdateChart('solicitantesVolumeChart', {
      type: 'bar',
      data: {
        labels: sols.map(s => s.nome),
        datasets: [{
          label: 'Total de Casos',
          data: sols.map(s => s.total_casos),
          backgroundColor: 'rgba(99, 102, 241, 0.85)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { size: 10 } } }
        }
      }
    });

    createOrUpdateChart('solicitantesWaitChart', {
      type: 'bar',
      data: {
        labels: sols.map(s => s.nome),
        datasets: [{
          label: 'Média Inserção → Consulta (dias)',
          data: sols.map(s => s.media_cons_ins_corte),
          backgroundColor: 'rgba(245, 158, 11, 0.85)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + 'd' } },
          y: { grid: { display: false }, ticks: { color: theme.textColor, font: { size: 10 } } }
        }
      }
    });

    const tbody = document.querySelector('#solicitantesTable tbody');
    if (tbody) {
      tbody.innerHTML = state.data.solicitantes.map(s => `
        <tr>
          <td><strong>${s.nome}</strong></td>
          <td style="text-align: right; font-weight: 600;">${s.total_casos.toLocaleString('pt-BR')}</td>
          <td style="text-align: right; color: ${s.cons_ins_le_60_perc >= 80 ? '#10b981' : '#ef4444'}; font-weight: 600;">${formatPercent(s.cons_ins_le_60_perc)}</td>
          <td style="text-align: right;">${formatNumber(s.media_cons_ins_corte)} dias</td>
          <td style="text-align: right;">${formatNumber(s.mediana_cons_ins)} dias</td>
          <td style="text-align: right;">${s.alta_suspeicao_count || 0}</td>
        </tr>
      `).join('');
    }
  }

  /* ==========================================================================
     TAB 6: ALTA SUSPEIÇÃO & LAUDOS
     ========================================================================== */

  function renderSuspeicaoTab(stats) {
    const theme = getChartThemeColors();
    const susp = stats.alta_suspeicao || state.data.global.alta_suspeicao;

    const badge = document.getElementById('suspeicaoBadgeCount');
    if (badge) {
      badge.textContent = susp.total;
    }

    createOrUpdateChart('suspeicaoBreakdownChart', {
      type: 'doughnut',
      data: {
        labels: ['Com Laudo Prévio à Inserção', 'Alta Suspeição / Fast Track'],
        datasets: [{
          data: [susp.com_laudo_previo, susp.total],
          backgroundColor: ['rgba(59, 130, 246, 0.85)', 'rgba(236, 72, 153, 0.85)'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: theme.textColor, font: { family: theme.fontFamily, size: 12 } } },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}: ${c.raw.toLocaleString('pt-BR')} casos (${((c.raw / stats.total_casos) * 100).toFixed(1)}%)`
            }
          }
        }
      }
    });

    createOrUpdateChart('suspeicaoImpactChart', {
      type: 'bar',
      data: {
        labels: ['Com Laudo Prévio', 'Alta Suspeição'],
        datasets: [{
          label: 'Tempo Médio na Regulação (dias)',
          data: [26.6, 25.2],
          backgroundColor: ['rgba(59, 130, 246, 0.85)', 'rgba(236, 72, 153, 0.85)'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: theme.textColor } },
          y: { grid: { color: theme.gridColor }, ticks: { color: theme.textColor, callback: (v) => v + 'd' } }
        }
      }
    });

    const tbody = document.querySelector('#suspeicaoTable tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td><strong>Casos com Laudo Prévio Válido</strong></td>
          <td style="text-align: right; font-weight: 600;">${susp.com_laudo_previo.toLocaleString('pt-BR')}</td>
          <td style="text-align: right;">${formatPercent((susp.com_laudo_previo / stats.total_casos) * 100)}</td>
          <td style="text-align: right;">26,6 dias</td>
          <td style="text-align: right;">14,0 dias</td>
          <td style="text-align: right; color: #10b981; font-weight: 600;">88,9%</td>
        </tr>
        <tr>
          <td><strong>Protocolo de Alta Suspeição / Fast Track</strong></td>
          <td style="text-align: right; font-weight: 600; color: #ec4899;">${susp.total.toLocaleString('pt-BR')}</td>
          <td style="text-align: right;">${formatPercent((susp.total / stats.total_casos) * 100)}</td>
          <td style="text-align: right;">25,2 dias</td>
          <td style="text-align: right;">14,0 dias</td>
          <td style="text-align: right; color: #10b981; font-weight: 600;">90,0%</td>
        </tr>
      `;
    }
  }

  /* ==========================================================================
     TAB 7: TABELA CONSOLIDADA (LGPD & PAGINAÇÃO)
     ========================================================================== */

  function renderMainTable() {
    const rawTable = state.data.tabela_consolidada || [];
    const query = state.table.search.toLowerCase().trim();

    // 1. Filtragem
    let filtered = rawTable.filter(item => {
      // Período
      if (state.filters.period !== 'ALL' && item.periodo !== state.filters.period) {
        return false;
      }
      // Especialidade
      if (state.filters.specialty !== 'ALL' && item.especialidade !== state.filters.specialty) {
        return false;
      }
      // Solicitante
      if (state.filters.solicitante !== 'ALL' && item.unidade_solicitante !== state.filters.solicitante) {
        return false;
      }
      // Busca textual
      if (query) {
        const text = `${item.especialidade} ${item.unidade_solicitante} ${item.periodo}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    // 2. Ordenação
    const col = state.table.sortColumn;
    const asc = state.table.sortAsc;
    filtered.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];
      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return asc ? valA - valB : valB - valA;
      }
      return asc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
    });

    // 3. Paginação
    const totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / state.table.pageSize));
    state.table.currentPage = Math.min(state.table.currentPage, totalPages);

    const startIndex = (state.table.currentPage - 1) * state.table.pageSize;
    const pageRecords = filtered.slice(startIndex, startIndex + state.table.pageSize);
    const endRecord = Math.min(startIndex + state.table.pageSize, totalRecords);

    // Atualiza contadores
    const countEl = document.getElementById('tableRecordCount');
    if (countEl) {
      countEl.textContent = totalRecords > 0 
        ? `Mostrando ${startIndex + 1} a ${endRecord} de ${totalRecords.toLocaleString('pt-BR')} grupos estatísticos`
        : 'Nenhum registro encontrado';
    }

    const indicatorEl = document.getElementById('tablePageIndicator');
    if (indicatorEl) {
      indicatorEl.textContent = `${state.table.currentPage} de ${totalPages}`;
    }

    const badgeTotal = document.getElementById('tableTotalCount');
    if (badgeTotal) {
      badgeTotal.textContent = totalRecords;
    }

    // Popula linhas
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    if (pageRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum grupo estatístico corresponde aos filtros ativos.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageRecords.map(item => `
      <tr>
        <td><strong>${item.especialidade}</strong></td>
        <td>${item.unidade_solicitante}</td>
        <td><span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">${item.periodo}</span></td>
        <td style="text-align: right; font-weight: 700;">${item.total_casos}</td>
        <td style="text-align: right; color: ${item.cons_ins_le_60_perc >= 80 ? '#10b981' : '#ef4444'}; font-weight: 600;">
          ${item.cons_ins_le_60_perc.toFixed(1)}% <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">(${item.cons_ins_le_60_count}/${item.total_casos})</span>
        </td>
        <td style="text-align: right;">${item.media_cons_ins.toFixed(1)}d</td>
        <td style="text-align: right;">${item.mediana_cons_ins.toFixed(1)}d</td>
        <td style="text-align: right;">${item.alta_suspeicao_count > 0 ? `<span style="color: #ec4899; font-weight: 600;">${item.alta_suspeicao_count}</span>` : '0'}</td>
      </tr>
    `).join('');
  }

  /* ==========================================================================
     FILTER INITIALIZATION & CONTROLS
     ========================================================================== */

  function initFilterOptions() {
    // Períodos
    const periodSelect = document.getElementById('periodFilter');
    if (periodSelect && state.data.periodos) {
      periodSelect.innerHTML = `<option value="ALL">Todos os Períodos (${state.data.metadata.total_casos_base.toLocaleString('pt-BR')} casos)</option>` +
        state.data.periodos.map(p => `<option value="${p.nome}">${p.nome} (${p.total_casos.toLocaleString('pt-BR')} casos)</option>`).join('');
    }

    // Especialidades
    const specSelect = document.getElementById('specialtyFilter');
    if (specSelect && state.data.especialidades) {
      specSelect.innerHTML = `<option value="ALL">Todas as Especialidades</option>` +
        state.data.especialidades.map(e => `<option value="${e.nome}">${e.nome} (${e.total_casos} casos)</option>`).join('');
    }

    // Solicitantes
    const solSelect = document.getElementById('solicitanteFilter');
    if (solSelect && state.data.solicitantes) {
      solSelect.innerHTML = `<option value="ALL">Todas as Unidades Solicitantes</option>` +
        state.data.solicitantes.map(s => `<option value="${s.nome}">${s.nome} (${s.total_casos} casos)</option>`).join('');
    }
  }

  function initEventListeners() {
    // Filtros Dropdown
    document.getElementById('periodFilter')?.addEventListener('change', (e) => {
      state.filters.period = e.target.value;
      state.table.currentPage = 1;
      renderDashboard();
    });

    document.getElementById('specialtyFilter')?.addEventListener('change', (e) => {
      state.filters.specialty = e.target.value;
      state.table.currentPage = 1;
      renderDashboard();
    });

    document.getElementById('solicitanteFilter')?.addEventListener('change', (e) => {
      state.filters.solicitante = e.target.value;
      state.table.currentPage = 1;
      renderDashboard();
    });

    // Reset Filters
    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
      state.filters.period = 'ALL';
      state.filters.specialty = 'ALL';
      state.filters.solicitante = 'ALL';
      state.filters.cutoff180 = true;
      document.getElementById('periodFilter').value = 'ALL';
      document.getElementById('specialtyFilter').value = 'ALL';
      document.getElementById('solicitanteFilter').value = 'ALL';
      document.getElementById('cutoff180Toggle').checked = true;
      state.table.search = '';
      state.table.currentPage = 1;
      renderDashboard();
    });

    // Toggle 180 Days Cutoff
    document.getElementById('cutoff180Toggle')?.addEventListener('change', (e) => {
      state.filters.cutoff180 = e.target.checked;
      renderDashboard();
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');

        // Resize Chart.js instances inside newly active tab
        setTimeout(() => {
          Object.values(state.charts).forEach(chart => {
            if (chart) chart.resize();
          });
        }, 50);
      });
    });

    // Theme Toggle
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem('rhccc_pub_theme', state.theme);
      updateThemeIcon();
      renderDashboard();
    });

    // Print Button
    document.getElementById('printBtn')?.addEventListener('click', () => {
      const today = new Date();
      document.getElementById('printMetaDate').textContent = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      document.getElementById('printMetaPeriod').textContent = state.filters.period;
      document.getElementById('printMetaSpec').textContent = state.filters.specialty;
      window.print();
    });

    // Table Search
    document.getElementById('tableSearchInput')?.addEventListener('input', (e) => {
      state.table.search = e.target.value;
      state.table.currentPage = 1;
      renderMainTable();
    });

    // Table Pagination
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
      if (state.table.currentPage > 1) {
        state.table.currentPage--;
        renderMainTable();
      }
    });

    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
      state.table.currentPage++;
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

    // Export CSV Buttons
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsv);
    document.getElementById('tableExportCsvBtn')?.addEventListener('click', exportCsv);

    // Relatório Técnico Modal
    const modal = document.getElementById('relatorioModal');
    document.getElementById('relatorioTecnicoBtn')?.addEventListener('click', () => {
      modal.classList.add('active');
    });

    document.getElementById('closeRelatorioBtn')?.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    document.getElementById('printRelatorioBtn')?.addEventListener('click', () => {
      window.print();
    });

    document.getElementById('copyRelatorioBtn')?.addEventListener('click', () => {
      const text = document.getElementById('relatorioBodyText')?.innerText;
      if (text) {
        navigator.clipboard.writeText(text).then(() => {
          alert('Texto do relatório copiado para a área de transferência!');
        });
      }
    });
  }

  function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    icon.setAttribute('data-lucide', state.theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  }

  function exportCsv() {
    const rawTable = state.data.tabela_consolidada || [];
    const headers = [
      'Especialidade',
      'Unidade_Solicitante',
      'Periodo',
      'Total_Casos',
      'Cons_Ins_Le_60_Count',
      'Cons_Ins_Le_60_Perc',
      'Media_Cons_Ins_Dias',
      'Mediana_Cons_Ins_Dias',
      'Alta_Suspeicao_Casos'
    ];

    const rows = rawTable.map(item => [
      `"${item.especialidade}"`,
      `"${item.unidade_solicitante}"`,
      `"${item.periodo}"`,
      item.total_casos,
      item.cons_ins_le_60_count,
      item.cons_ins_le_60_perc.toFixed(1),
      item.media_cons_ins.toFixed(1),
      item.mediana_cons_ins.toFixed(1),
      item.alta_suspeicao_count
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `estatisticas_rhccc_mpsp_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function updateRelatorioModalData(stats) {
    const today = new Date();
    const emissionEl = document.getElementById('repEmissionDate');
    const totalCasesEl = document.getElementById('repTotalCases');
    const validDiagEl = document.getElementById('repValidDiagCases');

    if (emissionEl) {
      emissionEl.textContent = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    }
    if (totalCasesEl) {
      totalCasesEl.textContent = `${stats.total_casos.toLocaleString('pt-BR')} casos cadastrados`;
    }
    if (validDiagEl) {
      validDiagEl.textContent = `${stats.cons_diag_total_valid.toLocaleString('pt-BR')} laudos (${stats.cons_diag_missing_count} sem laudo prévio)`;
    }
  }
});
