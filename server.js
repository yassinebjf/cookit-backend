import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// ✅ INIT OPENAI (STEP 2)
const openai = new OpenAI({
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
Tu es un chef cuisinier.
À partir des ingrédients suivants : "${ingredients}"

Génère UNE recette en JSON STRICT avec EXACTEMENT ce format :

{
  "title": "string",
  "ingredients": "string",
  "steps": ["step 1", "step 2", "step 3"],
  "calories": number,
  "estimatedMinutes": number,
  "cuisine": "string"
}

⚠️ Ne renvoie RIEN d'autre que du JSON valide.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    const raw = completion.choices[0].message.content;

    const recipe = JSON.parse(raw);

    return res.status(200).json(recipe);

  } catch (error) {
    console.error("❌ /recipe error:", error);

    return res.status(500).json({
      error: "AI_ERROR",
      message: "Failed to generate recipe",
    });
  }
});

// ✅ TOUJOURS EN DEHORS DES ROUTES
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});