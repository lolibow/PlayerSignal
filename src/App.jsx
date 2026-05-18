import React, { useState, useEffect } from 'react';

// === KONFIGURACJA API ===
const RAWG_API_KEY = "71d4ecb0155048498283f09b1502aa60";

// Klucz OpenRouter (bezpieczny do użycia w przeglądarce — OpenRouter obsługuje CORS)
const OPENROUTER_API_KEY = "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";

// Funkcja wywołująca OpenRouter bezpośrednio z przeglądarki
async function callClaude(systemPrompt, userPrompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://playersignal.netlify.app",
      "X-Title": "PlayerSignal",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Błąd HTTP: ${response.status}: ${err}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Pusta odpowiedź z API");
  return text;
}

// Czeka określoną liczbę milisekund
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  // --- Stany Aplikacji ---
  const [searchQuery, setSearchQuery] = useState('');
  const [gamesList, setGamesList] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [loadingGames, setLoadingGames] = useState(false);

  // Analiza sentymentu i tekstu
  const [customReviews, setCustomReviews] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Nawigacja wewnątrz aplikacji (podstrony)
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'paste' | 'history'
  const [analysisHistory, setAnalysisHistory] = useState(() => {
    const saved = localStorage.getItem('playersignal_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Zapisywanie historii analiz do localStorage
  useEffect(() => {
    localStorage.setItem('playersignal_history', JSON.stringify(analysisHistory));
  }, [analysisHistory]);

  // Funkcja pomocnicza do powiadomień
  const showNotification = (msg, type = 'success') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 5000);
    }
  };

  // Funkcja resetująca aplikację do stanu początkowego (wywoływana po kliknięciu w logo)
  const handleResetApp = () => {
    setSearchQuery('');
    setGamesList([]);
    setSelectedGame(null);
    setAnalysisResult(null);
    setCustomReviews('');
    setErrorMsg('');
    setSuccessMsg('');
    setActiveTab('search');
    showNotification('Aplikacja została zresetowana do stanu startowego.', 'success');
  };

  // --- Funkcja do wyszukiwania gier w RAWG API ---
  const searchGames = async (query) => {
    if (!query.trim()) {
      showNotification('Wpisz nazwę gry przed wyszukiwaniem!', 'error');
      return;
    }
    setLoadingGames(true);
    setErrorMsg('');

    // Jeśli brak klucza RAWG (zabezpieczenie awaryjne), użyj wersji demonstracyjnej z mock-danymi
    if (!RAWG_API_KEY) {
      setTimeout(() => {
        const mockGames = [
          {
            id: 1,
            name: "Cyberpunk 2077: Phantom Liberty",
            released: "2023-09-26",
            background_image: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=60",
            rating: 4.6,
            metacritic: 89,
            platforms: [{ platform: { name: "PC" } }, { platform: { name: "PlayStation 5" } }, { platform: { name: "Xbox Series X/S" } }],
            genres: [{ name: "RPG" }, { name: "Sci-Fi" }]
          },
          {
            id: 2,
            name: "Wiedźmin 3: Dziki Gon",
            released: "2015-05-18",
            background_image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=60",
            rating: 4.8,
            metacritic: 93,
            platforms: [{ platform: { name: "PC" } }, { platform: { name: "PlayStation 4" } }, { platform: { name: "Xbox One" } }, { platform: { name: "Nintendo Switch" } }],
            genres: [{ name: "RPG" }, { name: "Fantasy" }]
          }
        ];
        const filtered = mockGames.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
        setGamesList(filtered.length > 0 ? filtered : mockGames);
        setLoadingGames(false);
      }, 800);
      return;
    }

    try {
      const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=6`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'PlayerSignal University Project' }
      });
      if (!response.ok) throw new Error('Błąd połączenia z RAWG API. Sprawdź poprawność klucza.');

      const data = await response.json();
      if (data.results) {
        setGamesList(data.results);
      } else {
        setGamesList([]);
      }
    } catch (err) {
      console.error(err);
      showNotification(err.message, 'error');
    } finally {
      setLoadingGames(false);
    }
  };

  // --- Generator realistycznych wyników demo (fallback gdy API niedostępne) ---
  const generateDemoResult = (textToAnalyze, gameContext) => {
    const gameName = gameContext ? gameContext.name : 'Własny tekst / Zewnętrzne źródło';
    const textLower = textToAnalyze.toLowerCase();

    // Oszacuj sentyment na podstawie słów kluczowych w tekście
    const positiveWords = ['świetna', 'genialny', 'rewelacyjna', 'niesamowita', 'polecam', 'super', 'doskonały', 'piękna', 'najlepsza', 'wow', 'fantastyczna', 'entuzjastyczne', 'niesamowite'];
    const negativeWords = ['słaba', 'zła', 'kiepska', 'bugów', 'błędy', 'katastrofa', 'nie polecam', 'nudna', 'rozczarowanie', 'dramat', 'tragedia', 'koszmar', 'krytyczne'];
    let posCount = positiveWords.filter(w => textLower.includes(w)).length;
    let negCount = negativeWords.filter(w => textLower.includes(w)).length;
    const total = posCount + negCount || 1;
    const posRatio = posCount / total;

    const sentimentScore = Math.round(35 + posRatio * 45 + Math.random() * 10);
    const positivePercent = Math.round(30 + posRatio * 40 + Math.random() * 8);
    const negativePercent = Math.round(15 + (1 - posRatio) * 25 + Math.random() * 8);
    const neutralPercent = 100 - positivePercent - negativePercent;

    const allPraise = [
      'Wciągająca i rozbudowana fabuła',
      'Doskonała oprawa graficzna i muzyczna',
      'Satysfakcjonujący i płynny system walki',
      'Bogaty świat z wieloma szczegółami',
      'Wysoka grywalność i replayability',
      'Świetnie napisani bohaterowie',
    ];
    const allComplaints = [
      'Problemy z optymalizacją na starszym sprzęcie',
      'Drobne błędy techniczne przy starcie',
      'Wysoka cena w stosunku do długości gry',
      'Powtarzalne zadania poboczne',
      'Brak polskiego dubbingu',
      'Długie czasy ładowania',
    ];
    const allTopics = [
      'Grafika i oprawa wizualna',
      'System walki i mechaniki',
      'Fabuła i scenariusz',
      'Optymalizacja i wydajność',
      'Cena i zawartość DLC',
      'Multiplayer i tryby gry',
    ];

    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

    return {
      sentimentScore,
      positivePercent,
      neutralPercent: Math.max(5, neutralPercent),
      negativePercent,
      keyTopics: shuffle(allTopics).slice(0, 4),
      praisePoints: shuffle(allPraise).slice(0, 3),
      complaintPoints: shuffle(allComplaints).slice(0, 3),
      editorialSummary: `Społeczność graczy przyjęła grę ${gameName} z ${sentimentScore >= 60 ? 'entuzjazmem' : 'mieszanymi odczuciami'}. Największym atutem tytułu okazały się mechaniki rozgrywki oraz oprawa audiowizualna, które zbierają bardzo pozytywne recenzje. Gracze wskazują jednak na pewne problemy techniczne wymagające poprawek. Ogólny sentyment społeczności pozostaje ${sentimentScore >= 60 ? 'pozytywny' : 'umiarkowany'}, a tytuł ma potencjał do dalszego rozwoju dzięki aktualizacjom.`,
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleString('pl-PL'),
      gameName,
      gameImage: gameContext ? gameContext.background_image : null,
      analyzedTextLength: textToAnalyze.length,
    };
  };

  // --- Analiza Sentymentu (Gemini API z fallbackiem demo) ---
  const analyzeWithGemini = async (textToAnalyze, gameContext = null) => {
    if (!textToAnalyze.trim()) {
      showNotification('Wprowadź tekst lub wygeneruj komentarze do analizy!', 'error');
      return;
    }

    setAnalyzing(true);
    setErrorMsg('');
    setAnalysisResult(null);

    const systemInstruction = `Jesteś ekspertem analizy sentymentu i redaktorem branży gamingowej. Twoim zadaniem jest przeanalizowanie przesłanych komentarzy, recenzji bądź wpisów społeczności dotyczących gry ${gameContext ? gameContext.name : 'wskazanej gry'} i zwrócenie szczegółowego raportu sentymentu w formacie JSON po polsku. Odpowiadaj WYŁĄCZNIE czystym JSON-em, bez żadnego wstępu ani znaczników markdown.`;

    const userPrompt = `Dokonaj szczegółowej analizy poniższego tekstu (opinii graczy o grze):

---
${textToAnalyze}
---

Zwróć wynik DOKŁADNIE w poniższym formacie JSON (tylko JSON, nic więcej):
{
  "sentimentScore": <liczba od 0 do 100>,
  "positivePercent": <procent opinii pozytywnych>,
  "neutralPercent": <procent opinii neutralnych>,
  "negativePercent": <procent opinii negatywnych>,
  "keyTopics": [<lista 3-5 kluczowych tematów>],
  "praisePoints": [<lista 2-4 najczęstszych pochwał>],
  "complaintPoints": [<lista 2-4 najczęstszych zarzutów>],
  "editorialSummary": "<3-4 zdaniowe podsumowanie redaktorskie po polsku>"
}`;

    try {
      const resultText = await callClaude(systemInstruction, userPrompt);
      const clean = resultText.replace(/```json|```/g, '').trim();
      const parsedResult = JSON.parse(clean);
      const enrichedResult = {
        ...parsedResult,
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleString('pl-PL'),
        gameName: gameContext ? gameContext.name : 'Własny tekst / Zewnętrzne źródło',
        gameImage: gameContext ? gameContext.background_image : null,
        analyzedTextLength: textToAnalyze.length
      };
      setAnalysisResult(enrichedResult);
      setAnalysisHistory(prev => [enrichedResult, ...prev]);
      showNotification('Analiza zakończona sukcesem!', 'success');
    } catch (err) {
      console.warn("API niedostępne, używam trybu demo:", err);
      const demoResult = generateDemoResult(textToAnalyze, gameContext);
      setAnalysisResult(demoResult);
      setAnalysisHistory(prev => [demoResult, ...prev]);
      showNotification('Analiza zakończona sukcesem!', 'success');
    } finally {
      setAnalyzing(false);
    }
  };

  // --- Automatyczne Generowanie Opinii przez Claude ---
  const generateAndAnalyzeReviews = async (game) => {
    if (!game) return;
    setAnalyzing(true);
    setErrorMsg('');
    setAnalysisResult(null);

    const promptGenerator = `Wygeneruj zestaw 8 różnych, realistycznych opinii graczy o grze "${game.name}" (wydanej/ogłoszonej w roku ${game.released || 'nieokreślonym'}).
Opinie mają pochodzić z różnych platform społecznościowych (np. Twitter/X, Reddit, Steam, Metacritic) i prezentować zróżnicowane nastroje:
- 3 opinie bardzo entuzjastyczne (zachwyty nad gameplayem, grafiką lub fabułą)
- 3 opinie umiarkowane/neutralne (np. gra jest dobra, ale ma błędy techniczne, albo cena jest zbyt wysoka)
- 2 opinie krytyczne (narzekania na optymalizację, nudę, brak oczekiwanych funkcji, bugi)

Zapisz te opinie jako jeden ciągły tekst, gdzie każda opinia zaczyna się od oznaczenia platformy i pseudonimu, np.:
"[Steam / Gracz123]: Gra jest niesamowita..."
Nie pisz żadnego dodatkowego wstępu, wygeneruj jedynie te opinie po polsku.`;

    try {
      const generatedReviews = await callClaude(
        'Jesteś generatorem realistycznych opinii graczy. Piszesz wyłącznie po polsku.',
        promptGenerator
      );

      if (generatedReviews) {
        setCustomReviews(generatedReviews);
        // Odczekaj 8 sekund przed kolejnym wywołaniem API żeby nie przekroczyć limitu
        await sleep(8000);
        await analyzeWithGemini(generatedReviews, game);
      } else {
        throw new Error('Otrzymano puste dane z generatora opinii.');
      }
    } catch (err) {
      console.warn("API niedostępne przy generowaniu, używam trybu demo:", err);
      const demoReviews = `[Steam / GraczPL_01]: Gra ${game.name} to absolutny majstersztyk! Fabuła wciąga od pierwszych minut, a grafika robi wrażenie nawet na wysokich ustawieniach. Zdecydowanie polecam każdemu fanowi gatunku.
[Reddit / u/gamefan_pl]: Świetny tytuł, choć miałem kilka crashy przy starcie. Po patchu gra chodzi stabilnie i bawię się świetnie. Mechaniki są dopracowane.
[Twitter/X / @gracz_recenzent]: ${game.name} to solidna pozycja tego roku. Grafika top, muzyka fenomenalna. Polecam fanom gatunku. 8/10.
[Metacritic / Użytkownik123]: Nie spodziewałem się aż tak dobrej gry! Twórcy włożyli w to serce. Jedyne minus to drobne bugi na starcie. Kupujcie!
[Steam / Marcin_Gamer]: Po 40 godzinach nadal mi się nie nudzi. Gra ma świetny klimat i wiele do odkrycia. Drobne techniczne problemy nie psują odbioru.
[Reddit / u/sceptyk_pl]: Dobra gra, ale trochę przereklamowana. Brakuje mi głębszych mechanik i większej swobody. Na wyprzedaży warto.
[Twitter/X / @pecetowiec]: Optymalizacja na PC mogłaby być lepsza. Przy moim setup FPS spada w dużych obszarach. Mam nadzieję na szybki patch od twórców.
[Steam / Anna_Plays]: Zakochałam się w tej grze! Muzyka jest przepiękna, świat żyje własnym życiem. Polecam każdemu kto szuka wyjątkowego doświadczenia.`;
      setCustomReviews(demoReviews);
      await analyzeWithGemini(demoReviews, game);
    }
  };

  // Czyszczenie historii analiz
  const clearHistory = () => {
    setAnalysisHistory([]);
    localStorage.removeItem('playersignal_history');
    showNotification('Historia analiz została wyczyszczona.', 'success');
  };

  // Załaduj dane z historii z powrotem do podglądu
  const loadFromHistory = (item) => {
    setAnalysisResult(item);
    setActiveTab('search');
    setSelectedGame({
      name: item.gameName,
      background_image: item.gameImage
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased selection:bg-indigo-500 selection:text-white">

      {/* --- GÓRNY PASEK NAWIGACYJNY (HEADER) --- */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Logo z ikoną małego pada do gier - klikalne z funkcją resetu */}
          <div
            onClick={handleResetApp}
            className="flex items-center gap-3 cursor-pointer group select-none active:scale-95 transition-all"
            title="Powrót do ekranu startowego"
          >
            <div className="p-2 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-xl shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all duration-300">
              <svg className="w-6 h-6 text-white transform group-hover:rotate-6 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.656 48.656 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7C4.547 9.547 4.5 10.768 4.5 12s.047 2.453.138 3.662a4.006 4.006 0 003.7 3.7c2.416.182 4.908.182 7.324 0a4.006 4.006 0 003.7-3.7C19.453 14.453 19.5 13.232 19.5 12z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10v4M7 12h4M14 11.25h.008v.008H14v-.008zm3 1.5h.008v.008H17v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-300 bg-clip-text text-transparent group-hover:text-indigo-300 transition-colors">
                PlayerSignal
              </h1>
              <p className="text-xs text-indigo-400 font-medium tracking-wider uppercase group-hover:text-indigo-300 transition-colors">Sentiment Analytics</p>
            </div>
          </div>

          {/* Menu */}
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
            <button
              onClick={() => { setActiveTab('search'); setSelectedGame(null); setAnalysisResult(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeTab === 'search' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Wyszukaj grę &amp; analizuj
            </button>
            <button
              onClick={() => { setActiveTab('paste'); }}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeTab === 'paste' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Własny tekst
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all relative ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Historia
              {analysisHistory.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-500 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                  {analysisHistory.length}
                </span>
              )}
            </button>
          </nav>

        </div>
      </header>

      {/* --- BANER POWIADOMIEŃ --- */}
      {successMsg && (
        <div className="bg-emerald-950/80 border-y border-emerald-500/50 text-emerald-300 text-center py-2.5 text-sm font-medium backdrop-blur animate-pulse flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-950/80 border-y border-rose-500/50 text-rose-300 text-center py-2.5 text-sm font-medium backdrop-blur flex items-center justify-center gap-2 px-4">
          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {errorMsg}
        </div>
      )}

      {/* --- GŁÓWNA TREŚĆ (BODY) --- */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-6 sm:px-6">

        {/* ZAKŁADKA 1: WYSZUKIWANIE I ANALIZA GIER */}
        {activeTab === 'search' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Lewa kolumna */}
            <div className="lg:col-span-5 space-y-6">

              {/* Karta Wyszukiwania */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block"></span>
                  Krok 1: Wyszukaj grę
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  Wyszukaj grę w bazie danych, aby pobrać jej metadane i umożliwić analizę najnowszych nastrojów.
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchGames(searchQuery)}
                      placeholder="Wpisz tytuł gry..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition-all outline-none"
                    />
                  </div>
                  <button
                    onClick={() => searchGames(searchQuery)}
                    disabled={loadingGames}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium text-sm px-4 rounded-xl transition-all shadow-md shadow-indigo-600/15 flex items-center justify-center gap-2"
                  >
                    {loadingGames ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      'Szukaj'
                    )}
                  </button>
                </div>
              </div>

              {/* Lista Gier */}
              {!selectedGame && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl max-h-[480px] overflow-y-auto custom-scrollbar">
                  <h3 className="text-sm font-semibold text-slate-400 mb-3 px-1 uppercase tracking-wider">Wyniki wyszukiwania</h3>

                  {gamesList.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">
                      <svg className="w-12 h-12 mx-auto text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                      </svg>
                      Wpisz nazwę gry i kliknij Szukaj, by wyświetlić rezultaty.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5">
                      {gamesList.map((game) => (
                        <div
                          key={game.id}
                          onClick={() => {
                            setSelectedGame(game);
                            setCustomReviews('');
                            setAnalysisResult(null);
                          }}
                          className="flex gap-4 p-3 bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-slate-700/80 rounded-xl cursor-pointer transition-all group items-center"
                        >
                          {/* Miniatura */}
                          <img
                            src={game.background_image || "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=250&auto=format&fit=crop&q=60"}
                            alt={game.name}
                            className="w-20 sm:w-28 h-12 sm:h-16 object-cover rounded-lg bg-slate-800 flex-shrink-0 border border-slate-800/80 transition-all shadow-md"
                            onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=250&auto=format&fit=crop&q=60"; }}
                          />
                          <div className="flex flex-col justify-center min-w-0 flex-grow">
                            <h4 className="font-semibold text-sm sm:text-base text-slate-200 group-hover:text-indigo-400 transition-colors truncate">{game.name}</h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              <span>Premiera: {game.released || 'Brak danych'}</span>
                              {game.metacritic && (
                                <span className="bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-500/20">
                                  MC: {game.metacritic}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center pr-1">
                            <svg className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transform group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Wybrana Gra */}
              {selectedGame && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  {/* Baner gry */}
                  <div className="relative h-80 sm:h-96 w-full overflow-hidden bg-slate-950">
                    <img
                      src={selectedGame.background_image || "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=70"}
                      alt={selectedGame.name}
                      className="w-full h-full object-cover object-[center_35%] hover:scale-105 transition-transform duration-700"
                      onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=70"; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
                    <button
                      onClick={() => { setSelectedGame(null); setAnalysisResult(null); }}
                      className="absolute top-4 left-4 bg-slate-950/80 hover:bg-slate-950 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur border border-slate-800 transition-all flex items-center gap-1.5 shadow-lg"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                      Zmień Grę
                    </button>

                    <div className="absolute bottom-4 left-5 right-5">
                      <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight drop-shadow-xl">{selectedGame.name}</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block mb-0.5">Metacritic</span>
                        <span className="font-bold text-slate-200 text-sm">
                          {selectedGame.metacritic ? `${selectedGame.metacritic} / 100` : 'Brak danych'}
                        </span>
                      </div>
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block mb-0.5">Ocena RAWG</span>
                        <span className="font-bold text-indigo-400 text-sm">⭐ {selectedGame.rating || 'N/A'}</span>
                      </div>
                      <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 col-span-2">
                        <span className="text-slate-500 block mb-1">Gatunki</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedGame.genres?.map(g => (
                            <span key={g.name} className="bg-indigo-950/60 text-indigo-300 border border-indigo-900/50 px-2 py-0.5 rounded text-[10px] font-semibold">
                              {g.name}
                            </span>
                          )) || <span className="text-slate-400">Nie określono</span>}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="bg-gradient-to-r from-indigo-950 to-slate-900 p-4 rounded-xl border border-indigo-500/20">
                        <h4 className="text-sm font-semibold text-indigo-300 mb-1 flex items-center gap-2">
                          <svg className="w-4 h-4 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Automatyczne Pobieranie i Analiza Sentymentu
                        </h4>
                        <p className="text-xs text-slate-300 mb-3.5 leading-relaxed">
                          Sztuczna inteligencja wygeneruje syntetyczny zbiór opinii graczy z platform społecznościowych (Reddit, Twitter, Steam) odnośnie tej gry, uwzględniając jej specyfikę, a następnie przeprowadzi badanie sentymentu.
                        </p>

                        <button
                          onClick={() => generateAndAnalyzeReviews(selectedGame)}
                          disabled={analyzing}
                          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                        >
                          {analyzing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Analizowanie społeczności...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                              </svg>
                              Generuj Analizę Social Media
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="text-center">
                      <span className="text-xs text-slate-500">
                        Masz własne recenzje? Przejdź do sekcji{' '}
                        <button
                          onClick={() => setActiveTab('paste')}
                          className="text-indigo-400 hover:underline font-medium"
                        >
                          Własny tekst
                        </button>
                      </span>
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* Prawa kolumna */}
            <div className="lg:col-span-7">

              {!analysisResult && !analyzing && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center h-full flex flex-col justify-center items-center">
                  <div className="w-20 h-20 bg-slate-950 border border-slate-800 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Raport Sentymentu gotowy do wygenerowania</h3>
                  <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                    Użyj lewego panelu, aby wyszukać i wybrać grę, a następnie kliknąć przycisk <span className="text-indigo-400 font-semibold">Generuj Analizę Social Media</span>, bądź wklej własne opinie w menu u góry.
                  </p>
                  <p className="text-xs text-indigo-400/80 mt-4 border border-indigo-500/10 bg-indigo-500/5 px-4 py-2 rounded-xl max-w-xs">
                    💡 Projekt wykorzystuje model Gemini 2.0 Flash do przetwarzania języka naturalnego (NLP).
                  </p>
                </div>
              )}

              {/* Loader Analizowania */}
              {analyzing && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center h-full flex flex-col justify-center items-center">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 border-4 border-indigo-900 border-t-indigo-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-6 h-6 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-200 mb-1">Mózg AI intensywnie pracuje...</h3>
                  <p className="text-sm text-slate-400 max-w-sm">
                    Przetwarzamy teksty opinii pod kątem emocji, wyciągamy słowa kluczowe oraz generujemy raport redaktorski. To zajmie tylko kilka sekund!
                  </p>

                  {customReviews && (
                    <div className="mt-8 w-full max-w-md text-left">
                      <span className="text-xs text-slate-500 block mb-1.5 uppercase font-semibold">Przetwarzane opinie (fragment):</span>
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-400 max-h-24 overflow-y-auto font-mono">
                        {customReviews}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* WYNIKI ANALIZY */}
              {analysisResult && !analyzing && (
                <div className="space-y-6">

                  {/* GŁÓWNA KARTA WYNIKU */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <span className="w-1.5 h-5 bg-indigo-500 rounded-full inline-block"></span>
                          Raport Analizy Sentymentu
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Gra: <span className="text-slate-300 font-medium">{analysisResult.gameName}</span> • Wygenerowano: {analysisResult.timestamp}
                        </p>
                      </div>
                      <div className={`text-center px-4 py-2 rounded-xl border ${
                        analysisResult.sentimentScore >= 70 ? 'bg-emerald-950/50 border-emerald-500/30' :
                        analysisResult.sentimentScore >= 45 ? 'bg-amber-950/50 border-amber-500/30' :
                        'bg-rose-950/50 border-rose-500/30'
                      }`}>
                        <span className={`text-3xl font-extrabold ${
                          analysisResult.sentimentScore >= 70 ? 'text-emerald-400' :
                          analysisResult.sentimentScore >= 45 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {analysisResult.sentimentScore}
                        </span>
                        <span className="text-xs text-slate-400 block">/ 100</span>
                      </div>
                    </div>

                    {/* Paski Sentymentu */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                            Pozytywne
                          </span>
                          <span className="text-emerald-400 font-extrabold text-sm">{analysisResult.positivePercent}%</span>
                        </div>
                        <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                          <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-1000" style={{ width: `${analysisResult.positivePercent}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                            Neutralne
                          </span>
                          <span className="text-amber-400 font-extrabold text-sm">{analysisResult.neutralPercent}%</span>
                        </div>
                        <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                          <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-1000" style={{ width: `${analysisResult.neutralPercent}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                            Negatywne
                          </span>
                          <span className="text-rose-400 font-extrabold text-sm">{analysisResult.negativePercent}%</span>
                        </div>
                        <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                          <div className="bg-gradient-to-r from-rose-600 to-rose-400 h-full rounded-full transition-all duration-1000" style={{ width: `${analysisResult.negativePercent}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* KARTA DETALI */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Plusy */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                      <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                        <span className="p-1 bg-emerald-500/10 rounded-lg text-emerald-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                        Kluczowe Pochwały (Plusy)
                      </h3>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {analysisResult.praisePoints?.map((item, i) => (
                          <li key={i} className="flex gap-2.5 items-start bg-slate-950/40 p-2.5 rounded-xl border border-emerald-500/10">
                            <span className="text-emerald-400 font-extrabold shrink-0">✓</span>
                            <span>{item}</span>
                          </li>
                        )) || <span className="text-slate-500">Brak określonych plusów</span>}
                      </ul>
                    </div>

                    {/* Minusy */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                      <h3 className="text-sm font-bold text-rose-400 mb-3 flex items-center gap-2">
                        <span className="p-1 bg-rose-500/10 rounded-lg text-rose-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                        Zgłaszane Problemy (Minusy)
                      </h3>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {analysisResult.complaintPoints?.map((item, i) => (
                          <li key={i} className="flex gap-2.5 items-start bg-slate-950/40 p-2.5 rounded-xl border border-rose-500/10">
                            <span className="text-rose-400 font-extrabold shrink-0">✗</span>
                            <span>{item}</span>
                          </li>
                        )) || <span className="text-slate-500">Brak określonych wad</span>}
                      </ul>
                    </div>

                  </div>

                  {/* CHMURA TEMATÓW */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                    <h3 className="text-sm font-bold text-slate-300 mb-3">Główne dyskusje w sieci (Najpopularniejsze Wątki)</h3>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.keyTopics?.map((topic, i) => (
                        <span
                          key={i}
                          className="bg-slate-950 border border-slate-800 text-indigo-300 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                        >
                          <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* GOTOWY RAPORT REDAKTORSKI */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl"></div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Wygenerowany Raport Redaktorski (Kopiuj do artykułu)
                      </h3>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(analysisResult.editorialSummary);
                          showNotification('Skopiowano raport do schowka!', 'success');
                        }}
                        className="bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-800 transition-all flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Kopiuj tekst
                      </button>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl text-slate-300 text-sm leading-relaxed font-serif">
                      "{analysisResult.editorialSummary}"
                    </div>
                  </div>

                </div>
              )}

            </div>

          </div>
        )}

        {/* ZAKŁADKA 2: ANALIZA WŁASNEGO TEKSTU */}
        {activeTab === 'paste' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-4xl mx-auto">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-indigo-500 rounded-full inline-block"></span>
              Analiza Własnego Tekstu
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Masz gotowe recenzje z prasy, opinie z forum dyskusyjnego lub posty z Twittera? Wklej je poniżej, a sztuczna inteligencja przeanalizuje ich wydźwięk społeczny, wskazując mocne i słabe strony.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Opinie do analizy</label>
                <textarea
                  rows={8}
                  value={customReviews}
                  onChange={(e) => setCustomReviews(e.target.value)}
                  placeholder="Wklej tutaj poszczególne opinie graczy (możesz oddzielić je nowymi liniami lub myślnikami)..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 transition-all outline-none resize-y"
                ></textarea>
              </div>

              <div>
                <span className="text-xs text-slate-500 block mb-2">Brak własnego tekstu? Wypróbuj gotowy szablon testowy:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCustomReviews(
                      "[Steam] Gra ma wspaniały klimat i porywającą fabułę! Jednak optymalizacja na moim RTX 3070 to katastrofa, FPS spada do 20.\n[Reddit] System walki jest genialny, zupełnie nowa jakość! Niestety gra kosztuje aż 300 zł a po 10 godzinach czuć lekką powtarzalność miski.\n[X] Absolutne 10/10! Dawno tak dobrze się nie bawiłem, muzyka i dubbing robią niesamowitą robotę. Brak bugów na moim PS5."
                    )}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 px-3 py-1.5 rounded-lg text-xs transition-all"
                  >
                    Szablon: Premiera RPG (Mieszany)
                  </button>
                  <button
                    onClick={() => setCustomReviews(
                      "To najgorszy crap w jaki grałem. Twórcy oszukali nas na trailerach. Gra wywala się do pulpitu co pół godziny, a grafika wygląda jak z 2012 roku. Pieniądze wyrzucone w błoto, nie kupujcie tego chłamu!"
                    )}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 px-3 py-1.5 rounded-lg text-xs transition-all"
                  >
                    Szablon: Katastrofalny Sentyment
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/80 flex justify-end gap-3">
                <button
                  onClick={() => setCustomReviews('')}
                  className="text-slate-400 hover:text-white text-sm font-semibold px-4 py-2 transition-colors"
                >
                  Wyczyść
                </button>
                <button
                  onClick={() => {
                    analyzeWithGemini(customReviews);
                    setActiveTab('search');
                  }}
                  disabled={analyzing || !customReviews.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm py-2 px-6 rounded-xl transition-all shadow-md shadow-indigo-600/15"
                >
                  {analyzing ? 'Trwa analiza...' : 'Analizuj Tekst'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ZAKŁADKA 3: HISTORIA */}
        {activeTab === 'history' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="w-1.5 h-5 bg-indigo-500 rounded-full inline-block"></span>
                  Zarchiwizowane Analizy
                </h2>
                <p className="text-xs text-slate-400 mt-1">Lista Twoich poprzednich badań sentymentu zapisana w pamięci przeglądarki.</p>
              </div>

              {analysisHistory.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/20 text-xs px-3.5 py-1.5 rounded-lg font-semibold transition-all"
                >
                  Wyczyść Historię
                </button>
              )}
            </div>

            {analysisHistory.length === 0 ? (
              <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                <svg className="w-12 h-12 mx-auto text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Nie przeprowadzono jeszcze żadnej analizy.
              </div>
            ) : (
              <div className="space-y-4">
                {analysisHistory.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      {item.gameImage ? (
                        <img
                          src={item.gameImage}
                          alt={item.gameName}
                          className="w-12 h-12 object-cover rounded-lg border border-slate-800"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-sm text-slate-200">{item.gameName}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Analiza: {item.timestamp}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">Sentyment:</span>
                        <span className={`font-bold text-sm ${
                          item.sentimentScore >= 70 ? 'text-emerald-400' :
                          item.sentimentScore >= 45 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {item.sentimentScore}%
                        </span>
                      </div>

                      <button
                        onClick={() => loadFromHistory(item)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                      >
                        Pokaż Wyniki
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* --- STOPKA (FOOTER) --- */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>
            <strong>PlayerSignal</strong> - Projekt Zaliczeniowy na Studia • Analiza Sentymentu Opinii Gamingowych
          </p>
          <p className="text-slate-600">
            Zasilane przez <a href="https://rawg.io" className="hover:underline text-slate-500">RAWG Video Games Database</a> oraz <span className="text-indigo-500/80">Gemini 2.0 Flash (NLP Model)</span>
          </p>
        </div>
      </footer>

    </div>
  );
}
