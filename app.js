const STOCKS = [
  { ticker: 'NVDA', stooq: 'nvda.us', name: 'NVIDIA', group: 'Design', role: 'AI accelerators' },
  { ticker: 'AMD', stooq: 'amd.us', name: 'Advanced Micro Devices', group: 'Design', role: 'CPU + GPU' },
  { ticker: 'INTC', stooq: 'intc.us', name: 'Intel', group: 'Design', role: 'CPU + foundry' },
  { ticker: 'ARM', stooq: 'arm.us', name: 'Arm Holdings', group: 'Design', role: 'CPU IP' },
  { ticker: 'QCOM', stooq: 'qcom.us', name: 'Qualcomm', group: 'Design', role: 'Mobile + edge' },
  { ticker: 'AVGO', stooq: 'avgo.us', name: 'Broadcom', group: 'Design', role: 'Networking silicon' },
  { ticker: 'MRVL', stooq: 'mrvl.us', name: 'Marvell', group: 'Design', role: 'Custom silicon' },
  { ticker: 'TSM', stooq: 'tsm.us', name: 'Taiwan Semiconductor', group: 'Foundry', role: 'Leading-edge fab' },
  { ticker: 'MU', stooq: 'mu.us', name: 'Micron', group: 'Memory', role: 'DRAM + NAND' },
  { ticker: 'ASML', stooq: 'asml.us', name: 'ASML', group: 'Equipment', role: 'EUV lithography' },
  { ticker: 'AMAT', stooq: 'amat.us', name: 'Applied Materials', group: 'Equipment', role: 'Fab equipment' },
  { ticker: 'LRCX', stooq: 'lrcx.us', name: 'Lam Research', group: 'Equipment', role: 'Etch + deposition' },
];

const FALLBACK_QUOTES = {
  NVDA: { close: 125.2, changePct: 1.24 },
  AMD: { close: 146.8, changePct: 0.58 },
  INTC: { close: 31.5, changePct: -0.72 },
  ARM: { close: 142.4, changePct: 1.91 },
  QCOM: { close: 168.1, changePct: -0.18 },
  AVGO: { close: 184.9, changePct: 0.84 },
  MRVL: { close: 72.6, changePct: -1.03 },
  TSM: { close: 188.3, changePct: 0.41 },
  MU: { close: 104.7, changePct: 2.12 },
  ASML: { close: 755.4, changePct: -0.35 },
  AMAT: { close: 181.6, changePct: 0.27 },
  LRCX: { close: 84.9, changePct: 0.73 },
};

const state = {
  rows: [],
  selected: 'NVDA',
  filter: 'all',
  query: '',
  sort: 'move',
  notes: JSON.parse(localStorage.getItem('cpu-dashboard-notes') || '{}'),
};

const els = {
  dataStatus: document.querySelector('#dataStatus'),
  refreshButton: document.querySelector('#refreshButton'),
  stockList: document.querySelector('#stockList'),
  segmentFilters: document.querySelector('#segmentFilters'),
  searchInput: document.querySelector('#searchInput'),
  sortButton: document.querySelector('#sortButton'),
  signalBoard: document.querySelector('#signalBoard'),
  selectedStock: document.querySelector('#selectedStock'),
  medianMove: document.querySelector('#medianMove'),
  leaderTicker: document.querySelector('#leaderTicker'),
  leaderDetail: document.querySelector('#leaderDetail'),
  riskTone: document.querySelector('#riskTone'),
  riskDetail: document.querySelector('#riskDetail'),
  universeCount: document.querySelector('#universeCount'),
  pulseStrip: document.querySelector('#pulseStrip'),
  groupPulse: document.querySelector('#groupPulse'),
  pulseSummary: document.querySelector('#pulseSummary'),
  noteTicker: document.querySelector('#noteTicker'),
  noteText: document.querySelector('#noteText'),
  alertLevel: document.querySelector('#alertLevel'),
};

