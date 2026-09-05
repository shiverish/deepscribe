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

## Quick Capture & Inbox

- **Snel vastleggen:** Druk op `Ctrl+Alt+C` (of klik op het bliksemicoon) om overal snel een gedachte vast te leggen en direct weer door te gaan.
- **Geen afleiding:** Het invoerveld vraagt alleen om je gedachte. Een optioneel doellabel/projecthint kan worden gekozen via **More options**. Na opslaan sluit het venster direct met de melding *"Saved. Codex will prepare a suggestion."*
- **Proposal-first:** Agents analyseren captures en doen voorstellen via `propose_capture`, maar voeren nul wijzigingen automatisch door in je workspace zonder jouw expliciete goedkeuring.
- **Eén overzichtelijke Inbox:** In plaats van tabbladen toont de Inbox drie rustige secties:
  1. **Needs your decision:** Concrete voorstellen van agents (met diff-weergave, taakdoelen en acceptatiecriteria) en gerichte verduidelijkingsvragen. Acties: **Approve**, **Edit suggestion**, **Keep as loose note**, of **Dismiss**.
  2. **Waiting captures:** Compact overzicht van captures die wachten op analyse, inclusief een **Analyze now** knop om directe verwerking aan te vragen.
  3. **History:** Inklapbare geschiedenis van verwerkte, bewaarde of afgewezen captures.
- **Badge:** De tellerbadge op de navigatie telt uitsluitend items die jouw actieve beslissing vereisen.

## DeepScribe MCP voor agents

De desktop-app bevat een lokale bridge waarmee Codex en andere MCP-clients projecten, blokken, ideeën, concepten en todo's gestructureerd kunnen lezen en bijwerken. De bridge luistert uitsluitend op `127.0.0.1`, gebruikt per appstart een willekeurig toegangstoken en is alleen beschikbaar terwijl de Electron-app draait.

Beschikbare acties zijn onder andere projecten en blokken tonen, zoeken op tekst of tags, gewone kennisblokken aanmaken of aanvullen, gebruikerstaakblokken lezen, taakstatus bijwerken en gekoppelde bestanden lezen. Agents kunnen taken aanmaken met `create_task`; zulke taken komen in Inbox terecht met de aanmakende agent als herkomst. Agents kunnen ook de inhoud en tags van een taak bijwerken, bij voorkeur met `append_to_block`, bijvoorbeeld om een opleververslag achter te laten. De titel, afhankelijkheden, toewijzing, positie en status van een taak blijven van de gebruiker en lopen uitsluitend via `update_task_status` en de claimtools. Zolang een andere agent een geldige claim op een taak heeft, worden schrijfacties geweigerd tenzij de eigen `agentId` en `claimToken` worden meegegeven. Inline todo's kunnen agents niet aanmaken of afvinken. Door agents aangeleverde Markdown wordt veilig omgezet naar echte koppen, alinea's, links, code en lijsten in de editor; enkele betekenisvolle regeleinden blijven zichtbaar. Bijlagen worden aangeboden als `deepscribe://attachment/<id>` MCP-resources; lokale bestandspaden worden niet gedeeld. Tekstuele bestanden worden als tekst doorgegeven en andere formaten als base64-gecodeerde binaire resource. Schrijfacties verwijderen niets en de toolbeschrijvingen sturen agents aan om eerst te lezen en bestaande inhoud zo veel mogelijk te behouden.

## Zoeken voor agents

De MCP-tool `search` scoort op passageniveau in plaats van op hele documenten, zodat één relevante alinea in een lang blok ook gevonden wordt. Ieder resultaat bevat een snippet, een score, de kop waaronder de treffer staat en de reden van de match.

Naast blokken worden ook projecten doorzocht: titel, beschrijving en scratchpad. Projecttreffers zijn te herkennen aan `resultType: 'project'`; bloktreffers dragen `resultType: 'block'`. De filters `projectId` en `tags` gelden voor beide.

Het zoekvenster en MCP gebruiken dezelfde lokale ranking op passageniveau en doorzoeken ook projecten.

## Relaties tussen blokken

Blokken kunnen aan elkaar gerelateerd worden, ook over projectgrenzen heen. Relaties worden opgeslagen als verwijzingen naar blok-id, niet naar titel, dus een blok hernoemen breekt ze niet.

