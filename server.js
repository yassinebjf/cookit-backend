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

    /**
     * 🧠 PHILOSOPHIE :
     * - Les ingrédients donnés = ingrédients PRINCIPAUX
     * - L’IA PEUT ajouter automatiquement les bases classiques de la cuisine choisie
     *   (épices, aromates, huile, sel…)
     * - REFUS UNIQUEMENT si MÊME AVEC ces bases, la cuisine est impossible
     */

    const prompt = `
Tu es un chef cuisinier professionnel, expert STRICT en cuisine ${cuisine}.

RÈGLES ABSOLUES (À RESPECTER IMPÉRATIVEMENT) :

1️⃣ Les ingrédients fournis par l’utilisateur sont les INGRÉDIENTS PRINCIPAUX.
2️⃣ Tu DOIS ajouter automatiquement les ingrédients de base typiques de la cuisine ${cuisine}
   (épices, aromates, condiments, matières grasses, bases classiques),
   même s’ils ne sont PAS listés par l’utilisateur.
3️⃣ La recette DOIT être authentiquement ${cuisine}.
4️⃣ La recette DOIT durer ${durationHint}. Ne dépasse JAMAIS cette durée.

🚨 REFUS STRICT (CAS RARE) :
Tu REFUSES UNIQUEMENT si les ingrédients PRINCIPAUX sont
fondamentalement incompatibles avec la cuisine ${cuisine},
MÊME après ajout de TOUS les ingrédients de base classiques.

Exemples de REFUS légitime :
- Cuisine japonaise + fromage + chocolat
- Cuisine indienne + chocolat + fromage
- Cuisine italienne + algues + wasabi

⚠️ IMPORTANT :
- Le manque d’épices, d’aromates ou de bases classiques
  N’EST JAMAIS une raison de refus.
- Riz + poulet DOIT TOUJOURS donner une recette indienne valide.

FORMAT DE RÉPONSE — JSON STRICT UNIQUEMENT :

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
  "steps": ["step 1", "step 2", "step 3"],
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
        format: {
          type: "json_object",
        },
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