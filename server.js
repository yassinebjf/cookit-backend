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
    const { ingredients } = req.body;

    if (!ingredients || ingredients.trim().length === 0) {
      return res.status(400).json({
        error: "NO_INGREDIENTS",
        message: "No ingredients provided",
      });
    }

    const prompt = `
Tu es un chef cuisinier professionnel.

À partir des ingrédients suivants :
"${ingredients}"

Génère UNE recette en JSON STRICT.
Ne renvoie QUE du JSON valide (pas de texte, pas de backticks).

Format EXACT :

{
  "title": "string",
  "ingredients": "string",
  "steps": ["step 1", "step 2", "step 3"],
  "calories": number,
  "estimatedMinutes": number,
  "cuisine": "string"
}
`;

    // ✅ APPEL OFFICIEL ET CORRECT (Responses API)
    const response = await client.responses.create({
      model: "gpt-5.2",
      input: prompt,
      temperature: 0.6,
      text: {
        format: {
          type: "json_object",
        },
      },
    });

    // ✅ Sortie propre et fiable
    const json = JSON.parse(response.output_text);

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