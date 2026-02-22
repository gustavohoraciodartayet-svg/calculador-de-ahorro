/* =============================================
   app.js — Calculadora de Ahorros y Rendimiento
   ============================================= */

"use strict";

// ─── Currency config ─────────────────────────
const CURRENCY_LOCALES = {
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 'de-DE', currency: 'EUR' },
    ARS: { locale: 'es-AR', currency: 'ARS' },
    MXN: { locale: 'es-MX', currency: 'MXN' },
    CLP: { locale: 'es-CL', currency: 'CLP' },
    COP: { locale: 'es-CO', currency: 'COP' },
    BRL: { locale: 'pt-BR', currency: 'BRL' },
};

let selectedCurrency = 'ARS';

function fmt(value) {
    const cfg = CURRENCY_LOCALES[selectedCurrency] || CURRENCY_LOCALES['USD'];
    return new Intl.NumberFormat(cfg.locale, {
        style: 'currency', currency: cfg.currency,
        maximumFractionDigits: 0,
    }).format(value);
}

function fmtPct(value) {
    return value.toFixed(2) + '%';
}

// ─── Chart.js instances ───────────────────────
let pieChartInstance = null;
let lineChartInstance = null;
let cmpLineInstance = null;

// ─── Tab switching ────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab');
        document.getElementById('tab-content-' + target).classList.add('active');
    });
});

// ─── Currency selector ────────────────────────
const currencySelect = document.getElementById('currency');
currencySelect.addEventListener('change', e => {
    selectedCurrency = e.target.value;
    // Update all currency symbols shown in inputs
    document.querySelectorAll('.currency-symbol').forEach(el => {
        const symbols = { USD: '$', EUR: '€', ARS: '$', MXN: '$', CLP: '$', COP: '$', BRL: 'R$' };
        el.textContent = symbols[selectedCurrency] || '$';
    });
});

// ─── Target-type toggle ───────────────────────
document.querySelectorAll('input[name="targetType"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const isAge = document.getElementById('targetType-age').checked;
        document.getElementById('field-targetAge').classList.toggle('hidden', !isAge);
        document.getElementById('field-targetYears').classList.toggle('hidden', isAge);
    });
});

// ─── Inflation toggle ─────────────────────────
document.getElementById('inflationToggle').addEventListener('change', e => {
    document.getElementById('field-inflationRate').classList.toggle('hidden', !e.target.checked);
});

// ─── RESET ───────────────────────────────────
document.getElementById('btnReset').addEventListener('click', resetForm);
function resetForm() {
    document.querySelectorAll('#tab-content-single input[type=number]').forEach(i => i.value = '');
    document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
    document.querySelectorAll('.input-wrap').forEach(w => w.classList.remove('error'));
    document.getElementById('inflationToggle').checked = false;
    document.getElementById('field-inflationRate').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    destroyChart(pieChartInstance);
    destroyChart(lineChartInstance);
    pieChartInstance = null;
    lineChartInstance = null;
}

// ─── Validation helpers ───────────────────────
function getPositiveFloat(id, label, errors) {
    const el = document.getElementById(id);
    const wrap = el.closest('.input-wrap');
    const val = parseFloat(el.value);
    if (isNaN(val) || val < 0) {
        errors.push({ id, msg: `${label} debe ser un número positivo.` });
        wrap.classList.add('error');
        return null;
    }
    wrap.classList.remove('error');
    return val;
}

function setFieldError(id, msg) {
    const errEl = document.getElementById('err-' + id);
    if (errEl) errEl.textContent = msg || '';
}

function clearErrors() {
    document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
    document.querySelectorAll('.input-wrap').forEach(w => w.classList.remove('error'));
}

// ─── MAIN CALCULATE ───────────────────────────
document.getElementById('btnCalculate').addEventListener('click', calculate);