const quoteUrl = `https://stooq.com/q/l/?s=${STOCKS.map((stock) => stock.stooq).join('+')}&f=sd2t2ohlcv&h&e=csv`;
const historyUrl = (symbol) => `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
const corsMirrors = (url) => [
  url,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

function pct(value) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function money(value) {
  if (!Number.isFinite(value)) return '--';
  return `$${value.toFixed(value > 100 ? 2 : 2)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scale(value, min, max, low = 0, high = 100) {
  if (!Number.isFinite(value) || max === min) return (low + high) / 2;
  return low + ((value - min) / (max - min)) * (high - low);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map((header) => header.trim().toLowerCase());
  return lines
    .map((line) => {
      const values = line.split(',');
      return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    })
    .filter(Boolean);
}

function fallbackHistory(ticker) {
  const base = FALLBACK_QUOTES[ticker].close;
  let price = base / 1.14;
  return Array.from({ length: 90 }, (_, index) => {
    const wave = Math.sin(index / 6 + ticker.length) * 0.012;
    const trend = (index - 45) * 0.0009;
    price *= 1 + wave + trend;
    return { date: `Fallback ${index + 1}`, close: Number(price.toFixed(2)) };
  });
}

async function fetchQuotes() {
  const records = parseCsv(await fetchText(quoteUrl));
  return new Map(
    records.map((record) => {
      const ticker = record.symbol.replace('.US', '').replace('.us', '');
      const close = Number(record.close);
      const open = Number(record.open);
      const changePct = open ? ((close - open) / open) * 100 : 0;
      return [ticker, { close, changePct, volume: Number(record.volume), time: record.time }];
    }),
  );
}

async function fetchHistory(stock) {
  const records = parseCsv(await fetchText(historyUrl(stock.stooq)));
  const history = records
    .map((record) => ({ date: record.date, close: Number(record.close) }))
    .filter((row) => Number.isFinite(row.close))
    .slice(-90);
  return history.length > 10 ? history : fallbackHistory(stock.ticker);
}

async function fetchText(url) {
  const errors = [];
  for (const candidate of corsMirrors(url)) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(candidate, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Feed returned ${response.status}`);
      const text = await response.text();
      if (!text.includes(',') || text.toLowerCase().includes('no data')) {
        throw new Error('Feed returned malformed data');
      }
      return text;
    } catch (error) {
      errors.push(error.message);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error(errors.join('; '));
}

function enrich(stock, quote, history) {
  const closes = history.map((point) => point.close);
  const historyLatest = closes.at(-1) || FALLBACK_QUOTES[stock.ticker].close;
  const latest = quote?.close || historyLatest;
  const returns = closes.slice(1).map((close, index) => ((close - closes[index]) / closes[index]) * 100);
  const monthAgo = closes.at(-22) || closes[0] || latest;
  const momentum = ((historyLatest - monthAgo) / monthAgo) * 100;
  const recentReturns = returns.slice(-30);
  const avg = recentReturns.reduce((sum, item) => sum + item, 0) / Math.max(recentReturns.length, 1);
  const variance =
    recentReturns.reduce((sum, item) => sum + (item - avg) ** 2, 0) / Math.max(recentReturns.length, 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  return {
    ...stock,
    close: latest,
    changePct: quote?.changePct ?? FALLBACK_QUOTES[stock.ticker].changePct,
    volume: quote?.volume,
    history,
    momentum,
    volatility,
  };
}

async function loadData() {
  els.dataStatus.textContent = 'Loading market feed';
  els.refreshButton.disabled = true;
  try {
    const [quotes, histories] = await Promise.all([
      fetchQuotes(),
      Promise.all(STOCKS.map((stock) => fetchHistory(stock).catch(() => fallbackHistory(stock.ticker)))),
    ]);
    state.rows = STOCKS.map((stock, index) => enrich(stock, quotes.get(stock.ticker), histories[index]));
    els.dataStatus.textContent = `Live feed updated ${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch (error) {
    state.rows = STOCKS.map((stock) => enrich(stock, FALLBACK_QUOTES[stock.ticker], fallbackHistory(stock.ticker)));
    els.dataStatus.textContent = 'Live feed unavailable; using fallback tape';
  } finally {
    els.refreshButton.disabled = false;
    render();
  }
}

function filteredRows() {
  const query = state.query.trim().toLowerCase();
  return state.rows
    .filter((row) => state.filter === 'all' || row.group === state.filter)
    .filter((row) => !query || `${row.ticker} ${row.name} ${row.role}`.toLowerCase().includes(query))
    .sort((a, b) => {
      if (state.sort === 'risk') return b.volatility - a.volatility;
      if (state.sort === 'momentum') return b.momentum - a.momentum;
      return b.changePct - a.changePct;
    });
}

function signalStats(rows = state.rows) {
  if (!rows.length) {
    return {
      minMomentum: -10,
      maxMomentum: 10,
      minVolatility: 0,
      maxVolatility: 1,
      medianVolatility: 0,
    };
  }
  const momentums = rows.map((row) => row.momentum).filter(Number.isFinite);
  const volatilities = rows.map((row) => row.volatility).filter(Number.isFinite).sort((a, b) => a - b);
  const rawMinMomentum = Math.min(...momentums, -4);
  const rawMaxMomentum = Math.max(...momentums, 4);
  const momentumPad = Math.max((rawMaxMomentum - rawMinMomentum) * 0.18, 2);
  return {
    minMomentum: rawMinMomentum - momentumPad,
    maxMomentum: rawMaxMomentum + momentumPad,
    minVolatility: Math.min(...volatilities, 0),
    maxVolatility: Math.max(...volatilities, 1),
    medianVolatility: volatilities[Math.floor(volatilities.length / 2)] || 0,
  };
}

function signalFor(row, stats = signalStats()) {
  const highRisk = row.volatility >= stats.medianVolatility;
  const strong = row.momentum >= 4;
  const weak = row.momentum <= -4;
  const dayUp = row.changePct >= 0.05;
  const dayDown = row.changePct <= -0.05;

  if (strong && !highRisk && dayUp) return { label: 'Clean leader', tone: 'leader' };
  if (strong && highRisk) return { label: 'Hot leader', tone: 'hot' };
  if (weak && highRisk) return { label: 'Stress tape', tone: 'stress' };
  if (weak) return { label: 'Fading', tone: 'lag' };
  if (highRisk && dayDown) return { label: 'Risk watch', tone: 'watch' };
  if (dayUp) return { label: 'Accumulating', tone: 'base' };
  return { label: 'Base build', tone: 'neutral' };
}

function sparkline(history) {
  const values = history.map((point) => point.close).slice(-44);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 120;
      const y = 36 - ((value - min) / spread) * 30;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function renderStockList() {
  const rows = filteredRows();
  const stats = signalStats(state.rows);
  els.stockList.innerHTML = rows
    .map((row) => {
      const signal = signalFor(row, stats);
      const note = state.notes[row.ticker]?.text ? 'Note' : signal.label;
      const tone = row.changePct > 0.05 ? 'up' : row.changePct < -0.05 ? 'down' : 'flat';
      return `
        <button class="stock-row ${state.selected === row.ticker ? 'active' : ''}" type="button" data-ticker="${row.ticker}">
          <span class="stock-main">
            <span class="ticker">${row.ticker}</span>
            <span>
              <strong>${row.name}</strong>
              <span class="company">${row.role}</span>
            </span>
          </span>
          <span class="stock-meta">
            <svg class="spark" viewBox="0 0 120 42" role="img" aria-label="${row.ticker} price sparkline">
              <polyline points="${sparkline(row.history)}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
            </svg>
            <span class="price">${money(row.close)}</span>
            <span class="move ${tone}">${pct(row.changePct)}</span>
            <span class="badge">${note}</span>
          </span>
        </button>
      `;
    })
    .join('');

  els.stockList.querySelectorAll('.stock-row').forEach((button) => {
    button.addEventListener('click', () => {
      state.selected = button.dataset.ticker;
      syncNoteFields();
      render();
    });
  });
}

function renderMetrics() {
  const rows = state.rows;
  if (!rows.length) return;
  const sortedMoves = rows.map((row) => row.changePct).sort((a, b) => a - b);
  const median = sortedMoves[Math.floor(sortedMoves.length / 2)];
  const leader = [...rows].sort((a, b) => b.changePct - a.changePct)[0];
  const avgVol = rows.reduce((sum, row) => sum + row.volatility, 0) / rows.length;
  els.universeCount.textContent = rows.length;
  els.medianMove.textContent = pct(median);
  els.leaderTicker.textContent = leader.ticker;
  els.leaderDetail.textContent = `${leader.name} ${pct(leader.changePct)}`;
  els.riskTone.textContent = avgVol > 45 ? 'Hot' : avgVol > 30 ? 'Active' : 'Calm';
  els.riskDetail.textContent = `${avgVol.toFixed(1)} annualized vol`;
}

function renderSignalBoard() {
  const rows = filteredRows();
  if (!rows.length) {
    els.signalBoard.innerHTML = '<p class="empty-state">No symbols match this filter.</p>';
    return;
  }
  const stats = signalStats(state.rows);
  const visibleStats = signalStats(rows);
  const zeroPosition = clamp(scale(0, stats.minMomentum, stats.maxMomentum, 8, 92), 8, 92);
  els.signalBoard.innerHTML = `
    <div class="signal-axis" style="--zero:${zeroPosition}%">
      <span>${pct(visibleStats.minMomentum)}</span>
      <span>0</span>
      <span>${pct(visibleStats.maxMomentum)}</span>
    </div>
    ${rows
      .map((row) => {
        const signal = signalFor(row, stats);
        const momentumPosition = clamp(scale(row.momentum, stats.minMomentum, stats.maxMomentum, 8, 92), 8, 92);
        const risk = clamp(scale(row.volatility, stats.minVolatility, stats.maxVolatility, 18, 100), 18, 100);
        const tone = row.changePct > 0.05 ? 'up' : row.changePct < -0.05 ? 'down' : 'flat';
        return `
          <button
            class="signal-lane ${state.selected === row.ticker ? 'active' : ''}"
            type="button"
            data-ticker="${row.ticker}"
            data-tone="${signal.tone}"
            style="--momentum:${momentumPosition}%; --risk:${risk}%; --zero:${zeroPosition}%"
            title="${row.ticker}: ${pct(row.momentum)} 30d momentum, ${row.volatility.toFixed(1)} vol"
          >
            <span class="lane-id">
              <strong>${row.ticker}</strong>
              <small>${row.group}</small>
            </span>
            <span class="lane-rail">
              <span class="lane-zero"></span>
              <span class="lane-risk"></span>
              <span class="lane-dot"></span>
            </span>
            <span class="lane-reading">
              <strong class="${tone}">${pct(row.changePct)}</strong>
              <small>${signal.label}</small>
            </span>
          </button>
        `;
      })
      .join('')}
  `;

  els.signalBoard.querySelectorAll('.signal-lane').forEach((button) => {
    button.addEventListener('click', () => {
      state.selected = button.dataset.ticker;
      syncNoteFields();
      render();
    });
  });
}

function renderSelected() {
  const row = state.rows.find((item) => item.ticker === state.selected) || state.rows[0];
  if (!row) return;
  const note = state.notes[row.ticker];
  const stats = signalStats();
  const signal = signalFor(row, stats);
  const momentumWidth = clamp(scale(row.momentum, stats.minMomentum, stats.maxMomentum, 8, 100), 8, 100);
  const riskWidth = clamp(scale(row.volatility, stats.minVolatility, stats.maxVolatility, 8, 100), 8, 100);
  const dayWidth = clamp(scale(Math.abs(row.changePct), 0, 6, 8, 100), 8, 100);
  els.selectedStock.innerHTML = `
    <strong>${row.ticker} <span class="${row.changePct >= 0 ? 'up' : 'down'}">${pct(row.changePct)}</span></strong>
    <p class="signal-verdict">${signal.label}: ${row.role}</p>
    <div class="selected-grid">
      <div><span>Price</span><br>${money(row.close)}</div>
      <div><span>30d mom.</span><br>${pct(row.momentum)}</div>
      <div><span>Vol.</span><br>${row.volatility.toFixed(1)}</div>
    </div>
    <div class="signal-bars" aria-label="${row.ticker} signal bars">
      <span><em>Day</em><i class="${row.changePct >= 0 ? 'bar-up' : 'bar-down'}" style="width:${dayWidth}%"></i></span>
      <span><em>Momentum</em><i class="bar-blue" style="width:${momentumWidth}%"></i></span>
      <span><em>Risk</em><i class="bar-risk" style="width:${riskWidth}%"></i></span>
    </div>
    ${note?.alert ? `<p class="quiet">Alert level: ${money(Number(note.alert))}</p>` : ''}
  `;
}

function renderPulse() {
  if (!state.rows.length) return;
  const length = Math.min(...state.rows.map((row) => row.history.length));
  const returns = [];
  for (let i = Math.max(1, length - 60); i < length; i += 1) {
    const daily = state.rows.map((row) => {
      const history = row.history.slice(-length);
      return ((history[i].close - history[i - 1].close) / history[i - 1].close) * 100;
    });
    returns.push(daily.reduce((sum, item) => sum + item, 0) / daily.length);
  }
  const max = Math.max(...returns.map((item) => Math.abs(item)), 1);
  els.pulseStrip.innerHTML = returns
    .map((value) => {
      const alpha = Math.min(Math.abs(value) / max, 1);
      const color = value >= 0 ? `rgba(19, 138, 75, ${0.18 + alpha * 0.7})` : `rgba(200, 63, 49, ${0.18 + alpha * 0.7})`;
      return `<span class="pulse-cell" title="${pct(value)}" style="background:${color}"></span>`;
    })
    .join('');
  const last = returns.at(-1) || 0;
  els.pulseSummary.textContent = `Last equal-weight day ${pct(last)}`;
  renderGroupPulse();
}

function renderGroupPulse() {
  const groups = [...new Set(STOCKS.map((stock) => stock.group))];
  const stats = signalStats();
  els.groupPulse.innerHTML = groups
    .map((group) => {
      const rows = state.rows.filter((row) => row.group === group);
      if (!rows.length) return '';
      const day = rows.reduce((sum, row) => sum + row.changePct, 0) / rows.length;
      const momentum = rows.reduce((sum, row) => sum + row.momentum, 0) / rows.length;
      const volatility = rows.reduce((sum, row) => sum + row.volatility, 0) / rows.length;
      const heat = clamp(scale(Math.abs(day), 0, 4, 12, 100), 12, 100);
      const tone = day > 0.05 ? 'up' : day < -0.05 ? 'down' : 'flat';
      return `
        <button class="group-card" type="button" data-filter="${group}" style="--heat:${heat}%">
          <span>${group}</span>
          <strong class="${tone}">${pct(day)}</strong>
          <small>${pct(momentum)} mom. / ${volatility.toFixed(1)} vol</small>
        </button>
      `;
    })
    .join('');

  els.groupPulse.querySelectorAll('.group-card').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      els.segmentFilters
        .querySelectorAll('button')
        .forEach((item) => item.classList.toggle('active', item.dataset.filter === state.filter));
      render();
    });
  });
}

