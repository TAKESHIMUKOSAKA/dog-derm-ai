// Dog Derm AI v0.7 — clickable Disease Library + printable owner A4 handouts
(() => {
  let library=[];
  const $id=id=>document.getElementById(id);
  const escText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalise(s){return String(s||'').toLowerCase().replace(/[（）()\[\]・,，]/g,' ').replace(/\s+/g,' ').trim()}
  function matchDisease(name){
    const n=normalise(name);
    return library.find(d=>(d.aliases||[]).some(a=>n.includes(normalise(a))));
  }
  function listHtml(xs){return `<ul>${(xs||[]).map(x=>`<li>${escText(x)}</li>`).join('')}</ul>`}

  function ensureModal(){
    if($id('diseaseModal')) return;
    const modal=document.createElement('div'); modal.id='diseaseModal'; modal.className='disease-modal hidden';
    modal.innerHTML=`<div class="disease-sheet" role="dialog" aria-modal="true" aria-labelledby="diseaseTitle"><div id="diseaseModalContent"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeDisease()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDisease()});
  }
  function closeDisease(){$id('diseaseModal')?.classList.add('hidden')}

  function openOwnerPdf(url){window.open(url,'_blank','noopener')}
  function printOwnerPdf(url){
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)) { openOwnerPdf(url); return; }
    let frame=$id('ownerPdfPrintFrame'); if(frame)frame.remove();
    frame=document.createElement('iframe'); frame.id='ownerPdfPrintFrame'; frame.className='owner-pdf-frame'; frame.src=url;
    frame.onload=()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(_){openOwnerPdf(url)}};
    document.body.appendChild(frame);
  }

  function openDisease(d){
    ensureModal();
    const treatments=(d.treatments||[]).map(t=>`<div class="disease-treatment"><b>${escText(t.title)}</b><p>${escText(t.detail)}</p><span class="disease-source">${escText(t.source||'')}</span></div>`).join('');
    const drugs=(d.drug_examples||[]).length?`<div class="disease-card disease-drugs"><h3>登録済み用量例</h3>${listHtml(d.drug_examples)}<p class="disease-note">数値はDog Derm AIの登録済みDrug Databaseに基づく項目のみ表示。患者背景・添付文書・併用薬を確認して最終決定してください。</p></div>`:'';
    const refs=(d.evidence||[]).map(r=>`<a href="${escText(r.url)}" target="_blank" rel="noreferrer">${escText(r.id)} · ${escText(r.citation)}</a>`).join('');
    $id('diseaseModalContent').innerHTML=`
      <div class="disease-head"><div class="disease-head-main"><div class="disease-kicker">DOG DERM AI · DISEASE LIBRARY</div><h2 id="diseaseTitle">${escText(d.name)}</h2><p>${escText(d.english||'')}</p></div><button id="diseaseClose" class="disease-close" aria-label="閉じる">×</button></div>
      <div class="disease-body">
        <div class="disease-summary">${escText(d.summary)}</div>
        <div class="disease-grid">
          <div class="disease-card"><h3>診断・確認ポイント</h3>${listHtml(d.diagnosis)}</div>
          <div class="disease-card disease-duration"><h3>一般的な治療期間</h3><p>${escText(d.duration)}</p></div>
          <div class="disease-card full"><h3>治療の基本</h3>${treatments}</div>
          ${drugs}
          <div class="disease-card"><h3>再評価</h3>${listHtml(d.reassessment)}</div>
          <div class="disease-card"><h3>見落としやすい点</h3>${listHtml(d.pitfalls)}</div>
          <div class="disease-card full disease-owner"><h3>飼い主さま向け A4説明資料</h3><p>診察室でそのまま見せる・印刷するための1枚資料です。薬の細かな用量は載せず、病気・治療期間・自宅での注意点を説明します。</p><div class="disease-actions"><button id="ownerOpenBtn" class="disease-action primary">A4資料を開く</button><button id="ownerPrintBtn" class="disease-action secondary">印刷</button></div></div>
          <div class="disease-card full disease-evidence"><h3>Evidence</h3>${refs}</div>
        </div>
        <p class="disease-note">このDisease Libraryは獣医師向け臨床意思決定支援です。個々の患者の身体検査・検査結果・併存疾患を踏まえて治療を調整してください。</p>
      </div>`;
    $id('diseaseClose').onclick=closeDisease;
    $id('ownerOpenBtn').onclick=()=>openOwnerPdf(d.owner_pdf);
    $id('ownerPrintBtn').onclick=()=>printOwnerPdf(d.owner_pdf);
    $id('diseaseModal').classList.remove('hidden');
  }

  function decorateDifferentials(){
    document.querySelectorAll('#results .diff-title b').forEach(el=>{
      if(el.dataset.diseaseReady==='1') return;
      const d=matchDisease(el.textContent);
      el.dataset.diseaseReady='1';
      if(!d){
        const s=document.createElement('span');s.className='disease-unavailable';s.textContent='Disease Library準備中';el.after(s);return;
      }
      el.classList.add('disease-link'); el.setAttribute('role','button'); el.tabIndex=0; el.title=`${d.name}の治療ガイドを開く`;
      el.addEventListener('click',()=>openDisease(d));
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDisease(d)}});
      const s=document.createElement('span');s.className='disease-available';s.textContent='治療・A4資料';el.after(s);
    });
  }

  async function init(){
    try{
      const r=await fetch('/static/disease-library-v1.json',{cache:'no-store'}); if(!r.ok)throw new Error(); library=await r.json();
      ensureModal(); decorateDifferentials();
      const results=$id('results'); if(results)new MutationObserver(()=>decorateDifferentials()).observe(results,{childList:true,subtree:true});
      const v=$id('appVersion'); if(v){v.textContent='v0.7.0'; new MutationObserver(()=>{if(v.textContent!=='v0.7.0')v.textContent='v0.7.0'}).observe(v,{childList:true,subtree:true});}
    }catch(e){console.error('Disease Library load failed',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
