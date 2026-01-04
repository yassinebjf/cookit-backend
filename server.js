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
    const { ingredients, duration, mode, extraIngredients = [] } = req.body;
    const safeExtraIngredients = Array.isArray(extraIngredients)
      ? extraIngredients.filter(
          (e) => typeof e === "string" && e.trim().length > 0
        )
      : [];
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
    console.log("➕ EXTRA INGREDIENTS:", safeExtraIngredients);

    // ⏱️ Sécurisation de la durée (évite valeurs invalides venant du front)
    const safeDuration = ["rapide", "moyen", "long"].includes(duration)
      ? duration
      : "moyen";

    // 🍽️ Mode de préparation (plat par défaut)
    const safeMode = mode === "dessert" ? "dessert" : "savory";
    console.log("🍽️ MODE:", safeMode);

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

MODE DE PRÉPARATION :
- Mode sélectionné : ${safeMode === "dessert" ? "PÂTISSERIE / SUCRÉ" : "PLAT SALÉ"}

--------------------------------------------------
RÈGLES COMMUNES (TOUS MODES) :

Tu DOIS utiliser UNIQUEMENT :
- les ingrédients fournis par l’utilisateur
- les ingrédients supplémentaires explicitement sélectionnés dans l’interface

Liste des ingrédients supplémentaires AUTORISÉS :
${safeExtraIngredients.length > 0 ? safeExtraIngredients.join(", ") : "AUCUN"}

AUTORISÉ AUTOMATIQUEMENT :
- sel
- poivre
- toutes les épices sèches (paprika, curry, curcuma, cumin, herbes sèches, thym, laurier, etc.)
- huile, beurre
- eau
- lait

INGRÉDIENTS TECHNIQUES AUTORISÉS (USAGE LIMITÉ) :
- farine
- sucre

⚠️ La farine et le sucre sont AUTORISÉS UNIQUEMENT comme ingrédients techniques
(liaison, panure, texture, équilibre, caramélisation légère).
Ils NE DOIVENT PAS servir à créer des desserts ou pâtisseries complètes
SAUF si le mode est explicitement "dessert".

INTERDICTION ABSOLUE (TOUS MODES) :
- ajouter des ingrédients NON présents dans les listes ci-dessus
- ajouter des légumes, fruits ou produits frais non explicitement fournis
- compléter une recette avec des ingrédients "logiques"
- suggérer ou demander des ingrédients manquants

--------------------------------------------------
MODE PLAT SALÉ (${safeMode === "savory" ? "ACTIF" : "INACTIF"}) :

Tu es un chef cuisinier professionnel, expert STRICT en cuisine ${cuisine}.

RÈGLES SPÉCIFIQUES :
- La recette DOIT être salée
- INTERDICTION de créer un dessert ou une pâtisserie
- La recette DOIT durer ${durationHint}
- Respect STRICT des ingrédients fournis

--------------------------------------------------
MODE PÂTISSERIE (${safeMode === "dessert" ? "ACTIF" : "INACTIF"}) :

Tu es un pâtissier professionnel.

RÈGLES SPÉCIFIQUES :
- La recette DOIT être sucrée
- Les techniques de pâtisserie sont AUTORISÉES
- La farine et le sucre peuvent être utilisés librement
- La recette DOIT rester simple et réalisable avec les ingrédients fournis

--------------------------------------------------
VARIATION OBLIGATOIRE :

Si une recette a déjà été proposée pour ces ingrédients, ce mode et cette cuisine,
tu DOIS proposer une recette DIFFÉRENTE.

Tu peux varier :
- le type de préparation
- la technique
- les épices dominantes
- la texture finale

--------------------------------------------------
FORMAT DE RÉPONSE — JSON STRICT UNIQUEMENT.

{
  "status": "ok",
  "title": "string",
  "ingredients": "string",
  "steps": ["step 1", "step 2", "step 3"],
  "calories": number,
  "estimatedMinutes": number,
  "cuisine": "${cuisine}",
  "mode": "${safeMode}",
  "suggestion": null
}

RÈGLE FINALE :
Si les ingrédients principaux ET supplémentaires fournis sont compatibles avec le mode sélectionné,
TU DOIS générer une recette STRICTE sans aucun ingrédient ajouté.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
      temperature: 0.6,
      text: {
        format: { type: "json_object" }
      }
    });

    // 🛡️ PARSING ULTRA SAFE (Render / OpenAI)
    let json;

    try {
      if (response.output_parsed) {
        json = response.output_parsed;
      } else if (
        response.output &&
        response.output[0]?.content &&
        response.output[0].content[0]?.text
      ) {
        json = JSON.parse(response.output[0].content[0].text);
      } else {
        throw new Error("No parsable OpenAI response");
      }
    } catch (e) {
      console.error("❌ OpenAI BAD RESPONSE:", response);
      return res.status(502).json({
        error: "OPENAI_BAD_RESPONSE",
        message: "Invalid AI response format",
      });
    }

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