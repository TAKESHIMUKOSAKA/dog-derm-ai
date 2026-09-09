// Dog Derm AI v0.6 — Supabase cloud sync (RLS user-isolated)
(() => {
  const SUPABASE_URL='https://ddxcehcbeplrpkrtazys.supabase.co';
  const SUPABASE_KEY='sb_publishable_bNmwn-de-_o4BLSVVBJ1fg_frIzKnSN';
  const DB_NAME='dog-derm-ai-cases', DB_VERSION=1, STORE='cases';
  let session=null;
  const $id=id=>document.getElementById(id);

  function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function dbAll(){const db=await openDB();return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>{db.close();resolve(r.result||[])};r.onerror=()=>{db.close();reject(r.error)}})}
  async function dbPut(v){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v);tx.oncomplete=()=>{db.close();resolve(v)};tx.onerror=()=>{db.close();reject(tx.error)}})}

  function saveSession(s){session=s; if(s)localStorage.setItem('dogDermCloudSession',JSON.stringify(s)); else localStorage.removeItem('dogDermCloudSession'); renderCloud();}
  function loadSession(){try{session=JSON.parse(localStorage.getItem('dogDermCloudSession')||'null')}catch(_){session=null}}
  function authHeaders(){return {'apikey':SUPABASE_KEY,'Authorization':`Bearer ${session?.access_token||''}`,'Content-Type':'application/json'};}
  async function authFetch(path,opts={}){
    let r=await fetch(SUPABASE_URL+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});
    if(r.status===401 && session?.refresh_token){
      const rr=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
      if(rr.ok){saveSession(await rr.json());r=await fetch(SUPABASE_URL+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});} else saveSession(null);
    }
    return r;
  }

  async function signIn(email,password){
    const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d=await r.json(); if(!r.ok) throw new Error(d.msg||d.error_description||'ログインできませんでした'); saveSession(d); await syncBothWays();
  }
  async function signUp(email,password){
    const r=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d=await r.json(); if(!r.ok) throw new Error(d.msg||d.error_description||'登録できませんでした');
    if(d.access_token){saveSession(d);await syncBothWays();} else setCloudNotice('確認メールを送信しました。メール内のリンクを開いた後、ログインしてください。','ok');
  }

  function safePayload(rec,assets){
    return {patient:rec.patient||{},timeline:rec.timeline||[],assets,source_device:'browser',schema_version:1};
  }
  async function uploadAsset(blob,path){
    const r=await fetch(`${SUPABASE_URL}/storage/v1/object/dog-derm-case-assets/${path}`,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${session.access_token}`,'x-upsert':'true','Content-Type':blob.type||'application/octet-stream'},body:blob});
    if(!r.ok) throw new Error('画像同期に失敗しました');
  }
  async function syncAssets(rec){
    const uid=session.user.id, assets={lesion:[],chart:[]};
    for(const [kind,list] of [['lesion',rec.lesion_files||[]],['chart',rec.chart_files||[]]]){
      for(let i=0;i<list.length;i++){
        const f=list[i]; if(!(f instanceof Blob)) continue;
        const ext=(f.type||'image/jpeg').includes('png')?'png':'jpg';
        const path=`${uid}/${rec.id}/${kind}-${i}.${ext}`; await uploadAsset(f,path); assets[kind].push({path,name:f.name||`${kind}-${i}.${ext}`,type:f.type||'image/jpeg'});
      }
    }
    return assets;
  }
  async function fetchAsset(meta){
    const r=await authFetch(`/storage/v1/object/authenticated/dog-derm-case-assets/${meta.path}`,{headers:{'Content-Type':undefined}});
    if(!r.ok) return null; const b=await r.blob(); return new File([b],meta.name||'image.jpg',{type:meta.type||b.type||'image/jpeg'});
  }

  async function pushCase(rec,withAssets=true){
    const assets=withAssets?await syncAssets(rec):((rec.cloud_assets)||{lesion:[],chart:[]});
    const body={id:rec.id,user_id:session.user.id,title:rec.title||'症例',final_diagnosis:rec.final_diagnosis||'',payload:safePayload(rec,assets),created_at:rec.created_at||new Date().toISOString(),updated_at:rec.updated_at||new Date().toISOString()};
    const r=await authFetch('/rest/v1/dog_derm_cases?on_conflict=id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error('クラウド保存に失敗しました'); rec.cloud_assets=assets; await dbPut(rec);
  }
  async function pullCases(){
    const r=await authFetch('/rest/v1/dog_derm_cases?select=id,title,final_diagnosis,payload,created_at,updated_at&order=updated_at.desc');
    if(!r.ok) throw new Error('クラウド症例を取得できませんでした'); const rows=await r.json(); const locals=await dbAll(); const map=new Map(locals.map(x=>[x.id,x]));
    for(const row of rows){
      const local=map.get(row.id); if(local && (local.updated_at||'')>=(row.updated_at||'')) continue;
      const p=row.payload||{}, a=p.assets||{lesion:[],chart:[]}; const lesion=[], chart=[];
      for(const m of a.lesion||[]){const f=await fetchAsset(m);if(f)lesion.push(f)}
      for(const m of a.chart||[]){const f=await fetchAsset(m);if(f)chart.push(f)}
      await dbPut({id:row.id,title:row.title,final_diagnosis:row.final_diagnosis||'',created_at:row.created_at,updated_at:row.updated_at,patient:p.patient||{},timeline:p.timeline||[],lesion_files:lesion,chart_files:chart,cloud_assets:a});
    }
  }
  async function syncBothWays(){
    if(!session?.access_token)return; setCloudNotice('クラウド同期中…','');
    await pullCases(); const locals=await dbAll(); for(const rec of locals) await pushCase(rec,true);
    setCloudNotice(`同期完了 · ${locals.length}症例`,'ok'); renderCloud(); document.dispatchEvent(new CustomEvent('dogderm-cloud-synced'));
  }
  async function syncJsonOnly(){
    if(!session?.access_token)return; const locals=await dbAll(); for(const rec of locals) await pushCase(rec,false); setCloudNotice('クラウドへ自動保存しました。','ok');
  }

  function setCloudNotice(t,type=''){const e=$id('cloudNotice');if(e){e.textContent=t;e.className=`cloud-notice ${type}`}}
  function injectUI(){
    const panel=document.querySelector('.case-panel'); if(!panel||$id('cloudSyncBox'))return;
    const box=document.createElement('div'); box.id='cloudSyncBox'; box.className='cloud-sync-box';
    box.innerHTML=`<div class="cloud-head"><div><b>クラウド症例同期</b><small>iPhone・PCで同じ症例を共有</small></div><span id="cloudState" class="cloud-state">未接続</span></div>
      <div id="cloudLoggedOut"><div class="cloud-auth-grid"><input id="cloudEmail" type="email" placeholder="メールアドレス"><input id="cloudPassword" type="password" minlength="8" placeholder="パスワード（8文字以上）"></div><div class="cloud-buttons"><button id="cloudLoginBtn" class="case-btn primary-case">ログイン</button><button id="cloudSignupBtn" class="case-btn">新規登録</button></div></div>
      <div id="cloudLoggedIn" class="hidden"><div class="cloud-user"><span id="cloudUserEmail"></span><div><button id="cloudSyncBtn" class="case-btn primary-case">今すぐ同期</button><button id="cloudLogoutBtn" class="case-btn">ログアウト</button></div></div></div>
      <div id="cloudNotice" class="cloud-notice"></div><p class="cloud-help">症例情報・解析履歴・皮疹画像・カルテ画像をユーザーごとに分離して保存します。飼い主の氏名・住所・電話番号などは保存しない運用を継続してください。</p>`;
    panel.querySelector('.section-title')?.after(box);
    $id('cloudLoginBtn').onclick=()=>signIn($id('cloudEmail').value.trim(),$id('cloudPassword').value).catch(e=>setCloudNotice(e.message,'error'));
    $id('cloudSignupBtn').onclick=()=>signUp($id('cloudEmail').value.trim(),$id('cloudPassword').value).catch(e=>setCloudNotice(e.message,'error'));
    $id('cloudSyncBtn').onclick=()=>syncBothWays().catch(e=>setCloudNotice(e.message,'error'));
    $id('cloudLogoutBtn').onclick=()=>{saveSession(null);setCloudNotice('ログアウトしました。','')}; renderCloud();
  }
  function renderCloud(){
    if(!$id('cloudSyncBox'))return; const on=!!session?.access_token;
    $id('cloudLoggedOut').classList.toggle('hidden',on); $id('cloudLoggedIn').classList.toggle('hidden',!on); $id('cloudState').textContent=on?'クラウド接続中':'未接続'; $id('cloudState').classList.toggle('connected',on); if(on)$id('cloudUserEmail').textContent=session.user?.email||'ログイン済み';
  }

  loadSession(); injectUI();
  const versionNode=$id('appVersion'); if(versionNode){const f=()=>{if(versionNode.textContent!=='v0.6.0')versionNode.textContent='v0.6.0'};f();new MutationObserver(f).observe(versionNode,{childList:true,subtree:true});}
  const notice=$id('caseNotice'); if(notice)new MutationObserver(()=>{if(session?.access_token && /保存|自動保存/.test(notice.textContent||''))setTimeout(()=>syncJsonOnly().catch(()=>{}),500);}).observe(notice,{childList:true,subtree:true,characterData:true});
})();