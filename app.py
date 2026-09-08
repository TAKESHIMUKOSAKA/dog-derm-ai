from __future__ import annotations
import base64
import hmac
import json
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from prompt import SYSTEM_PROMPT, evidence_prompt_fragment, load_evidence
from schemas import DermAssessment

BASE = Path(__file__).parent
app = FastAPI(title="Dog Derm AI MVP", version="0.2.0")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

EVIDENCE = load_evidence()
EVIDENCE_BY_ID = {e["id"]: e for e in EVIDENCE}


def access_protected() -> bool:
    return bool(os.getenv("APP_ACCESS_KEY"))


def require_access(x_app_key: str | None) -> None:
    expected = os.getenv("APP_ACCESS_KEY", "")
    if expected and (not x_app_key or not hmac.compare_digest(x_app_key, expected)):
        raise HTTPException(status_code=401, detail="アクセスキーが正しくありません")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(BASE / "static" / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/service-worker.js")
def service_worker():
    # Must live at site root so its scope can cover the whole app.
    return FileResponse(BASE / "static" / "service-worker.js", media_type="application/javascript")


@app.get("/apple-touch-icon.png")
def apple_touch_icon():
    return FileResponse(BASE / "static" / "icons" / "apple-touch-icon.png", media_type="image/png")


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "mode": "openai" if os.getenv("OPENAI_API_KEY") else "demo",
        "model": os.getenv("OPENAI_MODEL", "gpt-5.6"),
        "evidence_count": len(EVIDENCE),
        "protected": access_protected(),
        "version": "0.2.0",
    }


@app.get("/api/auth-check")
def auth_check(x_app_key: Annotated[str | None, Header(alias="X-App-Key")] = None):
    require_access(x_app_key)
    return {"ok": True}


@app.get("/api/evidence")
def evidence(x_app_key: Annotated[str | None, Header(alias="X-App-Key")] = None):
    require_access(x_app_key)
    return EVIDENCE


def as_data_url(data: bytes, content_type: str | None) -> str:
    mime = content_type if content_type and content_type.startswith("image/") else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def clean_evidence_links(payload: dict) -> dict:
    # Never let a generated/unknown ID become a displayed citation.
    used = set()
    for t in payload.get("treatment_options", []):
        ids = [x for x in t.get("evidence_ids", []) if x in EVIDENCE_BY_ID]
        t["evidence_ids"] = ids
        used.update(ids)
        if not ids and t.get("evidence_grade") != "UNVERIFIED":
            t["evidence_grade"] = "UNVERIFIED"
            t["recommendation_strength"] = "UNCERTAIN"
    payload["evidence_references"] = [
        {
            "id": EVIDENCE_BY_ID[i]["id"],
            "title": EVIDENCE_BY_ID[i]["title"],
            "citation": EVIDENCE_BY_ID[i]["citation"],
            "url": EVIDENCE_BY_ID[i]["url"],
            "evidence_type": EVIDENCE_BY_ID[i]["evidence_type"],
        }
        for i in sorted(used)
    ]
    return payload


