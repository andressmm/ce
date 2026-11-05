(() => {
  'use strict';

  // ---------- Configuración ----------
  const API_URL = 'https://cronomet.com.ar/ce/php/getevt.php';   // si está en otro dominio: 'https://tudominio.com/getevt.php'
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
  const dialog = $('eventDialog');

  function drawEvents() {
    const sport = $('filterSport').value;
    const region = $('filterRegion').value;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const found = events.filter(x =>
      (MOSTRAR_PASADOS || x.time >= hoy.getTime()) &&
      (!sport || x.sport === sport) &&
      (!region || x.region === region)
    );

    grid.replaceChildren();
    if (!found.length) {
      grid.innerHTML = '<div class="empty-events">No hay eventos con esos filtros. Probá otra búsqueda.</div>';
      return;
    }

    for (const x of found) {
      const card = document.createElement('article');
      card.className = 'event-card';
      card.innerHTML = `
        <div class="event-art ${esc(x.art)}">
          <div class="date-tag"><strong>${x.day}</strong><span>${x.month}</span></div>
          <b>${esc(x.sport)}</b>
        </div>
        <div class="event-content">
          <h3>${esc(x.title)}</h3>
          <div class="event-meta">${icon('pin')} ${esc(x.location)}</div>
          <div class="distances">${esc(x.dist)}</div>
          <div class="event-bottom">
            <span>Ver ficha del evento</span>
            <button type="button" aria-label="Ver información de ${esc(x.title)}">${icon('arrow')}</button>
          </div>
        </div>`;
      card.querySelector('button').addEventListener('click', () => showEvent(x));
      grid.append(card);
    }
  }

  async function loadEvents() {
    grid.innerHTML = '<div class="empty-events">Cargando eventos…</div>';
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
      drawEvents();
    } catch (err) {
      console.error('Error al cargar eventos:', err);
      grid.innerHTML = '<div class="empty-events">No pudimos cargar los eventos. Intentá nuevamente más tarde.</div>';
    }
  }

  ['filterSport', 'filterRegion'].forEach(id => $(id).addEventListener('input', drawEvents));
  loadEvents();

  // ---------- Modal de ficha ----------
  function showEvent(x) {
    $('modalTitle').textContent = x.title;

    const resumen = `${x.date} · ${x.location} · ${x.sport} · ${x.dist}`;
    const links = [
      x.inscripcion && `<a href="${esc(x.inscripcion)}" target="_blank" rel="noopener noreferrer">Inscripción</a>`,
      x.ig && `<a href="${esc(x.ig)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
    ].filter(Boolean).join(' · ');

    $('modalInfo').innerHTML =
      `<span>${esc(resumen)}</span>` +
      (x.info ? `<br><br>${esc(x.info)}` : '') +
      (links ? `<br><br>${links}` : '');

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