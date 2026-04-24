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
  feed: {
    mode: 'loading',
    latestTimestamp: null,
    delayMinutes: null,
  },
  chartHistories: new Map(),
  chartHistoryStatus: new Map(),
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
  chartTitle: document.querySelector('#chartTitle'),
  delayStatus: document.querySelector('#delayStatus'),
  priceChart: document.querySelector('#priceChart'),
  chartStats: document.querySelector('#chartStats'),
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
  feedFootnote: document.querySelector('#feedFootnote'),
};

const quoteUrl = `https://stooq.com/q/l/?s=${STOCKS.map((stock) => stock.stooq).join('+')}&f=sd2t2ohlcv&h&e=csv`;
const historyUrl = (symbol) => `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
const stockAnalysisUrl = (ticker) =>
  `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/history/`;
const stockAnalysisMirrors = (ticker) => {
  const target = stockAnalysisUrl(ticker);
  return [
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://r.jina.ai/${target}`,
  ];
};
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

function compactNumber(value) {
  if (!Number.isFinite(value)) return '--';
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
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

function normalizeStooqDate(value) {
  if (!value) return '';
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
  return value.replace(/\./g, '-');
}

function parseQuoteTimestamp(date, time) {
  const normalizedDate = normalizeStooqDate(date);
  if (!normalizedDate || !time || time.toLowerCase() === 'n/d') return null;
  const parsed = new Date(`${normalizedDate}T${time}${stooqTimezoneOffset(normalizedDate)}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stooqTimezoneOffset(date) {
  const month = Number(date.slice(5, 7));
  return month >= 4 && month <= 10 ? '+02:00' : '+01:00';
}

function formatDateTime(timestamp) {
  if (!timestamp) return 'timestamp unavailable';
  return timestamp.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatChartDate(date) {
  const normalizedDate = normalizeStooqDate(date);
  const parsed = new Date(`${normalizedDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDelay(minutes) {
  if (!Number.isFinite(minutes)) return 'unknown delay';
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function feedFromQuotes(quotes) {
  const timestamps = [...quotes.values()]
    .map((quote) => quote.timestamp)
    .filter(Boolean)
    .map((timestamp) => timestamp.getTime());
  if (!timestamps.length) {
    return { mode: 'live', latestTimestamp: null, delayMinutes: null };
  }
  const latestTimestamp = new Date(Math.max(...timestamps));
  const delayMinutes = Math.max(0, Math.round((Date.now() - latestTimestamp.getTime()) / 60000));
  return { mode: 'live', latestTimestamp, delayMinutes };
}

function feedDelayCopy() {
  if (state.feed.mode === 'fallback') {
    return 'Live feed unavailable; showing offline fallback data.';
  }
  if (!state.feed.latestTimestamp) {
    return 'Free delayed feed; quote timestamp unavailable.';
  }
  return `Quote stamp ${formatDateTime(state.feed.latestTimestamp)}; about ${formatDelay(
    state.feed.delayMinutes,
  )} behind your clock.`;
}

function parseReadableDate(value) {
  const parsed = new Date(`${value} 12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function parseNumber(value) {
  const number = Number(String(value).replace(/[$,%,-]/g, '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function normalizeHistoryRows(rows) {
  return rows
    .map((cells) => ({
      date: parseReadableDate(cells[0]),
      close: parseNumber(cells[4]),
      volume: parseNumber(cells[7]),
    }))
    .filter((row) => Number.isFinite(row.close))
    .reverse()
    .slice(-90);
}

function parseStockAnalysisHistory(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const tableRows = [...doc.querySelectorAll('table tbody tr')]
    .map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()))
    .filter((cells) => cells.length >= 8);
  if (tableRows.length) return normalizeHistoryRows(tableRows);

  const markdownRows = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| ') && !line.includes('---') && !line.includes('| Date |'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  return normalizeHistoryRows(markdownRows);
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
      return [
        ticker,
        {
          close,
          changePct,
          volume: Number(record.volume),
          date: record.date,
          time: record.time,
          timestamp: parseQuoteTimestamp(record.date, record.time),
        },
      ];
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

async function fetchStockAnalysisHistory(stock) {
  const errors = [];
  for (const url of stockAnalysisMirrors(stock.ticker)) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`StockAnalysis history returned ${response.status}`);
      const rows = parseStockAnalysisHistory(await response.text());
      if (rows.length < 10) throw new Error('StockAnalysis history returned too little data');
      return rows;
    } catch (error) {
      errors.push(error.message);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error(errors.join('; '));
}

function isFallbackHistory(history) {
  return history.some((point) => String(point.date).startsWith('Fallback'));
}

function ensureChartHistory(row) {
  if (!row || state.chartHistories.has(row.ticker) || state.chartHistoryStatus.get(row.ticker) === 'loading') return;
  state.chartHistoryStatus.set(row.ticker, 'loading');
  fetchStockAnalysisHistory(row)
    .then((history) => {
      state.chartHistories.set(row.ticker, history);
      state.chartHistoryStatus.set(row.ticker, 'ready');
      if (state.selected === row.ticker) renderPriceChart();
    })
    .catch(() => {
      state.chartHistoryStatus.set(row.ticker, 'failed');
      if (state.selected === row.ticker) renderPriceChart();
    });
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
    quoteTimestamp: quote?.timestamp || null,
    quoteDate: quote?.date,
    quoteTime: quote?.time,
    historyLatest,
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
    state.feed = feedFromQuotes(quotes);
    state.rows = STOCKS.map((stock, index) => enrich(stock, quotes.get(stock.ticker), histories[index]));
    els.dataStatus.textContent = `Live feed updated ${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch (error) {
    state.feed = { mode: 'fallback', latestTimestamp: null, delayMinutes: null };
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

function renderPriceChart() {
  const row = state.rows.find((item) => item.ticker === state.selected) || state.rows[0];
  if (!row) {
    els.priceChart.innerHTML = '<p class="empty-state">Waiting for price history.</p>';
    els.chartStats.innerHTML = '';
    return;
  }
  ensureChartHistory(row);
  const status = state.chartHistoryStatus.get(row.ticker);
  const realHistory = state.chartHistories.get(row.ticker);
  const usingFallback = !realHistory && isFallbackHistory(row.history);
  const data = (realHistory || row.history).filter((point) => Number.isFinite(point.close)).slice(-90);
  if (usingFallback && status !== 'failed') {
    els.chartTitle.textContent = `${row.ticker} daily close`;
    els.priceChart.innerHTML = `<p class="empty-state">Loading real daily close history for ${row.ticker}.</p>`;
    els.chartStats.innerHTML = `
      <div><span>Chart source</span><strong>Loading</strong></div>
      <div><span>Quote</span><strong>${money(row.close)}</strong></div>
      <div><span>Feed delay</span><strong>${formatDelay(state.feed.delayMinutes)}</strong></div>
      <div><span>Volume</span><strong>${compactNumber(row.volume)}</strong></div>
    `;
    return;
  }
  if (data.length < 2) {
    els.priceChart.innerHTML = '<p class="empty-state">Not enough history for a time-series chart.</p>';
    els.chartStats.innerHTML = '';
    return;
  }

  const width = 960;
  const height = 360;
  const pad = { top: 26, right: 76, bottom: 52, left: 72 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const closes = data.map((point) => point.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const yPad = Math.max((maxClose - minClose) * 0.12, maxClose * 0.012, 1);
  const yMin = minClose - yPad;
  const yMax = maxClose + yPad;
  const xFor = (index) => pad.left + (index / Math.max(data.length - 1, 1)) * innerWidth;
  const yFor = (value) => pad.top + (1 - (value - yMin) / (yMax - yMin || 1)) * innerHeight;
  const pricePath = data
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(point.close).toFixed(2)}`)
    .join(' ');
  const areaPath = `${pricePath} L ${xFor(data.length - 1).toFixed(2)} ${pad.top + innerHeight} L ${pad.left} ${
    pad.top + innerHeight
  } Z`;
  const movingAverage = data.map((point, index) => {
    const window = data.slice(Math.max(0, index - 19), index + 1);
    return window.reduce((sum, item) => sum + item.close, 0) / window.length;
  });
  const movingAveragePath = movingAverage
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`)
    .join(' ');
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) / 4) * index).reverse();
  const xTickIndexes = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const lastPoint = data.at(-1);
  const firstPoint = data[0];
  const chartChange = ((lastPoint.close - firstPoint.close) / firstPoint.close) * 100;
  const tone = chartChange >= 0 ? 'up' : 'down';
  const chartSource = realHistory ? 'StockAnalysis table' : isFallbackHistory(data) ? 'Offline fallback' : 'Stooq daily CSV';
  const titleMode = chartSource === 'Offline fallback' ? 'fallback' : 'real';

  els.chartTitle.textContent = `${row.ticker} ${titleMode} ${data.length}-session close`;
  els.priceChart.innerHTML = `
    <svg class="time-series" viewBox="0 0 ${width} ${height}" role="img" aria-label="${row.ticker} daily close time series">
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
      ${yTicks
        .map(
          (tick) => `
            <g class="chart-grid">
              <line x1="${pad.left}" y1="${yFor(tick).toFixed(2)}" x2="${width - pad.right}" y2="${yFor(tick).toFixed(
            2,
          )}"></line>
              <text x="${width - pad.right + 14}" y="${(yFor(tick) + 4).toFixed(2)}">${money(tick)}</text>
            </g>
          `,
        )
        .join('')}
      ${xTickIndexes
        .map(
          (index) => `
            <text class="chart-x-label" x="${xFor(index).toFixed(2)}" y="${height - 18}" text-anchor="${
            index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'
          }">${formatChartDate(data[index].date)}</text>
          `,
        )
        .join('')}
      <path class="chart-area" d="${areaPath}"></path>
      <path class="chart-ma" d="${movingAveragePath}"></path>
      <path class="chart-line" d="${pricePath}"></path>
      <circle class="chart-last-dot" cx="${xFor(data.length - 1).toFixed(2)}" cy="${yFor(lastPoint.close).toFixed(
    2,
  )}" r="7"></circle>
      <text class="chart-last-label" x="${(xFor(data.length - 1) - 12).toFixed(2)}" y="${(yFor(lastPoint.close) - 14).toFixed(
    2,
  )}" text-anchor="end">${money(lastPoint.close)}</text>
    </svg>
  `;
  els.chartStats.innerHTML = `
    <div><span>Chart source</span><strong>${chartSource}</strong></div>
    <div><span>Chart range</span><strong>${formatChartDate(firstPoint.date)} - ${formatChartDate(lastPoint.date)}</strong></div>
    <div><span>${data.length}-session move</span><strong class="${tone}">${pct(chartChange)}</strong></div>
    <div><span>Quote delay</span><strong>${formatDelay(state.feed.delayMinutes)}</strong></div>
  `;
}

function renderFeedStatus() {
  const delayCopy = feedDelayCopy();
  els.delayStatus.textContent = delayCopy;
  els.feedFootnote.textContent = `${delayCopy} Free quotes are delayed; use a broker feed for execution-grade real time.`;
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
  renderPriceChart();
  renderFeedStatus();
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
