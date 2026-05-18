# PlayerSignal – Deployment na Netlify

## Jak wdrożyć (krok po kroku)

### Krok 1 – Wgraj pliki i wdróż na Netlify
Zastąp stare pliki w repozytorium GitHub nowymi. Netlify automatycznie przebuduje stronę.

### Krok 2 – Zdobądź darmowy klucz Gemini API
1. Wejdź na https://aistudio.google.com
2. Zaloguj się kontem Google
3. Kliknij "Get API Key" → "Create API key"
4. Skopiuj klucz

### Krok 3 – Dodaj klucz w Netlify
1. W swoim projekcie na Netlify: Site configuration → Environment variables
2. Kliknij "Add a variable"
3. Nazwa: GEMINI_API_KEY
4. Wartość: wklej skopiowany klucz → Save
5. Kliknij "Trigger deploy"

Gotowe! Analiza AI będzie działać.
