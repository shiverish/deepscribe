# SeeScribe 👁️✍️

**SeeScribe** is de vastleglaag van DeepScribe: een native Windows-applicatie (.NET 8 WPF) waarmee je met een sneltoets het scherm bevriest, erop annoteert, en het geheel als taak in DeepScribe zet. Een agent pakt het daar op.

De naam dekt de lading: *See* — de agent ziet het scherm. *Scribe* — jij schrijft erop.

---

## Waarom het geen AI-client is

SeeScribe praat niet met een AI-model. Iedere vastlegging wordt een item in DeepScribe, en pas van daaruit wordt er werk van gemaakt. Dat levert vier dingen op die een directe verbinding niet geeft:

- Alles blijft vastgelegd en terugvindbaar, ook als er niet meteen iets mee gebeurt.
- Meldingen kunnen worden verzameld voordat een agent ze oppakt.
- Iedere melding krijgt projectcontext mee in plaats van in een leeg gesprek te landen.
- Meerdere agents kunnen items claimen via de bestaande werkitemstroom van DeepScribe.

---

## Wat er in DeepScribe belandt

Per vastlegging ontstaat één taak, direct oppakbaar door welke agent dan ook:

- **Titel en toelichting** — wat je hebt getypt.
- **Context** — welk venster, welke applicatie, welk scherm, welk tijdstip.
- **Wat je hebt aangewezen** — als leesbare tekst én als bijlage met gestructureerde gegevens: type, coördinaten, volgorde, kleur, badgenummer. Een agent hoeft dus niet uit pixels af te leiden waar pijl 2 naar wijst.
- **De geannoteerde afbeelding** als bijlage.
- **Een spraakopname** als bijlage, wanneer ingesproken. SeeScribe transcribeert niet zelf.

Zonder project gaat het naar de Workspace Inbox; met project naar dat project.

---

## Bediening

| Sneltoets | Actie |
| :--- | :--- |
| **`Ctrl + Alt + S`** | Bevries het scherm onder de muis en ga annoteren |
| **`Enter`** | Bewaar in DeepScribe |
| **`Esc`** | Sluit de overlay |
| **`Ctrl + Z`** | Maak de laatste annotatie ongedaan |

Tekengereedschap: pijl, pen, kader, cirkel, markeerstift en genummerde stappen.

De overlay sluit pas wanneer het bewaren gelukt is. Mislukt het, dan blijft je annotatie staan met de reden erbij, zodat je opnieuw kunt proberen.

---

## Levensduur

SeeScribe wordt beheerd door DeepScribe en heeft geen eigen systeemvakicoon.

- DeepScribe start SeeScribe bij de eerste vastlegging. Starten en aansturen zijn dezelfde aanroep: draait SeeScribe al, dan geeft een tweede start zijn opdracht door via een named pipe en sluit zichzelf.
- Sluit DeepScribe af, dan sluit SeeScribe mee. Bij netjes afsluiten via een afsluitopdracht over de pipe; loopt DeepScribe vast, dan merkt een bewaker binnen vijftien seconden dat de bridge onbereikbaar is.
- Staat er een overlay open, dan wordt eerst gewacht tot die gesloten is.

Het instellingenvenster opent door SeeScribe zonder opdracht te starten.

---

## Verbinding met DeepScribe

DeepScribe opent bij het starten een lokale bridge en schrijft poort en token naar `deepscribe-mcp-bridge.json` in zijn gebruikersmap. SeeScribe leest dat bestand en spreekt de bridge aan.

Let op: het bestaan van dat bestand betekent niet dat DeepScribe leeft. Bij netjes afsluiten wordt het opgeruimd, maar na een crash blijft het staan. Daarom wordt de bridge daadwerkelijk aangesproken in plaats van alleen het bestand gecontroleerd.

---

## Bouwen

Vereist Windows 10 of 11 en de [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0).

Vanuit de hoofdmap van de repository:

```bash
npm run seescribe:build
```

```bash
npm run seescribe:test
```

Los draaien vanuit deze map:

```bash
dotnet run --project src/SeeScribe.App
```

`npm run app:build` bouwt SeeScribe mee en levert het uit als extra bron naast de DeepScribe-installatie, zodat een geïnstalleerde DeepScribe hem zonder verdere instellingen vindt.

---

## Projectstructuur

```text
seescribe/
├── src/
│   ├── SeeScribe.Core/       # Modellen, enums en interfaces
│   ├── SeeScribe.DeepScribe/ # Bridge-client, schrijver en annotatiebeschrijving
│   ├── SeeScribe.Storage/    # Instellingen
│   └── SeeScribe.App/        # WPF-overlay, tekengereedschap en diensten
└── tests/
    └── SeeScribe.Tests/      # xUnit-tests
```
