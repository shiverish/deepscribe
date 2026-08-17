# DeepScribe

DeepScribe is een local-first schrijf- en kennisapp met een hiërarchische Miller-columnnavigatie. De desktop-app bewaart een verplaatsbare SQLite-workspace lokaal op de computer; de browserontwikkelmodus gebruikt IndexedDB via Dexie.

## Starten

```bash
npm install
npm run dev
```

## Standalone Desktop App (Electron)

- **Snel starten (ontwikkelmodus):** Dubbelklik op `start-deepscribe.bat` of voer `npm run app:dev` uit.
- **Standalone Windows-installer bouwen:** Voer `npm run app:build` uit. Dit maakt de installer en update-metadata aan in `dist-electron`.
- **Automatische Updates:** De app controleert bij het opstarten op de achtergrond op updates en kan ook handmatig worden gecontroleerd via **Instellingen → Algemeen → Versie & Updates**. Zodra een update binnen is, kan deze met één klik worden geïnstalleerd met automatische back-up/flush van actieve wijzigingen.
- **PWA (Progressive Web App):** De web-app bevat een Web App Manifest (`public/manifest.json`), waardoor je de app ook direct vanuit Chrome of Edge als app op je computer kunt installeren via "App installeren".


## Lokale data en back-ups

- De desktop-app bewaart `workspace.json`, `workspace.sqlite` en alle bijlagen standaard onder `Documenten\DeepScribe\Workspace`.
- Via **Instellingen → Algemeen → Dataopslag** kun je de workspacemap openen of veilig naar een andere locatie kopiëren en omschakelen.
- De workspace is nog niet versleuteld. Bescherm de gekozen map met passende Windows- en schijfrechten.
- Bij de eerste desktopstart wordt bestaande IndexedDB-data na bevestiging naar de workspace gemigreerd; de oude opslag blijft als veiligheidskopie behouden.
- Maak regelmatig via **Exporteren & Importeren** een `.deepscribe`-archief van ieder belangrijk project.
- Importeren overschrijft nooit een bestaand project: project-, blok- en bijlage-id's worden opnieuw aangemaakt.
- Import wordt volledig teruggedraaid als validatie of een databasebewerking mislukt.
- Afbeeldingen die direct in de editor worden geplaatst zijn begrensd op 5 MB per bestand.
- Afbeeldingen kunnen via de uploadknop of met drag-and-drop op de gewenste tekstpositie worden ingevoegd.
- Gewone blokbijlagen worden onder `attachments\<project-id>` in de actieve workspace geplaatst en zijn begrensd op 25 MB per bestand.
- In de browserontwikkelmodus vraagt DeepScribe om persistente browseropslag; wis browserdata alleen met een recente export.

## DeepScribe MCP voor agents

De desktop-app bevat een lokale bridge waarmee Codex en andere MCP-clients projecten, blokken, ideeën, concepten en todo's gestructureerd kunnen lezen en bijwerken. De bridge luistert uitsluitend op `127.0.0.1`, gebruikt per appstart een willekeurig toegangstoken en is alleen beschikbaar terwijl de Electron-app draait.

Beschikbare acties zijn onder andere projecten en blokken tonen, zoeken op tekst of tags, blokken aanmaken of aanvullen, todo's toevoegen of afvinken en gekoppelde bestanden lezen. Door agents aangeleverde Markdown wordt veilig omgezet naar echte koppen, alinea's, links, code en lijsten in de editor; enkele betekenisvolle regeleinden blijven zichtbaar. Bijlagen worden aangeboden als `deepscribe://attachment/<id>` MCP-resources; lokale bestandspaden worden niet gedeeld. Tekstuele bestanden worden als tekst doorgegeven en andere formaten als base64-gecodeerde binaire resource. Schrijfacties verwijderen niets en de toolbeschrijvingen sturen agents aan om eerst te lezen en bestaande inhoud zo veel mogelijk te behouden.

Blokken die via MCP door een agent zijn aangemaakt of gewijzigd krijgen een badge **Nieuw van agent** totdat het blok geopend en kort zichtbaar is geweest. Ongelezen wijzigingen druppelen met een teller omhoog door alle bovenliggende blokken tot aan het project. De rand, badge en optionele glow gebruiken een aparte, globale agent-alertkleur die onder **Instellingen → Uiterlijk** kan worden aangepast.

Registreer de lokale STDIO-server eenmalig bij Codex vanuit deze projectmap:

```powershell
codex mcp add deepscribe -- node "K:\Apps\DeepScribe\mcp\server.mjs"
```

Start of herstart vervolgens DeepScribe met `npm run app:dev` of de desktop-app en open een nieuwe Codex-taak. Controleer de verbinding met `/mcp` of laat de agent de DeepScribe-tool `status` uitvoeren. De STDIO-opzet volgt de [officiële OpenAI-documentatie voor lokale MCP-servers](https://learn.chatgpt.com/docs/extend/mcp).

### Claude Desktop-extensie

Bouw het installeerbare MCP Bundle met:

```powershell
npm run mcpb:build
```

Dit maakt `dist-mcpb/DeepScribe-<versie>.mcpb`. Installeer dat bestand in Claude Desktop via **Settings → Extensions → Advanced settings → Install Extension**. De bundel bevat de MCP-server en alle Node-afhankelijkheden; een losse Node-installatie of verwijzing naar deze projectmap is niet nodig. DeepScribe zelf moet wel draaien wanneer Claude de tools gebruikt.

### ChatGPT-skill

De herbruikbare Agent Skill staat in `integrations/chatgpt/deepscribe`. Bouw een uploadbaar archief met:

```powershell
npm run skill:build
```

Upload `dist-skills/DeepScribe-Skill-<versie>.zip` via **Plugins → Skills → Create → Upload**. De skill leert ChatGPT hoe het DeepScribe veilig leest, bijwerkt en formatteert, maar levert zelf geen netwerkverbinding met de lokale app; daarvoor moeten de DeepScribe-tools afzonderlijk als ondersteunde MCP-app beschikbaar zijn.

## Controles

```bash
npm run lint
npm test
npm run build
```

De tests bewaken onder andere cyclische boomstructuren, verplaatsen, project- en blokherstel, definitief verwijderen en archiefvalidatie.
