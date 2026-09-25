// Ruft echte Ladesäulen-Standorte (Deutschland) von Open Charge Map ab
// und schreibt sie nach data/stations.json.
// Läuft in der GitHub Action "update-charging-data.yml".
const fs = require('fs');
const path = require('path');

// compact=true weggelassen: das entfernt sonst die OperatorInfo-Objekte
// (Betreibername), die wir zum Zuordnen brauchen.
const OCM_URL =
  'https://api.openchargemap.io/v3/poi/?output=json&countrycode=DE&maxresults=6000&verbose=false';

// Betreiber, für die die App eigene Tarife/Preise kennt (siehe "cpos" in
// index.html). Treffer dieser Betreiber bekommen die passende interne ID,
// damit Tarifvergleich & Blockiergebühr weiter funktionieren.
const OPERATOR_MAP = [
  { match: /ionity/i, cpo: 'ionity' },
  { match: /enbw/i, cpo: 'enbw' },
  { match: /allego/i, cpo: 'allego' },
  { match: /aral\s*pulse|aral/i, cpo: 'aral' },
  { match: /shell/i, cpo: 'shell' },
  { match: /ewe/i, cpo: 'ewe' }
];

function mapKnownOperator(name) {
  if (!name) return null;
  for (const o of OPERATOR_MAP) {
    if (o.match.test(name)) return o.cpo;
  }
  return null;
}

// Für alle übrigen (unbekannten) Betreiber: stabile ID aus dem Namen bauen,
// z.B. "E.ON Drive" -> "e-on-drive". Die App zeigt sie mit echtem Namen an,
// aber ohne Tarifvergleich (dafür fehlen uns die Preisdaten).
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Umlaute/Akzente entfernen
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function main() {
  // Kostenloser API-Key nötig, sonst antwortet OCM mit 403.
  // Als Repo-Secret OCM_API_KEY hinterlegen (Settings -> Secrets -> Actions).
  const apiKey = process.env.OCM_API_KEY;
  const url = OCM_URL + (apiKey ? '&key=' + apiKey : '');

  const res = await fetch(url, { headers: { 'User-Agent': 'Elveo-App (github.com/7ksmnhgfnp-rgb/ElveoV2)' } });
  if (!res.ok) throw new Error('OCM-Abruf fehlgeschlagen: ' + res.status);
  const raw = await res.json();

  let knownCount = 0, otherCount = 0;

  const stations = raw
    .map(function (poi) {
      if (!poi.AddressInfo || poi.AddressInfo.Latitude == null || poi.AddressInfo.Longitude == null) return null;
      const opName = (poi.OperatorInfo && poi.OperatorInfo.Title) || null;
      const known = mapKnownOperator(opName);
      const cpo = known || (opName ? 'x-' + slugify(opName) : 'x-unbekannt');
      const conn = (poi.Connections || [])[0];
      if (known) knownCount++; else otherCount++;
      const a = poi.AddressInfo;
      const addrParts = [a.AddressLine1, [a.Postcode, a.Town].filter(Boolean).join(' ')].filter(Boolean);
      return {
        cpo: cpo,
        name: opName || 'Unbekannter Anbieter',
        lat: a.Latitude,
        lng: a.Longitude,
        kw: conn && conn.PowerKW ? Math.round(conn.PowerKW) : null,
        title: a.Title || null,
        address: addrParts.length ? addrParts.join(', ') : null
      };
    })
    .filter(Boolean);

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stations.json'), JSON.stringify(stations, null, 2));

  console.log(
    'Geschrieben: ' + stations.length + ' Ladesäulen von ' + raw.length + ' Treffern (' +
    knownCount + ' bei bekannten Anbietern mit Tarifdaten, ' + otherCount + ' bei weiteren Anbietern ohne Tarifdaten).'
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
