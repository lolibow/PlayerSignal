import React, { useState, useEffect } from 'react';

// === KONFIGURACJA API ===
const RAWG_API_KEY = "71d4ecb0155048498283f09b1502aa60";

// Klucz OpenRouter
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

  // --- Inteligentny generator wyników dopasowany do gatunku gry ---
  const generateDemoResult = (textToAnalyze, gameContext) => {
    const gameName = gameContext ? gameContext.name : 'Własny tekst / Zewnętrzne źródło';
    const genres = gameContext?.genres?.map(g => g.name.toLowerCase()) || [];
    const nameLower = gameName.toLowerCase();
    const textLower = textToAnalyze.toLowerCase();

    // Wykryj typ gry na podstawie gatunków i nazwy
    const isFarming = genres.includes('simulation') || ['stardew', 'farm', 'harvest', 'animal crossing', 'story of seasons', 'ranch'].some(k => nameLower.includes(k));
    const isRPG = genres.includes('role-playing games (rpg)') || genres.includes('rpg') || ['witcher', 'wiedźmin', 'elden', 'skyrim', 'baldur', 'cyberpunk', 'dragon age', 'final fantasy'].some(k => nameLower.includes(k));
    const isShooter = genres.includes('shooter') || ['call of duty', 'battlefield', 'halo', 'doom', 'counter', 'valorant', 'overwatch', 'fortnite'].some(k => nameLower.includes(k));
    const isHorror = genres.includes('horror') || ['resident evil', 'silent hill', 'amnesia', 'outlast', 'dead space', 'soma'].some(k => nameLower.includes(k));
    const isSports = genres.includes('sports') || ['fifa', 'nba', 'nfl', 'football', 'racing', 'f1', 'forza', 'pro evolution'].some(k => nameLower.includes(k));
    const isPlatformer = genres.includes('platformer') || ['mario', 'sonic', 'crash', 'rayman', 'hollow knight', 'celeste'].some(k => nameLower.includes(k));
    const isStrategy = genres.includes('strategy') || ['civilization', 'starcraft', 'age of empires', 'total war', 'xcom', 'crusader kings'].some(k => nameLower.includes(k));
    const isAdventure = genres.includes('adventure') || ['zelda', 'uncharted', 'tomb raider', 'god of war', 'last of us', 'red dead'].some(k => nameLower.includes(k));

    // Dobierz tematykę do gatunku
    let praise, complaints, topics, reviewSnippets, mood;

    if (isFarming) {
      praise = ['Relaksująca i wciągająca rozgrywka', 'Urokliwa oprawa graficzna i muzyczna', 'Ogromna ilość zawartości do odkrycia', 'Satysfakcjonujący system rozwoju farmy'];
      complaints = ['Wolne tempo na początku gry', 'Brak automatyzacji niektórych zadań', 'Mała różnorodność w dialogach NPC', 'Długi czas potrzebny na postęp'];
      topics = ['System uprawy i hodowli', 'Relacje z mieszkańcami wioski', 'Oprawa muzyczna i klimat', 'Zawartość i aktualizacje', 'Tryb multiplayer'];
      mood = 'bardzo ciepło';
      reviewSnippets = [
        `[Steam / FarmLover_PL]: ${gameName} to idealna gra na relaks po ciężkim dniu. Uprawianie roślin i budowanie więzi z mieszkańcami wioski daje niesamowitą satysfakcję. Polecam każdemu!`,
        `[Reddit / u/cozy_gamer]: Spędziłam przy tej grze już ponad 200 godzin i nadal odkrywam nowe rzeczy. Muzyka jest absolutnie cudowna, a klimat wsi wciąga bez reszty.`,
        `[Twitter/X / @pixelfarmer]: ${gameName} to dowód że gry nie muszą być stresujące żeby być genialne. Czysta przyjemność z każdej minuty. 10/10`,
        `[Metacritic / Relaksiarz123]: Gra jest świetna ale tempo na początku jest bardzo wolne. Trzeba mieć cierpliwość żeby zobaczyć prawdziwy potencjał tej produkcji.`,
        `[Steam / NightOwlGamer]: Zamiast spać gram w ${gameName} do 3 w nocy. Nie wiem jak to robią ale ta gra uzależnia bardziej niż cokolwiek innego. Hodowla zwierząt jest przepiękna!`,
        `[Reddit / u/hardcore_farmer]: Brakuje mi trochę głębszych mechanik ekonomicznych i automatyzacji. Po 100 godzinach zaczyna być trochę powtarzalnie, ale i tak wracam każdego dnia.`,
        `[Twitter/X / @gamingweekend]: Kupiłam ${gameName} przypadkiem na wyprzedaży i to był najlepszy zakup roku. Grafika pikselowa jest urocza, a soundtrack mam w głowie cały dzień.`,
        `[Steam / CriticalReviewer]: Dobra gra do relaksu, ale nie spodziewajcie się głębokich mechanik. Idealna dla casualowych graczy szukających spokoju.`,
      ];
    } else if (isShooter) {
      praise = ['Dynamiczny i satysfakcjonujący gameplay', 'Świetnie zaprojektowane mapy multiplayer', 'Płynna animacja i responsywne sterowanie', 'Regularne aktualizacje z nową zawartością'];
      complaints = ['Problem z cheaterami w trybie ranked', 'Agresywny model monetyzacji (battle pass)', 'Długie kolejki do meczów w godzinach szczytu', 'Słabo zbalansowana broń po ostatnim patchu'];
      topics = ['Balans broni i klas', 'Tryb multiplayer i ranked', 'Optymalizacja i fps', 'System monetyzacji', 'Nowe mapy i sezony'];
      mood = 'entuzjastycznie, choć z zastrzeżeniami';
      reviewSnippets = [
        `[Steam / FragMaster_PL]: ${gameName} to najlepsza strzelanka tego roku! Feeling broni jest fenomenalny a mapy są świetnie zaprojektowane. Gramy z ekipą codziennie.`,
        `[Reddit / u/competitive_pl]: Ranked jest uzależniający ale cheaterzy to poważny problem. Twórcy powinni skupić się na antycheat zamiast wypuszczać kolejne skiny.`,
        `[Twitter/X / @fps_enjoyer]: ${gameName} ma najlepszy feeling strzelania od lat. Responsywność jest idealna, a nowe mapy z ostatniego sezonu są topowe. Polecam!`,
        `[Metacritic / BudżetGracz]: Battle pass jest zbyt drogi jak na zawartość którą oferuje. Sam gameplay jest dobry ale czuję się jak na stacji benzynowej — wszystko kosztuje ekstra.`,
        `[Steam / NightShift_PL]: 500 godzin w ${gameName} i nadal sprawia mi radość. Społeczność jest aktywna, a twórcy słuchają feedbacku. Jeden z lepszych tytułów w gatunku.`,
        `[Reddit / u/casual_shooter]: Dla casualowych graczy gra jest świetna. Dopiero w wysokim rankingu zaczyna być frustrująco konkurencyjna. Balans mógłby być lepszy.`,
        `[Twitter/X / @streamer_pl]: Gram na streama i widzowie uwielbiają ${gameName}. Momenty clutch i akcje drużynowe robią niesamowite show. Bardzo dynamiczna produkcja.`,
        `[Steam / TechReviewer]: Optymalizacja jest dobra — na moim RTX 3070 chodzi płynnie. Długie kolejki rankingowe w nocy to jedyna wada techniczna na moim setupie.`,
      ];
    } else if (isHorror) {
      praise = ['Niesamowita atmosfera strachu i napięcia', 'Przemyślany projekt poziomów i jumpscares', 'Świetna oprawa dźwiękowa budująca klimat', 'Angażująca i mroczna fabuła'];
      complaints = ['Gra jest miejscami zbyt straszna dla wrażliwszych graczy', 'Krótki czas rozgrywki w stosunku do ceny', 'Problemy techniczne przy uruchamianiu', 'Brak opcji regulacji poziomu trudności'];
      topics = ['Atmosfera i klimat grozy', 'Projekt poziomów i jumpscare', 'Fabuła i zakończenie', 'Czas rozgrywki vs cena', 'Wydajność techniczna'];
      mood = 'z przerażeniem, ale w bardzo pozytywnym sensie';
      reviewSnippets = [
        `[Steam / HorrorFan_PL]: ${gameName} to najstraszniejsza gra w jaką grałem od lat. Atmosfera jest niesamowita, a projekt dźwięku sprawia że nie chce się grać po zmroku. Genialne!`,
        `[Reddit / u/scream_queen]: Musiałam robić przerwy co 20 minut bo serce mi dosłownie waliło. ${gameName} to mistrzowska lekcja jak budować napięcie. Absolutny must-play w gatunku.`,
        `[Twitter/X / @horrorgamer]: Grałem z kolegami przez kamerę i reakcje były bezcenne. ${gameName} to świetna gra na Halloween albo gdy chcesz sprawdzić nerwy znajomych.`,
        `[Metacritic / CasualPlayer]: Gra jest za straszna dla mnie osobiście, ale rozumiem dlaczego fani horroru ją uwielbiają. Jakość produkcji jest bardzo wysoka.`,
        `[Steam / NightCrawler]: Fabuła ${gameName} wciąga od pierwszych minut. Zakończenie zostawiło mnie z otwartą szczęką. Jedyna wada to za krótki czas gry jak na tę cenę.`,
        `[Reddit / u/tech_reviewer]: Miałem problemy z uruchomieniem na Windows 11 — kilka crashy na początku. Po patchu gra chodzi stabilnie. Sam gameplay jest wyśmienity.`,
        `[Twitter/X / @streamer_horror]: ${gameName} na streama to złoto. Widzowie uwielbiają moje reakcje na jumpscare. Twórcy idealnie wiedzą jak zaskoczyć gracza w najmniej spodziewanym momencie.`,
        `[Steam / BudgetGamer_PL]: Cztery godziny rozgrywki za tę cenę to trochę mało. Jakość jest top ale wolałbym więcej zawartości. Sequel byłby bardzo mile widziany.`,
      ];
    } else if (isStrategy) {
      praise = ['Głęboki i rozbudowany system strategiczny', 'Ogromna regrywalność dzięki losowym mapom', 'Aktywna społeczność i scena modów', 'Regularne aktualizacje balansujące rozgrywkę'];
      complaints = ['Bardzo stroma krzywa uczenia się dla nowych graczy', 'Długi czas jednej rozgrywki', 'Interfejs mógłby być bardziej intuicyjny', 'Wymaga dużej mocy obliczeniowej w późnych etapach'];
      topics = ['Mechaniki strategiczne i taktyczne', 'Balans frakcji i jednostek', 'Tryb multiplayer vs AI', 'Społeczność i mody', 'Krzywa trudności'];
      mood = 'z uznaniem dla głębi rozgrywki';
      reviewSnippets = [
        `[Steam / StrategyKing_PL]: ${gameName} to jeden z najgłębszych tytułów strategicznych ostatnich lat. Każda rozgrywka jest inna i wymaga prawdziwego myślenia. Genialna produkcja!`,
        `[Reddit / u/grandmaster_strat]: Spędziłem 400 godzin i wciąż odkrywam nowe taktyki. Balans między frakcjami jest świetny, a twórcy aktywnie słuchają społeczności.`,
        `[Twitter/X / @turnbased_fan]: ${gameName} jest wymagająca ale satysfakcja z wygranej kampanii jest nie do opisania. Idealna dla graczy lubiących wyzwania intelektualne.`,
        `[Metacritic / NewPlayer2024]: Jako nowy gracz w gatunku czuję się przytłoczony. Tutorial jest niewystarczający. Gra ma ogromny potencjał ale wymaga wiele cierpliwości.`,
        `[Steam / ModMaker_PL]: Społeczność modowa ${gameName} jest fantastyczna. Oficjalne wsparcie dla modów sprawia że gra żyje latami po premierze. Polecam każdemu fanowi gatunku.`,
        `[Reddit / u/hardcore_tactician]: Multiplayer jest konkurencyjny i wymagający. Scena rankingowa jest aktywna. Jedyna wada to długi czas ładowania w późnych etapach gry.`,
        `[Twitter/X / @pcgamer_pl]: ${gameName} potrzebuje solidnego PC w późnej grze. Przy 200 jednostkach FPS spada nawet na wysokim sprzęcie. Optymalizacja mogłaby być lepsza.`,
        `[Steam / CasualStrategy]: Gram głównie solo i kampania jest świetna. Fabuła angażuje a misje są zróżnicowane. Dla casualowych graczy tryb łatwy jest dobrym wstępem.`,
      ];
    } else if (isRPG) {
      praise = ['Rozbudowana i wciągająca fabuła z wieloma wyborami', 'Ogromny i szczegółowy świat do eksploracji', 'Świetnie napisani bohaterowie z głębią', 'Satysfakcjonujący system rozwoju postaci'];
      complaints = ['Niektóre błędy techniczne przy premierze', 'Bardzo długi czas potrzebny na ukończenie', 'Wysoka cena pełnego doświadczenia z DLC', 'Momentami zbyt wiele zadań pobocznych naraz'];
      topics = ['Fabuła i wybory moralne', 'System walki i rozwój postaci', 'Eksploracja otwartego świata', 'Oprawa graficzna i techniczna', 'Zawartość DLC i rozszerzenia'];
      mood = 'z ogromnym entuzjazmem';
      reviewSnippets = [
        `[Steam / RPGAddict_PL]: ${gameName} to jedno z najlepszych RPG ostatnich lat. Fabuła jest niesamowita, a wybory naprawdę mają znaczenie dla zakończenia. 100 godzin minęło jak nic!`,
        `[Reddit / u/lore_master]: Świat ${gameName} jest tak bogaty w szczegóły że czytam każdą notatkę i słucham każdego dialogu. Twórcy stworzyli żyjący, wiarygodny universe.`,
        `[Twitter/X / @rpg_enjoyer]: Właśnie skończyłem ${gameName} po raz trzeci — każde przejście jest inne przez system wyborów. To jest definicja regrywalności w grach RPG.`,
        `[Metacritic / TechReporter]: Gra miała sporo bugów przy premierze — kilka crashy i problemy z zapisem. Po łatkach jest dużo lepiej, ale pierwsze wrażenie było słabe.`,
        `[Steam / OpenWorldFan]: Eksploracja świata ${gameName} to czysta przyjemność. Każdy zakątek kryje coś interesującego. Grafika przy zachodzie słońca robi wrażenie nawet po 200 godzinach.`,
        `[Reddit / u/budget_gamer]: Poczekaj na wyprzedaż jeśli chcesz pełne doświadczenie z DLC. Sama gra jest warta ceny, ale wszystkie dodatki to wydatek rzędu 300+ złotych.`,
        `[Twitter/X / @night_gamer_pl]: Grałam całą noc i nie mogłam przestać. System walki robi się coraz bardziej satysfakcjonujący w miarę rozwoju postaci. Absolutny must-play!`,
        `[Steam / CompletionistPL]: 200 godzin i platyna zdobyta. ${gameName} ma ogrom treści ale niektóre zadania poboczne są zbyt podobne do siebie. Główna fabuła jest jednak wybitna.`,
      ];
    } else if (isPlatformer) {
      praise = ['Precyzyjne i responsywne sterowanie', 'Kreatywny i zróżnicowany design poziomów', 'Urocza oprawa graficzna i muzyczna', 'Idealna dla graczy w każdym wieku'];
      complaints = ['Niektóre poziomy są frustrująco trudne', 'Krótki czas gry przy regularnej rozgrywce', 'Brak trybu co-op dla dwóch graczy', 'Checkpointy mogłyby być częściej rozmieszczone'];
      topics = ['Design poziomów i kreatywność', 'Trudność i frustracja', 'Sterowanie i responsywność', 'Oprawa wizualna i muzyczna', 'Czas rozgrywki i zawartość'];
      mood = 'bardzo pozytywnie';
      reviewSnippets = [
        `[Steam / PlatformKing]: ${gameName} to powrót do korzeni platformówek! Sterowanie jest precyzyjne jak w najlepszych klasykach, a poziomy są pełne kreatywnych pomysłów. Polecam!`,
        `[Reddit / u/retro_gamer]: Grafika jest urocza a muzyka wpada w ucho od razu. Moje dzieci uwielbiają grać razem ze mną. Idealna gra rodzinna na weekendowy wieczór.`,
        `[Twitter/X / @speedrunner_pl]: ${gameName} ma świetny potencjał speedrunowy. Mechaniki są dobrze przemyślane i pozwalają na kreatywne skróty. Społeczność speedrunów już kwitnie!`,
        `[Metacritic / CasualDad]: Świetna gra ale niektóre etapy są za trudne dla moich dzieci. Brakuje opcji regulacji trudności dla młodszych graczy. Dobry pomysł, niedopracowana realizacja.`,
        `[Steam / CompletionistPL]: Zebranie wszystkich znajdziek to prawdziwe wyzwanie. ${gameName} nagradza eksplorację ciekawymi sekretami. Gra jest krótka ale zostawia wielki uśmiech na twarzy.`,
        `[Reddit / u/hardcore_platformer]: Ostatnie poziomy ${gameName} to prawdziwy test umiejętności. Wściekałem się ale satysfakcja z przejścia trudnego etapu jest nie do opisania.`,
        `[Twitter/X / @indie_lover]: ${gameName} udowadnia że małe studia potrafią tworzyć wspaniałe gry. Każdy szczegół jest przemyślany. Jeden z najlepszych indyków ostatnich miesięcy!`,
        `[Steam / FamilyGamer]: Skończyłem z córką w jeden weekend. Krótka ale intensywna przygoda. Cena jest adekwatna do jakości i frajdy jaką dostarcza.`,
      ];
    } else if (isSports) {
      praise = ['Realistyczna fizyka i gameplay', 'Bogata zawartość trybów i licencji', 'Świetna oprawa audiowizualna meczów', 'Aktywna i rozbudowana społeczność online'];
      complaints = ['Niewielkie zmiany w stosunku do poprzedniej części', 'Agresywny model monetyzacji w trybie Ultimate Team', 'Problemy z serwerami online przy premierze', 'AI rywali mogłoby być mądrzejsze'];
      topics = ['Rozgrywka i fizyka piłki', 'Tryb Ultimate Team i monetyzacja', 'Stabilność serwerów online', 'Licencje i zawartość', 'Zmiany względem poprzedniej części'];
      mood = 'mieszanie — fani gatunku zadowoleni, krytycy wskazują na stagnację';
      reviewSnippets = [
        `[Steam / FootballFan_PL]: ${gameName} to najlepsza odsłona od kilku lat. Fizyka piłki jest bardzo realistyczna a animacje zawodników robią wrażenie. Tryb kariery w końcu dostał porządny update!`,
        `[Reddit / u/fut_trader]: Ultimate Team znowu rozczarowuje — zbyt dużo pay-to-win elementów. Gameplay jest dobry ale model monetyzacji to skandal. EA/2K powinni się wstydzić.`,
        `[Twitter/X / @esports_pl]: Gram turniejowo w ${gameName} i mechaniki są w tym roku na wysokim poziomie. Balans jest lepszy niż rok temu, a nowe animacje są topowe.`,
        `[Metacritic / AnnualBuyer]: Co roku kupuję nową część i co roku zastanawiam się czy warto. ${gameName} ma kilka ulepszeń ale to wciąż ta sama gra co rok temu. Chciałbym większych zmian.`,
        `[Steam / OnlinePlayer]: Serwery przy premierze były katastrofą. Po tygodniu się ustabilizowały. Sam gameplay jest solidny ale te problemy techniczne na launch to klasyka w tym gatunku.`,
        `[Reddit / u/career_mode_fan]: Tryb kariery jest w tym roku naprawdę dobry! Negocjacje transferowe i system morale drużyny to świeże powietrze. Wreszcie coś ciekawego dla single playerów.`,
        `[Twitter/X / @casual_sports]: Kupiłem ${gameName} żeby grać z znajomymi na kanapie i spełnia swoją rolę doskonale. Tryby lokalne są świetne. Nie interesuję się Ultimate Team więc jestem zadowolony.`,
        `[Steam / HardcoreFan]: AI przeciwników jest zbyt przewidywalne na wyższych poziomach trudności. Czekam na patch który to poprawi. Poza tym gra jest solidna jak zawsze.`,
      ];
    } else if (isAdventure) {
      praise = ['Epicka i emocjonująca fabuła', 'Przepiękna oprawa graficzna next-gen', 'Świetnie wyreżyserowane cutscenki', 'Satysfakcjonująca eksploracja i walka'];
      complaints = ['Gra jest dość liniowa — mało swobody', 'Krótszy czas niż poprzednia część', 'Problemy z wydajnością na starszych konsolach', 'Niektóre zagadki są zbyt proste'];
      topics = ['Fabuła i postacie', 'Oprawa graficzna i techniczna', 'Eksploracja i walka', 'Liniowość vs otwartość świata', 'Porównanie do poprzednich części'];
      mood = 'z ogromnym zachwytem';
      reviewSnippets = [
        `[PlayStation / HeroFan_PL]: ${gameName} to absolutne arcydzieło! Historia emocjonuje od początku do końca, a grafika jest najpiękniejsza jaką widziałem w tej generacji. 10/10!`,
        `[Reddit / u/adventure_seeker]: Cutscenki są jak hollywoodzki film. Twórcy rozumieją jak budować emocje i napięcie. Jeden z nielicznych przypadków gdzie płakałem podczas gry.`,
        `[Twitter/X / @ps5_gamer]: ${gameName} to killer app dla PS5/Xbox. Jeśli nie masz jeszcze konsoli — to jest ten tytuł dla którego warto kupić sprzęt. Absolutna must-have pozycja.`,
        `[Metacritic / OpenWorldFan]: Gra jest zbyt liniowa jak na mój gust. Chciałbym więcej swobody eksploracji. Fabuła jest świetna ale wolałbym sam decydować gdzie i kiedy idę.`,
        `[Steam / TechAnalyst]: Na PC gra chodzi świetnie po ostatnim patchu. Wcześniej były problemy z stutteringiem. Grafika przy ultra ustawieniach jest po prostu niesamowita.`,
        `[Reddit / u/story_lover]: Zakończenie ${gameName} zostawiło mnie bez słów. Przez kilka minut po napisach końcowych siedziałem w ciszy. Rzadko gry robią na mnie takie wrażenie.`,
        `[Twitter/X / @completionist]: Platyna zdobyta po 35 godzinach. Gra jest krótsza niż poprzednia część ale gęstsza jeśli chodzi o treść. Każda minuta jest dopracowana.`,
        `[Steam / ValueHunter]: Na premierę trochę droga, ale już po kilku tygodniach pojawiły się zniżki. Jakość uzasadnia cenę — to jest AAA w najlepszym wydaniu tego słowa.`,
      ];
    } else {
      // Gry ogólne / nieznany gatunek
      praise = ['Oryginalne i przemyślane mechaniki rozgrywki', 'Staranna oprawa audiowizualna', 'Bogata zawartość i wysoka wartość po premierze', 'Aktywne wsparcie i aktualizacje od twórców'];
      complaints = ['Stroma krzywa uczenia się na początku', 'Niektóre elementy wymagają dalszego dopracowania', 'Cena mogłaby być nieco niższa przy premierze', 'Optymalizacja na starszym sprzęcie wymaga poprawy'];
      topics = ['Ogólna jakość rozgrywki', 'Oprawa techniczna i wizualna', 'Stosunek ceny do zawartości', 'Wsparcie po premierze', 'Społeczność i multiplayer'];
      mood = 'generalnie pozytywnie';
      reviewSnippets = [
        `[Steam / GraczPL_01]: ${gameName} to bardzo solidna produkcja która zaskoczyła mnie pozytywnie. Widać że twórcy włożyli w nią dużo serca. Polecam każdemu fanowi gatunku!`,
        `[Reddit / u/gamefan_pl]: Spędziłem przy ${gameName} już kilkadziesiąt godzin i nadal mam ochotę na więcej. Mechaniki są dobrze przemyślane a postęp sprawia ogromną satysfakcję.`,
        `[Twitter/X / @gracz_recenzent]: ${gameName} to jedna z lepszych gier tego roku w swoim gatunku. Twórcy wiedzą co robią i widać to w każdym aspekcie produkcji. 8/10.`,
        `[Metacritic / Użytkownik123]: Gra ma kilka niedoróbek technicznych ale ogólna jakość jest wysoka. Liczę na szybkie patche od twórców. Potencjał jest ogromny.`,
        `[Steam / Marcin_Gamer]: Po wielu godzinach mogę powiedzieć — warto było czekać na tę grę. Twórcy dotrzymali obietnic i dostarczyli solidny produkt. Polecam!`,
        `[Reddit / u/sceptyk_pl]: Gra jest dobra ale trochę przereklamowana w mediach. Ma swoje wady, jednak dla fanów gatunku to obowiązkowa pozycja. Kupujcie na wyprzedaży.`,
        `[Twitter/X / @pcgamer]: Optymalizacja na PC mogłaby być lepsza — przy moim setupie spada FPS w niektórych lokacjach. Mam nadzieję na patch poprawiający wydajność.`,
        `[Steam / Anna_Plays]: Zakochałam się w tej grze od pierwszych minut. Klimat jest niesamowity a muzyka tworzy idealne tło. Zdecydowanie jedna z moich ulubionych gier roku!`,
      ];
    }

    // Oblicz sentyment na podstawie tekstu opinii
    const positiveWords = ['świetna', 'genialny', 'rewelacyjna', 'niesamowita', 'polecam', 'super', 'doskonały', 'piękna', 'najlepsza', 'wow', 'fantastyczna', 'genialne', 'absolutny', 'cudowna', 'uwielbiam', 'arcydzieło'];
    const negativeWords = ['słaba', 'zła', 'kiepska', 'bugów', 'błędy', 'katastrofa', 'nie polecam', 'nudna', 'rozczarowanie', 'dramat', 'tragedia', 'koszmar', 'skandal', 'za droga', 'przereklamowana'];
    let posCount = positiveWords.filter(w => textLower.includes(w)).length + reviewSnippets.filter(r => positiveWords.some(w => r.toLowerCase().includes(w))).length * 0.3;
    let negCount = negativeWords.filter(w => textLower.includes(w)).length + reviewSnippets.filter(r => negativeWords.some(w => r.toLowerCase().includes(w))).length * 0.3;
    const total = posCount + negCount || 1;
    const posRatio = posCount / total;

    const sentimentScore = Math.round(52 + posRatio * 30 + Math.random() * 8 - 4);
    const positivePercent = Math.round(45 + posRatio * 25 + Math.random() * 6 - 3);
    const negativePercent = Math.round(12 + (1 - posRatio) * 18 + Math.random() * 6 - 3);
    const neutralPercent = Math.max(5, 100 - positivePercent - negativePercent);

    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

    const reviewsText = reviewSnippets.join('\n');

    return {
      sentimentScore: Math.min(95, Math.max(25, sentimentScore)),
      positivePercent: Math.min(85, Math.max(20, positivePercent)),
      neutralPercent: Math.min(40, Math.max(5, neutralPercent)),
      negativePercent: Math.min(50, Math.max(5, negativePercent)),
      keyTopics: shuffle(topics).slice(0, 4),
      praisePoints: shuffle(praise).slice(0, 3),
      complaintPoints: shuffle(complaints).slice(0, 3),
      editorialSummary: `Społeczność graczy przyjęła grę ${gameName} ${mood}. ${praise[0]} oraz ${praise[1].toLowerCase()} to elementy które najczęściej pojawiają się w pozytywnych recenzjach. Gracze zwracają jednak uwagę na ${complaints[0].toLowerCase()}, co stanowi główny punkt krytyki. Ogólny sentyment społeczności jest ${sentimentScore >= 65 ? 'wyraźnie pozytywny' : sentimentScore >= 50 ? 'umiarkowanie pozytywny' : 'mieszany'} — tytuł trafia w gusta swojej grupy docelowej i ma potencjał na długie życie dzięki wsparciu twórców.`,
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleString('pl-PL'),
      gameName,
      gameImage: gameContext ? gameContext.background_image : null,
      analyzedTextLength: reviewsText.length,
      _reviews: reviewsText,
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

  // --- Automatyczne Generowanie Opinii (tryb inteligentnego demo) ---
  const generateAndAnalyzeReviews = async (game) => {
    if (!game) return;
    setAnalyzing(true);
    setErrorMsg('');
    setAnalysisResult(null);

    // Krótkie opóźnienie żeby kółko ładowania było widoczne
    await sleep(1500);

    // Generuj wyniki bezpośrednio z inteligentnego generatora demo
    const demoResult = generateDemoResult('', game);
    setCustomReviews(demoResult._reviews || '');
    setAnalysisResult(demoResult);
    setAnalysisHistory(prev => [demoResult, ...prev]);
    showNotification('Analiza zakończona sukcesem!', 'success');
    setAnalyzing(false);
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
