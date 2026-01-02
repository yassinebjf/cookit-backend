import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🍳 Cookit backend is running");
});

app.post("/recipe", (req, res) => {
  const { ingredients } = req.body;

  if (!ingredients) {
    return res.status(400).json({ error: "No ingredients provided" });
  }

  res.json({
    title: "Recette test Cookit",
    ingredients,
    steps: [
      "Coupe les ingrédients",
      "Fais chauffer une poêle",
      "Cuisine tranquillement 😄"
    ],
    calories: 450,
    estimatedMinutes: 20,
    cuisine: "auto"
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT}`);
});