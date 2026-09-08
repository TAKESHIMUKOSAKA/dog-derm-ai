function shareText(d){
  const diffs=(d.differentials||[]).map(x=>`${x.rank}. ${x.disease} [${x.likelihood}]`).join('\n');
  const tests=(d.recommended_tests||[]).map(x=>`・${x.test}: ${x.why}`).join('\n');
  const tx=(d.treatment_options||[]).map(x=>{
    const parts=[
      `■ ${x.therapy}`,
      `適応: ${x.indication||''}`,
      `用量: ${x.dose||'用量未検証'}`,
      `経路: ${x.route||'未記載'}`,
      `頻度: ${x.frequency||'未記載'}`,
      `初期期間: ${x.initial_duration||'未記載'}`,
      `再評価: ${x.reassessment_timing||'未記載'}`,
      `減量/中止: ${x.taper_or_stop||'未記載'}`,
      `プロトコル: ${x.protocol||''}`,
      `Evidence: ${x.evidence_grade||'UNVERIFIED'} / ${x.recommendation_strength||'UNCERTAIN'}`
    ];
    if((x.monitoring||[]).length) parts.push(`モニタリング: ${(x.monitoring||[]).join('、')}`);
    if((x.cautions||[]).length) parts.push(`注意: ${(x.cautions||[]).join('、')}`);
    if(x.dose_evidence_note) parts.push(`用量根拠: ${x.dose_evidence_note}`);
    return parts.join('\n');
  }).join('\n\n');
  return `Dog Derm AI\n\n${d.problem_representation||''}\n\n鑑別診断\n${diffs}\n\n推奨検査\n${tests}\n\n治療案\n${tx}\n\n${d.disclaimer||''}`;
}

function renderResults(d){
  lastResult=d;
  const morph=(d.morphology||[]).map(m=>`<span class="tag">${esc(m.lesion)} · ${esc(m.confidence)}</span>`).join('');
  const diffs=(d.differentials||[]).map(x=>`<div class="diff"><div class="diff-title"><span class="rank">${x.rank}</span><b>${esc(x.disease)}</b><span class="likelihood ${x.likelihood}">${x.likelihood}</span></div><small>支持</small>${list(x.reasons_for)}<small>反証/弱点</small>${list(x.reasons_against)}<small>不足情報</small>${list(x.missing_information)}</div>`).join('');
  const tests=(d.recommended_tests||[]).map(x=>`<div class="test"><b>${esc(x.priority)} · ${esc(x.test)}</b><p>${esc(x.why)}</p><p><strong>診断への影響：</strong>${esc(x.expected_impact)}</p></div>`).join('');
  const tx=(d.treatment_options||[]).map(x=>{
    const dose=x.dose||'用量未検証';
    const doseClass=dose==='用量未検証'?'alert danger':'alert';
    return `<div class="therapy">
      <div class="therapy-head"><h4>${esc(x.therapy)}</h4><span class="grade">Evidence ${esc(x.evidence_grade)}</span></div>
      <p><strong>適応：</strong>${esc(x.indication)}</p>
      <div class="${doseClass}"><strong>投薬プロトコル</strong><br>
        用量：${esc(dose)}<br>
        投与経路：${esc(x.route||'未記載')}<br>
        頻度：${esc(x.frequency||'未記載')}<br>
        初期治療期間：${esc(x.initial_duration||'未記載')}<br>
        再評価時期：${esc(x.reassessment_timing||'未記載')}<br>
        減量・中止基準：${esc(x.taper_or_stop||'未記載')}
      </div>
      <p><strong>治療の考え方：</strong>${esc(x.protocol||'')}</p>
      ${(x.monitoring||[]).length?`<p><strong>モニタリング：</strong></p>${list(x.monitoring)}`:''}
      ${(x.cautions||[]).length?`<div class="alert"><strong>注意：</strong> ${x.cautions.map(esc).join(' / ')}</div>`:''}
      ${x.dose_evidence_note?`<p class="disclaimer"><strong>用量根拠：</strong>${esc(x.dose_evidence_note)}</p>`:''}
      <p class="disclaimer">Recommendation: ${esc(x.recommendation_strength)} · Evidence IDs: ${(x.evidence_ids||[]).map(esc).join(', ')||'none'}</p>
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
      <div class="card full"><h3>具体的治療プロトコル</h3>${tx||'<p class="disclaimer">治療提案なし</p>'}</div>
      <div class="card full"><h3>Evidence Library</h3>${refs}<div class="disclaimer">${esc(d.disclaimer)}</div></div>
    </div>`;
  $('results').classList.remove('hidden'); $('shareBtn').addEventListener('click',shareResult); $('results').scrollIntoView({behavior:'smooth',block:'start'});
}
