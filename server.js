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
// 🌐 Langue de sortie des recettes (indépendante des champs techniques
// fixes comme "technique" et "cuisine", qui restent en anglais/valeurs
// canoniques — c'est le client Flutter qui les traduit à l'affichage)
// =========================
const LANGUAGE_NAMES = {
  fr: "français",
  en: "English",
  ar: "العربية (Arabic)",
  zh: "中文 (Chinese)",
  de: "Deutsch (German)",
  es: "español (Spanish)",
  tr: "Türkçe (Turkish)",
};

function languageInstruction(languageCode) {
  const name = LANGUAGE_NAMES[languageCode] || LANGUAGE_NAMES.fr;
  return `
--------------------------------------------------
LANGUE DE SORTIE (OBLIGATOIRE) :

Tout le texte libre lisible par l'utilisateur (title, ingredients,
steps, reason en cas de refus) DOIT être rédigé en ${name}.

Exception stricte : les champs "technique" et "cuisine" du JSON de
réponse ne sont JAMAIS traduits — ils DOIVENT rester exactement l'une
des valeurs fixes indiquées dans le format de réponse ci-dessous (ex:
"four", "poele", "mijote", "french", "italian"...), quelle que soit
la langue de sortie choisie.
`;
}

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
// 📵 Daily per-device cap (abuse protection against runaway/bot usage,
// not a defense against normal cost — see cookit_product_decisions memory)
// =========================
const DAILY_RECIPE_LIMIT = 5;
const dailyUsage = new Map(); // deviceId -> { count, resetAt }

function deviceDailyLimiter(req, res, next) {
  const deviceId =
    typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";

  if (!deviceId) {
    return res.status(400).json({
      error: "MISSING_DEVICE_ID",
      message: "deviceId is required",
    });
  }

  const now = Date.now();
  let entry = dailyUsage.get(deviceId);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
  }

  if (entry.count >= DAILY_RECIPE_LIMIT) {
    dailyUsage.set(deviceId, entry);
    return res.status(429).json({
      error: "DAILY_LIMIT_REACHED",
      message: `Daily limit of ${DAILY_RECIPE_LIMIT} recipe generations reached`,
      resetAt: new Date(entry.resetAt).toISOString(),
    });
  }

  entry.count += 1;
  dailyUsage.set(deviceId, entry);
  next();
}

