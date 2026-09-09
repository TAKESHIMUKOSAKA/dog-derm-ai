// Dog Derm AI v0.5 — device-local longitudinal case manager
(() => {
  const DB_NAME = 'dog-derm-ai-cases';
  const DB_VERSION = 1;
  const STORE = 'cases';
  let activeCaseId = null;
  let activeCaseCache = null;
  let showingCases = false;

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `case-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const nowIso = () => new Date().toISOString();
  const fmtDate = iso => {
    try { return new Date(iso).toLocaleString('ja-JP', {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
    catch (_) { return iso || ''; }
  };

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function dbPut(record){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete=()=>{db.close();resolve(record)};
      tx.onerror=()=>{db.close();reject(tx.error)};
    });
  }
  async function dbGet(id){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
      req.onsuccess=()=>{const v=req.result;db.close();resolve(v)};
      req.onerror=()=>{db.close();reject(req.error)};
    });
  }
  async function dbAll(){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      req.onsuccess=()=>{const v=req.result||[];db.close();resolve(v)};
      req.onerror=()=>{db.close();reject(req.error)};
    });
  }
  async function dbRemove(id){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete=()=>{db.close();resolve()};
      tx.onerror=()=>{db.close();reject(tx.error)};
    });
  }

  const patientToForm = {
    breed:'breed', age:'age', onset_age:'onset_age', sex:'sex', duration:'duration', course:'course', pruritus:'pruritus', pvas:'pvas',
    itch_vs_lesion_order:'itch_order', seasonality:'seasonality', ectoparasite_prevention:'prevention', distribution:'distribution',
    vet_lesion:'vet_lesion', treatment_history:'treatment_history', contagion:'contagion', gastrointestinal_signs:'gi', diet_history:'diet', systemic_or_other:'systemic'
  };

  function setForm(p={}){
    Object.entries(patientToForm).forEach(([key,id])=>{
      const el=$(id); if(!el) return;
      const value=(p[key]??'').toString();
      if(el.tagName==='SELECT' && !Array.from(el.options).some(o=>o.value===value)) el.value='';
      else el.value=value;
      el.classList.remove('auto-filled');
    });
    if($('quick_note')) $('quick_note').value='';
    if($('followup_note')) $('followup_note').value='';
  }

  function clearWorkspace(){
    setForm({});
    files=[]; chartFiles=[]; lastResult=null;
    renderPreviews(); renderChartPreviews();
    if($('imageStatus')) $('imageStatus').textContent='最大6枚。iPhoneでは送信前にJPEG化・縮小して通信量を抑えます。';
    if($('chartStatus')) $('chartStatus').textContent='未追加。手入力だけでも解析できます。';
    if($('chartSummary')) { $('chartSummary').textContent=''; $('chartSummary').classList.add('hidden'); }
    if($('results')) { $('results').innerHTML=''; $('results').classList.add('hidden'); }
  }

  function defaultTitle(){
    const p=basePatient();
    const bits=[p.breed,p.age].filter(Boolean).join(' · ');
    return bits || `犬症例 ${new Date().toLocaleDateString('ja-JP')}`;
  }

  function objectiveHistory(record){
    if(!record) return '';
    const updates=(record.timeline||[])
      .filter(e=>e.update_note)
      .map(e=>`${fmtDate(e.created_at)}: ${e.update_note}`);
    if(record.final_diagnosis) updates.push(`担当獣医師が登録した最終診断: ${record.final_diagnosis}`);
    return updates.join('\n');
  }

  // Extend the existing patient payload without changing the original UI logic.
  const basePatient = patient;
  patient = function(){
    const p=basePatient();
    const update=($('followup_note')?.value||'').trim();
    const history=objectiveHistory(activeCaseCache);
    if(history) p.longitudinal_case_history = `過去の追加検査・経過（客観情報として扱う）:\n${history}`;
    if(update){
      p.new_case_update = update;
      p.systemic_or_other = [p.systemic_or_other, `【今回の追加検査・経過】${update}`].filter(Boolean).join('\n');
    }
    return p;
  };

  function topDiff(result){
    return (result?.differentials||[]).slice(0,3).map(x=>`${x.rank}. ${x.disease}`).join(' / ');
  }
  function compareRanks(prevResult, currentResult){
    if(!prevResult || !currentResult) return [];
    const prev=new Map((prevResult.differentials||[]).map(x=>[x.disease,x.rank]));
    return (currentResult.differentials||[]).slice(0,5).map(x=>{
      const old=prev.get(x.disease);
      if(old==null) return `NEW ${x.rank}位：${x.disease}`;
      if(old>x.rank) return `↑ ${old}→${x.rank}位：${x.disease}`;
      if(old<x.rank) return `↓ ${old}→${x.rank}位：${x.disease}`;
      return `→ ${x.rank}位：${x.disease}`;
    });
  }

  async function ensureActiveCase(){
    if(activeCaseId && activeCaseCache) return activeCaseCache;
    const record={
      id:uid(), title:defaultTitle(), created_at:nowIso(), updated_at:nowIso(), final_diagnosis:'',
      patient:basePatient(), lesion_files:[...files], chart_files:[...chartFiles], timeline:[]
    };
    activeCaseId=record.id; activeCaseCache=record;
    await dbPut(record);
    return record;
  }

  async function saveCurrentCase(showMessage=true){
    const record=await ensureActiveCase();
    const title=($('caseTitle')?.value||'').trim();
    record.title=title || record.title || defaultTitle();
    record.final_diagnosis=($('finalDiagnosis')?.value||'').trim();
    record.patient=basePatient();
    record.lesion_files=[...files];
    record.chart_files=[...chartFiles];
    record.updated_at=nowIso();
    activeCaseCache=record;
    await dbPut(record);
    renderActiveCase();
    if(showMessage) setCaseNotice('保存しました。この端末から再開できます。','ok');
    return record;
  }

  async function recordAnalysis(result){
    const record=await ensureActiveCase();
    const previous=[...(record.timeline||[])].reverse().find(e=>e.type==='analysis' && e.result)?.result || null;
    const update=[($('quick_note')?.value||'').trim(),($('followup_note')?.value||'').trim()].filter(Boolean).join(' / ');
    const event={
      id:uid(), type:'analysis', created_at:nowIso(), update_note:update, patient:patient(), result,
      rank_changes:compareRanks(previous,result)
    };
    record.timeline=[...(record.timeline||[]),event];
    record.patient=basePatient();
    record.lesion_files=[...files];
    record.chart_files=[...chartFiles];
    record.updated_at=event.created_at;
    if(!record.title) record.title=defaultTitle();
    activeCaseCache=record;
    await dbPut(record);
    if($('followup_note')) $('followup_note').value='';
    renderActiveCase();
    setCaseNotice('解析結果を症例タイムラインへ自動保存しました。','ok');
  }

  const baseRenderResults = renderResults;
  renderResults = function(d){
    baseRenderResults(d);
    recordAnalysis(d).catch(e=>{
      console.error(e);
      setCaseNotice('解析結果は表示できましたが、症例保存に失敗しました。','error');
    });
  };

  function setCaseNotice(text,type=''){
    const el=$('caseNotice'); if(!el) return;
    el.textContent=text; el.className=`case-notice ${type}`;
  }

  function renderActiveCase(){
    const rec=activeCaseCache;
    const active=$('activeCaseTools');
    if(!rec){
      if(active) active.classList.add('hidden');
      $('activeCaseSummary').innerHTML='<b>新しい症例</b><span>解析するとこの端末に自動保存されます</span>';
      return;
    }
    if(active) active.classList.remove('hidden');
    $('activeCaseSummary').innerHTML=`<b>${esc(rec.title||'症例')}</b><span>最終更新 ${esc(fmtDate(rec.updated_at))} · 解析 ${(rec.timeline||[]).filter(e=>e.type==='analysis').length}回</span>`;
    if($('caseTitle')) $('caseTitle').value=rec.title||'';
    if($('finalDiagnosis')) $('finalDiagnosis').value=rec.final_diagnosis||'';
    renderTimeline(rec);
  }

  function renderTimeline(rec){
    const box=$('caseTimeline'); if(!box) return;
    const events=[...(rec.timeline||[])].reverse();
    if(!events.length){box.innerHTML='<p class="case-empty">まだ解析履歴はありません。</p>';return;}
    box.innerHTML=events.map((e,idx)=>{
      const changes=(e.rank_changes||[]).length?`<div class="rank-changes">${e.rank_changes.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'';
      return `<article class="timeline-event">
        <div class="timeline-dot"></div>
        <div class="timeline-body">
          <div class="timeline-head"><b>${esc(fmtDate(e.created_at))}</b><button class="timeline-view" data-event-id="${esc(e.id)}">この時点の結果</button></div>
          ${e.update_note?`<p><strong>追加情報：</strong>${esc(e.update_note)}</p>`:''}
          <p class="timeline-diff"><strong>上位鑑別：</strong>${esc(topDiff(e.result)||'—')}</p>
          ${changes}
        </div>
      </article>`;
    }).join('');
    box.querySelectorAll('.timeline-view').forEach(btn=>btn.addEventListener('click',()=>{
      const e=(rec.timeline||[]).find(x=>x.id===btn.dataset.eventId);
      if(e?.result) baseRenderResults(e.result);
    }));
  }

  async function renderSavedCases(){
    const list=$('savedCasesList'); if(!list) return;
    const cases=(await dbAll()).sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''));
    $('savedCaseCount').textContent=`${cases.length}症例`;
    if(!cases.length){list.innerHTML='<p class="case-empty">保存症例はまだありません。</p>';return;}
    list.innerHTML=cases.map(c=>{
      const latest=[...(c.timeline||[])].reverse().find(e=>e.result);
      return `<div class="saved-case-row">
        <button class="saved-case-open" data-case-id="${esc(c.id)}"><b>${esc(c.title||'症例')}</b><span>${esc(fmtDate(c.updated_at))}${latest?` · ${esc(topDiff(latest.result).split(' / ')[0])}`:''}</span></button>
        <button class="saved-case-delete" data-case-id="${esc(c.id)}" aria-label="削除">×</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.saved-case-open').forEach(btn=>btn.addEventListener('click',()=>loadCase(btn.dataset.caseId)));
    list.querySelectorAll('.saved-case-delete').forEach(btn=>btn.addEventListener('click',async()=>{
      if(!confirm('この保存症例をこの端末から削除しますか？')) return;
      await dbRemove(btn.dataset.caseId);
      if(activeCaseId===btn.dataset.caseId){activeCaseId=null;activeCaseCache=null;clearWorkspace();renderActiveCase();}
      await renderSavedCases();
    }));
  }

  async function loadCase(id){
    const rec=await dbGet(id); if(!rec) return;
    activeCaseId=rec.id; activeCaseCache=rec;
    setForm(rec.patient||{});
    files=[...(rec.lesion_files||[])];
    chartFiles=[...(rec.chart_files||[])];
    renderPreviews(); renderChartPreviews();
    if($('imageStatus')) $('imageStatus').textContent=files.length?`${files.length}/6枚 · 保存症例から復元`:'皮疹画像なし';
    if($('chartStatus')) $('chartStatus').textContent=chartFiles.length?`${chartFiles.length}枚 · 保存症例から復元`:'カルテ画像なし';
    renderActiveCase();
    showingCases=false; $('savedCasesPanel').classList.add('hidden');
    const latest=[...(rec.timeline||[])].reverse().find(e=>e.result);
    if(latest?.result) baseRenderResults(latest.result); else $('results').classList.add('hidden');
    setCaseNotice('保存症例を開きました。追加検査や経過を入力して再解析できます。','ok');
    document.querySelector('.case-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function startNewCase(){
    if(activeCaseCache && !confirm('新しい症例を開始しますか？現在の症例は保存済みです。')) return;
    activeCaseId=null; activeCaseCache=null; clearWorkspace(); renderActiveCase();
    setCaseNotice('新しい症例を開始しました。','');
  }

  // UI events
  $('saveCaseBtn')?.addEventListener('click',()=>saveCurrentCase().catch(e=>{console.error(e);setCaseNotice('保存に失敗しました。','error')}));
  $('newCaseBtn')?.addEventListener('click',startNewCase);
  $('showCasesBtn')?.addEventListener('click',async()=>{
    showingCases=!showingCases;
    $('savedCasesPanel').classList.toggle('hidden',!showingCases);
    if(showingCases) await renderSavedCases();
  });
  $('saveCaseMetaBtn')?.addEventListener('click',()=>saveCurrentCase().catch(e=>{console.error(e);setCaseNotice('保存に失敗しました。','error')}));

  // Keep the visible feature version aligned with this UI layer.
  const versionNode=$('appVersion');
  if(versionNode){
    const forceVersion=()=>{if(versionNode.textContent!=='v0.5.0') versionNode.textContent='v0.5.0'};
    forceVersion(); new MutationObserver(forceVersion).observe(versionNode,{childList:true,characterData:true,subtree:true});
  }

  renderActiveCase();
  renderSavedCases().catch(()=>{});
})();
