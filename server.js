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

    // 🔥 MOCK ACTUEL (sera remplacé par IA)
    return res.status(200).json({
      title: "Recette test Cookit",
      ingredients,
      steps: [
        "Coupe les ingrédients",
        "Fais chauffer une poêle",
        "Cuisine tranquillement 😄",
      ],
      calories: 450,
      estimatedMinutes: 20,
      cuisine: "auto",
    });
  } catch (error) {
    console.error("❌ /recipe error:", error);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong on the server",
    });
  }
});

// ✅ TOUJOURS EN DEHORS DES ROUTES
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});