function syncNoteFields() {
  const note = state.notes[state.selected] || {};
  els.noteTicker.value = state.selected;
  els.noteText.value = note.text || '';
  els.alertLevel.value = note.alert || '';
}

function saveNote() {
  const ticker = els.noteTicker.value;
  state.selected = ticker;
  state.notes[ticker] = {
    text: els.noteText.value.trim(),
    alert: els.alertLevel.value,
  };
  localStorage.setItem('cpu-dashboard-notes', JSON.stringify(state.notes));
  render();
}

function renderNotes() {
  els.noteTicker.innerHTML = STOCKS.map((stock) => `<option value="${stock.ticker}">${stock.ticker} - ${stock.name}</option>`).join('');
  syncNoteFields();
}

function render() {
  renderMetrics();
  renderStockList();
  renderSignalBoard();
  renderSelected();
  renderPulse();
}

els.refreshButton.addEventListener('click', loadData);
els.searchInput.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderStockList();
});
els.segmentFilters.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  els.segmentFilters.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  renderStockList();
});
els.sortButton.addEventListener('click', () => {
  state.sort = state.sort === 'move' ? 'momentum' : state.sort === 'momentum' ? 'risk' : 'move';
  els.sortButton.textContent = `Sort: ${state.sort}`;
  renderStockList();
});
els.noteTicker.addEventListener('change', (event) => {
  state.selected = event.target.value;
  syncNoteFields();
  render();
});
els.noteText.addEventListener('input', saveNote);
els.alertLevel.addEventListener('input', saveNote);

renderNotes();
loadData();
