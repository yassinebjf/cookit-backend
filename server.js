import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";

dotenv.config();
const IS_DEV = process.env.NODE_ENV !== "production";

const app = express();
const PORT = process.env.PORT || 10000;

// =========================
// Middlewares
// =========================
app.use(cors());
app.use(express.json());

const recipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

// =========================
// Health check
// =========================
const START_TIME = Date.now();
const VERSION = "2.0.0";

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "cookit-backend",
    version: VERSION,
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// =========================
// OpenAI client
// =========================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =========================
// 🍳 RECIPE GENERATION
// =========================
app.post("/recipe", recipeLimiter, async (req, res) => {
  try {
    const {
      ingredients,
      duration,
      mode,
      extraIngredients = [],
      isPremium = false,
    } = req.body;

    const PREMIUM_MODE = isPremium === true;
    const randomCuisines = [
      "french",
      "italian",
      "indian",
      "mexican",
      "japanese",
      "mediterranean",
      "vegetarian",
    ];

    // Normalisation de la cuisine reçue (front multilingue)
    const rawCuisine =
      typeof req.body.cuisine === "string"
        ? req.body.cuisine.trim().toLowerCase()
        : null;

    // Valeurs considérées comme "aléatoire"
    const RANDOM_KEYS = [
      "random",
      "aleatoire",
      "aléatoire",
      "choisis un type de cuisine",
      ""
    ];

    // Mapping labels UI → codes backend
    const CUISINE_MAP = {
      // French
      "française": "french",
      "francais": "french",
      "french": "french",

      // Italian
      "italienne": "italian",
      "italian": "italian",

      // Indian
      "indienne": "indian",
      "indian": "indian",

      // Japanese
      "japonaise": "japanese",
      "japanese": "japanese",

      // Mediterranean
      "méditerranéenne": "mediterranean",
      "mediterraneenne": "mediterranean",
      "mediterranean": "mediterranean",

      // Mexican
      "mexicaine": "mexican",
      "mexicain": "mexican",
      "mexican": "mexican",

      // Vegetarian
      "végétarienne": "vegetarian",
      "vegetarienne": "vegetarian",
      "vegetarian": "vegetarian",
    };

    let cuisine;

    if (!rawCuisine || RANDOM_KEYS.includes(rawCuisine)) {
      cuisine =
        randomCuisines[Math.floor(Math.random() * randomCuisines.length)];
    } else if (CUISINE_MAP[rawCuisine]) {
      cuisine = CUISINE_MAP[rawCuisine];
    } else {
      // Sécurité : fallback random si valeur inconnue
      cuisine =
        randomCuisines[Math.floor(Math.random() * randomCuisines.length)];
    }

    // =========================
    // 🔒 BACKEND VALIDATION (SOURCE DE VÉRITÉ)
    // =========================
    if (!ingredients || ingredients.trim().length === 0) {
      return res.status(400).json({
        error: "NO_INGREDIENTS",
        message: "No ingredients provided",
      });
    }

    // ⏱️ Validation stricte de la durée (le backend refuse l'incohérence)
    if (!duration || !["rapide", "moyen", "long"].includes(duration)) {
      return res.status(400).json({
        error: "INVALID_DURATION",
        message: "Duration must be 'rapide', 'moyen' or 'long'",
      });
    }

    const safeDuration = duration;

    // 🍽️ Mode de préparation (plat par défaut)

    // ⏱️ CONTRAINTE DE DURÉE
    const durationHint = {
      rapide: "15 minutes maximum",
      moyen: "entre 30 et 40 minutes",
      long: "60 minutes ou plus",
    }[safeDuration];

    const estimatedMinutes =
      safeDuration === "rapide" ? 10 :
      safeDuration === "moyen" ? 30 :
      60;

    const aiConfig = PREMIUM_MODE
      ? {
          model: "gpt-4.1",
          temperature: 0.3,
          timeoutMs: 30_000,
          extraPrompt: `
MODE PREMIUM ACTIVÉ
- Réponses plus précises
- Quantités plus détaillées
- Étapes plus pédagogiques
- Calories plus cohérentes et réalistes
`,
        }
      : {
          model: "gpt-4.1-mini",
          temperature: 0.6,
          timeoutMs: 20_000,
          extraPrompt: "",
        };
    // 🚨 VERROUILLAGE ABSOLU :
    // Les ingrédients sont CONSIDÉRÉS VALIDES.
    // L’IA n’a PAS le droit de discuter ce point.
    const prompt = `
${aiConfig.extraPrompt}
MODE STRICT — OBLIGATOIRE

Tu es dans un mode de CONTRAINTE ABSOLUE.
Ce n’est PAS une tâche créative libre.
Tu dois STRICTEMENT respecter les règles ci-dessous.

--------------------------------------------------
LISTE DES INGRÉDIENTS AUTORISÉS (LISTE FERMÉE) :

${ingredients}

--------------------------------------------------
RÈGLES ABSOLUES (AUCUNE EXCEPTION) :

1. Tu DOIS utiliser UNIQUEMENT les ingrédients listés ci-dessus.
2. Tu ES STRICTEMENT INTERDIT d’ajouter :
   - viande
   - poisson
   - volaille
   - fruits de mer
   - légumes
   - fruits
   - produits laitiers
   - tout ingrédient non listé explicitement

3. Tu ES AUTORISÉ à ajouter UNIQUEMENT :
   - sel
   - poivre
   - épices sèches (en lien avec la cuisine choisie)
   - huile ou matière grasse
   - liquides techniques : eau, vinaigre, sauce soja, vin

4. Si la liste d’ingrédients est très courte :
   - tu DOIS quand même produire un plat valide
   - une recette simple et traditionnelle est attendue
   - tu n’as PAS le droit d’inventer des ingrédients

--------------------------------------------------
STYLE DE CUISINE :

Cuisine sélectionnée : ${cuisine || "basée ingrédients"}

La cuisine influence UNIQUEMENT :
- les épices
- la technique
- le nom du plat

Elle NE DOIT JAMAIS introduire de nouveaux ingrédients.

--------------------------------------------------
CONTRAINTE DE DURÉE :

La recette DOIT durer : ${durationHint}

--------------------------------------------------
FORMAT DE RÉPONSE — JSON STRICT UNIQUEMENT :

{
  "status": "ok",
  "title": "string",
  "ingredients": "string",
  "steps": ["étape 1", "étape 2"],
  "estimatedMinutes": ${estimatedMinutes},
  "caloriesKcal": number (estimation réaliste basée sur les ingrédients et quantités),
  "cuisine": "${cuisine}",
  "mode": "strict"
}

--------------------------------------------------
RÈGLE CALORIES (OBLIGATOIRE) :

- Tu DOIS estimer les calories à partir des ingrédients réellement utilisés
- Utilise des portions réalistes (ex: 1 œuf ≈ 70 kcal)
- L’estimation doit être cohérente avec la recette (±20% accepté)
- Tu N’AS PAS le droit d’inventer des calories arbitraires

--------------------------------------------------
RÈGLE FINALE :

Si TU AJOUTES un ingrédient non autorisé,
la réponse est CONSIDÉRÉE COMME INVALIDE.
`;

    const openAITimeoutMs = aiConfig.timeoutMs;

    const response = await Promise.race([
      client.responses.create({
        model: aiConfig.model,
        input: prompt,
        temperature: aiConfig.temperature,
        text: {
          format: { type: "json_object" }
        }
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("OPENAI_TIMEOUT")),
          openAITimeoutMs
        )
      ),
    ]);

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
      if (IS_DEV) {
        console.error("❌ OpenAI BAD RESPONSE:", response);
      }
      return res.status(502).json({
        error: "OPENAI_BAD_RESPONSE",
        message: "Invalid AI response format",
      });
    }

    if (json.status === "refused") {
      return res.status(422).json(json);
    }

    // 🛡️ Validation stricte des calories (jamais inventées par le backend)
    if (typeof json.caloriesKcal !== "number" || json.caloriesKcal <= 0) {
      return res.status(502).json({
        error: "INVALID_CALORIES",
        message: "AI did not return valid calorie estimation",
      });
    }
    json.caloriesKcal = Math.round(json.caloriesKcal);

    // 🛡️ Sécurité finale : jamais de minutes nulles
    if (typeof json.estimatedMinutes !== "number") {
      json.estimatedMinutes = estimatedMinutes;
    }

    return res.status(200).json(json);

  } catch (error) {
    if (IS_DEV) {
      console.error("❌ /recipe error:", error);
    }
    if (error.message === "OPENAI_TIMEOUT") {
      return res.status(504).json({
        error: "OPENAI_TIMEOUT",
        message: "AI response took too long, please retry",
      });
    }

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
  console.log(`🚀 Cookit backend listening on port ${PORT} (${IS_DEV ? "dev" : "prod"})`);
});