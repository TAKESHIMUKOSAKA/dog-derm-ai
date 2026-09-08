// Dog Derm AI v0.3 — verified treatment protocol UI
(async function refreshV03Stats(){
  try{
    const r=await fetch('/api/health',{cache:'no-store'}); const h=await r.json();
    const d=document.getElementById('drugCount'); if(d)d.textContent=h.drug_count ?? '—';
    const v=document.getElementById('appVersion'); if(v)v.textContent=`v${h.version||'0.3.0'}`;
  }catch(_){/* base app health indicator remains authoritative */}
})();

shareText = function(d){
  const diffs=(d.differentials||[]).map(x=>`${x.rank}. ${x.disease} [${x.likelihood}]`).join('\n');
  const tests=(d.recommended_tests||[]).map(x=>`・${x.test}: ${x.why}`).join('\n');
  const tx=(d.treatment_options||[]).map(x=>[
    `■ ${x.therapy}`,
    `適応: ${x.indication||''}`,
    `用量: ${x.dose||'用量未検証'} / ${x.route||'—'} / ${x.frequency||'—'}`,
    `初期期間: ${x.initial_duration||'—'}`,
    `再評価: ${x.reassessment_timing||'—'}`,
    `減量・中止: ${x.taper_or_stop||'—'}`,
    `Monitoring: ${(x.monitoring||[]).join('、')||'—'}`,
    `用量根拠: ${x.dose_evidence_note||'—'}`,
    `Evidence: ${x.evidence_grade||'UNVERIFIED'} / ${x.label_status||'UNVERIFIED'}`
  ].join('\n')).join('\n\n');
  return `Dog Derm AI\n\n${d.problem_representation||''}\n\n鑑別診断\n${diffs}\n\n推奨検査\n${tests}\n\n具体的治療プロトコル\n${tx}\n\n${d.disclaimer||''}`;
};

renderResults = function(d){
  lastResult=d;
  const morph=(d.morphology||[]).map(m=>`<span class="tag">${esc(m.lesion)} · ${esc(m.confidence)}</span>`).join('');
  const diffs=(d.differentials||[]).map(x=>`<div class="diff"><div class="diff-title"><span class="rank">${x.rank}</span><b>${esc(x.disease)}</b><span class="likelihood ${x.likelihood}">${x.likelihood}</span></div><small>支持</small>${list(x.reasons_for)}<small>反証/弱点</small>${list(x.reasons_against)}<small>不足情報</small>${list(x.missing_information)}</div>`).join('');
  const tests=(d.recommended_tests||[]).map(x=>`<div class="test"><b>${esc(x.priority)} · ${esc(x.test)}</b><p>${esc(x.why)}</p><p><strong>診断への影響：</strong>${esc(x.expected_impact)}</p></div>`).join('');
  const tx=(d.treatment_options||[]).map(x=>{
    const unverified=(x.dose||'').includes('未検証');
    const monitors=(x.monitoring||[]).map(m=>`<span class="monitor-chip">${esc(m)}</span>`).join('');
    const cautions=(x.cautions||[]).length?`<div class="alert"><b>注意</b><br>${x.cautions.map(esc).join(' / ')}</div>`:'';
    return `<div class="therapy-v03">
      <div class="therapy-head"><h4>${esc(x.therapy)}</h4><span class="grade">Evidence ${esc(x.evidence_grade)}</span><span class="protocol-status">${esc(x.label_status||'UNVERIFIED')}</span></div>
      <p><strong>適応条件：</strong>${esc(x.indication)}</p>
      ${x.protocol?`<p>${esc(x.protocol)}</p>`:''}
      <div class="regimen-grid">
        <div class="regimen-cell ${unverified?'dose-unverified':''}"><b>用量</b><span>${esc(x.dose||'用量未検証')}</span></div>
        <div class="regimen-cell"><b>投与経路</b><span>${esc(x.route||'—')}</span></div>
        <div class="regimen-cell"><b>頻度</b><span>${esc(x.frequency||'—')}</span></div>
        <div class="regimen-cell"><b>導入・初期期間</b><span>${esc(x.initial_duration||'—')}</span></div>
        <div class="regimen-cell"><b>再評価</b><span>${esc(x.reassessment_timing||'—')}</span></div>
        <div class="regimen-cell"><b>減量・中止</b><span>${esc(x.taper_or_stop||'—')}</span></div>
      </div>
      ${(x.monitoring||[]).length?`<div class="protocol-section"><b>Monitoring</b><div class="monitor-chips">${monitors}</div></div>`:''}
      ${x.dose_evidence_note?`<div class="dose-source"><b>用量根拠：</b> ${esc(x.dose_evidence_note)}</div>`:''}
      ${cautions}
      <p class="db-id">Recommendation: ${esc(x.recommendation_strength)} · Drug DB: ${esc(x.drug_database_id||'none')} · Regimen: ${esc(x.regimen_context||'none')} · Evidence IDs: ${(x.evidence_ids||[]).map(esc).join(', ')||'none'}</p>
    </div>`;
  }).join('');
  const refs=(d.evidence_references||[]).map(x=>`<div class="evidence"><a href="${esc(x.url)}" target="_blank" rel="noreferrer">${esc(x.id)} · ${esc(x.title)}</a><p>${esc(x.citation)}</p><p>${esc(x.evidence_type)}</p></div>`).join('') || '<p class="disclaimer">今回の治療提案に紐づく検証済み文献はありません。</p>';
  const reds=(d.red_flags||[]).length?`<div class="alert danger"><b>Red flags</b>${list(d.red_flags)}</div>`:'<div class="alert"><b>Red flags</b> · 今回の入力から明確な緊急フラグは抽出されませんでした。</div>';
  $('results').innerHTML=`
    <div class="result-head"><div class="result-actions"><button id="shareBtn" class="secondary">結果を共有</button></div><div class="kicker">CLINICAL REPRESENTATION</div><h2>${esc(d.problem_representation)}</h2><p>${esc(d.lesion_description)}</p><span class="quality">IMAGE ${esc(d.image_quality)} · ${esc(d.image_quality_comment)}</span></div>
    <div class="cards">
      <div class="card"><h3>AI皮疹認識</h3><div class="morphs">${morph||'<span class="tag">評価不能</span>'}</div></div>
      <div class="card"><h3>追加で確認したい問診</h3>${list(d.additional_questions)}</div>
      <div class="card full">${reds}</div>
      <div class="card full"><h3>鑑別診断</h3>${diffs}</div>
      <div class="card"><h3>次に行う検査</h3>${tests}</div>
      <div class="card"><h3>Clinical notes</h3>${list(d.clinical_notes)}</div>
      <div class="card full"><h3>具体的治療プロトコル <span class="v03-badge">DOSE GUARD</span></h3><p class="treatment-intro">数値用量は登録済みDrug Databaseとサーバー側で照合。未照合の数値は自動的に非表示にします。</p>${tx||'<p class="disclaimer">治療提案なし</p>'}</div>
      <div class="card full"><h3>Evidence Library</h3>${refs}<div class="disclaimer">${esc(d.disclaimer)}</div></div>
    </div>`;
  $('results').classList.remove('hidden'); $('shareBtn').addEventListener('click',shareResult); $('results').scrollIntoView({behavior:'smooth',block:'start'});
};
