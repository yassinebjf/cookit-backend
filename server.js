import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middlewares
app.use(cors());
app.use(express.json());

// OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.send("🍳 Cookit backend is running");
});

// =========================
// 🍳 RECIPE GENERATION
// =========================
app.post("/recipe", async (req, res) => {
  try {
    const { ingredients, duration, cuisine } = req.body;

    // 🔒 VALIDATIONS
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

    // ⏱️ CONTRAINTE DE DURÉE
    const durationHint = {
      rapide: "15 minutes maximum",
      moyen: "entre 30 et 40 minutes",
      long: "60 minutes ou plus",
    }[duration] || "entre 30 et 40 minutes";

    const prompt = `
Tu es un chef cuisinier professionnel, expert STRICT en cuisine ${cuisine}.

RÈGLES ABSOLUES :
1️⃣ Les ingrédients fournis sont les INGRÉDIENTS PRINCIPAUX.
2️⃣ Tu AJOUTES automatiquement les bases classiques de la cuisine ${cuisine}
   (épices, aromates, huile, sel, etc.).
3️⃣ La recette DOIT être authentiquement ${cuisine}.
4️⃣ Durée OBLIGATOIRE : ${durationHint}.

🚨 REFUS UNIQUEMENT SI :
Même avec les bases classiques, les ingrédients principaux sont incompatibles
avec la cuisine ${cuisine}.

Exemples de refus légitimes :
- Japonaise + chocolat + fromage
- Indienne + chocolat + fromage
- Italienne + algues + wasabi

⚠️ IMPORTANT :
- Le manque d’épices n’est JAMAIS une raison de refus.
- Riz + poulet DOIT donner une recette indienne valide.

FORMAT JSON STRICT UNIQUEMENT.

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
  "steps": ["step 1", "step 2"],
  "calories": number,
  "estimatedMinutes": number,
  "cuisine": "${cuisine}",
  "suggestion": null
}
`;

    const response = await client.responses.create({
      model: "gpt-5.2",
      input: prompt,
      temperature: 0.35,
      text: {
        format: { type: "json_object" },
      },
    });

    const json = JSON.parse(response.output_text);

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

// START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});