function calculate() {
    clearErrors();

    // Read inputs
    const initialCapital = getPositiveFloat('initialCapital', 'Capital inicial', []);
    const currentAge = getPositiveFloat('currentAge', 'Edad actual', []);
    const annualRate = getPositiveFloat('annualRate', 'Tasa anual', []);
    const monthlyContrib = getPositiveFloat('monthlyContrib', 'Aportación mensual', []);

    const isAge = document.getElementById('targetType-age').checked;
    let years = null;

    const errors = [];

    // Re-validate with error collection
    function validateField(id, label, min = 0, strict = false) {
        const el = document.getElementById(id);
        const val = parseFloat(el.value);
        const wrap = el.closest('.input-wrap');
        if (isNaN(val) || (strict ? val <= min : val < min)) {
            errors.push({ id, msg: `${label} debe ser un número ${strict ? 'mayor a' : 'positivo ≥'} ${min}.` });
            wrap.classList.add('error');
            return null;
        }
        wrap.classList.remove('error');
        return val;
    }

    const capital = validateField('initialCapital', 'Capital inicial');
    const age = validateField('currentAge', 'Edad actual', 0, true);
    const rate = validateField('annualRate', 'Tasa anual', 0, true);
    const monthly = validateField('monthlyContrib', 'Aportación mensual');

    if (isAge) {
        const targetAge = validateField('targetAge', 'Edad objetivo', 0, true);
        if (targetAge !== null && age !== null) {
            if (targetAge <= age) {
                errors.push({ id: 'targetAge', msg: 'La edad objetivo debe ser mayor que la edad actual.' });
                document.getElementById('targetAge').closest('.input-wrap').classList.add('error');
            } else {
                years = targetAge - age;
            }
        }
    } else {
        const ty = validateField('targetYears', 'Años a invertir', 0, true);
        if (ty !== null) years = ty;
    }

    // Inflation
    let inflationRate = 0;
    const inflationOn = document.getElementById('inflationToggle').checked;
    if (inflationOn) {
        const ir = validateField('inflationRate', 'Tasa de inflación');
        if (ir !== null) inflationRate = ir;
    }

    // Show errors
    errors.forEach(e => setFieldError(e.id, e.msg));

    if (errors.length > 0 || capital === null || rate === null || monthly === null || years === null) return;

    // ─── Compound interest (monthly) ─────────────
    const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const totalMonths = Math.round(years * 12);

    let balance = capital;
    let sumInvested = capital;
    const yearData = [];   // { year, age, invested, interest, total, real }
    const startAge = age;

    for (let m = 1; m <= totalMonths; m++) {
        balance = balance * (1 + monthlyRate) + monthly;
        sumInvested += monthly;

        if (m % 12 === 0) {
            const yr = m / 12;
            const real = inflationOn
                ? balance / Math.pow(1 + inflationRate / 100, yr)
                : null;
            yearData.push({
                year: yr,
                age: Math.round(startAge + yr),
                invested: sumInvested,
                interest: balance - sumInvested,
                total: balance,
                real: real,
            });
        }
    }

    // Final values
    const finalBalance = balance;
    const finalInvested = sumInvested;
    const finalInterest = finalBalance - finalInvested;
    const returnPct = (finalInterest / finalInvested) * 100;
    const finalReal = inflationOn
        ? finalBalance / Math.pow(1 + inflationRate / 100, years)
        : null;

    // ─── Render summary ───────────────────────────
    document.getElementById('s-invested').textContent = fmt(finalInvested);
    document.getElementById('s-interest').textContent = fmt(finalInterest);
    document.getElementById('s-total').textContent = fmt(finalBalance);
    document.getElementById('s-return').textContent = fmtPct(returnPct);

    const cardReal = document.getElementById('card-real');
    const thReal = document.getElementById('th-real');
    if (inflationOn && finalReal !== null) {
        document.getElementById('s-real').textContent = fmt(finalReal);
        cardReal.classList.remove('hidden');
        thReal.classList.remove('hidden');
    } else {
        cardReal.classList.add('hidden');
        thReal.classList.add('hidden');
    }

    // ─── Render year table ────────────────────────
    const tbody = document.getElementById('yearTableBody');
    tbody.innerHTML = '';
    yearData.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.year}</td>
      <td>${row.age}</td>
      <td>${fmt(row.invested)}</td>
      <td>${fmt(row.interest)}</td>
      <td>${fmt(row.total)}</td>
      ${inflationOn ? `<td>${fmt(row.real)}</td>` : ''}
    `;
        tbody.appendChild(tr);
    });

    // ─── Pie chart ────────────────────────────────
    destroyChart(pieChartInstance);
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Capital Invertido', 'Intereses Ganados'],
            datasets: [{
                data: [finalInvested, finalInterest],
                backgroundColor: ['rgba(59,130,246,0.85)', 'rgba(16,185,129,0.85)'],
                borderColor: ['#1d4ed8', '#059669'],
                borderWidth: 2,
                hoverOffset: 8,
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${fmt(ctx.parsed)} (${((ctx.parsed / finalBalance) * 100).toFixed(1)}%)`
                    }
                }
            },
            cutout: '65%',
            animation: { animateScale: true, duration: 700 },
        }
    });

    // ─── Line chart ───────────────────────────────
    destroyChart(lineChartInstance);
    const lineCtx = document.getElementById('lineChart').getContext('2d');
    const labels = yearData.map(r => `Año ${r.year}`);

    const datasetsLine = [
        {
            label: 'Total Acumulado',
            data: yearData.map(r => r.total),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: yearData.length <= 40 ? 4 : 0,
            borderWidth: 2,
        },
        {
            label: 'Capital Invertido',
            data: yearData.map(r => r.invested),
            borderColor: '#64748b',
            backgroundColor: 'rgba(100,116,139,0.05)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [5, 4],
        },
    ];

    if (inflationOn) {
        datasetsLine.push({
            label: 'Valor Real (Inflación)',
            data: yearData.map(r => r.real),
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [4, 4],
        });
    }

    lineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: { labels, datasets: datasetsLine },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 14 }
                },
                tooltip: {
                    callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 12 },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: {
                        color: '#64748b',
                        callback: v => {
                            if (v >= 1e9) return fmt(v / 1e9) + 'B';
                            if (v >= 1e6) return fmt(v / 1e6) + 'M';
                            if (v >= 1e3) return fmt(v / 1e3) + 'K';
                            return fmt(v);
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            },
            animation: { duration: 700 },
            interaction: { mode: 'index', intersect: false },
        }
    });

    // Show results
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── PDF EXPORT ───────────────────────────────
document.getElementById('btnExportPDF').addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const resultsEl = document.getElementById('results');

    const btn = document.getElementById('btnExportPDF');
    btn.textContent = '⏳ Generando...';
    btn.disabled = true;

    try {
        const canvas = await html2canvas(resultsEl, {
            backgroundColor: '#080d1a',
            scale: 1.5,
            useCORS: true,
            logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height * pageW) / canvas.width;

        let positionY = 0;
        let remaining = imgH;

        while (remaining > 0) {
            pdf.addImage(imgData, 'PNG', 0, -positionY, pageW, imgH);
            remaining -= pageH;
            if (remaining > 0) { pdf.addPage(); positionY += pageH; }
        }

        pdf.save(`calculadora-ahorros-${Date.now()}.pdf`);
    } catch (err) {
        alert('Error al generar PDF. Intenta nuevamente.');
        console.error(err);
    } finally {
        btn.textContent = '⬇ Exportar PDF';
        btn.disabled = false;
    }
});

