const $ = id => document.getElementById(id);
let files = [];
let chartFiles = [];
let appKey = sessionStorage.getItem('dogDermAppKey') || '';
let isProtected = false;
let lastResult = null;

function authHeaders(){ return appKey ? {'X-App-Key': appKey} : {}; }

async function health(){
  const r = await fetch('/api/health', {cache:'no-store'}); const h = await r.json();
  $('modePill').textContent = h.mode === 'openai' ? `AI接続 · ${h.model}` : 'DEMO MODE · APIキー未設定';
  $('evidenceCount').textContent = h.evidence_count;
  if($('drugCount')) $('drugCount').textContent = h.drug_count;
  if($('appVersion')) $('appVersion').textContent = `v${h.version}`;
  isProtected = !!h.protected;
  if(isProtected) await ensureAuth();
}

async function ensureAuth(){
  if(!appKey){ $('authOverlay').classList.remove('hidden'); return false; }
  try{
    const r = await fetch('/api/auth-check', {headers:authHeaders(), cache:'no-store'});
    if(!r.ok) throw new Error('auth');
    $('authOverlay').classList.add('hidden'); return true;
  }catch(_){
    appKey=''; sessionStorage.removeItem('dogDermAppKey'); $('authOverlay').classList.remove('hidden'); return false;
  }
}

$('loginBtn').addEventListener('click', async()=>{
  const candidate=$('accessKey').value;
  if(!candidate){$('loginError').textContent='アクセスキーを入力してください。';return;}
  appKey=candidate;
  try{
    const r=await fetch('/api/auth-check',{headers:authHeaders(),cache:'no-store'});
    if(!r.ok) throw new Error();
    sessionStorage.setItem('dogDermAppKey',appKey); $('loginError').textContent=''; $('authOverlay').classList.add('hidden');
  }catch(_){
    appKey=''; $('loginError').textContent='アクセスキーが正しくありません。';
  }
});
$('accessKey').addEventListener('keydown',e=>{if(e.key==='Enter')$('loginBtn').click()});
health().catch(()=>{$('modePill').textContent='接続エラー'});

if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
}
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
if(isIOS && !standalone && localStorage.getItem('hideInstallHint')!=='1') $('installHint').classList.remove('hidden');
$('dismissInstall').addEventListener('click',()=>{$('installHint').classList.add('hidden');localStorage.setItem('hideInstallHint','1')});

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('この画像形式を読み込めません'))};
    img.src=url;
  });
}

