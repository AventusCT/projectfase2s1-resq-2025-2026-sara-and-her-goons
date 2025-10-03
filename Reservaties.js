    // ---------------------- Config ----------------------
    const OPENING_START = "08:00";
    const OPENING_END   = "18:00";
    const POLICY_LOCK_MIN_BEFORE_START = 60; // minuten

    const PRODUCTS = [
      { id: "cam1", name: "Camera A", type: "Apparaat" },
      { id: "cam2", name: "Camera B", type: "Apparaat" },
      { id: "mic1", name: "Microfoon set", type: "Audio" },
      { id: "lap1", name: "Laptop 13\"", type: "IT" },
      { id: "room1", name: "Vergaderruimte 1", type: "Ruimte" },
      { id: "room2", name: "Studio", type: "Ruimte" },
    ];

    // ---------------------- Helpers ----------------------
    const $ = sel => document.querySelector(sel);
    const $$ = sel => Array.from(document.querySelectorAll(sel));

    const storageKey = 'epic3-reservations-v1';
    function getReservations(){
      try{ return JSON.parse(localStorage.getItem(storageKey)||'[]'); }catch{ return [] }
    }
    function saveReservations(list){ localStorage.setItem(storageKey, JSON.stringify(list)); }

    function timeToMinutes(t){ const [h,m] = t.split(':').map(Number); return h*60+m; }
    function withinOpening(start, end){
      return timeToMinutes(start) >= timeToMinutes(OPENING_START)
        && timeToMinutes(end)   <= timeToMinutes(OPENING_END)
        && timeToMinutes(end)   >  timeToMinutes(start);
    }
    function sameDay(a,b){ return a === b; }
    function overlaps(a, b){
      if(a.item!==b.item) return false;
      if(!sameDay(a.date, b.date)) return false;
      const s1=timeToMinutes(a.start), e1=timeToMinutes(a.end);
      const s2=timeToMinutes(b.start), e2=timeToMinutes(b.end);
      return (s1 < e2) && (s2 < e1); // strikt overlap
    }
    function isLocked(res){
      const now = new Date();
      const [y,mo,d] = res.date.split('-').map(Number);
      const [sh,sm] = res.start.split(':').map(Number);
      const startDate = new Date(y, (mo-1), d, sh, sm, 0);
      const diffMin = Math.floor((startDate - now)/60000);
      return diffMin < POLICY_LOCK_MIN_BEFORE_START; // niet wijzigbaar/annuleerbaar
    }

    function toast({title, body, type='success'}){
      const t = document.createElement('div');
      t.className = `alert ${type}`;
      t.innerHTML = `<strong>${title}</strong><br/><small>${body||''}</small>`;
      $('#toast').appendChild(t);
      setTimeout(()=>{ t.remove(); }, 4200);
    }

    function formatDate(d){ return new Date(d+"T00:00:00").toLocaleDateString('nl-NL'); }

    // ---------------------- Init UI ----------------------
    function renderProducts(){
      const cont = $('#products');
      cont.innerHTML = '';
      PRODUCTS.forEach(p=>{
        const el = document.createElement('div');
        el.className = 'product';
        el.innerHTML = `<h4>${p.name}</h4>
          <div class="hint">Type: ${p.type}</div>
          <div style="margin-top:10px"><span class="badge">ID: ${p.id}</span></div>`;
        cont.appendChild(el);
      });

      // item select
      const select = $('#item');
      select.innerHTML = '<option value="">Selecteer een item…</option>' + PRODUCTS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    }

    function renderTables(){
      const name = $('#employee').value.trim();
      const filterDate = $('#filterDate').value || null;
      const all = getReservations().sort((a,b)=> (a.date+b.start).localeCompare(b.date+b.start));

      const my = all.filter(r=> r.employee.toLowerCase() === name.toLowerCase());
      const myBody = $('#myTable tbody');
      myBody.innerHTML = my.filter(r=> !filterDate || r.date===filterDate).map(rowHtml).join('') || emptyRow(6);

      const adminOn = $('#adminToggle').checked;
      $('#adminBlock').style.display = adminOn ? 'block' : 'none';
      if(adminOn){
        const allBody = $('#allTable tbody');
        allBody.innerHTML = all.filter(r=> !filterDate || r.date===filterDate).map(rowHtmlAdmin).join('') || emptyRow(7);
      }
    }

    function emptyRow(cols){ return `<tr><td colspan="${cols}" class="hint">Geen reserveringen gevonden…</td></tr>` }

    function rowHtml(r){
      const lock = isLocked(r);
      const actions = lock
        ? `<button class="ghost" disabled title="Binnen 1u — vergrendeld">🔒</button>`
        : `<button data-act="edit" data-id="${r.id}" class="secondary">Wijzig</button>
           <button data-act="cancel" data-id="${r.id}" class="danger">Annuleer</button>`;
      return `<tr>
        <td>${productName(r.item)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${r.start}</td>
        <td>${r.end}</td>
        <td>${lock? '🔒 Vergrendeld' : 'Actief'}</td>
        <td>${actions}</td>
      </tr>`;
    }

    function rowHtmlAdmin(r){
      const lock = isLocked(r);
      const actions = `<button data-act="edit" data-id="${r.id}" class="secondary" ${lock? 'disabled':''}>Wijzig</button>
                       <button data-act="cancel-any" data-id="${r.id}" class="danger">Verwijder</button>`;
      return `<tr>
        <td>${r.employee}</td>
        <td>${productName(r.item)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${r.start}</td>
        <td>${r.end}</td>
        <td>${lock? '🔒 Vergrendeld' : 'Actief'}</td>
        <td>${actions}</td>
      </tr>`;
    }

    function productName(id){ return (PRODUCTS.find(p=>p.id===id)||{}).name || id }

    // ---------------------- CRUD ----------------------
    let editingId = null;

    function createReservation(){
      const employee = $('#employee').value.trim();
      const item = $('#item').value;
      const date = $('#date').value;
      const start = $('#start').value;
      const end = $('#end').value;

      if(!employee) return toast({title:'Naam verplicht', body:'Vul je naam in om te reserveren.', type:'danger'});
      if(!item || !date || !start || !end) return toast({title:'Onvolledig formulier', body:'Kies item, datum en tijden.', type:'danger'});
      if(!withinOpening(start,end)) return toast({title:'Buiten openingstijden', body:`Tijden moeten tussen ${OPENING_START} en ${OPENING_END} liggen en logisch zijn.`, type:'danger'});

      const all = getReservations();
      const candidate = { id: crypto.randomUUID(), employee, item, date, start, end };

      // Overlap-check
      const conflict = all.some(r=> overlaps(r, candidate));
      if(conflict) return toast({title:'Conflict gedetecteerd', body:'Er bestaat al een reservering die overlapt.', type:'danger'});

      all.push(candidate); saveReservations(all); renderTables();
      toast({title:'Reservering bevestigd', body:`${productName(item)} op ${formatDate(date)} ${start}–${end}`});
      clearForm();
    }

    function startEdit(id){
      const all = getReservations();
      const r = all.find(x=>x.id===id); if(!r) return;
      editingId = id;
      $('#item').value = r.item;
      $('#date').value = r.date;
      $('#start').value = r.start;
      $('#end').value = r.end;
      $('#createBtn').style.display = 'none';
      $('#updateBtn').style.display = 'inline-block';
      $('#cancelEditBtn').style.display = 'inline-block';
      window.scrollTo({ top: 0, behavior:'smooth'});
    }

    function updateReservation(){
      if(!editingId) return;
      const all = getReservations();
      const idx = all.findIndex(x=>x.id===editingId);
      if(idx<0) return;

      const employee = all[idx].employee; // medewerker blijft gelijk
      const item = $('#item').value, date=$('#date').value, start=$('#start').value, end=$('#end').value;
      if(!item || !date || !start || !end) return toast({title:'Onvolledig', body:'Vul alle velden in.', type:'danger'});
      if(!withinOpening(start,end)) return toast({title:'Buiten openingstijden', body:`Tijden moeten tussen ${OPENING_START} en ${OPENING_END} liggen.`, type:'danger'});

      const candidate = { id: editingId, employee, item, date, start, end };
      const conflict = getReservations().some(r=> r.id!==editingId && overlaps(r, candidate));
      if(conflict) return toast({title:'Conflict gedetecteerd', body:'Overlap met bestaande reservering.', type:'danger'});

      // beleidsregel: wijzigen toegestaan tot 1u voor start
      if(isLocked(all[idx])){ return toast({title:'Wijzigen geblokkeerd', body:'Binnen 1 uur voor start.', type:'danger'}); }

      all[idx] = candidate; saveReservations(all);
      editingId=null; renderTables(); clearForm();
      toast({title:'Wijziging opgeslagen', body:`${productName(item)} op ${formatDate(date)} ${start}–${end}`});
    }

    function cancelReservation(id, any=false){
      const all = getReservations();
      const idx = all.findIndex(x=>x.id===id); if(idx<0) return;

      if(!any && isLocked(all[idx])){ return toast({title:'Annuleren geblokkeerd', body:'Binnen 1 uur voor start.', type:'danger'}); }

      const removed = all.splice(idx,1)[0]; saveReservations(all); renderTables();
      toast({title:'Reservering geannuleerd', body:`${productName(removed.item)} • ${formatDate(removed.date)} ${removed.start}–${removed.end}`});
    }

    function clearForm(){
      $('#item').value=''; $('#date').value=''; $('#start').value=''; $('#end').value='';
      $('#createBtn').style.display = 'inline-block';
      $('#updateBtn').style.display = 'none';
      $('#cancelEditBtn').style.display = 'none';
    }

    // ---------------------- Events ----------------------
    $('#createBtn').addEventListener('click', createReservation);
    $('#updateBtn').addEventListener('click', updateReservation);
    $('#cancelEditBtn').addEventListener('click', ()=>{ editingId=null; clearForm(); });
    $('#resetBtn').addEventListener('click', clearForm);
    $('#employee').addEventListener('input', renderTables);
    $('#adminToggle').addEventListener('change', renderTables);
    $('#filterDate').addEventListener('change', renderTables);
    $('#clearFilter').addEventListener('click', ()=>{ $('#filterDate').value=''; renderTables(); });

    // event delegation voor actieknoppen
    $('#myTable').addEventListener('click', (e)=>{
      const btn = e.target.closest('button'); if(!btn) return;
      const id = btn.getAttribute('data-id');
      if(btn.dataset.act==='edit') startEdit(id);
      if(btn.dataset.act==='cancel') cancelReservation(id,false);
    });
    $('#allTable').addEventListener('click', (e)=>{
      const btn = e.target.closest('button'); if(!btn) return;
      const id = btn.getAttribute('data-id');
      if(btn.dataset.act==='edit') startEdit(id);
      if(btn.dataset.act==='cancel-any') cancelReservation(id,true);
    });

    // ---------------------- Boot ----------------------
    (function boot(){
      renderProducts();
      // prefills
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth()+1).padStart(2,'0');
      const dd = String(today.getDate()).padStart(2,'0');
      $('#date').value = `${yyyy}-${mm}-${dd}`;
      $('#filterDate').value = '';
      $('#start').value = '09:00';
      $('#end').value = '10:00';
      renderTables();
    })();