// ─── COMPARE RESET ────────────────────────────
document.getElementById('btnResetCompare').addEventListener('click', () => {
    document.querySelectorAll('.cmp-input').forEach(i => i.value = '');
    document.querySelectorAll('[id^="cmp-err-"]').forEach(e => e.textContent = '');
    document.getElementById('compareResults').classList.add('hidden');
    destroyChart(cmpLineInstance);
    cmpLineInstance = null;
});

// ─── COMPARE CALCULATE ────────────────────────
document.getElementById('btnCompare').addEventListener('click', compareCalculate);

function getCmpField(s, field, label, errors) {
    const el = document.querySelector(`.cmp-input[data-s="${s}"][data-field="${field}"]`);
    const errEl = document.getElementById(`cmp-err-${s}-${field}`);
    if (!el) return null;
    const val = parseFloat(el.value);
    const wrap = el.closest('.input-wrap');
    if (isNaN(val) || val < 0) {
        if (errEl) errEl.textContent = `${label} requerido (número positivo).`;
        wrap.classList.add('error');
        errors.push(true);
        return null;
    }
    if (errEl) errEl.textContent = '';
    wrap.classList.remove('error');
    return val;
}

function runScenario(capital, years, rate, monthly) {
    const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const totalMonths = Math.round(years * 12);
    let balance = capital;
    let invested = capital;
    const yearData = [];

    for (let m = 1; m <= totalMonths; m++) {
        balance = balance * (1 + monthlyRate) + monthly;
        invested += monthly;
        if (m % 12 === 0) {
            yearData.push({ year: m / 12, total: balance, invested });
        }
    }

    return {
        invested,
        interest: balance - invested,
        total: balance,
        returnPct: ((balance - invested) / invested) * 100,
        yearData,
    };
}

