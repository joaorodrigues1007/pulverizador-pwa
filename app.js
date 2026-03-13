const STORAGE_KEY = 'pulverizador-florestal-pwa-v1';
const DEFAULT_STATE = {
  equipamento: 'Pulverizador florestal 01',
  talhao: '',
  taxaAplicacao: 200,
  faixaAplicada: 6,
  velocidade: 5.5,
  tempo50m: 32.73,
  usarTempo50m: false,
  pressaoReferencia: 3,
  observacao: '',
  pontas: [
    { id: crypto.randomUUID(), nome: 'HF 140 10 azul', vazaoReferencia: 0.39, quantidade: 1 },
    { id: crypto.randomUUID(), nome: 'ULD 05 marrom', vazaoReferencia: 1.89, quantidade: 1 },
    { id: crypto.randomUUID(), nome: 'XT020 azul', vazaoReferencia: 0.76, quantidade: 1 }
  ],
  historico: []
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatNumber(value, decimals = 2) {
  return round(value, decimals).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function calcularVelocidadePorTempo(tempo50m) {
  if (!tempo50m) return 0;
  return 180 / tempo50m;
}

function calcularTempoPorVelocidade(velocidade) {
  if (!velocidade) return 0;
  return 180 / velocidade;
}

function calcularVTC(taxaAplicacao, faixaAplicada, velocidade) {
  if (!taxaAplicacao || !faixaAplicada || !velocidade) return 0;
  return (taxaAplicacao * faixaAplicada * velocidade) / 600;
}

function calcularVazaoReferenciaConjunto(pontas) {
  return pontas.reduce((total, ponta) => total + (Number(ponta.vazaoReferencia) || 0) * (Number(ponta.quantidade) || 0), 0);
}

function calcularPressaoServico(vtc, pressaoReferencia, vazaoRefConjunto) {
  if (!vtc || !pressaoReferencia || !vazaoRefConjunto) return 0;
  return Math.pow((vtc * Math.sqrt(pressaoReferencia)) / vazaoRefConjunto, 2);
}

function calcularFaixaTolerancia(vazaoIdeal) {
  return { menor: vazaoIdeal * 0.95, ideal: vazaoIdeal, maior: vazaoIdeal * 1.05 };
}

function diagnosticoPressao(pressao) {
  if (!pressao) return 'Informe os dados para calcular.';
  if (pressao < 1.5) return 'Pressão baixa para trabalho prático. Verifique combinação de bicos e velocidade.';
  if (pressao > 6) return 'Pressão alta para trabalho prático. Revise a combinação de pontas.';
  return 'Pressão dentro de uma faixa operacional usual.';
}

function query(id) { return document.getElementById(id); }

function syncInputsFromState() {
  query('equipamento').value = state.equipamento;
  query('talhao').value = state.talhao;
  query('taxaAplicacao').value = state.taxaAplicacao;
  query('faixaAplicada').value = state.faixaAplicada;
  query('velocidade').value = state.velocidade;
  query('tempo50m').value = state.tempo50m;
  query('usarTempo50m').checked = state.usarTempo50m;
  query('pressaoReferencia').value = String(state.pressaoReferencia);
  query('observacao').value = state.observacao;
  query('velocidadeBox').classList.toggle('hidden', state.usarTempo50m);
  query('tempoBox').classList.toggle('hidden', !state.usarTempo50m);
}

function bindTopInputs() {
  ['equipamento','talhao','observacao'].forEach((id) => {
    query(id).addEventListener('input', (e) => {
      state[id] = e.target.value;
      saveState();
      renderResultado();
    });
  });

  ['taxaAplicacao','faixaAplicada','velocidade','tempo50m','pressaoReferencia'].forEach((id) => {
    query(id).addEventListener('input', (e) => {
      state[id] = Number(e.target.value);
      if (id === 'velocidade' && !state.usarTempo50m) state.tempo50m = round(calcularTempoPorVelocidade(state.velocidade), 2);
      if (id === 'tempo50m' && state.usarTempo50m) state.velocidade = round(calcularVelocidadePorTempo(state.tempo50m), 2);
      saveState();
      render();
    });
  });

  query('usarTempo50m').addEventListener('change', (e) => {
    state.usarTempo50m = e.target.checked;
    if (state.usarTempo50m) state.velocidade = round(calcularVelocidadePorTempo(state.tempo50m), 2);
    else state.tempo50m = round(calcularTempoPorVelocidade(state.velocidade), 2);
    saveState();
    render();
  });
}

function renderPontas() {
  const container = query('pontasList');
  container.innerHTML = '';
  const template = query('pontaTemplate');

  state.pontas.forEach((ponta, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.ponta-title').textContent = `Ponta ${index + 1}`;
    const nome = node.querySelector('.ponta-nome');
    const vazao = node.querySelector('.ponta-vazao');
    const quantidade = node.querySelector('.ponta-quantidade');
    const contribuicao = node.querySelector('.contribuicao');
    const removeBtn = node.querySelector('.remove-ponta');

    nome.value = ponta.nome;
    vazao.value = ponta.vazaoReferencia;
    quantidade.value = ponta.quantidade;
    contribuicao.textContent = `Contribuição: ${formatNumber((Number(ponta.vazaoReferencia)||0) * (Number(ponta.quantidade)||0), 3)} L/min`;

    nome.addEventListener('input', (e) => updatePonta(ponta.id, 'nome', e.target.value));
    vazao.addEventListener('input', (e) => updatePonta(ponta.id, 'vazaoReferencia', Number(e.target.value)));
    quantidade.addEventListener('input', (e) => updatePonta(ponta.id, 'quantidade', Number(e.target.value)));
    removeBtn.addEventListener('click', () => removePonta(ponta.id));

    container.appendChild(node);
  });
}

function updatePonta(id, field, value) {
  state.pontas = state.pontas.map((p) => p.id === id ? { ...p, [field]: value } : p);
  saveState();
  render();
}

function removePonta(id) {
  state.pontas = state.pontas.filter((p) => p.id !== id);
  saveState();
  render();
}

function addPonta() {
  state.pontas.push({ id: crypto.randomUUID(), nome: 'Nova ponta', vazaoReferencia: 0, quantidade: 1 });
  saveState();
  render();
}

function getComputed() {
  const velocidade = state.usarTempo50m ? calcularVelocidadePorTempo(Number(state.tempo50m)) : Number(state.velocidade) || 0;
  const tempo50m = state.usarTempo50m ? Number(state.tempo50m) || 0 : calcularTempoPorVelocidade(Number(state.velocidade));
  const vtc = calcularVTC(Number(state.taxaAplicacao), Number(state.faixaAplicada), velocidade);
  const qref = calcularVazaoReferenciaConjunto(state.pontas);
  const pressao = calcularPressaoServico(vtc, Number(state.pressaoReferencia), qref);
  const tol = calcularFaixaTolerancia(vtc);
  return { velocidade, tempo50m, vtc, qref, pressao, tol };
}

function renderResultado() {
  const { velocidade, tempo50m, vtc, qref, pressao, tol } = getComputed();
  query('kpiVelocidade').textContent = `${formatNumber(velocidade, 2)} km/h`;
  query('kpiTempo').textContent = `Tempo equivalente: ${formatNumber(tempo50m, 2)} s`;
  query('kpiVTC').textContent = `${formatNumber(vtc, 3)} L/min`;
  query('kpiQref').textContent = `${formatNumber(qref, 3)} L/min`;
  query('kpiPressao').textContent = `${formatNumber(pressao, 2)} bar`;
  query('tolMenor').textContent = `${formatNumber(tol.menor, 3)} L/min`;
  query('tolIdeal').textContent = `${formatNumber(tol.ideal, 3)} L/min`;
  query('tolMaior').textContent = `${formatNumber(tol.maior, 3)} L/min`;
  query('diagEquipamento').textContent = state.equipamento || '-';
  query('diagTalhao').textContent = state.talhao || 'Não informado';
  query('diagPref').textContent = `${formatNumber(Number(state.pressaoReferencia), 1)} bar`;
  query('diagStatus').textContent = diagnosticoPressao(pressao);
  query('diagObs').textContent = state.observacao || 'Sem observação';
}

function saveCalculation() {
  const { velocidade, tempo50m, vtc, qref, pressao } = getComputed();
  const item = {
    id: crypto.randomUUID(),
    data: new Date().toLocaleString('pt-BR'),
    equipamento: state.equipamento,
    talhao: state.talhao || 'Não informado',
    taxaAplicacao: Number(state.taxaAplicacao),
    faixaAplicada: Number(state.faixaAplicada),
    velocidade: round(velocidade, 2),
    tempo50m: round(tempo50m, 2),
    pressaoReferencia: Number(state.pressaoReferencia),
    vtc: round(vtc, 3),
    qref: round(qref, 3),
    pressao: round(pressao, 2),
    observacao: state.observacao || 'Sem observação',
    pontas: state.pontas.map((p) => ({ ...p }))
  };
  state.historico = [item, ...state.historico].slice(0, 50);
  saveState();
  renderHistorico();
  activateTab('historico');
}

function renderHistorico() {
  const list = query('historicoList');
  list.innerHTML = '';
  if (!state.historico.length) {
    list.innerHTML = '<div class="history-item"><p class="meta">Nenhuma regulagem salva ainda.</p></div>';
    return;
  }
  state.historico.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="row between center">
        <strong>${escapeHtml(item.equipamento || '-')}</strong>
        <span class="meta">${escapeHtml(item.data)}</span>
      </div>
      <p class="meta">Talhão: ${escapeHtml(item.talhao)}</p>
      <div class="inline-list">
        <span>Taxa: ${formatNumber(item.taxaAplicacao, 2)} L/ha</span>
        <span>Faixa: ${formatNumber(item.faixaAplicada, 2)} m</span>
        <span>Velocidade: ${formatNumber(item.velocidade, 2)} km/h</span>
        <span>Tempo 50 m: ${formatNumber(item.tempo50m, 2)} s</span>
        <span>VTC: ${formatNumber(item.vtc, 3)} L/min</span>
        <span>Vazão ref. conjunto: ${formatNumber(item.qref, 3)} L/min</span>
        <span>Pressão: ${formatNumber(item.pressao, 2)} bar</span>
      </div>
      <div class="inline-list">
        ${item.pontas.map((p) => `<span>${escapeHtml(p.nome)} — ${formatNumber(Number(p.quantidade), 0)} un — ${formatNumber(Number(p.vazaoReferencia), 3)} L/min</span>`).join('')}
      </div>
      <p class="meta">${escapeHtml(item.observacao)}</p>
    `;
    list.appendChild(div);
  });
}

function clearHistorico() {
  state.historico = [];
  saveState();
  renderHistorico();
}

function activateTab(name) {
  document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === name));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
  query('addPonta').addEventListener('click', addPonta);
  query('salvarCalculo').addEventListener('click', saveCalculation);
  query('limparHistorico').addEventListener('click', clearHistorico);
}

function render() {
  syncInputsFromState();
  renderPontas();
  renderResultado();
  renderHistorico();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

bindEvents();
bindTopInputs();
render();
