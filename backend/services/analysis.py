import json
import os
import re

import ollama

PROMPT_TEMPLATE = """Tu es un expert en recrutement et en analyse d'entretiens.
Analyse la transcription d'entretien suivante et retourne UNIQUEMENT un JSON valide \
(sans markdown, sans texte avant ou après) avec exactement cette structure :

{{
  "nom_candidat": "string ou Non mentionné",
  "poste_vise": "string ou Non mentionné",
  "score_global": <entier entre 1 et 10>,
  "resume_executif": "2-3 phrases synthétisant le profil",
  "points_forts": ["string", "string", "string"],
  "points_amelioration": ["string", "string"],
  "competences_techniques": ["string"],
  "competences_comportementales": ["string"],
  "questions_recommandees": ["string", "string", "string"],
  "verdict": "À retenir | À surveiller | Non retenu",
  "justification_verdict": "1-2 phrases"
}}

Transcription :
{transcription}"""


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


async def analyze_transcript(transcription: str) -> dict:
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    prompt = PROMPT_TEMPLATE.format(transcription=transcription)

    response = ollama.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        options={"temperature": 0.1},
    )

    raw = response["message"]["content"]
    return _parse_llm_response(raw)
