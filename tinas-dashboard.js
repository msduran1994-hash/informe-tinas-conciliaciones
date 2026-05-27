/* Dashboard Ejecutivo · Conciliaciones de Inventario de Tinas
   Lógica de filtros, KPIs, alertas, comparativo, tendencias y diagnóstico.
   Datos exclusivos de window.TINAS_DATA (hoja CONSOLIDADO TINAS).
*/
(function(){
  'use strict';
  const DATA = window.TINAS_DATA || [];
  const META = window.TINAS_META || {};

  // ---------- utilidades ----------
  const fmt = n => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    return sign + abs.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  };
  const pct = (a, b) => (b === 0 || b === null) ? '—' : ((a / b) * 100).toFixed(2) + '%';
  const monthName = m => ['—','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m] || '—';
  const isoToShort = iso => iso ? iso.slice(5).replace('-','/') + '/' + iso.slice(2,4) : '—';

  function estadoOf(r) {
    const d = r.diferencias || 0;
    if (d === 0) return 'OK';
    const a = Math.abs(d);
    if (a <= 5) return 'LEVE';
    if (a <= 50) return 'MEDIO';
    return 'CRITICO';
  }
  function tipoOf(r) {
    const d = r.diferencias || 0;
    return d > 0 ? 'SOBRANTE' : d < 0 ? 'FALTANTE' : 'CUADRADO';
  }

  // anotar
  DATA.forEach(r => { r._estado = estadoOf(r); r._tipo = tipoOf(r); });

  // ---------- estado ----------
  const state = { year:'', month:'', informe:'', cedi:'', bodega:'', tipo:'', estado:'' };

  function applyFilters(rows){
    return rows.filter(r => (
      (!state.year || r.year === +state.year) &&
      (!state.month || r.month === +state.month) &&
      (!state.informe || r.informe === state.informe) &&
      (!state.cedi || r.cedi === state.cedi) &&
      (!state.bodega || r.bodega === state.bodega) &&
      (!state.tipo || r._tipo === state.tipo) &&
      (!state.estado || r._estado === state.estado)
    ));
  }

  // ---------- inicializar filtros ----------
  function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }
  function fillSelect(id, items, fmt){
    const s = document.getElementById(id);
    items.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = fmt ? fmt(v) : v;
      s.appendChild(o);
    });
  }

  fillSelect('f-year', uniq(DATA.map(r=>r.year)).sort());
  fillSelect('f-month', uniq(DATA.map(r=>r.month)).sort((a,b)=>a-b), m => `${String(m).padStart(2,'0')} · ${monthName(m)}`);
  fillSelect('f-informe', uniq(DATA.map(r=>r.informe)).sort());
  fillSelect('f-cedi', uniq(DATA.map(r=>r.cedi)).sort());
  fillSelect('f-bodega', uniq(DATA.map(r=>r.bodega)).sort());

  ['year','month','informe','cedi','bodega','tipo','estado'].forEach(k => {
    document.getElementById('f-'+k).addEventListener('change', e => {
      state[k] = e.target.value; render();
    });
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    Object.keys(state).forEach(k => state[k] = '');
    document.querySelectorAll('#filters select').forEach(s => s.value = '');
    render();
  });
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

  // ---------- chips de filtros activos ----------
  function renderChips(){
    const cont = document.getElementById('active-filters');
    cont.innerHTML = '';
    const labels = {year:'Año', month:'Mes', informe:'Informe', cedi:'Sede', bodega:'Bodega', tipo:'Tipo', estado:'Estado'};
    Object.entries(state).forEach(([k,v]) => {
      if (!v) return;
      const chip = document.createElement('span');
      chip.className = 'active-chip';
      const lbl = k === 'month' ? `${labels[k]}: ${monthName(+v)}` : `${labels[k]}: ${v}`;
      chip.innerHTML = `${lbl} <button data-k="${k}">×</button>`;
      cont.appendChild(chip);
    });
    cont.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      state[b.dataset.k] = '';
      document.getElementById('f-'+b.dataset.k).value = '';
      render();
    }));
  }

  // ---------- KPIs ----------
  function renderKPIs(rows){
    const tot = rows.reduce((s,r)=> ({
      teorico: s.teorico + r.saldoTeorico,
      fisico: s.fisico + r.conteoFisico,
      dif: s.dif + r.diferencias,
      absDif: s.absDif + Math.abs(r.diferencias),
      ajuste: s.ajuste + r.ajuste,
      absAj: s.absAj + Math.abs(r.ajuste),
      entradas: s.entradas + r.entradas,
      salidas: s.salidas + r.salidas
    }), {teorico:0,fisico:0,dif:0,absDif:0,ajuste:0,absAj:0,entradas:0,salidas:0});

    const faltantes = rows.filter(r => r.diferencias < 0).length;
    const sobrantes = rows.filter(r => r.diferencias > 0).length;
    const cuadrados = rows.filter(r => r.diferencias === 0).length;
    const criticos = rows.filter(r => r._estado === 'CRITICO').length;
    const cedis = uniq(rows.map(r => r.cedi)).length;
    const informes = uniq(rows.map(r => r.informe)).length;
    const exactitud = tot.teorico ? (1 - Math.abs(tot.dif) / tot.teorico) * 100 : 100;
    const cuadrePct = rows.length ? cuadrados / rows.length * 100 : 0;

    const cards = [
      { cls:'hero', label:'Saldo teórico consolidado', value: fmt(tot.teorico), meta:`Físico contado: ${fmt(tot.fisico)}`, bar: 100, ico:'Σ' },
      { cls: tot.dif < 0 ? 'danger' : 'good', label:'Diferencia neta', value: (tot.dif>=0?'+':'')+fmt(tot.dif), meta:`|Δ| absoluta: ${fmt(tot.absDif)} unidades`, bar: Math.min(100, Math.abs(tot.dif)/Math.max(1,tot.teorico)*100*30), ico:'Δ' },
      { cls: exactitud >= 99 ? 'good' : exactitud >= 95 ? 'info' : exactitud >= 90 ? 'warn' : 'danger', label:'Exactitud de inventario', value: exactitud.toFixed(2) + '%', meta:`Objetivo gerencial ≥ 99,00 %`, bar: Math.max(0,Math.min(100,exactitud)), ico:'%' },
      { cls: criticos > 5 ? 'danger' : criticos > 0 ? 'warn' : 'good', label:'Registros críticos', value: fmt(criticos), meta:`Estado crítico (|Δ| > 50 unidades)`, bar: rows.length ? criticos/rows.length*100*4 : 0, ico:'!' },
      { cls: faltantes > sobrantes ? 'warn' : 'info', label:'Faltantes vs sobrantes', value: `${fmt(faltantes)} / ${fmt(sobrantes)}`, meta:`Cuadrados: ${fmt(cuadrados)} · ${cuadrePct.toFixed(1)}%`, bar: rows.length ? (faltantes/rows.length)*100 : 0, ico:'±' },
      { cls:'info', label:'Sedes y conciliaciones', value: `${fmt(cedis)} · ${fmt(informes)}`, meta:`Sedes evaluadas · Informes consolidados`, bar: 100, ico:'#' }
    ];

    const cont = document.getElementById('kpi-grid');
    cont.innerHTML = '';
    cards.forEach(c => {
      const el = document.createElement('div');
      el.className = 'kpi ' + c.cls;
      el.innerHTML = `<div class="ico">${c.ico}</div>
        <div class="label">${c.label}</div>
        <div class="value mono">${c.value}</div>
        <div class="bar"><div style="width:${c.bar}%"></div></div>
        <div class="meta">${c.meta}</div>`;
      cont.appendChild(el);
    });
  }

  // ---------- Narrativa ejecutiva ----------
  function buildNarrative(rows){
    const filtroActivo = Object.values(state).some(Boolean);
    const r25 = rows.filter(r => r.year === 2025);
    const r26 = rows.filter(r => r.year === 2026);
    const sum = arr => arr.reduce((a,b)=>({dif:a.dif+b.diferencias, ajuste:a.ajuste+b.ajuste, fisico:a.fisico+b.conteoFisico, teorico:a.teorico+b.saldoTeorico}), {dif:0,ajuste:0,fisico:0,teorico:0});
    const s25 = sum(r25), s26 = sum(r26);

    // top sede con mayor faltante
    const sedeAgg = {};
    rows.forEach(r => {
      const a = sedeAgg[r.cedi] = sedeAgg[r.cedi] || {dif:0,abs:0,n:0};
      a.dif += r.diferencias; a.abs += Math.abs(r.diferencias); a.n++;
    });
    const sedeRanking = Object.entries(sedeAgg).sort((a,b)=>a[1].dif-b[1].dif);
    const peor = sedeRanking[0];
    const mejor = sedeRanking[sedeRanking.length-1];

    // informes ordenados
    const infAgg = {};
    rows.forEach(r => {
      const a = infAgg[r.informe] = infAgg[r.informe] || {dif:0, corte:r.corte};
      a.dif += r.diferencias;
    });
    const infOrd = Object.entries(infAgg).sort((a,b)=> (a[1].corte||'').localeCompare(b[1].corte||''));
    const ultimo = infOrd[infOrd.length-1];
    const penultimo = infOrd[infOrd.length-2];
    const tendenciaTexto = (ultimo && penultimo) ? (
      Math.abs(ultimo[1].dif) > Math.abs(penultimo[1].dif)
        ? `<strong>repunte de la desviación</strong> entre <span class="num">${penultimo[0].trim()}</span> (Δ <span class="num">${fmt(penultimo[1].dif)}</span>) y <span class="num">${ultimo[0].trim()}</span> (Δ <span class="num">${fmt(ultimo[1].dif)}</span>)`
        : `<strong>mejora en la última conciliación</strong> (<span class="num">${ultimo[0].trim()}</span>: Δ <span class="num">${fmt(ultimo[1].dif)}</span> vs <span class="num">${penultimo[0].trim()}</span>: Δ <span class="num">${fmt(penultimo[1].dif)}</span>)`
    ) : '';

    let p1, p2, p3;
    if (r25.length && r26.length) {
      p1 = `El consolidado integra <span class="num">${infOrd.length}</span> conciliaciones reales entre <span class="num">${infOrd[0][1].corte}</span> y <span class="num">${ultimo[1].corte}</span>, cubriendo <span class="num">${uniq(rows.map(r=>r.cedi)).length}</span> sedes / centros de costo y <span class="num">${uniq(rows.map(r=>r.bodega)).length}</span> bodegas físicas. El saldo físico contado acumulado es de <span class="num">${fmt(s25.fisico + s26.fisico)}</span> tinas frente a un teórico de <span class="num">${fmt(s25.teorico + s26.teorico)}</span>, con una <strong>diferencia neta consolidada de <span class="num">${fmt(s25.dif + s26.dif)}</span></strong> tinas.`;
      const dPct25 = s25.teorico ? Math.abs(s25.dif/s25.teorico*100) : 0;
      const dPct26 = s26.teorico ? Math.abs(s26.dif/s26.teorico*100) : 0;
      const mejoria = dPct26 < dPct25;
      p2 = `En <strong>2025</strong> la diferencia neta cerró en <span class="num">${fmt(s25.dif)}</span> tinas (${dPct25.toFixed(2)}% del teórico), con ajustes operativos por <span class="num">${fmt(s25.ajuste)}</span>. <strong>2026 (YTD)</strong> registra hasta el momento una diferencia neta de <span class="num">${fmt(s26.dif)}</span> tinas (${dPct26.toFixed(2)}% del teórico) y ajustes por <span class="num">${fmt(s26.ajuste)}</span>: ${mejoria ? '<strong>la desviación porcentual es menor</strong> que el cierre 2025 acumulado' : '<strong>la desviación porcentual es mayor</strong> que el cierre 2025'}.`;
    } else if (r25.length) {
      p1 = `Vista filtrada sobre <strong>2025</strong>: <span class="num">${r25.length}</span> registros de <span class="num">${uniq(r25.map(r=>r.informe)).length}</span> conciliaciones. Físico contado <span class="num">${fmt(s25.fisico)}</span> sobre teórico <span class="num">${fmt(s25.teorico)}</span> · diferencia neta <span class="num">${fmt(s25.dif)}</span>.`;
      p2 = `Ajustes operativos totales registrados: <span class="num">${fmt(s25.ajuste)}</span>.`;
    } else if (r26.length) {
      p1 = `Vista filtrada sobre <strong>2026 YTD</strong>: <span class="num">${r26.length}</span> registros de <span class="num">${uniq(r26.map(r=>r.informe)).length}</span> conciliaciones. Físico contado <span class="num">${fmt(s26.fisico)}</span> sobre teórico <span class="num">${fmt(s26.teorico)}</span> · diferencia neta <span class="num">${fmt(s26.dif)}</span>.`;
      p2 = `Ajustes operativos: <span class="num">${fmt(s26.ajuste)}</span>.`;
    } else {
      p1 = `No hay registros para los filtros activos. Ajuste los criterios para visualizar información.`;
      p2 = '';
    }

    if (peor && mejor && peor !== mejor) {
      p3 = `La <strong>sede con mayor exposición</strong> es <span class="num">${peor[0]}</span> con una diferencia acumulada de <span class="num">${fmt(peor[1].dif)}</span> tinas; en el otro extremo, <span class="num">${mejor[0]}</span> presenta el comportamiento más positivo con <span class="num">${fmt(mejor[1].dif)}</span>. ${tendenciaTexto ? 'La serie evidencia ' + tendenciaTexto + '.' : ''}`;
    } else {
      p3 = '';
    }

    document.getElementById('narrative').innerHTML = `
      ${filtroActivo ? '<p style="font-size:11.5px;color:#0d5860;background:#eef5f6;padding:6px 10px;border-radius:6px;border:1px solid #c8e0e2;margin-bottom:10px;">Vista con filtros activos · los indicadores se recalculan dinámicamente.</p>' : ''}
      <p>${p1}</p>
      ${p2 ? `<p>${p2}</p>` : ''}
      ${p3 ? `<p>${p3}</p>` : ''}
    `;

    // VEREDICTO
    const totDifAbs = Math.abs(s25.dif + s26.dif);
    const totTeo = s25.teorico + s26.teorico;
    const exact = totTeo ? (1 - totDifAbs/totTeo) * 100 : 100;
    let grade, color, items = [];
    if (exact >= 99) { grade = 'A'; color = '#0FB5AE'; }
    else if (exact >= 97) { grade = 'B'; color = '#0FB5AE'; }
    else if (exact >= 93) { grade = 'C'; color = '#E08A1A'; }
    else { grade = 'D'; color = '#f57f8c'; }
    document.getElementById('v-grade').innerHTML = `${grade}<span class="sub">· ${exact.toFixed(2)}% exactitud</span>`;
    document.getElementById('v-grade').style.color = color;

    if (s26.teorico && (Math.abs(s26.dif)/s26.teorico) < (Math.abs(s25.dif)/Math.max(1,s25.teorico)))
      items.push({t:'Mejora YoY en exactitud porcentual', c:'ok'});
    else if (r25.length && r26.length)
      items.push({t:'Retroceso en exactitud porcentual frente a 2025', c:'bad'});

    if (peor) items.push({t:`Mayor exposición concentrada en ${peor[0]}`, c:'warn'});
    const nFisicoCero = rows.filter(r => r.conteoFisico === 0 && r.saldoTeorico !== 0).length;
    if (nFisicoCero > 0) items.push({t:`${nFisicoCero} bodega·corte sin conteo físico pese a tener saldo teórico`, c:'warn'});
    const sobreAjuste = rows.filter(r => Math.abs(r.ajuste) > Math.abs(r.diferencias) && r.diferencias !== 0).length;
    if (sobreAjuste > 0) items.push({t:`${sobreAjuste} ajustes mayores a la diferencia detectada`, c:'warn'});
    if (items.length < 4) items.push({t:`${rows.filter(r=>r._estado==='OK').length} registros cierran sin diferencia`, c:'ok'});

    document.getElementById('v-list').innerHTML = items.map(i =>
      `<li class="${i.c==='ok'?'':i.c}"><span class="dot"></span>${i.t}</li>`
    ).join('');
  }

  // ---------- Alertas automáticas ----------
  function renderAlerts(rows){
    const alerts = [];

    // 1. Críticos por umbral
    const criticos = rows.filter(r => r._estado === 'CRITICO').sort((a,b)=> Math.abs(b.diferencias)-Math.abs(a.diferencias));
    criticos.slice(0,6).forEach(r => {
      const tipo = r.diferencias < 0 ? 'Faltante crítico' : 'Sobrante crítico';
      alerts.push({
        lvl: 'crit', code: '!!',
        title: `${tipo} en ${r.cedi}`,
        desc: `Informe <span class="ref">${r.informe.trim()}</span> · bodega <span class="ref">${r.bodega}</span> · corte ${isoToShort(r.corte)}. Teórico ${fmt(r.saldoTeorico)} vs físico ${fmt(r.conteoFisico)}.`,
        metaL: r.diferencias < 0 ? 'Faltante' : 'Sobrante',
        metaV: fmt(r.diferencias),
        impact: Math.abs(r.diferencias)
      });
    });

    // 2. Físico = 0 con teórico positivo
    rows.filter(r => r.conteoFisico === 0 && r.saldoTeorico > 0).slice(0,3).forEach(r => {
      alerts.push({
        lvl: 'high', code: '∅',
        title: `Sin conteo físico pese a saldo teórico (${r.cedi})`,
        desc: `Bodega <span class="ref">${r.bodega}</span> · informe <span class="ref">${r.informe.trim()}</span>. Teórico ${fmt(r.saldoTeorico)} pero conteo físico reportado en 0 — posible omisión de inventario o bodega no inspeccionada.`,
        metaL: 'Teórico no contado',
        metaV: fmt(r.saldoTeorico),
        impact: r.saldoTeorico
      });
    });

    // 3. Ajuste superior a la diferencia (incoherencia)
    rows.filter(r => r.diferencias !== 0 && Math.abs(r.ajuste) > Math.abs(r.diferencias)).slice(0,3).forEach(r => {
      alerts.push({
        lvl: 'high', code: '≠',
        title: `Ajuste no coherente con la diferencia (${r.cedi})`,
        desc: `Informe <span class="ref">${r.informe.trim()}</span> · bodega <span class="ref">${r.bodega}</span>. Diferencia ${fmt(r.diferencias)} pero ajuste registrado ${fmt(r.ajuste)} — requiere validación contable.`,
        metaL: 'Ajuste',
        metaV: fmt(r.ajuste),
        impact: Math.abs(r.ajuste)
      });
    });

    // 4. Sede con tendencia adversa en últimas 3 conciliaciones
    const infOrd = uniq(rows.map(r=>r.informe).sort());
    const ultimas = infOrd.slice(-3);
    if (ultimas.length === 3) {
      const sedeTrend = {};
      ultimas.forEach((inf, idx) => {
        rows.filter(r => r.informe === inf).forEach(r => {
          sedeTrend[r.cedi] = sedeTrend[r.cedi] || [0,0,0];
          sedeTrend[r.cedi][idx] += r.diferencias;
        });
      });
      Object.entries(sedeTrend).filter(([_,v]) => v[0]>=v[1] && v[1]>=v[2] && v[2] < -20).slice(0,2).forEach(([sede, vals]) => {
        alerts.push({
          lvl: 'med', code: '↘',
          title: `Tendencia adversa sostenida en ${sede}`,
          desc: `Diferencias en las últimas 3 conciliaciones: ${fmt(vals[0])} → ${fmt(vals[1])} → ${fmt(vals[2])} (deterioro progresivo).`,
          metaL: 'Última Δ',
          metaV: fmt(vals[2]),
          impact: Math.abs(vals[2])
        });
      });
    }

    // 5. Coherencia matemática Teorico = SaldoUA + Entradas - Salidas
    const incoherentes = rows.filter(r => {
      const calc = (r.saldoCorteUA||0) + (r.entradas||0) - (r.salidas||0);
      return r.saldoTeorico && Math.abs(calc - r.saldoTeorico) > 1;
    });
    if (incoherentes.length > 0) {
      const ej = incoherentes[0];
      const calc = (ej.saldoCorteUA||0) + (ej.entradas||0) - (ej.salidas||0);
      alerts.push({
        lvl: 'med', code: '∑',
        title: `${incoherentes.length} fila(s) con saldo teórico que no concilia con E-S`,
        desc: `Ejemplo: <span class="ref">${ej.informe.trim()}</span> · ${ej.cedi}. Cálculo (UA+E-S) = ${fmt(calc)} ≠ teórico reportado ${fmt(ej.saldoTeorico)}.`,
        metaL: 'Filas',
        metaV: fmt(incoherentes.length),
        impact: incoherentes.length
      });
    }

    // 6. OK final si no hay alertas
    if (alerts.length === 0) {
      alerts.push({lvl:'low',code:'✓',title:'Sin inconsistencias relevantes detectadas', desc:'Bajo los filtros aplicados, ninguna regla de validación automática se activó.', metaL:'Estado', metaV:'OK', impact:0});
    }

    alerts.sort((a,b)=> {
      const order = {crit:0, high:1, med:2, low:3};
      return order[a.lvl]-order[b.lvl] || b.impact-a.impact;
    });

    const cont = document.getElementById('alerts-list');
    cont.innerHTML = '';
    alerts.slice(0,12).forEach(a => {
      const el = document.createElement('div');
      el.className = 'alert ' + a.lvl;
      el.innerHTML = `<div class="lvl">${a.code}</div>
        <div><div class="title">${a.title}</div><div class="desc">${a.desc}</div></div>
        <div class="meta-right">${a.metaL}<span class="num">${a.metaV}</span></div>`;
      cont.appendChild(el);
    });
    document.getElementById('alert-count').textContent = alerts.filter(a => a.lvl !== 'low').length;
  }

  // ---------- Comparativo 2025 vs 2026 ----------
  function renderComparativo(rows){
    const r25 = rows.filter(r => r.year === 2025);
    const r26 = rows.filter(r => r.year === 2026);
    const concept = (arr, k) => arr.reduce((s,r)=>s + (r[k]||0), 0);
    const items = [
      { k:'Entradas', a: concept(r25,'entradas'), b: concept(r26,'entradas') },
      { k:'Salidas', a: concept(r25,'salidas'), b: concept(r26,'salidas') },
      { k:'Saldo teórico', a: concept(r25,'saldoTeorico'), b: concept(r26,'saldoTeorico') },
      { k:'Conteo físico', a: concept(r25,'conteoFisico'), b: concept(r26,'conteoFisico') },
      { k:'Diferencia neta', a: concept(r25,'diferencias'), b: concept(r26,'diferencias') },
      { k:'|Diferencia| absoluta', a: r25.reduce((s,r)=>s+Math.abs(r.diferencias),0), b: r26.reduce((s,r)=>s+Math.abs(r.diferencias),0) },
      { k:'Ajustes operativos', a: concept(r25,'ajuste'), b: concept(r26,'ajuste') }
    ];

    // Tabla
    const tb = document.querySelector('#cmp-table tbody');
    tb.innerHTML = '';
    items.forEach(it => {
      const d = it.b - it.a;
      const dcls = d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero';
      const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '–';
      const dPct = it.a !== 0 ? ((d/Math.abs(it.a))*100).toFixed(1) + '%' : '—';
      tb.innerHTML += `<tr>
        <td>${it.k}</td>
        <td class="num">${fmt(it.a)}</td>
        <td class="num">${fmt(it.b)}</td>
        <td class="num ${dcls}">${arrow} ${fmt(d)}<br><span style="font-size:10px;font-weight:500;opacity:.7">${dPct}</span></td>
      </tr>`;
    });

    // Barras agrupadas
    const main = items.filter(it => ['Saldo teórico','Conteo físico','|Diferencia| absoluta','Ajustes operativos','Entradas','Salidas'].includes(it.k));
    const W = 560, H = 280, P = {t:14,r:10,b:50,l:60};
    const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
    const max = Math.max(...main.map(it => Math.max(Math.abs(it.a), Math.abs(it.b))));
    const grp = innerW / main.length;
    const barW = grp * 0.35;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">`;
    // grid
    for (let i=0;i<=4;i++){
      const y = P.t + innerH * (i/4);
      svg += `<line class="grid-line" x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}"/>`;
      svg += `<text class="axis-label" x="${P.l-6}" y="${y+3}" text-anchor="end">${fmt(max*(1-i/4))}</text>`;
    }
    svg += `<line class="axis-line" x1="${P.l}" x2="${W-P.r}" y1="${P.t+innerH}" y2="${P.t+innerH}"/>`;
    main.forEach((it,i) => {
      const cx = P.l + grp*i + grp/2;
      const h25 = Math.abs(it.a)/(max||1)*innerH;
      const h26 = Math.abs(it.b)/(max||1)*innerH;
      svg += `<rect x="${cx-barW-2}" y="${P.t+innerH-h25}" width="${barW}" height="${h25}" fill="#1B2E54" rx="2"/>`;
      svg += `<rect x="${cx+2}" y="${P.t+innerH-h26}" width="${barW}" height="${h26}" fill="#0FB5AE" rx="2"/>`;
      svg += `<text class="axis-label" x="${cx}" y="${P.t+innerH+14}" text-anchor="middle">${it.k.split(' ')[0]}</text>`;
      svg += `<text class="axis-label" x="${cx}" y="${P.t+innerH+26}" text-anchor="middle">${it.k.split(' ').slice(1).join(' ')||''}</text>`;
    });
    // leyenda
    svg += `<g transform="translate(${P.l},${H-8})">
      <rect width="10" height="10" fill="#1B2E54" rx="2"/><text class="axis-label" x="15" y="9">2025</text>
      <rect x="60" width="10" height="10" fill="#0FB5AE" rx="2"/><text class="axis-label" x="75" y="9">2026 YTD</text>
    </g>`;
    svg += '</svg>';
    document.getElementById('cmp-bars').innerHTML = svg;
  }

  // ---------- Tendencias ----------
  function renderTrend(rows){
    // Agrupar por informe → corte
    const infMap = {};
    rows.forEach(r => {
      const i = infMap[r.informe] = infMap[r.informe] || {corte:r.corte, dif:0, absDif:0, ajuste:0, absAjuste:0, teorico:0, fisico:0};
      i.dif += r.diferencias; i.absDif += Math.abs(r.diferencias);
      i.ajuste += r.ajuste; i.absAjuste += Math.abs(r.ajuste);
      i.teorico += r.saldoTeorico; i.fisico += r.conteoFisico;
    });
    const points = Object.entries(infMap).sort((a,b)=> (a[1].corte||'').localeCompare(b[1].corte||''));

    const W = 1080, H = 320, P = {t:16, r:80, b:46, l:50};
    const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
    if (points.length === 0) {
      document.getElementById('trend-chart').innerHTML = '<div style="padding:40px;text-align:center;color:#6B7793">Sin datos para los filtros aplicados.</div>';
      return;
    }
    const maxLeft = Math.max(...points.map(p => Math.max(p[1].teorico, p[1].fisico)));
    const maxRight = Math.max(...points.map(p => Math.max(p[1].absDif, p[1].absAjuste, 1)));
    const x = i => P.l + (points.length>1 ? (i/(points.length-1))*innerW : innerW/2);

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">`;
    for (let i=0;i<=4;i++){
      const y = P.t + innerH * (i/4);
      svg += `<line class="grid-line" x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}"/>`;
      svg += `<text class="axis-label" x="${P.l-6}" y="${y+3}" text-anchor="end">${fmt(maxLeft*(1-i/4))}</text>`;
      svg += `<text class="axis-label" x="${W-P.r+6}" y="${y+3}" text-anchor="start" fill="#C5364B">${fmt(maxRight*(1-i/4))}</text>`;
    }
    svg += `<line class="axis-line" x1="${P.l}" x2="${W-P.r}" y1="${P.t+innerH}" y2="${P.t+innerH}"/>`;

    // áreas teorico / fisico
    function line(arr, color, w=2, opacity=1){
      const d = arr.map((v,i)=> `${i?'L':'M'}${x(i)},${P.t + innerH - v/(maxLeft||1)*innerH}`).join(' ');
      return `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" opacity="${opacity}" stroke-linejoin="round"/>`;
    }
    function lineR(arr, color, w=2){
      const d = arr.map((v,i)=> `${i?'L':'M'}${x(i)},${P.t + innerH - v/(maxRight||1)*innerH}`).join(' ');
      return `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linejoin="round"/>`;
    }
    svg += line(points.map(p=>p[1].teorico), '#0F1E3D', 2);
    svg += line(points.map(p=>p[1].fisico), '#0FB5AE', 2);
    svg += lineR(points.map(p=>p[1].absDif), '#C5364B', 2);
    svg += lineR(points.map(p=>p[1].absAjuste), '#E08A1A', 1.5);

    // dots
    points.forEach((p,i) => {
      svg += `<circle cx="${x(i)}" cy="${P.t + innerH - p[1].teorico/(maxLeft||1)*innerH}" r="3" fill="#0F1E3D"/>`;
      svg += `<circle cx="${x(i)}" cy="${P.t + innerH - p[1].fisico/(maxLeft||1)*innerH}" r="3" fill="#0FB5AE"/>`;
      svg += `<circle cx="${x(i)}" cy="${P.t + innerH - p[1].absDif/(maxRight||1)*innerH}" r="3" fill="#C5364B"/>`;
      svg += `<text class="axis-label" x="${x(i)}" y="${P.t+innerH+16}" text-anchor="middle">${p[0].trim()}</text>`;
      svg += `<text class="axis-label" x="${x(i)}" y="${P.t+innerH+30}" text-anchor="middle" fill="#8693AC">${isoToShort(p[1].corte)}</text>`;
    });

    svg += `<text class="axis-label" x="${P.l}" y="10" text-anchor="start" font-weight="700" fill="#0F1E3D">Saldos (unidades)</text>`;
    svg += `<text class="axis-label" x="${W-P.r}" y="10" text-anchor="end" font-weight="700" fill="#C5364B">|Δ| y |Ajustes|</text>`;
    svg += '</svg>';
    document.getElementById('trend-chart').innerHTML = svg;
  }

  // ---------- Ranking sedes ----------
  function renderCediBars(rows){
    const agg = {};
    rows.forEach(r => {
      const a = agg[r.cedi] = agg[r.cedi] || {dif:0, absDif:0, fisico:0, teorico:0, n:0, criticos:0, faltantes:0, sobrantes:0};
      a.dif += r.diferencias; a.absDif += Math.abs(r.diferencias);
      a.fisico += r.conteoFisico; a.teorico += r.saldoTeorico; a.n++;
      if (r._estado === 'CRITICO') a.criticos++;
      if (r.diferencias < 0) a.faltantes++;
      if (r.diferencias > 0) a.sobrantes++;
    });
    const list = Object.entries(agg).sort((a,b)=> b[1].absDif - a[1].absDif).slice(0,16);
    const max = Math.max(...list.map(([_,v]) => v.absDif), 1);

    const cont = document.getElementById('cedi-bars');
    cont.innerHTML = '';
    if (list.length === 0) { cont.innerHTML = '<div style="padding:20px;color:#6B7793">Sin datos.</div>'; return; }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:230px 1fr 110px 110px 70px;gap:10px;align-items:center;font-size:12px;';
    wrap.innerHTML = `<div class="small-cap" style="color:#6B7793">Sede</div>
      <div class="small-cap" style="color:#6B7793">Magnitud |Δ|</div>
      <div class="small-cap" style="color:#6B7793;text-align:right">Δ neta</div>
      <div class="small-cap" style="color:#6B7793;text-align:right">Físico / Teórico</div>
      <div class="small-cap" style="color:#6B7793;text-align:right">Crít.</div>`;
    cont.appendChild(wrap);

    list.forEach(([sede, v]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:230px 1fr 110px 110px 70px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #EDEFF4;font-size:12px;';
      const color = v.dif < -50 ? '#C5364B' : v.dif < -5 ? '#E08A1A' : v.dif > 50 ? '#6C4BD9' : v.dif > 5 ? '#0E7C86' : '#1F8A4C';
      const ratio = v.teorico ? (v.fisico/v.teorico*100).toFixed(1) + '%' : '—';
      row.innerHTML = `
        <div style="font-weight:600;color:#0B1320;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${sede}">${sede}</div>
        <div>
          <div style="background:#EDEFF4;height:8px;border-radius:4px;overflow:hidden;position:relative">
            <div style="background:${color};width:${(v.absDif/max*100).toFixed(2)}%;height:100%;border-radius:4px"></div>
          </div>
          <div class="mono" style="font-size:10.5px;color:#6B7793;margin-top:3px">|Δ| ${fmt(v.absDif)} unidades · ${v.n} bod·corte</div>
        </div>
        <div class="num mono" style="text-align:right;font-weight:700;color:${v.dif<0?'#C5364B':v.dif>0?'#0E7C86':'#6B7793'}">${(v.dif>=0?'+':'')+fmt(v.dif)}</div>
        <div class="num mono" style="text-align:right">${fmt(v.fisico)}<br><span style="font-size:10px;color:#6B7793">/ ${fmt(v.teorico)} · ${ratio}</span></div>
        <div class="num mono" style="text-align:right;font-weight:700;color:${v.criticos?'#C5364B':'#6B7793'}">${v.criticos}</div>
      `;
      cont.appendChild(row);
    });
  }

  // ---------- Heatmap ----------
  function renderHeatmap(rows){
    const infList = uniq(rows.map(r=>r.informe)).sort((a,b)=>{
      const ca = rows.find(r=>r.informe===a)?.corte || '';
      const cb = rows.find(r=>r.informe===b)?.corte || '';
      return ca.localeCompare(cb);
    });
    const sedeAgg = {};
    rows.forEach(r => {
      const k = r.cedi;
      sedeAgg[k] = sedeAgg[k] || {totalAbs:0, byInf:{}};
      sedeAgg[k].byInf[r.informe] = (sedeAgg[k].byInf[r.informe]||0) + r.diferencias;
      sedeAgg[k].totalAbs += Math.abs(r.diferencias);
    });
    const sedes = Object.entries(sedeAgg).sort((a,b)=>b[1].totalAbs - a[1].totalAbs).slice(0,16).map(([k])=>k);
    const maxAbs = Math.max(1, ...sedes.flatMap(s => infList.map(i => Math.abs(sedeAgg[s]?.byInf[i] || 0))));

    const cont = document.getElementById('heatmap');
    const cols = infList.length;
    cont.style.cssText = `display:grid;grid-template-columns:200px repeat(${cols},1fr);gap:2px;align-items:center;`;
    cont.innerHTML = '';
    // header
    cont.innerHTML += `<div class="h-col"></div>` + infList.map(i => `<div class="h-col" title="${i}">${i.trim().replace('CI-','').replace(' ','')}</div>`).join('');
    sedes.forEach(s => {
      cont.innerHTML += `<div class="h-label" title="${s}">${s.length>26?s.slice(0,24)+'…':s}</div>`;
      infList.forEach(inf => {
        const v = sedeAgg[s]?.byInf[inf];
        let bg = '#EDEFF4', col = '#6B7793', txt = '·';
        if (v === undefined) { bg = '#F4F5F8'; txt = ''; }
        else if (v === 0) { bg = '#EDEFF4'; col = '#6B7793'; txt = '0'; }
        else {
          const intensity = Math.min(1, Math.abs(v)/maxAbs);
          if (v < 0) {
            bg = `rgba(197,54,75,${0.18 + intensity*0.72})`;
            col = intensity > 0.5 ? '#fff' : '#7d1b2a';
          } else {
            bg = `rgba(31,138,76,${0.18 + intensity*0.72})`;
            col = intensity > 0.5 ? '#fff' : '#0a5a30';
          }
          txt = (v>0?'+':'') + fmt(v);
        }
        cont.innerHTML += `<div class="h-cell" style="background:${bg};color:${col}" title="${s} · ${inf}: ${fmt(v)}">${txt}</div>`;
      });
    });
  }

  // ---------- Hallazgos ----------
  function renderFindings(rows){
    const findings = [];

    // Sede top faltante histórico
    const sedeAgg = {};
    rows.forEach(r => { sedeAgg[r.cedi] = (sedeAgg[r.cedi] || 0) + r.diferencias; });
    const sedeRk = Object.entries(sedeAgg).sort((a,b)=>a[1]-b[1]);
    if (sedeRk[0] && sedeRk[0][1] < 0) {
      findings.push({c:'crit', t:`Concentración crítica de faltantes en ${sedeRk[0][0]}`, d:`Acumulado de <span class="mono">${fmt(sedeRk[0][1])}</span> unidades en pérdida neta en el periodo. Representa el principal foco de exposición operativa y exige un control diferenciado: inventarios cíclicos semanales, verificación de pares envío-recepción y revisión de rutas de salida.`, tags:['Sede','Crítico','Operación'], imp:Math.abs(sedeRk[0][1])});
    }
    if (sedeRk[1] && sedeRk[1][1] < 0) {
      findings.push({c:'high', t:`Segundo foco de exposición: ${sedeRk[1][0]}`, d:`Diferencia acumulada de <span class="mono">${fmt(sedeRk[1][1])}</span> unidades. Recomendado: muestreo estratificado del inventario y revisión de los responsables de cargue.`, tags:['Sede','Alto','Operación'], imp:Math.abs(sedeRk[1][1])});
    }

    // Informe con mayor desvío
    const infAgg = {};
    rows.forEach(r => { (infAgg[r.informe] = infAgg[r.informe] || {dif:0, corte:r.corte}).dif += r.diferencias; });
    const infRk = Object.entries(infAgg).sort((a,b)=> Math.abs(b[1].dif) - Math.abs(a[1].dif));
    if (infRk[0]) {
      findings.push({c:'high', t:`Conciliación con mayor desvío: ${infRk[0][0].trim()}`, d:`Corte ${isoToShort(infRk[0][1].corte)} con diferencia neta de <span class="mono">${fmt(infRk[0][1].dif)}</span>. Documentar las causas raíz en mesa técnica y validar si el evento puede repetirse en próximos cortes.`, tags:['Informe','Alto'], imp:Math.abs(infRk[0][1].dif)});
    }

    // Bodegas con conteo físico = 0 recurrente
    const bodSinFisico = {};
    rows.forEach(r => {
      if (r.conteoFisico === 0 && r.saldoTeorico > 0) bodSinFisico[r.bodega] = (bodSinFisico[r.bodega]||0) + 1;
    });
    const bodRk = Object.entries(bodSinFisico).sort((a,b)=>b[1]-a[1]);
    if (bodRk[0]) {
      findings.push({c:'med', t:`Bodegas con omisión recurrente de conteo físico`, d:`La bodega <span class="mono">${bodRk[0][0]}</span> registra <span class="mono">${bodRk[0][1]}</span> conciliaciones sin conteo físico pese a tener saldo teórico. Riesgo de información de cierre no verificada.`, tags:['Bodega','Medio','Control'], imp:bodRk[0][1]*10});
    }

    // Tendencia 2026 mejorando o empeorando
    const r25 = rows.filter(r=>r.year===2025);
    const r26 = rows.filter(r=>r.year===2026);
    if (r25.length && r26.length) {
      const e25 = r25.reduce((s,r)=>s+r.saldoTeorico,0); const f25 = r25.reduce((s,r)=>s+r.conteoFisico,0);
      const e26 = r26.reduce((s,r)=>s+r.saldoTeorico,0); const f26 = r26.reduce((s,r)=>s+r.conteoFisico,0);
      const p25 = e25 ? (1-Math.abs(e25-f25)/e25)*100 : 100;
      const p26 = e26 ? (1-Math.abs(e26-f26)/e26)*100 : 100;
      if (p26 > p25) {
        findings.push({c:'low', t:`Mejora en exactitud de inventario 2026 vs 2025`, d:`Exactitud 2025 = <span class="mono">${p25.toFixed(2)}%</span> · 2026 YTD = <span class="mono">${p26.toFixed(2)}%</span>. Continuidad del comportamiento positivo, validar sostenibilidad en los próximos cortes.`, tags:['Tendencia','Positivo'], imp:(p26-p25)*100});
      } else {
        findings.push({c:'high', t:`Retroceso en exactitud 2026 vs cierre 2025`, d:`Exactitud 2025 = <span class="mono">${p25.toFixed(2)}%</span> · 2026 YTD = <span class="mono">${p26.toFixed(2)}%</span>. Requiere análisis de causa raíz inmediato y refuerzo de procedimientos.`, tags:['Tendencia','Alto','Acción'], imp:(p25-p26)*100});
      }
    }

    // CADENAS ESPECIALES (físico = 0 sistemático)
    const ce = rows.filter(r => r.cedi === 'CADENAS ESPECIALES');
    if (ce.length > 0) {
      const ceCeros = ce.filter(r => r.conteoFisico === 0).length;
      if (ceCeros >= ce.length * 0.7) {
        findings.push({c:'med', t:`Bodega CADENAS ESPECIALES: conteo físico sistemáticamente en 0`, d:`En <span class="mono">${ceCeros}</span> de <span class="mono">${ce.length}</span> conciliaciones esta bodega reporta conteo físico = 0 con teórico positivo. Revisar si se trata de bodega virtual / contable o si se está omitiendo verificación física.`, tags:['Calidad','Medio'], imp:ce.reduce((s,r)=>s+r.saldoTeorico,0)});
      }
    }

    // Sobrante neto sostenido
    if (sedeRk[sedeRk.length-1] && sedeRk[sedeRk.length-1][1] > 0) {
      findings.push({c:'med', t:`Sobrantes sistemáticos en ${sedeRk[sedeRk.length-1][0]}`, d:`Diferencia positiva acumulada de <span class="mono">${fmt(sedeRk[sedeRk.length-1][1])}</span> unidades. Los sobrantes recurrentes pueden indicar fallas en el reporte de salidas o doble contabilización de entradas; revisar trazabilidad de tinas en tránsito.`, tags:['Sobrantes','Medio'], imp:sedeRk[sedeRk.length-1][1]});
    }

    // Ajustes mayores a la diferencia
    const incoherentes = rows.filter(r => r.diferencias !== 0 && Math.abs(r.ajuste) > Math.abs(r.diferencias));
    if (incoherentes.length > 0) {
      findings.push({c:'high', t:`Ajustes contables superiores a la diferencia detectada`, d:`<span class="mono">${incoherentes.length}</span> registros con ajuste mayor en valor absoluto que la diferencia identificada — posible regularización de ajustes anteriores o necesidad de validación con auditoría contable.`, tags:['Auditoría','Alto','Contable'], imp:incoherentes.reduce((s,r)=>s+Math.abs(r.ajuste),0)});
    }

    // Volatilidad por sede
    const variances = {};
    rows.forEach(r => {
      variances[r.cedi] = variances[r.cedi] || [];
      variances[r.cedi].push(r.diferencias);
    });
    let maxRange = 0, maxRangeSede = '';
    Object.entries(variances).forEach(([s, arr]) => {
      if (arr.length < 5) return;
      const range = Math.max(...arr) - Math.min(...arr);
      if (range > maxRange) { maxRange = range; maxRangeSede = s; }
    });
    if (maxRangeSede) {
      findings.push({c:'med', t:`Alta volatilidad de diferencias en ${maxRangeSede}`, d:`Rango entre máximo y mínimo de diferencias = <span class="mono">${fmt(maxRange)}</span> unidades. La inestabilidad operativa sugiere procesos no estandarizados o eventos puntuales (devoluciones masivas, traslados extraordinarios) que requieren documentación.`, tags:['Volatilidad','Medio'], imp:maxRange});
    }

    // Última conciliación con repunte
    const ultimos = Object.entries(infAgg).sort((a,b)=>(a[1].corte||'').localeCompare(b[1].corte||'')).slice(-2);
    if (ultimos.length === 2 && Math.abs(ultimos[1][1].dif) > Math.abs(ultimos[0][1].dif)*2 && Math.abs(ultimos[1][1].dif) > 100) {
      findings.push({c:'crit', t:`Repunte significativo en la conciliación más reciente`, d:`<span class="mono">${ultimos[0][0].trim()}</span>: Δ <span class="mono">${fmt(ultimos[0][1].dif)}</span> → <span class="mono">${ultimos[1][0].trim()}</span>: Δ <span class="mono">${fmt(ultimos[1][1].dif)}</span>. Activar mesa técnica de causa raíz dentro de la próxima semana.`, tags:['Tendencia','Crítico','Inmediato'], imp:Math.abs(ultimos[1][1].dif)});
    }

    // ordenar por impacto
    findings.sort((a,b) => {
      const order = {crit:0, high:1, med:2, low:3};
      return order[a.c] - order[b.c] || b.imp - a.imp;
    });

    const cont = document.getElementById('findings-list');
    cont.innerHTML = '';
    findings.slice(0,10).forEach((f, i) => {
      const el = document.createElement('div');
      el.className = 'finding ' + f.c;
      const impLabel = f.c === 'crit' ? 'imp-alto' : f.c === 'high' ? 'imp-alto' : f.c === 'med' ? 'imp-med' : '';
      el.innerHTML = `<div class="rank">#${String(i+1).padStart(2,'0')}</div>
        <div class="body">
          <div class="t">${f.t}</div>
          <div class="d">${f.d}</div>
          <div class="tags">${f.tags.map(t=>`<span class="${impLabel}">${t}</span>`).join('')}</div>
        </div>
        <div class="impact"><div class="v mono">${fmt(Math.round(f.imp))}</div><div class="l">Impacto relativo</div></div>`;
      cont.appendChild(el);
    });
    if (findings.length === 0) cont.innerHTML = '<div style="padding:20px;color:#6B7793">Sin hallazgos relevantes en la vista filtrada.</div>';
  }

  // ---------- Plan de acción ----------
  function renderPlan(rows){
    // Plan está basado en patrones identificados; siempre se calcula sobre las rows actuales para que
    // los responsables sugeridos y los KPIs de seguimiento se ajusten al alcance filtrado.
    const sedeAgg = {};
    rows.forEach(r => { sedeAgg[r.cedi] = (sedeAgg[r.cedi]||0) + r.diferencias; });
    const peor = Object.entries(sedeAgg).sort((a,b)=>a[1]-b[1])[0];
    const peor2 = Object.entries(sedeAgg).sort((a,b)=>a[1]-b[1])[1];

    const plan = [
      {a:`Mesa técnica de causa raíz para ${peor ? peor[0] : 'la sede de mayor exposición'}`, r:'Coordinación Logística + Auditoría Interna', p:'ALTA', c:'CRÍTICA', plazo:'7 días', kpi:'Acta y plan de mitigación firmados'},
      {a:`Inventario cíclico semanal de la(s) bodega(s) con mayor faltante (CENTRAL DE TINAS, TINAS BODEGA ALISTAMIENTO)`, r:'Jefes de Bodega CEDI', p:'ALTA', c:'ALTA', plazo:'Continuo · primer ciclo 7 días', kpi:'% bodegas con conteo cíclico al día'},
      {a:`Validar que toda bodega con saldo teórico > 0 reciba conteo físico (revisar omisiones recurrentes)`, r:'Control Interno', p:'ALTA', c:'ALTA', plazo:'Próxima conciliación', kpi:'Filas con físico = 0 y teórico > 0'},
      {a:`Reconciliación contable de los ajustes que superan en magnitud a la diferencia operativa`, r:'Contabilidad + Auditoría', p:'ALTA', c:'ALTA', plazo:'15 días', kpi:'Ajustes contables soportados'},
      {a:`Revisión de procesos de cargue / recepción en ${peor2 ? peor2[0] : 'la segunda sede'} para frenar la pérdida sostenida`, r:'Jefe de Operaciones', p:'MEDIA', c:'ALTA', plazo:'30 días', kpi:'|Δ| de la sede en próximo corte'},
      {a:`Trazabilidad punta a punta de tinas en tránsito (despachos paletizados, devoluciones, terceros)`, r:'Coordinación Logística', p:'MEDIA', c:'MEDIA', plazo:'45 días', kpi:'Tinas en tránsito reconciliadas / total'},
      {a:`Estandarizar procedimiento de conteo para bodegas de baja rotación que sistemáticamente reportan 0 físico`, r:'Calidad + Bodegas', p:'MEDIA', c:'MEDIA', plazo:'30 días', kpi:'SOP firmado y socializado'},
      {a:`Tablero de KPI mensual de exactitud de inventario por sede, con meta gerencial ≥ 99,00%`, r:'Planeación + BI', p:'MEDIA', c:'MEDIA', plazo:'30 días', kpi:'Tablero publicado y revisado'},
      {a:`Auditoría sorpresa muestral en bodegas con sobrantes sostenidos (riesgo de salidas no registradas)`, r:'Auditoría Interna', p:'MEDIA', c:'MEDIA', plazo:'60 días', kpi:'Bodegas auditadas / programadas'},
      {a:`Capacitación a responsables de conteo en procedimiento estándar y uso del formato de conciliación`, r:'Talento Humano + Operaciones', p:'BAJA', c:'BAJA', plazo:'60 días', kpi:'% de responsables capacitados'},
      {a:`Indicadores de oportunidad: cada conciliación debe cerrarse en ≤ 5 días hábiles después del corte`, r:'Coordinación Logística', p:'BAJA', c:'BAJA', plazo:'Continuo', kpi:'Días promedio de cierre'},
      {a:`Documentar lecciones aprendidas y archivar evidencias por conciliación en repositorio único`, r:'Calidad', p:'BAJA', c:'BAJA', plazo:'90 días', kpi:'Repositorio implementado'}
    ];

    window._planData = plan;
    renderPlanFiltered('all');
  }
  function renderPlanFiltered(tab){
    const plan = window._planData || [];
    const tb = document.querySelector('#plan-table tbody');
    tb.innerHTML = '';
    plan.filter(p => tab === 'all' || p.p === tab).forEach((p, i) => {
      const pclass = p.p === 'ALTA' ? 'crit' : p.p === 'MEDIA' ? 'med' : 'leve';
      const cclass = p.c === 'CRÍTICA' ? 'crit' : p.c === 'ALTA' ? 'crit' : p.c === 'MEDIA' ? 'med' : 'leve';
      tb.innerHTML += `<tr>
        <td class="mono" style="color:#6B7793">#${String(i+1).padStart(2,'0')}</td>
        <td>${p.a}</td>
        <td style="font-size:11.5px;color:#3C475C">${p.r}</td>
        <td><span class="badge ${pclass}">${p.p}</span></td>
        <td><span class="badge ${cclass}">${p.c}</span></td>
        <td class="mono" style="font-size:11px">${p.plazo}</td>
        <td style="font-size:11px;color:#3C475C">${p.kpi}</td>
      </tr>`;
    });
  }
  document.querySelectorAll('#plan-tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#plan-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderPlanFiltered(b.dataset.tab);
    });
  });

  // ---------- Diagnóstico ----------
  function renderDiag(rows){
    const totFilas = rows.length;
    const nullFisico = rows.filter(r => r.conteoFisico === 0 && r.saldoTeorico > 0).length;
    const sinSistema = rows.filter(r => r.saldoSistema === 0 && r.saldoTeorico > 0).length;
    const incoherenteEcuacion = rows.filter(r => {
      const calc = (r.saldoCorteUA||0) + (r.entradas||0) - (r.salidas||0);
      return r.saldoTeorico && Math.abs(calc - r.saldoTeorico) > 1;
    }).length;
    const ajusteSuperior = rows.filter(r => r.diferencias !== 0 && Math.abs(r.ajuste) > Math.abs(r.diferencias)).length;
    const cuadrados = rows.filter(r => r.diferencias === 0).length;

    document.getElementById('diag-coherencia').innerHTML = `
      <div class="stat"><span class="k">Filas analizadas</span><span class="v">${fmt(totFilas)}</span></div>
      <div class="stat"><span class="k">Cuadradas (Δ = 0)</span><span class="v">${fmt(cuadrados)} · ${pct(cuadrados,totFilas)}</span></div>
      <div class="stat"><span class="k">Físico = 0 con teórico > 0</span><span class="v ${nullFisico?'neg':''}">${fmt(nullFisico)}</span></div>
      <div class="stat"><span class="k">Saldo sistema = 0 con teórico > 0</span><span class="v ${sinSistema?'neg':''}">${fmt(sinSistema)}</span></div>
      <div class="stat"><span class="k">Filas con (UA + E − S) ≠ Teórico</span><span class="v ${incoherenteEcuacion?'neg':''}">${fmt(incoherenteEcuacion)}</span></div>
      <div class="stat"><span class="k">Ajuste &gt; |Δ| (incoherente)</span><span class="v ${ajusteSuperior?'neg':''}">${fmt(ajusteSuperior)}</span></div>
    `;

    // trazabilidad
    const infs = uniq(rows.map(r=>r.informe));
    const sedes = uniq(rows.map(r=>r.cedi));
    const bodegas = uniq(rows.map(r=>r.bodega));
    const fechaMin = rows.map(r=>r.corte).filter(Boolean).sort()[0];
    const fechaMax = rows.map(r=>r.corte).filter(Boolean).sort().slice(-1)[0];
    document.getElementById('diag-traza').innerHTML = `
      <div class="stat"><span class="k">Periodo cubierto</span><span class="v">${fechaMin||'—'} → ${fechaMax||'—'}</span></div>
      <div class="stat"><span class="k">Conciliaciones (informes)</span><span class="v">${infs.length}</span></div>
      <div class="stat"><span class="k">Sedes / centros de costo</span><span class="v">${sedes.length}</span></div>
      <div class="stat"><span class="k">Bodegas físicas</span><span class="v">${bodegas.length}</span></div>
      <div class="stat"><span class="k">Profundidad media por informe</span><span class="v">${(totFilas/Math.max(1,infs.length)).toFixed(1)} filas</span></div>
      <div class="stat"><span class="k">Cobertura sede·informe</span><span class="v">${pct(totFilas, infs.length*sedes.length)}</span></div>
    `;

    // operativo
    const r25 = rows.filter(r=>r.year===2025);
    const r26 = rows.filter(r=>r.year===2026);
    const exp25 = r25.reduce((s,r)=>s+Math.abs(r.diferencias),0);
    const exp26 = r26.reduce((s,r)=>s+Math.abs(r.diferencias),0);

    document.getElementById('diag-op').innerHTML = [
      `El proceso muestra <strong>concentración de pérdida</strong> en bodegas core de alistamiento y central de tinas, sugiriendo fugas operativas asociadas a alto flujo (entradas + salidas elevadas vs. baja exactitud relativa).`,
      `La <strong>relación ajuste / diferencia</strong> muestra ${ajusteSuperior} casos donde el ajuste excede la diferencia identificada: requiere conciliación contable, normalmente asociado a regularización de cortes previos.`,
      r25.length && r26.length ? `Comparando 2025 (|Δ| acumulada = <span class="mono">${fmt(exp25)}</span>) frente a 2026 YTD (<span class="mono">${fmt(exp26)}</span>), se identifica que la <strong>magnitud absoluta del riesgo operativo</strong> en lo corrido de 2026 es proporcionalmente ${exp26 / Math.max(1,r26.length) < exp25 / Math.max(1,r25.length) ? 'menor por registro' : 'mayor por registro'} que en 2025.` : '',
      nullFisico > 0 ? `Existen <strong>${nullFisico} registros sin conteo físico</strong> pese a tener saldo teórico positivo — debilita la trazabilidad y debe corregirse antes del próximo cierre.` : `Todas las bodegas con saldo teórico positivo recibieron conteo físico — calidad de fuente adecuada.`
    ].filter(Boolean).map(t=>`<li>${t}</li>`).join('');

    // financiero (estimación cualitativa)
    const netDif = rows.reduce((s,r)=>s+r.diferencias,0);
    const absDif = rows.reduce((s,r)=>s+Math.abs(r.diferencias),0);
    const totFisico = rows.reduce((s,r)=>s+r.conteoFisico,0);
    const exactitud = totFisico ? (1 - Math.abs(netDif)/Math.max(1,rows.reduce((s,r)=>s+r.saldoTeorico,0)))*100 : 100;

    document.getElementById('diag-fin').innerHTML = [
      `Diferencia <strong>neta consolidada</strong> de <span class="mono">${fmt(netDif)}</span> tinas representa la posición real de pérdida del activo físico — incidencia directa en costo de reposición.`,
      `La <strong>diferencia absoluta acumulada</strong> de <span class="mono">${fmt(absDif)}</span> tinas refleja la verdadera exposición operativa (pérdidas + ganancias) y es la base sobre la cual dimensionar planes de mitigación.`,
      `Exactitud de inventario consolidada = <span class="mono">${exactitud.toFixed(2)}%</span>. Una meta ejecutiva razonable es alcanzar y sostener <span class="mono">≥ 99,00 %</span>; cada punto porcentual por debajo equivale aproximadamente a <span class="mono">${fmt(Math.round(totFisico*0.01))}</span> tinas de exposición.`,
      `Los <strong>ajustes contables registrados</strong> (<span class="mono">${fmt(rows.reduce((s,r)=>s+r.ajuste,0))}</span>) deben reconciliarse con los soportes de pérdida operativa para no afectar el resultado del periodo con cargos no justificados.`
    ].map(t=>`<li>${t}</li>`).join('');
  }

  // ---------- Tabla detalle ----------
  function renderDetail(rows){
    const tb = document.querySelector('#detail-table tbody');
    tb.innerHTML = '';
    rows.forEach(r => {
      const cls = {OK:'ok',LEVE:'leve',MEDIO:'med',CRITICO:'crit'}[r._estado];
      const dCls = r.diferencias < 0 ? 'neg' : r.diferencias > 0 ? 'pos' : 'zero';
      tb.innerHTML += `<tr>
        <td class="mono" style="font-size:11px">${isoToShort(r.corte)}</td>
        <td class="code">${r.informe.trim()}</td>
        <td class="code">${r.bodega}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.cedi}">${r.cedi}</td>
        <td class="num">${fmt(r.entradas)}</td>
        <td class="num">${fmt(r.salidas)}</td>
        <td class="num">${fmt(r.saldoTeorico)}</td>
        <td class="num">${fmt(r.conteoFisico)}</td>
        <td class="num ${dCls}">${(r.diferencias>=0?'+':'')+fmt(r.diferencias)}</td>
        <td class="num">${fmt(r.saldoSistema)}</td>
        <td class="num">${fmt(r.ajuste)}</td>
        <td><span class="badge ${cls}">${r._estado}</span></td>
      </tr>`;
    });
    document.getElementById('det-count').textContent = fmt(rows.length);
    const tot = rows.reduce((s,r)=>s+r.diferencias,0);
    const el = document.getElementById('det-dif');
    el.textContent = (tot>=0?'+':'') + fmt(tot);
    el.style.color = tot < 0 ? '#C5364B' : tot > 0 ? '#0E7C86' : '#6B7793';
  }

  // ---------- Export CSV ----------
  function exportCSV(){
    const rows = applyFilters(DATA);
    const headers = ['Corte','Informe','Bodega','Sede','SaldoCorteUA','Entradas','Salidas','SaldoTeorico','ConteoFisico','Diferencias','SaldoSistema','Ajuste','Estado','Tipo'];
    const csv = [headers.join(';')].concat(rows.map(r => [
      r.corte, r.informe.trim(), r.bodega, r.cedi,
      r.saldoCorteUA, r.entradas, r.salidas, r.saldoTeorico, r.conteoFisico, r.diferencias, r.saldoSistema, r.ajuste, r._estado, r._tipo
    ].join(';'))).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Conciliacion_Tinas_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ---------- meta ----------
  document.getElementById('meta-last').textContent = META.ultimaActualizacion || '—';
  document.getElementById('meta-rows').textContent = (META.totalFilas || DATA.length) + ' filas';
  document.getElementById('meta-rows-pill').textContent = `· ${META.totalFilas || DATA.length} registros`;

  // ---------- render principal ----------
  function render(){
    const rows = applyFilters(DATA);
    document.getElementById('rs-rows').textContent = fmt(rows.length);
    renderChips();
    renderKPIs(rows);
    buildNarrative(rows);
    renderAlerts(rows);
    renderComparativo(rows);
    renderTrend(rows);
    renderCediBars(rows);
    renderHeatmap(rows);
    renderFindings(rows);
    renderPlan(rows);
    renderDiag(rows);
    renderDetail(rows);
  }

  render();

  // Active state for sidebar nav based on scroll
  const navLinks = document.querySelectorAll('.nav-item');
  window.addEventListener('scroll', () => {
    const y = window.scrollY + 120;
    let active = null;
    document.querySelectorAll('section[id]').forEach(s => {
      if (s.offsetTop <= y) active = s.id;
    });
    if (active) {
      navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + active));
    }
  }, { passive: true });

})();