function compareCalculate() {
    // Clear old errors
    document.querySelectorAll('[id^="cmp-err-"]').forEach(e => e.textContent = '');
    document.querySelectorAll('.cmp-input').forEach(i => i.closest('.input-wrap').classList.remove('error'));

    const errors = [];
    const aCapital = getCmpField('a', 'initialCapital', 'Capital', errors);
    const aYears = getCmpField('a', 'years', 'Años', errors);
    const aRate = getCmpField('a', 'rate', 'Tasa', errors);
    const aMonthly = getCmpField('a', 'monthly', 'Aporte', errors);
    const bCapital = getCmpField('b', 'initialCapital', 'Capital', errors);
    const bYears = getCmpField('b', 'years', 'Años', errors);
    const bRate = getCmpField('b', 'rate', 'Tasa', errors);
    const bMonthly = getCmpField('b', 'monthly', 'Aporte', errors);

    if (errors.length > 0) return;

    const sA = runScenario(aCapital, aYears, aRate, aMonthly);
    const sB = runScenario(bCapital, bYears, bRate, bMonthly);

    // Summary
    document.getElementById('ca-invested').textContent = fmt(sA.invested);
    document.getElementById('ca-interest').textContent = fmt(sA.interest);
    document.getElementById('ca-total').textContent = fmt(sA.total);
    document.getElementById('ca-return').textContent = fmtPct(sA.returnPct);

    document.getElementById('cb-invested').textContent = fmt(sB.invested);
    document.getElementById('cb-interest').textContent = fmt(sB.interest);
    document.getElementById('cb-total').textContent = fmt(sB.total);
    document.getElementById('cb-return').textContent = fmtPct(sB.returnPct);

    // Winner banner
    const diff = sA.total - sB.total;
    const banner = document.getElementById('winner-banner');
    const winTxt = document.getElementById('winner-text');
    const winDiff = document.getElementById('winner-diff');
    banner.classList.remove('hidden');
    if (Math.abs(diff) < 1) {
        winTxt.textContent = '🤝 ¡Empate técnico!';
        winDiff.textContent = '';
    } else if (diff > 0) {
        winTxt.textContent = '🏆 Escenario A gana por';
        winDiff.textContent = fmt(diff);
    } else {
        winTxt.textContent = '🏆 Escenario B gana por';
        winDiff.textContent = fmt(Math.abs(diff));
    }

    // Overlay line chart
    const maxYears = Math.max(aYears, bYears);
    const labelsAll = Array.from({ length: maxYears }, (_, i) => `Año ${i + 1}`);

    const getYearTotals = (yearData, maxY) => {
        const map = {};
        yearData.forEach(r => map[r.year] = r.total);
        return Array.from({ length: maxY }, (_, i) => map[i + 1] ?? null);
    };

    destroyChart(cmpLineInstance);
    const ctx = document.getElementById('compareLineChart').getContext('2d');
    cmpLineInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labelsAll,
            datasets: [
                {
                    label: 'Escenario A',
                    data: getYearTotals(sA.yearData, maxYears),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    spanGaps: false,
                },
                {
                    label: 'Escenario B',
                    data: getYearTotals(sB.yearData, maxYears),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 0,
                    spanGaps: false,
                },
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 }, padding: 14 }
                },
                tooltip: {
                    callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 14 },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: {
                        color: '#64748b',
                        callback: v => {
                            if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
                            if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
                            return '$' + v;
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            },
            animation: { duration: 700 },
            interaction: { mode: 'index', intersect: false },
        }
    });

    document.getElementById('compareResults').classList.remove('hidden');
    document.getElementById('compareResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Utility ──────────────────────────────────
function destroyChart(instance) {
    if (instance) {
        try { instance.destroy(); } catch (_) { }
    }
}
