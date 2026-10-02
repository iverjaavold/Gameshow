# Gameshow

En liten Node-server på Render serverer appen.

## Mappestruktur

```
gameshow/
├── index.html      Selve siden
├── server.js       Server: serverer appen
├── package.json    Startkommando for serveren
├── render.yaml     Oppsett for Render
├── README.md
├── assets/         Bilder og andre filer
├── css/
│   └── base.css    Grunnstil og layout
└── js/
    └── main.js     Oppstart
```

## Kjøre appen lokalt

Installer [Node.js](https://nodejs.org) (versjon 18 eller nyere), og kjør:

```
node server.js
```

Åpne `http://localhost:3000`.

## Publisere på Render

1. Lag et nytt repo på GitHub som heter `gameshow`, og push koden dit.
2. Gå til Render og velg **New → Blueprint**. Koble til GitHub-repoet.
3. Render leser `render.yaml` og oppretter webtjenesten `gameshow`.

Når du pusher endringer til repoet, publiserer Render den nye versjonen automatisk.
