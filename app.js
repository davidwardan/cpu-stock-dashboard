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
  canvas: document.querySelector('#signalCanvas'),
  selectedStock: document.querySelector('#selectedStock'),
  medianMove: document.querySelector('#medianMove'),
  leaderTicker: document.querySelector('#leaderTicker'),
  leaderDetail: document.querySelector('#leaderDetail'),
  riskTone: document.querySelector('#riskTone'),
  riskDetail: document.querySelector('#riskDetail'),
  universeCount: document.querySelector('#universeCount'),
  pulseStrip: document.querySelector('#pulseStrip'),
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
  const latest = quote?.close || closes.at(-1) || FALLBACK_QUOTES[stock.ticker].close;
  const returns = closes.slice(1).map((close, index) => ((close - closes[index]) / closes[index]) * 100);
  const monthAgo = closes.at(-22) || closes[0] || latest;
  const momentum = ((latest - monthAgo) / monthAgo) * 100;
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
  els.stockList.innerHTML = rows
    .map((row) => {
      const note = state.notes[row.ticker]?.text ? 'Note' : row.group;
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

function drawSignalMap() {
  const canvas = els.canvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(360, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const pad = 42;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#d8d5ca';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, height / 2);
  ctx.lineTo(width - pad, height / 2);
  ctx.moveTo(width / 2, pad);
  ctx.lineTo(width / 2, height - pad);
  ctx.stroke();

  ctx.fillStyle = '#706f68';
  ctx.font = '12px Helvetica, Arial, sans-serif';
  ctx.fillText('Lower vol', pad, height - 16);
  ctx.fillText('Higher momentum', width - 138, pad - 12);

  const rows = state.rows;
  const maxMomentum = Math.max(...rows.map((row) => Math.abs(row.momentum)), 10);
  const maxVol = Math.max(...rows.map((row) => row.volatility), 30);
  rows.forEach((row) => {
    const x = pad + ((row.momentum + maxMomentum) / (maxMomentum * 2)) * (width - pad * 2);
    const y = height - pad - (row.volatility / maxVol) * (height - pad * 2);
    const selected = row.ticker === state.selected;
    ctx.beginPath();
    ctx.arc(x, y, selected ? 11 : 7, 0, Math.PI * 2);
    ctx.fillStyle = selected ? '#1b5cff' : row.changePct >= 0 ? '#138a4b' : '#c83f31';
    ctx.fill();
    ctx.fillStyle = '#11110f';
    ctx.font = `${selected ? 800 : 700} 12px Helvetica, Arial, sans-serif`;
    ctx.fillText(row.ticker, x + 12, y + 4);
  });
}

function renderSelected() {
  const row = state.rows.find((item) => item.ticker === state.selected) || state.rows[0];
  if (!row) return;
  const note = state.notes[row.ticker];
  els.selectedStock.innerHTML = `
    <strong>${row.ticker} <span class="${row.changePct >= 0 ? 'up' : 'down'}">${pct(row.changePct)}</span></strong>
    <div class="selected-grid">
      <div><span>Price</span><br>${money(row.close)}</div>
      <div><span>30d mom.</span><br>${pct(row.momentum)}</div>
      <div><span>Vol.</span><br>${row.volatility.toFixed(1)}</div>
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
  drawSignalMap();
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
window.addEventListener('resize', drawSignalMap);

renderNotes();
loadData();
