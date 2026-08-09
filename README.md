# DeepScribe

DeepScribe is een local-first schrijf- en kennisapp met een hiërarchische Miller-columnnavigatie. Alle gegevens blijven lokaal in de browser en worden opgeslagen in IndexedDB via Dexie.

## Starten

```bash
npm install
npm run dev
```

## Standalone Desktop App (Electron)

- **Snel starten (ontwikkelmodus):** Dubbelklik op `start-deepscribe.bat` of voer `npm run app:dev` uit.
- **Standalone Windows-installer bouwen:** Voer `npm run app:build` uit. Alleen `dist-electron/DeepScribe Setup.exe` wordt aangemaakt.
- **PWA (Progressive Web App):** De web-app bevat een Web App Manifest (`public/manifest.json`), waardoor je de app ook direct vanuit Chrome of Edge als app op je computer kunt installeren via "App installeren".

## Lokale data en back-ups

- DeepScribe vraagt de browser om persistente opslag, maar een export blijft de veiligste back-up.
- Maak regelmatig via **Exporteren & Importeren** een `.deepscribe`-archief van ieder belangrijk project.
- Importeren overschrijft nooit een bestaand project: project-, blok- en bijlage-id's worden opnieuw aangemaakt.
- Import wordt volledig teruggedraaid als validatie of een databasebewerking mislukt.
- Afbeeldingen die direct in de editor worden geplaatst zijn begrensd op 5 MB per bestand.
- Afbeeldingen kunnen via de uploadknop of met drag-and-drop op de gewenste tekstpositie worden ingevoegd.
- Gewone blokbijlagen worden gekopieerd naar `Documenten\DeepScribe\Projects\<project-id>` en zijn begrensd op 25 MB per bestand.
- Wis browserdata voor deze site alleen wanneer je een recente export hebt.

## DeepScribe MCP voor agents

De desktop-app bevat een lokale bridge waarmee Codex en andere MCP-clients projecten, blokken, ideeën, concepten en todo's gestructureerd kunnen lezen en bijwerken. De bridge luistert uitsluitend op `127.0.0.1`, gebruikt per appstart een willekeurig toegangstoken en is alleen beschikbaar terwijl de Electron-app draait.

Beschikbare acties zijn onder andere projecten en blokken tonen, zoeken op tekst of tags, blokken aanmaken of aanvullen, en todo's toevoegen of afvinken. Schrijfacties verwijderen niets en de toolbeschrijvingen sturen agents aan om eerst te lezen en bestaande inhoud zo veel mogelijk te behouden.

Registreer de lokale STDIO-server eenmalig bij Codex vanuit deze projectmap:

```powershell
codex mcp add deepscribe -- node "K:\Apps\DeepScribe\mcp\server.mjs"
```

Start of herstart vervolgens DeepScribe met `npm run app:dev` of de desktop-app en open een nieuwe Codex-taak. Controleer de verbinding met `/mcp` of laat de agent de DeepScribe-tool `status` uitvoeren. De STDIO-opzet volgt de [officiële OpenAI-documentatie voor lokale MCP-servers](https://learn.chatgpt.com/docs/extend/mcp).

## Controles

```bash
npm run lint
npm test
npm run build
```

De tests bewaken onder andere cyclische boomstructuren, verplaatsen, project- en blokherstel, definitief verwijderen en archiefvalidatie.
