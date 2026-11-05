(() => {
  'use strict';

  // ---------- Configuración ----------
  const API_URL = 'https://www.cronomet.com.ar/ce/php/getevt.php';   // si está en otro dominio: 'https://tudominio.com/getevt.php'
  const MOSTRAR_PASADOS = false;  // true = mostrar también eventos ya realizados
  const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const fechaLarga = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Deporte (de la base) -> clase CSS de la ilustración
  const ARTES = {
    'mtb': 'mtb',
    'running': 'running',
    'trail': 'trail',
    'aguas abiertas': 'water'
  };

  let events = [];

  // ---------- Utilidades ----------
  const $ = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Acepta URL completa, "instagram.com/..." o "@usuario"
  function normalizarUrl(valor, tipo) {
    const v = String(valor ?? '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (tipo === 'ig') return 'https://instagram.com/' + v.replace(/^@/, '').replace(/^\/+/, '');
    if (/^[\w.-]+\.[a-z]{2,}/i.test(v)) return 'https://' + v;
    return '';
  }

  // Convierte una fila de la tabla `ce` al formato que usa la interfaz
  function mapEvento(row) {
    const d = new Date(`${row.fecha}T12:00:00`);
    if (isNaN(d)) return null; // fecha inválida o vacía
    const sport = (row.deporte || '').trim();
    const ciudad = (row.ciudad || '').trim();
    const region = (row.region || '').trim();
    return {
      id: row.id,
      title: row.evento || 'Sin título',
      sport,
      region,
      location: [ciudad, region].filter(Boolean).join(', '),
      dist: row.distancia || '',
      ig: normalizarUrl(row.ig, 'ig'),
      inscripcion: normalizarUrl(row.inscripcion, 'web'),
      info: row.info || '',
      art: ARTES[sport.toLowerCase()] || 'running',
      date: fechaLarga.format(d),
      day: String(d.getDate()).padStart(2, '0'),
      month: MESES[d.getMonth()],
      year: d.getFullYear(),
      dateShort: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      time: d.getTime()
    };
  }

  // Rellena un <select> con los valores existentes en la base (conserva la 1.ª opción "Todos")
  function fillSelect(id, values) {
    const sel = $(id);
    if (!sel) return;
    const actual = sel.value;
    const primera = sel.options[0];
    sel.replaceChildren(primera);
    [...new Set(values.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .forEach(v => sel.add(new Option(v, v)));
    sel.value = actual;
  }

  // ---------- Agenda ----------
  const grid = $('eventGrid');
  const listWrap = $('eventList');
  const listBody = $('eventListBody');
  const dialog = $('eventDialog');

  // Vista elegida (tarjetas / listado). Se recuerda en el navegador.
  const VISTA_KEY = 'ce_vista_agenda';
  let vista = 'cards';
  let cargado = false;
  try { if (localStorage.getItem(VISTA_KEY) === 'list') vista = 'list'; } catch { /* sin almacenamiento */ }

  function marcarVista() {
    document.querySelectorAll('.view-toggle button').forEach(b => {
      const activo = b.dataset.view === vista;
      b.classList.toggle('active', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
  }

  function setVista(v) {
    vista = v === 'list' ? 'list' : 'cards';
    try { localStorage.setItem(VISTA_KEY, vista); } catch { /* sin almacenamiento */ }
    marcarVista();
    if (cargado) drawEvents();
  }

  // Mensajes (cargando, error, sin resultados): se muestran siempre en el contenedor de tarjetas
  function showMessage(texto) {
    listWrap.hidden = true;
    grid.hidden = false;
    grid.innerHTML = `<div class="empty-events">${texto}</div>`;
  }

  function drawEvents() {
    const sport = $('filterSport').value;
    const region = $('filterRegion').value;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const found = events.filter(x =>
      (MOSTRAR_PASADOS || x.time >= hoy.getTime()) &&
      (!sport || x.sport === sport) &&
      (!region || x.region === region)
    );

    if (!found.length) {
      showMessage('No hay eventos con esos filtros. Probá otra búsqueda.');
      return;
    }
    if (vista === 'list') drawList(found, hoy.getTime());
    else drawCards(found);
  }

  // ----- Vista de tarjetas -----
  function drawCards(found) {
    listWrap.hidden = true;
    grid.hidden = false;
    grid.replaceChildren();

    for (const x of found) {
      const card = document.createElement('article');
      card.className = 'event-card';
      card.innerHTML = `
        <div class="event-art ${esc(x.art)}">
          <div class="date-tag"><strong>${x.day}</strong><span>${x.month} ${x.year}</span></div>
          <b>${esc(x.sport)}</b>
        </div>
        <div class="event-content">
          <h3>${esc(x.title)}</h3>
          <div class="event-meta">${icon('pin')} ${esc(x.location)}</div>
          <div class="distances">${esc(x.dist)}</div>
          <button type="button" class="event-bottom" aria-label="Ver ficha de ${esc(x.title)}">
            <span>Ver ficha del evento</span>${icon('arrow')}
          </button>
        </div>`;
      card.querySelector('.event-bottom').addEventListener('click', () => showEvent(x));
      grid.append(card);
    }
  }

  // ----- Vista de listado (tabla) -----
  function drawList(found, hoyMs) {
    grid.hidden = true;
    grid.replaceChildren();
    listWrap.hidden = false;
    listBody.replaceChildren(...found.map(x => listRow(x, hoyMs)));
  }

  function listRow(x, hoyMs) {
    const pasado = x.time < hoyMs;
    const links = [
      x.inscripcion && `<a href="${esc(x.inscripcion)}" target="_blank" rel="noopener noreferrer">Inscripción</a>`,
      x.ig && `<a href="${esc(x.ig)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
    ].filter(Boolean).join(' · ');

    const tr = document.createElement('tr');
    if (pasado) tr.className = 'is-past';
    tr.innerHTML =
      `<td class="c-date"><strong>${esc(x.dateShort)}</strong>${pasado ? '<span class="badge-past">Finalizado</span>' : ''}</td>` +
      `<td class="c-name"><div class="l-title">${esc(x.title)}</div>${links ? `<div class="l-links">${links}</div>` : ''}</td>` +
      `<td class="c-sport">${x.sport ? `<span class="chip">${esc(x.sport)}</span>` : ''}</td>` +
      `<td class="c-loc">${esc(x.location)}</td>` +
      `<td class="c-dist">${esc(x.dist)}</td>` +
      `<td class="c-act"><button type="button" class="list-view-btn" aria-label="Ver ficha de ${esc(x.title)}"><span>Ver ficha</span>${icon('arrow')}</button></td>`;

    tr.querySelector('.list-view-btn').addEventListener('click', () => showEvent(x));
    // Click en cualquier parte de la fila (menos en los links) abre la ficha
    tr.addEventListener('click', e => { if (!e.target.closest('a, button')) showEvent(x); });
    return tr;
  }

  async function loadEvents() {
    showMessage('Cargando eventos…');
    try {
      const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error('Respuesta no exitosa');

      events = json.data
        .map(mapEvento)
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);

      fillSelect('filterSport', events.map(e => e.sport));
      fillSelect('filterRegion', events.map(e => e.region));
      cargado = true;
      drawEvents();
    } catch (err) {
      console.error('Error al cargar eventos:', err);
      showMessage('No pudimos cargar los eventos. Intentá nuevamente más tarde.');
    }
  }

  ['filterSport', 'filterRegion'].forEach(id => $(id).addEventListener('input', drawEvents));
  document.querySelectorAll('.view-toggle button').forEach(b => b.addEventListener('click', () => setVista(b.dataset.view)));
  marcarVista();
  loadEvents();

  // ---------- Modal de ficha ----------
  function showEvent(x) {
    $('modalTitle').textContent = x.title;
    $('modalInfo').textContent = [x.date, x.location, x.sport, x.dist].filter(Boolean).join(' · ');

    // Links (solo se muestra el bloque si hay al menos uno)
    const links = [
      x.inscripcion && { label: 'Inscripción', url: x.inscripcion },
      x.ig && { label: 'Instagram', url: x.ig }
    ].filter(Boolean);
    $('modalLinksBox').hidden = !links.length;
    $('modalLinks').innerHTML = links
      .map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a></li>`)
      .join('');

    // Información adicional (columna `info`)
    const info = (x.info || '').trim();
    const extra = $('modalExtra');
    extra.textContent = info || 'No hay información adicional.';
    extra.classList.toggle('is-empty', !info);

    dialog.showModal();
  }
  $('modalClose').onclick = () => dialog.close();
  $('modalOk').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  // ---------- Modal de contacto ----------
  const contactDialog = $('contactDialog');
  $('contactBtn').onclick = () => contactDialog.showModal();
  $('proposalBtn').onclick = () => contactDialog.showModal();
  $('contactClose').onclick = () => contactDialog.close();
  contactDialog.addEventListener('click', e => { if (e.target === contactDialog) contactDialog.close(); });

  // ---------- Menú móvil ----------
  const toggle = $('mobileToggle');
  const links = $('navLinks');
  const setMenu = open => {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };
  toggle.onclick = () => setMenu(!links.classList.contains('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
})();