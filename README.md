# DeepScribe

DeepScribe is een local-first schrijf- en kennisapp met een hiërarchische Miller-columnnavigatie. Alle gegevens blijven lokaal in de browser en worden opgeslagen in IndexedDB via Dexie.

## Starten

```bash
npm install
npm run dev
```

## Standalone Desktop App (Electron)

- **Snel starten (ontwikkelmodus):** Dubbelklik op `start-deepscribe.bat` of voer `npm run app:dev` uit.
- **Standalone Windows .exe bouwen:** Voer `npm run app:build` uit. De verpakte installatiebestanden (`.exe` / draagbare app) worden aangemaakt in `dist-electron/`.
- **PWA (Progressive Web App):** De web-app bevat een Web App Manifest (`public/manifest.json`), waardoor je de app ook direct vanuit Chrome of Edge als app op je computer kunt installeren via "App installeren".

## Lokale data en back-ups

- DeepScribe vraagt de browser om persistente opslag, maar een export blijft de veiligste back-up.
- Maak regelmatig via **Exporteren & Importeren** een `.deepscribe`-archief van ieder belangrijk project.
- Importeren overschrijft nooit een bestaand project: project-, blok- en bijlage-id's worden opnieuw aangemaakt.
- Import wordt volledig teruggedraaid als validatie of een databasebewerking mislukt.
- Afbeeldingen die direct in de editor worden geplaatst zijn begrensd op 5 MB per bestand.
- Wis browserdata voor deze site alleen wanneer je een recente export hebt.

## Controles

```bash
npm run lint
npm test
npm run build
```

De tests bewaken onder andere cyclische boomstructuren, verplaatsen, project- en blokherstel, definitief verwijderen en archiefvalidatie.