- In de editor schrijf je een verwijzing als `[[Bloktitel]]`. Bij opslaan wordt die eenmalig omgezet naar een relatie. Een titel die niet bestaat, of die door meerdere blokken wordt gedragen, blijft bewust onopgelost in plaats van naar het verkeerde blok te wijzen.
- Naast het neutrale `relates-to` bestaan de typen `supports`, `contradicts`, `derived-from` en `source-of`. Een getypeerde relatie die bewust is gelegd, verdwijnt niet wanneer de tekst verandert.
- Het referentiepaneel toont uitgaande verwijzingen en backlinks, met het relatietype en een markering wanneer het andere blok in een ander project staat.
- Agents gebruiken `link_blocks` om een relatie te leggen en `get_related` om vanaf een blok door de graaf te lopen. Zowel uitgaande links als backlinks tellen als stap; ieder resultaat meldt richting, type, afstand en of het cross-project is.
- Bij het definitief verwijderen van een blok of project worden de bijbehorende relaties opgeruimd.

## Uitgaande webhooks

DeepScribe kan taak- en blokgebeurtenissen als JSON naar externe automatiseringen sturen, bijvoorbeeld n8n, Discord of Home Assistant. Endpoints worden beheerd onder **Instellingen → Agents → Outgoing Webhooks**.

- Per endpoint kies je zelf welke gebeurtenissen worden verstuurd: `task.status_changed`, `task.created`, `block.created` en `block.updated`.
- De payload bevat `event`, `timestamp`, `projectId`, `blockId`, `taskId`, `oldStatus`, `newStatus`, `title`, `tags` en `metadata`.
- Verzending gebeurt asynchroon en blokkeert de interface niet; een traag of onbereikbaar endpoint vertraagt het opslaan niet.
- Authenticatie is optioneel: een `Authorization: Bearer`-header of een `X-DeepScribe-Signature` met een HMAC-SHA256 over de body.
- Alleen `http`- en `https`-URL's worden geaccepteerd, met een time-out van vijf seconden. Een mislukte levering wordt gelogd en heeft geen gevolgen voor de andere endpoints.
- Blokken in de prullenbak versturen geen gebeurtenissen.

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

## Licentie

DeepScribe is gelicentieerd onder de [GNU General Public License v3.0 (GPLv3)](LICENSE).


## Capture Inbox

Quick Capture (`Ctrl+Alt+C`) bewaart tekst als bronblok. Opslaan zet de capture direct klaar voor verwerking; een aparte verwerkingstaak is niet nodig. Het venster sluit pas na bevestigde workspaceopslag. Concepttekst blijft bij focusverlies en herstart bewaard, totdat je opslaat of **Discard** kiest.

Open **Inbox** (`Ctrl+5`) voor **Pending**, **Needs input** en **Processed**. Hier staan de oorspronkelijke tekst, vragen van de agent en links naar resultaten. Een antwoord zet de capture opnieuw klaar. De laatste processorcontrole is zichtbaar; zonder beschikbare agent blijven captures wachten.

Agents gebruiken `list_captures`, `get_capture`, `claim_next_capture`, `renew_capture_claim` en `complete_capture`. Claims duren vijftien minuten. Lees projectcontext en mogelijke duplicaten voordat je wijzigingen voorbereidt. `complete_capture` verwerkt maximaal twintig wijzigingen atomair: nieuwe kennis, aanvullingen, taken in Inbox of verwijzingen naar bestaande resultaten. Voor bestaande bestemmingen is `expectedUpdatedAt` verplicht. Een herhaalde `requestId` met dezelfde inhoud levert hetzelfde resultaat zonder dubbele writes. Brontekst blijft behouden; afgeleide resultaten krijgen een `derived-from`-relatie naar de capture.

De externe **DeepScribe Capture Processing**-heartbeat controleert elke vijftien minuten en verwerkt maximaal vijf captures per run. Deze heartbeat wordt buiten de applicatie ingesteld en vereist beschikbare MCP-tools. Hij ordent informatie en bereidt taken voor, zonder vervolgwerk uit te voeren. Nieuwe vragen en technische blokkades worden gemeld; lege of ongewijzigde wachtrijen blijven stil. SeeScribe-screenshots houden hun bestaande flow.