// Évite une fuite mémoire lente : purge les entrées expirées chaque heure.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of dailyUsage) {
    if (now >= entry.resetAt) dailyUsage.delete(id);
  }
}, 60 * 60 * 1000).unref();

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
// Privacy policy (required for Google Play submission)
// =========================
app.get("/privacy", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Politique de confidentialité — Cook'it</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; background: #fff; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  footer { margin-top: 3rem; font-size: 0.85rem; color: #666; }
</style>
</head>
<body>
<h1>Politique de confidentialité — Cook'it</h1>
<p>Dernière mise à jour : 28 juillet 2026</p>

<p>Cook'it ("l'application", "nous") est une application qui génère des recettes de cuisine à partir des ingrédients que vous indiquez. Cette page explique quelles données sont traitées et comment.</p>

<h2>Ce que vous nous envoyez</h2>
<p>Lorsque vous demandez une recette, le texte des ingrédients que vous tapez ou dictez, ainsi que vos préférences (type de cuisine, durée de préparation), sont envoyés à notre serveur puis transmis à OpenAI pour générer la recette, et à Unsplash pour trouver une photo illustrative correspondant au plat. Nous ne demandons ni ne collectons votre nom, votre adresse e-mail ou toute autre donnée d'identification pour utiliser cette fonctionnalité.</p>

<h2>Micro et dictée vocale</h2>
<p>Si vous utilisez la dictée vocale, l'audio est traité directement par le service de reconnaissance vocale de votre appareil (Android ou iOS). Nous ne recevons ni ne stockons aucun enregistrement audio.</p>

<h2>Données stockées sur votre appareil</h2>
<p>Votre historique de recettes, vos favoris et vos points de progression sont enregistrés uniquement en local sur votre appareil. Nous n'avons pas accès à ces données et elles ne sont pas envoyées à nos serveurs.</p>

<h2>Compte et connexion</h2>
<p>Cook'it fonctionne actuellement en mode invité : aucune création de compte n'est requise et aucune donnée de connexion n'est collectée.</p>

<h2>Publicité</h2>
<p>Les publicités sont actuellement désactivées dans l'application. Si elles venaient à être activées dans une future mise à jour, cette page sera mise à jour en conséquence avant leur activation.</p>

<h2>Services tiers utilisés</h2>
<ul>
  <li><strong>OpenAI</strong> — génération du texte de la recette à partir des ingrédients fournis.</li>
  <li><strong>Unsplash</strong> — recherche d'une photo générique correspondant au type de plat.</li>
  <li><strong>Firebase (Google)</strong> — infrastructure technique de l'application.</li>
</ul>
<p>Ces services peuvent traiter les données selon leurs propres politiques de confidentialité respectives.</p>

<h2>Permissions de l'application</h2>
<ul>
  <li><strong>Microphone</strong> — pour dicter vos ingrédients (traitement local par votre appareil, voir ci-dessus).</li>
  <li><strong>Internet</strong> — pour générer les recettes et charger les photos.</li>
  <li><strong>Notifications</strong> — pour vous prévenir quand un minuteur de cuisson est terminé.</li>
</ul>

<h2>Enfants</h2>
<p>Cook'it n'est pas destinée aux enfants de moins de 13 ans et ne collecte pas sciemment de données auprès d'eux.</p>

<h2>Modifications</h2>
<p>Cette politique peut être mise à jour si l'application évolue. La date de dernière mise à jour figure en haut de cette page.</p>

<h2>Contact</h2>
<p>Pour toute question concernant cette politique, contactez-nous à : <a href="mailto:yassinebjf98@gmail.com">yassinebjf98@gmail.com</a></p>

<footer>Cook'it</footer>
</body>
</html>`);
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
app.post("/recipe", recipeLimiter, deviceDailyLimiter, async (req, res) => {
  try {
    const {
      ingredients,
      duration,
      mode,
      extraIngredients = [],
      language = "fr",
    } = req.body;

    // 🔒 Pas de vrai système d'abonnement pour l'instant : on n'a AUCUNE
    // raison de faire confiance à un champ envoyé par le client pour
    // décider quel modèle IA (donc quel coût) utiliser. Codé en dur à
    // false jusqu'à ce qu'un vrai statut premium existe côté serveur.
    const PREMIUM_MODE = false;
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
    // Les ingrédients listés sont CONSIDÉRÉS VALIDES pour composer la
    // recette (l'IA ne discute pas ce point) — mais la liste elle-même
    // doit d'abord être de vrais ingrédients, voir VALIDATION D'ENTRÉE.
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
VALIDATION D'ENTRÉE (PRIORITAIRE, AVANT TOUTE AUTRE RÈGLE) :

Si la liste ci-dessus ne contient PAS de vrais ingrédients alimentaires
reconnaissables — mots inventés, charabia, insultes, excréments/fluides
corporels, contenu vulgaire ou choquant, sujet non alimentaire, texte
au hasard — tu DOIS répondre UNIQUEMENT avec :
{"status": "refused", "reason": "..."}
(reason = une phrase courte et polie, DANS LA LANGUE DE SORTIE demandée
plus bas dans ce message, expliquant qu'il faut
indiquer de vrais ingrédients) et NE PRODUIRE AUCUNE RECETTE.
Dans le doute (ex: ingrédient rare mais réel), ne refuse PAS.

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
${languageInstruction(language)}
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
// 🍳🍳🍳 3 RECIPE SUGGESTIONS (carte à swiper)
// =========================
app.post("/recipes", recipeLimiter, deviceDailyLimiter, async (req, res) => {
  try {
    const {
      ingredients,
      duration,
      extraIngredients = [],
      dietary = null,
      language = "fr",
    } = req.body;

    // 🔒 Même raisonnement que sur /recipe : pas de vrai abonnement
    // aujourd'hui, donc pas de confiance dans un champ client pour le coût.
    const PREMIUM_MODE = false;

    const DIET_RULES = {
      vegetarian:
        "Le plat doit être VÉGÉTARIEN : aucune viande, volaille, poisson ni fruit de mer, dans aucune des 3 recettes. Si la liste d'ingrédients fournie contient de la viande, du poisson, de la volaille ou des fruits de mer, tu DOIS répondre avec {\"status\": \"refused\", \"reason\": \"...\"} au lieu de générer des recettes.",
      vegan:
        "Le plat doit être VÉGANE : aucune viande, volaille, poisson, fruit de mer, produit laitier, œuf ni miel, dans aucune des 3 recettes. Si la liste d'ingrédients fournie contient l'un de ces éléments, tu DOIS répondre avec {\"status\": \"refused\", \"reason\": \"...\"} au lieu de générer des recettes.",
      gluten_free:
        "Le plat doit être SANS GLUTEN : pas de blé, orge, seigle, pâtes ou pain classiques, sauce soja classique. Adapte la technique de cuisson si besoin, sans jamais ajouter un ingrédient interdit par les règles ci-dessus.",
      dairy_free:
        "Le plat doit être SANS PRODUITS LAITIERS : pas de lait, crème, beurre, fromage ni yaourt. Si la liste d'ingrédients fournie en contient, tu DOIS répondre avec {\"status\": \"refused\", \"reason\": \"...\"} au lieu de générer des recettes.",
    };
    const dietaryRule = dietary && DIET_RULES[dietary] ? DIET_RULES[dietary] : null;

    const randomCuisines = [
      "french",
      "italian",
      "indian",
      "mexican",
      "japanese",
      "mediterranean",
      "vegetarian",
    ];

    const rawCuisine =
      typeof req.body.cuisine === "string"
        ? req.body.cuisine.trim().toLowerCase()
        : null;

    const RANDOM_KEYS = [
      "random",
      "aleatoire",
      "aléatoire",
      "choisis un type de cuisine",
      ""
    ];

    const CUISINE_MAP = {
      "française": "french", "francais": "french", "french": "french",
      "italienne": "italian", "italian": "italian",
      "indienne": "indian", "indian": "indian",
      "japonaise": "japanese", "japanese": "japanese",
      "méditerranéenne": "mediterranean", "mediterraneenne": "mediterranean", "mediterranean": "mediterranean",
      "mexicaine": "mexican", "mexicain": "mexican", "mexican": "mexican",
      "végétarienne": "vegetarian", "vegetarienne": "vegetarian", "vegetarian": "vegetarian",
    };

    let cuisine;
    if (!rawCuisine || RANDOM_KEYS.includes(rawCuisine)) {
      cuisine = randomCuisines[Math.floor(Math.random() * randomCuisines.length)];
    } else if (CUISINE_MAP[rawCuisine]) {
      cuisine = CUISINE_MAP[rawCuisine];
    } else {
      cuisine = randomCuisines[Math.floor(Math.random() * randomCuisines.length)];
    }

    if (!ingredients || ingredients.trim().length === 0) {
      return res.status(400).json({ error: "NO_INGREDIENTS", message: "No ingredients provided" });
    }

    if (!duration || !["rapide", "moyen", "long"].includes(duration)) {
      return res.status(400).json({ error: "INVALID_DURATION", message: "Duration must be 'rapide', 'moyen' or 'long'" });
    }

    const safeDuration = duration;
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
      ? { model: "gpt-4.1", temperature: 0.5, timeoutMs: 45_000 }
      : { model: "gpt-4.1-mini", temperature: 0.7, timeoutMs: 35_000 };

    const prompt = `
MODE STRICT — OBLIGATOIRE

Tu es dans un mode de CONTRAINTE ABSOLUE.
Ce n'est PAS une tâche créative libre.
Tu dois STRICTEMENT respecter les règles ci-dessous.

--------------------------------------------------
LISTE DES INGRÉDIENTS AUTORISÉS (LISTE FERMÉE) :

${ingredients}

--------------------------------------------------
VALIDATION D'ENTRÉE (PRIORITAIRE, AVANT TOUTE AUTRE RÈGLE) :

Si la liste ci-dessus ne contient PAS de vrais ingrédients alimentaires
reconnaissables — mots inventés, charabia, insultes, excréments/fluides
corporels, contenu vulgaire ou choquant, sujet non alimentaire, texte
au hasard — tu DOIS répondre UNIQUEMENT avec :
{"status": "refused", "reason": "..."}
(reason = une phrase courte et polie, DANS LA LANGUE DE SORTIE demandée
plus bas dans ce message, expliquant qu'il faut
indiquer de vrais ingrédients) et NE PRODUIRE AUCUNE RECETTE.
Dans le doute (ex: ingrédient rare mais réel), ne refuse PAS.

--------------------------------------------------
RÈGLES ABSOLUES (AUCUNE EXCEPTION) :

1. Tu DOIS utiliser UNIQUEMENT les ingrédients listés ci-dessus.
2. Tu ES STRICTEMENT INTERDIT d'ajouter :
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

4. Si la liste d'ingrédients est très courte :
   - tu DOIS quand même produire un plat valide pour chacune des 3 recettes
   - une recette simple et traditionnelle est attendue
   - tu n'as PAS le droit d'inventer des ingrédients

${dietaryRule ? `--------------------------------------------------
CONTRAINTE ALIMENTAIRE (OBLIGATOIRE) :

${dietaryRule}

` : ""}--------------------------------------------------
TU DOIS PRODUIRE EXACTEMENT 3 RECETTES DIFFÉRENTES.

Chaque recette DOIT utiliser une technique de cuisson différente et imposée :
- Recette 1 : technique "four / rôti"
- Recette 2 : technique "poêle / sauté"
- Recette 3 : technique "mijoté / bouilli / vapeur" (ou un plat froid type salade si les ingrédients ne se prêtent pas à la cuisson)

Les 3 recettes doivent avoir des titres clairement différents et ne pas être de simples variantes l'une de l'autre.

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

Chaque recette DOIT durer : ${durationHint}
${languageInstruction(language)}
--------------------------------------------------
FORMAT DE RÉPONSE — JSON STRICT UNIQUEMENT :

{
  "status": "ok",
  "recipes": [
    {
      "title": "string",
      "technique": "four" | "poele" | "mijote",
      "ingredients": "string",
      "steps": ["étape 1", "étape 2"],
      "estimatedMinutes": ${estimatedMinutes},
      "caloriesKcal": number (estimation réaliste basée sur les ingrédients et quantités),
      "cuisine": "${cuisine}",
      "mode": "strict"
    }
  ]
}

Le tableau "recipes" doit contenir EXACTEMENT 3 éléments, dans l'ordre four / poêle / mijoté.

--------------------------------------------------
RÈGLE CALORIES (OBLIGATOIRE) :

- Tu DOIS estimer les calories à partir des ingrédients réellement utilisés, pour CHAQUE recette
- Utilise des portions réalistes (ex: 1 œuf ≈ 70 kcal)
- L'estimation doit être cohérente avec la recette (±20% accepté)
- Tu N'AS PAS le droit d'inventer des calories arbitraires

--------------------------------------------------
RÈGLE FINALE :

Si TU AJOUTES un ingrédient non autorisé, ou si tu ne produis pas exactement 3 recettes différentes,
la réponse est CONSIDÉRÉE COMME INVALIDE.
`;

    const response = await Promise.race([
      client.responses.create({
        model: aiConfig.model,
        input: prompt,
        temperature: aiConfig.temperature,
        text: { format: { type: "json_object" } },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OPENAI_TIMEOUT")), aiConfig.timeoutMs)
      ),
    ]);

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
      if (IS_DEV) console.error("❌ OpenAI BAD RESPONSE:", response);
      return res.status(502).json({ error: "OPENAI_BAD_RESPONSE", message: "Invalid AI response format" });
    }

    if (json.status === "refused") {
      return res.status(422).json(json);
    }

    if (!Array.isArray(json.recipes) || json.recipes.length === 0) {
      return res.status(502).json({ error: "INVALID_RECIPES", message: "AI did not return a recipes array" });
    }

    // 🛡️ Validation + normalisation de chaque recette
    for (const recipe of json.recipes) {
      if (typeof recipe.caloriesKcal !== "number" || recipe.caloriesKcal <= 0) {
        return res.status(502).json({ error: "INVALID_CALORIES", message: "AI did not return valid calorie estimation" });
      }
      recipe.caloriesKcal = Math.round(recipe.caloriesKcal);
      if (typeof recipe.estimatedMinutes !== "number") {
        recipe.estimatedMinutes = estimatedMinutes;
      }
    }

    // 🛡️ Anti-doublon : titres normalisés trop proches -> on garde quand même
    // mais on log côté serveur pour surveiller la qualité du prompt dans le temps.
    const normalizedTitles = json.recipes.map((r) =>
      (r.title || "").toLowerCase().trim()
    );
    const uniqueTitles = new Set(normalizedTitles);
    if (uniqueTitles.size < normalizedTitles.length && IS_DEV) {
      console.warn("⚠️ Titres de recettes potentiellement dupliqués:", normalizedTitles);
    }

    return res.status(200).json(json);
  } catch (error) {
    if (IS_DEV) console.error("❌ /recipes error:", error);
    if (error.message === "OPENAI_TIMEOUT") {
      return res.status(504).json({ error: "OPENAI_TIMEOUT", message: "AI response took too long, please retry" });
    }
    return res.status(500).json({ error: "AI_ERROR", message: error.message || "Failed to generate recipes" });
  }
});

// =========================
// 🖼️ IMAGE SEARCH (proxy Unsplash — la clé reste côté serveur)
// =========================
app.get("/image", recipeLimiter, async (req, res) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) {
      return res.status(400).json({ error: "NO_QUERY", message: "Missing query" });
    }

    const unsplashUrl =
      "https://api.unsplash.com/search/photos" +
      `?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;

    const unsplashRes = await fetch(unsplashUrl, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
    });

    if (!unsplashRes.ok) {
      return res.status(502).json({ error: "UNSPLASH_ERROR" });
    }

    const data = await unsplashRes.json();
    const url = data?.results?.[0]?.urls?.regular ?? null;

    return res.status(200).json({ url });
  } catch (error) {
    if (IS_DEV) {
      console.error("❌ /image error:", error);
    }
    return res.status(500).json({ error: "IMAGE_ERROR" });
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Cookit backend listening on port ${PORT} (${IS_DEV ? "dev" : "prod"})`);
});