import json
import os
import re

import requests


PROMPT_TEMPLATE = """Tu es un assistant d'aide à la décision de recrutement pour managers.
Analyse la transcription d'entretien suivante{job_context} et retourne UNIQUEMENT un JSON valide \
(sans markdown, sans texte avant ou après) avec exactement cette structure :

{{
  "nom_candidat": "string ou Non mentionné",
  "poste_vise": "string ou Non mentionné",
  "score_global": <entier entre 1 et 10>,
  "verdict": "À recruter | À évaluer | Ne pas recruter",
  "justification_verdict": "1-2 phrases en termes de performance et rentabilité",
  "resume_executif": "2-3 phrases orientées impact business pour un manager",
  "potentiel": {{
    "capacite_evolution": "évaluation 1-2 phrases",
    "autonomie": "évaluation 1-2 phrases",
    "adaptabilite": "évaluation 1-2 phrases"
  }},
  "risques": [
    {{
      "titre": "string court",
      "description": "impact concret pour l'équipe ou le projet",
      "niveau": "faible | moyen | élevé"
    }}
  ],
  "impact_business": {{
    "temps_onboarding": "estimation en semaines ou mois avec justification",
    "cout_formation": "estimation et domaines concernés",
    "valeur_equipe": "ce que ce candidat apporte concrètement à l'équipe"
  }},
  "recommandations": {{
    "formations": ["string"],
    "mentoring": ["string"],
    "stack_a_renforcer": ["string"]
  }}
}}

Transcription :
{transcription}
{job_section}"""


def _parse_llm_response(raw: str) -> dict:
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Impossible de parser la réponse du modèle en JSON : {raw[:200]}")


async def analyze_transcript(transcription: str, job_description: str = "") -> dict:
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    job_context = ", en la comparant avec la fiche de poste fournie" if job_description else ""
    job_section = f"\n\nFiche de poste :\n{job_description}" if job_description else ""

    prompt = PROMPT_TEMPLATE.format(
        transcription=transcription,
        job_context=job_context,
        job_section=job_section,
    )

    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        },
        timeout=60,
    )
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"]
    return _parse_llm_response(raw)