async function normalizeImage(file){
  try{
    const img=await loadImage(file);
    const maxSide=1800;
    let w=img.naturalWidth, h=img.naturalHeight;
    const scale=Math.min(1,maxSide/Math.max(w,h)); w=Math.round(w*scale); h=Math.round(h*scale);
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:false}); ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
    if(!blob) throw new Error('JPEG変換に失敗しました');
    const base=(file.name||'image').replace(/\.[^.]+$/,'');
    return new File([blob],`${base}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  }catch(e){
    const supported=['image/jpeg','image/png','image/webp','image/gif'];
    if(supported.includes(file.type)) return file;
    throw new Error(`${file.name || '画像'}をJPEGへ変換できませんでした。iPhoneのカメラで撮影し直すか、スクリーンショットを使用してください。`);
  }
}

async function addImages(selected){
  if(files.length>=6){alert('画像は最大6枚です。');return;}
  const incoming=Array.from(selected).slice(0,6-files.length);
  $('imageStatus').textContent='画像をiPhone送信用に準備しています…';
  try{
    for(const f of incoming) files.push(await normalizeImage(f));
    renderPreviews();
    const mb=(files.reduce((n,f)=>n+f.size,0)/1024/1024).toFixed(1);
    $('imageStatus').textContent=`${files.length}/6枚 · 送信サイズ合計 約${mb}MB · JPEG最適化済み`;
  }catch(e){alert(e.message);}
}

['cameraInput','libraryInput'].forEach(id=>$(id).addEventListener('change', async e=>{
  await addImages(e.target.files); e.target.value='';
}));

function renderPreviews(){
  $('previews').innerHTML='';
  files.forEach((f,i)=>{
    const d=document.createElement('div'); d.className='preview';
    const img=document.createElement('img'); img.src=URL.createObjectURL(f);
    const b=document.createElement('button'); b.textContent='×'; b.onclick=()=>{files.splice(i,1);renderPreviews();$('imageStatus').textContent=`${files.length}/6枚`};
    d.append(img,b); $('previews').append(d);
  });
}

async function addChartImages(selected){
  const incoming=Array.from(selected).slice(0,4);
  if(!incoming.length) return;
  $('chartStatus').textContent='カルテ画像を準備しています…';
  try{
    chartFiles=[];
    for(const f of incoming) chartFiles.push(await normalizeImage(f));
    renderChartPreviews();
    await extractChart();
  }catch(e){
    $('chartStatus').textContent='カルテ読取に失敗しました。手入力でも解析できます。';
    alert(e.message);
  }
}

['chartCameraInput','chartLibraryInput'].forEach(id=>$(id).addEventListener('change', async e=>{
  await addChartImages(e.target.files); e.target.value='';
}));

function renderChartPreviews(){
  $('chartPreviews').innerHTML='';
  chartFiles.forEach(f=>{
    const d=document.createElement('div'); d.className='preview chart-preview';
    const img=document.createElement('img'); img.src=URL.createObjectURL(f);
    d.append(img); $('chartPreviews').append(d);
  });
}

const chartFieldMap={
  breed:'breed', age:'age', onset_age:'onset_age', sex:'sex', duration:'duration', course:'course', pruritus:'pruritus', pvas:'pvas',
  itch_order:'itch_order', seasonality:'seasonality', prevention:'prevention', distribution:'distribution', vet_lesion:'vet_lesion',
  treatment_history:'treatment_history', contagion:'contagion', gi:'gi', diet:'diet', systemic:'systemic'
};
const fieldLabels={breed:'犬種',age:'年齢',onset_age:'発症年齢',sex:'性別',duration:'発症時期',course:'経過',pruritus:'痒み',pvas:'pVAS',itch_order:'痒みと皮疹の順序',seasonality:'季節性',prevention:'ノミ・マダニ予防',distribution:'分布',vet_lesion:'皮疹名',treatment_history:'治療歴',contagion:'同居動物/人の皮疹',gi:'消化器症状',diet:'食事歴',systemic:'全身症状・その他'};

function applyChartExtraction(data){
  let count=0;
  Object.entries(chartFieldMap).forEach(([key,id])=>{
    const value=(data[key]??'').toString().trim();
    if(!value) return;
    const el=$(id);
    if(el.tagName==='SELECT'){
      const ok=Array.from(el.options).some(o=>o.value===value || o.textContent===value);
      if(!ok) return;
    }
    el.value=value; el.classList.add('auto-filled'); count++;
  });
  const uncertain=data.uncertain_fields||[];
  $('chartStatus').textContent=`カルテから ${count}項目を自動入力しました${uncertain.length?` · 要確認 ${uncertain.length}項目`:''}`;
  const parts=[];
  if(data.summary) parts.push(data.summary);
  if(uncertain.length) parts.push(`不明・要確認：${uncertain.map(x=>fieldLabels[x]||x).join('、')}`);
  if((data.source_notes||[]).length) parts.push(`読取メモ：${data.source_notes.join(' / ')}`);
  $('chartSummary').textContent=parts.join('\n');
  $('chartSummary').classList.toggle('hidden',parts.length===0);
}

async function extractChart(){
  if(!chartFiles.length) return;
  if(isProtected && !(await ensureAuth())) return;
  $('chartReading').classList.remove('hidden');
  $('chartStatus').textContent='カルテをAIで読み取っています…';
  const fd=new FormData(); chartFiles.forEach(f=>fd.append('chart_images',f,f.name));
  try{
    const r=await fetch('/api/extract-chart',{method:'POST',body:fd,headers:authHeaders()});
    const data=await r.json();
    if(r.status===401){appKey='';sessionStorage.removeItem('dogDermAppKey');$('authOverlay').classList.remove('hidden');throw new Error('アクセスキーを再入力してください。');}
    if(!r.ok) throw new Error(data.detail||'カルテ読取エラー');
    applyChartExtraction(data);
  }finally{
    $('chartReading').classList.add('hidden');
  }
}

function val(id){return $(id).value.trim()}
function patient(){return {
  species:'dog', breed:val('breed'), age:val('age'), onset_age:val('onset_age'), sex:val('sex'), duration:val('duration'), course:val('course'),
  pruritus:val('pruritus'), pvas:val('pvas'), itch_vs_lesion_order:val('itch_order'), seasonality:val('seasonality'), ectoparasite_prevention:val('prevention'),
  distribution:val('distribution'), vet_lesion:val('vet_lesion'), treatment_history:val('treatment_history'), contagion:val('contagion'), gastrointestinal_signs:val('gi'),
  diet_history:val('diet'), systemic_or_other:val('systemic'), clinician_note:val('quick_note')
}}

$('analyzeBtn').addEventListener('click', async ()=>{
  if(files.length===0){alert('皮疹画像を1枚以上追加してください。');return}
  if(isProtected && !(await ensureAuth())) return;
  const btn=$('analyzeBtn'); btn.disabled=true; $('loading').classList.remove('hidden'); $('results').classList.add('hidden');
  const fd=new FormData(); fd.append('patient_json',JSON.stringify(patient())); files.forEach(f=>fd.append('images',f,f.name));
  try{
    const r=await fetch('/api/analyze',{method:'POST',body:fd,headers:authHeaders()}); const data=await r.json();
    if(r.status===401){appKey='';sessionStorage.removeItem('dogDermAppKey');$('authOverlay').classList.remove('hidden');throw new Error('アクセスキーを再入力してください。');}
    if(!r.ok) throw new Error(data.detail||'解析エラー'); renderResults(data);
  }catch(e){alert(e.message)}finally{btn.disabled=false;$('loading').classList.add('hidden')}
});

function esc(x=''){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function list(xs){return (xs||[]).length?`<ul>${xs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p class="disclaimer">なし / 情報不足</p>'}
function shareText(d){
  const diffs=(d.differentials||[]).map(x=>`${x.rank}. ${x.disease} [${x.likelihood}]`).join('\n');
  const tests=(d.recommended_tests||[]).map(x=>`・${x.test}: ${x.why}`).join('\n');
  return `Dog Derm AI\n\n${d.problem_representation||''}\n\n鑑別診断\n${diffs}\n\n推奨検査\n${tests}\n\n${d.disclaimer||''}`;
}

async function shareResult(){
  if(!lastResult)return;
  const text=shareText(lastResult);
  if(navigator.share){try{await navigator.share({title:'Dog Derm AI 解析結果',text});return}catch(e){if(e.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(text);alert('解析結果をクリップボードにコピーしました。')}catch(_){alert('共有できませんでした。')}
}

function renderResults(d){
  lastResult=d;
  const morph=(d.morphology||[]).map(m=>`<span class="tag">${esc(m.lesion)} · ${esc(m.confidence)}</span>`).join('');
  const diffs=(d.differentials||[]).map(x=>`<div class="diff"><div class="diff-title"><span class="rank">${x.rank}</span><b>${esc(x.disease)}</b><span class="likelihood ${x.likelihood}">${x.likelihood}</span></div><small>支持</small>${list(x.reasons_for)}<small>反証/弱点</small>${list(x.reasons_against)}<small>不足情報</small>${list(x.missing_information)}</div>`).join('');
  const tests=(d.recommended_tests||[]).map(x=>`<div class="test"><b>${esc(x.priority)} · ${esc(x.test)}</b><p>${esc(x.why)}</p><p><strong>診断への影響：</strong>${esc(x.expected_impact)}</p></div>`).join('');
  const tx=(d.treatment_options||[]).map(x=>`<div class="therapy"><div class="therapy-head"><h4>${esc(x.therapy)}</h4><span class="grade">Evidence ${esc(x.evidence_grade)}</span></div><p><strong>適応：</strong>${esc(x.indication)}</p><p>${esc(x.protocol)}</p>${x.cautions?.length?`<div class="alert">${x.cautions.map(esc).join(' / ')}</div>`:''}<p class="disclaimer">Recommendation: ${esc(x.recommendation_strength)} · Evidence IDs: ${(x.evidence_ids||[]).map(esc).join(', ')||'none'}</p></div>`).join('');
  const refs=(d.evidence_references||[]).map(x=>`<div class="evidence"><a href="${esc(x.url)}" target="_blank" rel="noreferrer">${esc(x.id)} · ${esc(x.title)}</a><p>${esc(x.citation)}</p><p>${esc(x.evidence_type)}</p></div>`).join('') || '<p class="disclaimer">今回の治療提案に紐づく検証済み文献はありません。</p>';
  const reds=(d.red_flags||[]).length?`<div class="alert danger"><b>Red flags</b>${list(d.red_flags)}</div>`:'<div class="alert"><b>Red flags</b> · 今回の入力から明確な緊急フラグは抽出されませんでした。</div>';
  $('results').innerHTML=`
    <div class="result-head"><div class="result-actions"><button id="shareBtn" class="secondary">結果を共有</button></div><div class="kicker">症例要約</div><h2>${esc(d.problem_representation)}</h2><p>${esc(d.lesion_description)}</p><span class="quality">IMAGE ${esc(d.image_quality)} · ${esc(d.image_quality_comment)}</span></div>
    <div class="cards">
      <div class="card"><h3>AI皮疹認識</h3><div class="morphs">${morph||'<span class="tag">評価不能</span>'}</div></div>
      <div class="card"><h3>追加で確認したい問診</h3>${list(d.additional_questions)}</div>
      <div class="card full">${reds}</div>
      <div class="card full"><h3>鑑別診断</h3>${diffs}</div>
      <div class="card"><h3>次に行う検査</h3>${tests}</div>
      <div class="card"><h3>Clinical notes</h3>${list(d.clinical_notes)}</div>
      <div class="card full"><h3>条件付き治療案</h3>${tx||'<p class="disclaimer">治療提案なし</p>'}</div>
      <div class="card full"><h3>Evidence Library</h3>${refs}<div class="disclaimer">${esc(d.disclaimer)}</div></div>
    </div>`;
  $('results').classList.remove('hidden'); $('shareBtn').addEventListener('click',shareResult); $('results').scrollIntoView({behavior:'smooth',block:'start'});
}
