import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// ✅ OpenAI client (UNE SEULE FOIS)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("🍳 Cookit backend is running");
});

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

    // ✅ JSON déjà parsé par OpenAI
    return res.status(200).json(response.output_parsed);

  } catch (error) {
    console.error("❌ /recipe error:", error);

    return res.status(500).json({
      error: "AI_ERROR",
      message: error.message ?? "Failed to generate recipe",
    });
  }
});

// ✅ TOUJOURS EN DEHORS DES ROUTES
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});