def demo_assessment(patient: dict) -> dict:
    # Offline demo demonstrates UI/flow only; it intentionally does not "interpret" the photo.
    lesion_hint = patient.get("vet_lesion", "") or "画像からの評価はAPI接続時に実施"
    payload = {
        "image_quality": "NOT_ASSESSABLE",
        "image_quality_comment": "デモモードのため画像解析は実行していません。OPENAI_API_KEY設定後に実画像を解析します。",
        "morphology": [{
            "lesion": lesion_hint,
            "confidence": "LOW",
            "description": "獣医師入力を仮表示しています。",
            "image_basis": "デモモード"
        }],
        "lesion_description": f"獣医師入力皮疹: {lesion_hint}",
        "problem_representation": f"{patient.get('breed','犬種未入力')}、{patient.get('sex','性別未入力')}。発症年齢 {patient.get('onset_age','未入力')}、掻痒 {patient.get('pruritus','未入力')}。これはUI確認用デモ結果です。",
        "red_flags": [],
        "differentials": [
            {"rank":1,"disease":"表在性膿皮症 / superficial pyoderma","likelihood":"MODERATE","reasons_for":["皮疹によっては重要な鑑別"],"reasons_against":["デモでは画像を評価していない"],"missing_information":["細胞診"]},
            {"rank":2,"disease":"アレルギー性皮膚炎＋二次感染","likelihood":"MODERATE","reasons_for":["掻痒性皮膚疾患で頻度が高い"],"reasons_against":["病歴情報だけでは確定不可"],"missing_information":["分布、季節性、感染評価、除去食歴"]},
            {"rank":3,"disease":"皮膚糸状菌症","likelihood":"LOW","reasons_for":["感染性鑑別として除外価値がある"],"reasons_against":["画像未評価"],"missing_information":["毛検査/PCR/培養など"]}
        ],
        "additional_questions":["痒みと皮疹のどちらが先でしたか？","同居動物や家族に皮疹はありますか？"],
        "recommended_tests":[
            {"priority":"HIGH","test":"皮膚細胞診","why":"細菌・Malassezia・炎症細胞の確認","expected_impact":"感染の有無で鑑別と治療が大きく変わる"},
            {"priority":"MEDIUM","test":"皮膚掻爬/毛検査","why":"Demodex等の除外","expected_impact":"寄生虫性疾患を確認・除外する"}
        ],
        "treatment_options":[
            {"indication":"細胞診等で表在性膿皮症が支持される場合","therapy":"局所抗菌療法を優先して検討","protocol":"病変範囲・製剤・患者条件に応じて選択。全身抗菌薬は適応を吟味する。","evidence_grade":"A","recommendation_strength":"STRONG","evidence_ids":["ISCAID_PYODERMA_2025"],"cautions":["再発例では基礎疾患を検索"]}
        ],
        "clinical_notes":["デモ結果は診断目的に使用しないでください。"],
        "disclaimer":"本ツールは獣医師向け臨床意思決定支援です。身体検査、細胞診、掻爬、培養、病理検査等を必要に応じて実施し、最終判断は担当獣医師が行ってください。"
    }
    return clean_evidence_links(payload)


@app.post("/api/analyze")
async def analyze(
    patient_json: Annotated[str, Form(...)],
    images: Annotated[list[UploadFile], File(...)],
    x_app_key: Annotated[str | None, Header(alias="X-App-Key")] = None,
):
    require_access(x_app_key)
    try:
        patient = json.loads(patient_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail="patient_json is invalid") from e

    if not images:
        raise HTTPException(status_code=400, detail="少なくとも1枚の画像が必要です")
    if len(images) > 6:
        raise HTTPException(status_code=400, detail="画像は最大6枚です")

    image_content = []
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    for img in images:
        data = await img.read()
        if len(data) > 12 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{img.filename}: 12MBを超えています")
        if img.content_type not in allowed:
            raise HTTPException(status_code=400, detail=f"{img.filename}: JPEG/PNG/WebP/GIFに変換してから送信してください")
        image_content.append({
            "type": "input_image",
            "image_url": as_data_url(data, img.content_type),
            "detail": "high",
        })

    if not os.getenv("OPENAI_API_KEY"):
        return demo_assessment(patient)

    user_text = (
        "以下の症例を解析してください。画像は同一症例です。\n"
        "PATIENT_HISTORY:\n" + json.dumps(patient, ensure_ascii=False, indent=2)
    )

    content = [{"type": "input_text", "text": user_text}] + image_content
    try:
        from openai import OpenAI
        client = OpenAI()
        response = client.responses.parse(
            model=os.getenv("OPENAI_MODEL", "gpt-5.6"),
            reasoning={"effort": os.getenv("OPENAI_REASONING_EFFORT", "medium")},
            input=[
                {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + evidence_prompt_fragment(EVIDENCE)},
                {"role": "user", "content": content},
            ],
            text_format=DermAssessment,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI解析に失敗しました: {type(e).__name__}: {e}") from e

    parsed = response.output_parsed
    if parsed is None:
        raise HTTPException(status_code=502, detail="AIから構造化結果を取得できませんでした")
    payload = parsed.model_dump()
    return clean_evidence_links(payload)
