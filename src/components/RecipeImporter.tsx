import React, { useState, useEffect } from 'react';
import { Search, Compass, Shuffle, ArrowLeft, Download, Check, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { Recipe, RecipeIngredient } from '../types';
import { 
  recipeImportService, 
  mapTheMealDBToRecipe, 
  translateAreaToFrench, 
  translateCategoryFilterToFrench,
  translateText,
  translateIngredients
} from '../services/recipeImportService';

interface RecipeImporterProps {
  onClose: () => void;
  onImport: (recipe: Recipe, ingredients: Omit<RecipeIngredient, 'id' | 'recipeId'>[]) => void;
  existingRecipes: Recipe[];
}

export const RecipeImporter: React.FC<RecipeImporterProps> = ({ onClose, onImport, existingRecipes }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  
  const [meals, setMeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aperçu de recette sélectionnée
  const [selectedMealDetail, setSelectedMealDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Charger les filtres au démarrage
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [cats, regions] = await Promise.all([
          recipeImportService.getCategories(),
          recipeImportService.getAreas()
        ]);
        setCategories(cats);
        setAreas(regions);
      } catch (err) {
        console.error("Erreur chargement des filtres TheMealDB", err);
      }
    };
    loadFilters();
    // Charger des résultats par défaut (recherche vide ou au hasard)
    handleSearch('Chicken');
  }, []);

  const loadMeals = async (query: string, category: string, area: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedMealDetail(null);
    try {
      let results: any[] = [];

      // 1. Déterminer la source principale
      if (query.trim()) {
        // Recherche textuelle
        results = await recipeImportService.searchRecipesByName(query);
      } else if (category && !area) {
        // Catégorie uniquement
        results = await recipeImportService.filterByCategory(category);
        results = results.map(m => ({ ...m, strCategory: category, strArea: 'N/A' }));
      } else if (area && !category) {
        // Pays/Origine uniquement
        results = await recipeImportService.filterByArea(area);
        results = results.map(m => ({ ...m, strCategory: 'N/A', strArea: area }));
      } else if (category && area) {
        // Les deux filtres sont sélectionnés : on récupère les deux listes en parallèle et on fait l'intersection
        const [catMeals, areaMeals] = await Promise.all([
          recipeImportService.filterByCategory(category),
          recipeImportService.filterByArea(area)
        ]);

        const areaMealIds = new Set(areaMeals.map(m => m.idMeal));
        results = catMeals.filter(m => areaMealIds.has(m.idMeal));
        results = results.map(m => ({ ...m, strCategory: category, strArea: area }));
      } else {
        // Aucun filtre : charger par défaut
        results = await recipeImportService.searchRecipesByName('Chicken');
      }

      // Si on a à la fois une recherche textuelle ET des filtres (catégorie/région)
      if (query.trim() && (category || area)) {
        let filterSet: Set<string> | null = null;

        if (category && area) {
          const [catMeals, areaMeals] = await Promise.all([
            recipeImportService.filterByCategory(category),
            recipeImportService.filterByArea(area)
          ]);
          const areaIds = new Set(areaMeals.map(m => m.idMeal));
          const intersectedIds = catMeals.filter(m => areaIds.has(m.idMeal)).map(m => m.idMeal);
          filterSet = new Set(intersectedIds);
        } else if (category) {
          const catMeals = await recipeImportService.filterByCategory(category);
          filterSet = new Set(catMeals.map(m => m.idMeal));
        } else if (area) {
          const areaMeals = await recipeImportService.filterByArea(area);
          filterSet = new Set(areaMeals.map(m => m.idMeal));
        }

        if (filterSet) {
          results = results.filter(m => filterSet!.has(m.idMeal));
        }
      }

      setMeals(results || []);
    } catch (err: any) {
      console.error("Erreur lors du chargement des recettes:", err);
      setError(err.message || "Erreur lors du chargement des recettes.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    loadMeals(query, selectedCategory, selectedArea);
  };

  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(category);
    loadMeals(searchQuery, category, selectedArea);
  };

  const handleAreaFilter = (area: string) => {
    setSelectedArea(area);
    loadMeals(searchQuery, selectedCategory, area);
  };

  const handleRandomRecipe = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedMealDetail(null);
    try {
      const meal = await recipeImportService.getRandomRecipe();
      if (meal) {
        setMeals([meal]);
        // Ouvrir directement l'aperçu
        handleSelectMeal(meal.idMeal);
      } else {
        setMeals([]);
      }
    } catch (err) {
      setError("Erreur lors de la récupération d'une recette aléatoire.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMeal = async (idMeal: string) => {
    setIsLoadingDetail(true);
    try {
      const mealDetail = await recipeImportService.getRecipeDetailsById(idMeal);
      setSelectedMealDetail(mealDetail);
    } catch (err) {
      alert("Impossible de charger les détails de cette recette.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedMealDetail) return;
    setIsTranslating(true);
    try {
      const mapped = mapTheMealDBToRecipe(selectedMealDetail);

      // Traduction en parallèle des champs principaux et des ingrédients
      const [
        translatedName,
        translatedDescription,
        translatedInstructions,
        translatedIngredientsList
      ] = await Promise.all([
        translateText(mapped.recipe.name),
        translateText(mapped.recipe.description),
        translateText(mapped.recipe.instructions || ''),
        translateIngredients(mapped.ingredients)
      ]);

      const translatedArea = translateAreaToFrench(selectedMealDetail.strArea || '');
      const finalNotes = `Catégorie originale : ${selectedMealDetail.strCategory || 'N/A'}\nCuisine : ${translatedArea}\n\nRecette importée et traduite en français.`;

      const translatedRecipe: Recipe = {
        ...mapped.recipe,
        name: translatedName,
        description: translatedDescription,
        instructions: translatedInstructions,
        notes: finalNotes,
        rawExtractedText: `Recette importée depuis TheMealDB.\nOrigine : ${translatedArea}\nYouTube : ${mapped.recipe.videoUrl || 'Aucun'}\nSite web : ${mapped.recipe.sourceUrl || 'Aucun'}`
      };

      onImport(translatedRecipe, translatedIngredientsList);
    } catch (err) {
      console.error("Erreur lors de la traduction de la recette:", err);
      // Fallback en cas d'erreur de traduction : importer la version non-traduite
      const mapped = mapTheMealDBToRecipe(selectedMealDetail);
      onImport(mapped.recipe, mapped.ingredients);
    } finally {
      setIsTranslating(false);
    }
  };

  // Détection de doublons dans la base locale existante
  const isAlreadyImported = (idMeal: string, name: string) => {
    return existingRecipes.some(
      r => r.externalId === idMeal || r.name.toLowerCase() === name.toLowerCase()
    );
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '16px 0' }}>
      
      {/* BOUTON RETOUR */}
      <button 
        type="button" 
        className="btn btn-secondary" 
        style={{ marginBottom: '20px', height: '36px', padding: '0 12px' }}
        onClick={onClose}
      >
        <ArrowLeft size={16} />
        Retour aux recettes
      </button>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Importer depuis TheMealDB</h1>
          <p className="page-subtitle">Recherchez parmi des milliers de recettes gratuites et importez-les dans MarmiCout</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleRandomRecipe} disabled={isLoading}>
          <Shuffle size={16} style={{ marginRight: '6px' }} />
          Recette aléatoire
        </button>
      </div>

      {/* ZONE DE FILTRES ET RECHERCHE */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          
          {/* Recherche textuelle */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchQuery);
            }}
            style={{ display: 'flex', gap: '10px' }}
          >
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                placeholder="Rechercher par nom de plat (ex: Beef Wellington, Tarte, Apple)..."
                className="form-input"
                style={{ paddingLeft: '36px', height: '44px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--color-dark-light)' }} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: '44px', padding: '0 20px' }} disabled={isLoading}>
              Rechercher
            </button>
          </form>

          {/* Filtres par Catégorie et Région */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px' }}>Filtrer par Catégorie</label>
              <select 
                className="form-input" 
                style={{ height: '38px' }}
                value={selectedCategory} 
                onChange={(e) => handleCategoryFilter(e.target.value)}
              >
                <option value="">-- Choisir une catégorie --</option>
                {[...categories]
                  .sort((a, b) => translateCategoryFilterToFrench(a.strCategory).localeCompare(translateCategoryFilterToFrench(b.strCategory)))
                  .map((c: any) => (
                    <option key={c.idCategory} value={c.strCategory}>{translateCategoryFilterToFrench(c.strCategory)}</option>
                  ))
                }
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px' }}>Filtrer par Pays / Origine</label>
              <select 
                className="form-input" 
                style={{ height: '38px' }}
                value={selectedArea} 
                onChange={(e) => handleAreaFilter(e.target.value)}
              >
                <option value="">-- Choisir une origine --</option>
                {[...areas]
                  .sort((a, b) => translateAreaToFrench(a).localeCompare(translateAreaToFrench(b)))
                  .map((a: string) => (
                    <option key={a} value={a}>{translateAreaToFrench(a)}</option>
                  ))
                }
              </select>
            </div>
          </div>

        </div>
      </div>

      {/* CORPS PRINCIPAL : GRILLE / DÉTAIL */}
      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <RefreshCw size={36} className="spin" style={{ margin: '0 auto 16px', color: 'var(--color-primary)', animation: 'spin 1.5s linear infinite' }} />
          <p style={{ color: 'var(--color-dark-light)' }}>Recherche en cours dans la base de données TheMealDB...</p>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '24px', borderLeft: '4px solid var(--color-danger)', backgroundColor: 'var(--color-danger-light)' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <AlertCircle size={24} style={{ color: 'var(--color-danger)' }} />
            <div>
              <strong style={{ color: 'var(--color-danger)', display: 'block' }}>Une erreur est survenue</strong>
              <span style={{ fontSize: '13px', color: 'var(--color-dark)' }}>{error}</span>
            </div>
          </div>
        </div>
      ) : !meals || meals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-dark-light)' }}>
          <Compass size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p>Aucun résultat trouvé pour votre recherche. Essayez un autre mot-clé (de préférence en anglais).</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedMealDetail ? '1fr 1fr' : '1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* COLONNE GAUCHE : LISTE DES RÉSULTATS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
            {meals.map((meal: any) => {
              const duplicate = isAlreadyImported(meal.idMeal, meal.strMeal);
              const isSelected = selectedMealDetail?.idMeal === meal.idMeal;

              return (
                <div 
                  key={meal.idMeal} 
                  className="card" 
                  style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    padding: '12px', 
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-white)',
                  }}
                  onClick={() => handleSelectMeal(meal.idMeal)}
                >
                  <img 
                    src={meal.strMealThumb || 'https://via.placeholder.com/150?text=No+Image'} 
                    alt={meal.strMeal} 
                    style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Image+Absente';
                    }}
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px', color: 'var(--color-dark)' }}>{meal.strMeal}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {meal.strCategory && meal.strCategory !== 'N/A' && (
                          <span className="badge badge-info" style={{ fontSize: '10px', padding: '2px 6px' }}>{translateCategoryFilterToFrench(meal.strCategory)}</span>
                        )}
                        {meal.strArea && meal.strArea !== 'N/A' && (
                          <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: 'var(--color-light)', color: 'var(--color-dark)' }}>{translateAreaToFrench(meal.strArea)}</span>
                        )}
                      </div>
                    </div>

                    {duplicate && (
                      <span className="badge badge-success" style={{ fontSize: '10px', width: 'fit-content', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                        <Check size={10} /> Déjà importé
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* COLONNE DROITE : APERÇU ET ACTIONS */}
          <div>
            {isLoadingDetail ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', color: 'var(--color-primary)', animation: 'spin 1.5s linear infinite' }} />
                <p style={{ fontSize: '13px', color: 'var(--color-dark-light)' }}>Chargement de la recette...</p>
              </div>
            ) : selectedMealDetail ? (
              <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <img 
                  src={selectedMealDetail.strMealThumb || 'https://via.placeholder.com/300?text=No+Image'} 
                  alt={selectedMealDetail.strMeal} 
                  style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                />
                
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span className="badge badge-info" style={{ fontSize: '11px' }}>{translateCategoryFilterToFrench(selectedMealDetail.strCategory)}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-dark-light)' }}>Origine : {translateAreaToFrench(selectedMealDetail.strArea)}</span>
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-dark)' }}>{selectedMealDetail.strMeal}</h3>
                </div>

                {/* Liens sources externes */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedMealDetail.strYoutube && (
                    <a 
                      href={selectedMealDetail.strYoutube} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="badge badge-danger" 
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '4px 8px' }}
                    >
                      <ExternalLink size={10} /> Vidéo YouTube
                    </a>
                  )}
                  {selectedMealDetail.strSource && (
                    <a 
                      href={selectedMealDetail.strSource} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="badge badge-info" 
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '4px 8px' }}
                    >
                      <ExternalLink size={10} /> Site source
                    </a>
                  )}
                </div>

                {/* Ingrédients list */}
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '8px' }}>
                    Ingrédients détectés
                  </h4>
                  <ul style={{ paddingLeft: '16px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', margin: 0 }}>
                    {(() => {
                      const list = [];
                      for (let i = 1; i <= 20; i++) {
                        const name = selectedMealDetail[`strIngredient${i}`];
                        const measure = selectedMealDetail[`strMeasure${i}`];
                        if (name && name.trim()) {
                          list.push(`${name.trim()} - ${measure ? measure.trim() : ''}`);
                        }
                      }
                      return list.map((item, idx) => <li key={idx}>{item}</li>);
                    })()}
                  </ul>
                </div>

                {/* Instructions */}
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '8px' }}>
                    Instructions
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--color-dark-light)', lineHeight: '1.4', maxHeight: '150px', overflowY: 'auto', margin: 0, whiteSpace: 'pre-line' }}>
                    {selectedMealDetail.strInstructions}
                  </p>
                </div>

                {/* Bouton d'action */}
                {isTranslating ? (
                  <button 
                    type="button" 
                    className="btn btn-success" 
                    style={{ width: '100%', height: '44px', marginTop: '8px', opacity: 0.8, cursor: 'not-allowed' }}
                    disabled={true}
                  >
                    <RefreshCw size={16} className="spin" style={{ marginRight: '6px', animation: 'spin 1.5s linear infinite' }} />
                    Traduction en français...
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="btn btn-success" 
                    style={{ width: '100%', height: '44px', marginTop: '8px' }}
                    onClick={handleImportSubmit}
                  >
                    <Download size={16} style={{ marginRight: '6px' }} />
                    Importer et ajuster la recette
                  </button>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px', border: '2px dashed var(--color-border)', color: 'var(--color-dark-light)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                <Compass size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <p style={{ fontSize: '13px' }}>Sélectionnez une recette à gauche pour en afficher l'aperçu complet et l'importer.</p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};
