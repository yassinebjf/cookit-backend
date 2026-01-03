import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// ✅ OpenAI client (UNE seule fois)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Health check
app.get("/", (req, res) => {
  res.send("🍳 Cookit backend is running");
});

// ✅ Génération de recette IA (JSON strict)
app.post("/recipe", async (req, res) => {
  try {
    const { ingredients, duration, cuisine } = req.body;

    // 🔒 VALIDATIONS STRICTES
    if (!ingredients || ingredients.trim().length === 0) {
      return res.status(400).json({
        error: "NO_INGREDIENTS",
        message: "No ingredients provided",
      });
    }

    if (!cuisine || cuisine.trim().length === 0) {
      return res.status(400).json({
        error: "NO_CUISINE",
        message: "No cuisine provided",
      });
    }

    // 🔥 CONTRAINTE DE DURÉE (SOURCE DE VÉRITÉ BACKEND)
    const durationHint = {
      rapide: "15 minutes maximum",
      moyen: "entre 30 et 40 minutes",
      long: "60 minutes ou plus",
    }[duration] || "entre 30 et 40 minutes";

    // 🧠 PROMPT STRICT
    const prompt = `
Tu es un chef cuisinier professionnel EXPERT en cuisine ${cuisine}.

⚠️ RÈGLE ABSOLUE :
La recette DOIT être AUTHENTIQUEMENT ${cuisine}.
Toute recette qui n’est PAS typique de la cuisine ${cuisine} est INTERDITE.

Ingrédients disponibles :
"${ingredients}"

⏱️ CONTRAINTE DE TEMPS OBLIGATOIRE :
La recette DOIT durer ${durationHint}.
Ne dépasse JAMAIS cette durée.

🚫 SI IMPOSSIBLE :
Si une recette authentique ${cuisine} est IMPOSSIBLE avec ces ingrédients :
- REFUSE la génération
- Explique brièvement pourquoi
- Propose UNE cuisine alternative plus cohérente

Réponds UNIQUEMENT en JSON STRICT (aucun texte, aucun backtick).

FORMAT EXACT :

{
  "status": "ok | refused",
  "title": "string | null",
  "ingredients": "string | null",
  "steps": [],
  "calories": number | null,
  "estimatedMinutes": number | null,
  "cuisine": "${cuisine}",
  "suggestion": {
    "suggestedCuisine": "string",
    "reason": "string"
  } | null
}
`;

    // ✅ APPEL OPENAI (Responses API)
    const response = await client.responses.create({
      model: "gpt-5.2",
      input: prompt,
      temperature: 0.3,
      text: {
        format: {
          type: "json_object",
        },
      },
    });

    const json = JSON.parse(response.output_text);

    // 🔁 REFUS PROPRE
    if (json.status === "refused") {
      return res.status(422).json(json);
    }

    // ✅ SUCCÈS
    return res.status(200).json(json);

  } catch (error) {
    console.error("❌ /recipe error:", error);
    return res.status(500).json({
      error: "AI_ERROR",
      message: error.message || "Failed to generate recipe",
    });
  }
});

// ✅ Toujours en dernier
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});