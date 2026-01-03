

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

console.log("📁 CWD =", process.cwd());
console.log("🔑 OPENAI_API_KEY =", process.env.OPENAI_API_KEY?.slice(0, 15));

const app = express();
const PORT = process.env.PORT || 10000;

// =========================
// Middlewares
// =========================
app.use(cors());
app.use(express.json());

// =========================
// OpenAI client
// =========================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =========================
// Health check
// =========================
app.get("/", (req, res) => {
  res.send("🍳 Cookit backend is running");
});

// =========================
// 🍳 RECIPE GENERATION
// =========================
app.post("/recipe", async (req, res) => {
  try {
    const { ingredients, duration } = req.body;
    const cuisine = (req.body.cuisine && req.body.cuisine.trim().length > 0)
      ? req.body.cuisine.trim()
      : "indienne";

    // =========================
    // 🔒 BACKEND VALIDATION (SOURCE DE VÉRITÉ)
    // =========================
    if (!ingredients || ingredients.trim().length === 0) {
      return res.status(400).json({
        error: "NO_INGREDIENTS",
        message: "No ingredients provided",
      });
    }

    console.log("📩 BODY REÇU:", { ingredients, duration, cuisine });

    // ⏱️ Sécurisation de la durée (évite valeurs invalides venant du front)
    const safeDuration = ["rapide", "moyen", "long"].includes(duration)
      ? duration
      : "moyen";

    // ⏱️ CONTRAINTE DE DURÉE
    const durationHint = {
      rapide: "15 minutes maximum",
      moyen: "entre 30 et 40 minutes",
      long: "60 minutes ou plus",
    }[safeDuration];

    // 🚨 VERROUILLAGE ABSOLU :
    // Les ingrédients sont CONSIDÉRÉS VALIDES.
    // L’IA n’a PAS le droit de discuter ce point.
    const prompt = `
CONTEXTE TECHNIQUE (NON NÉGOCIABLE) :

Les ingrédients principaux ont DÉJÀ été VALIDÉS par le backend.
Ils sont considérés comme EXISTANTS, CORRECTS et EXPLOITABLES.

TU N’AS PAS LE DROIT :
- de dire qu’aucun ingrédient n’a été fourni
- de demander plus d’ingrédients
- de remettre en cause leur validité

--------------------------------------------------

Tu es un chef cuisinier professionnel, expert STRICT en cuisine ${cuisine}.

RÈGLES ABSOLUES :

1️⃣ Les ingrédients fournis par l’utilisateur sont les INGRÉDIENTS PRINCIPAUX.
2️⃣ Tu DOIS ajouter automatiquement les ingrédients de base typiques de la cuisine ${cuisine}
   (épices, aromates, condiments, huile, sel, etc.).
3️⃣ Le manque d’épices ou d’aromates N’EST JAMAIS une raison de refus.
4️⃣ La recette DOIT être authentiquement ${cuisine}.
5️⃣ La recette DOIT durer ${durationHint}. Ne dépasse JAMAIS cette durée.

🚨 REFUS — CAS EXTRÊMEMENT RARE :
Tu REFUSES UNIQUEMENT si les ingrédients PRINCIPAUX sont
fondamentalement incompatibles avec la cuisine ${cuisine},
MÊME après ajout de TOUTES les bases classiques.

Exemples de REFUS LÉGITIMES :
- Cuisine japonaise + chocolat + fromage
- Cuisine indienne + chocolat + fromage
- Cuisine italienne + algues + wasabi

Exemples OBLIGATOIRES À ACCEPTER :
- Riz + poulet + cuisine indienne → ✅ ACCEPTER
- Riz seul + cuisine indienne → ✅ ACCEPTER
- Poulet seul + cuisine indienne → ✅ ACCEPTER

--------------------------------------------------

FORMAT DE RÉPONSE — JSON STRICT UNIQUEMENT.

SI REFUS :
{
  "status": "refused",
  "title": null,
  "ingredients": null,
  "steps": [],
  "calories": null,
  "estimatedMinutes": null,
  "cuisine": "${cuisine}",
  "suggestion": {
    "suggestedCuisine": "string",
    "reason": "string"
  }
}

SI OK :
{
  "status": "ok",
  "title": "string",
  "ingredients": "string",
  "steps": ["step 1", "step 2", "step 3"],
  "calories": number,
  "estimatedMinutes": number,
  "cuisine": "${cuisine}",
  "suggestion": null
}

RÈGLE FINALE :
Si les ingrédients principaux sont compatibles avec la cuisine ${cuisine},
TU N’AS PAS LE DROIT DE REFUSER.
`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

const json =
  response.output_parsed ??
  JSON.parse(response.output_text);

    if (json.status === "refused") {
      return res.status(422).json(json);
    }

    return res.status(200).json(json);

  } catch (error) {
    console.error("❌ /recipe error:", error);
    return res.status(500).json({
      error: "AI_ERROR",
      message: error.message || "Failed to generate recipe",
    });
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});