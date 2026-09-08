from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

Likelihood = Literal["HIGH", "MODERATE", "LOW"]
Priority = Literal["HIGH", "MEDIUM", "LOW"]
EvidenceGrade = Literal["A", "B", "C", "D", "E", "UNVERIFIED"]
RecommendationStrength = Literal["STRONG", "CONDITIONAL", "UNCERTAIN"]

class MorphologyItem(BaseModel):
    lesion: str
    confidence: Likelihood
    description: str
    image_basis: str

class Differential(BaseModel):
    rank: int = Field(ge=1, le=10)
    disease: str
    likelihood: Likelihood
    reasons_for: list[str]
    reasons_against: list[str]
    missing_information: list[str]

class RecommendedTest(BaseModel):
    priority: Priority
    test: str
    why: str
    expected_impact: str

class TreatmentOption(BaseModel):
    indication: str
    therapy: str
    protocol: str
    drug_database_id: str = ""
    regimen_context: str = ""
    label_status: str = ""
    dose: str = ""
    route: str = ""
    frequency: str = ""
    initial_duration: str = ""
    reassessment_timing: str = ""
    taper_or_stop: str = ""
    monitoring: list[str] = []
    evidence_grade: EvidenceGrade
    recommendation_strength: RecommendationStrength
    evidence_ids: list[str]
    cautions: list[str]
    dose_evidence_note: str = ""

class EvidenceReference(BaseModel):
    id: str
    title: str
    citation: str
    url: str
    evidence_type: str

class DermAssessment(BaseModel):
    image_quality: Literal["ADEQUATE", "LIMITED", "NOT_ASSESSABLE"]
    image_quality_comment: str
    morphology: list[MorphologyItem]
    lesion_description: str
    problem_representation: str
    red_flags: list[str]
    differentials: list[Differential]
    additional_questions: list[str]
    recommended_tests: list[RecommendedTest]
    treatment_options: list[TreatmentOption]
    clinical_notes: list[str]
    disclaimer: str
