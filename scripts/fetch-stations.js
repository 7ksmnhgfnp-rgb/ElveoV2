// Ruft echte Ladesäulen-Standorte (Deutschland) von Open Charge Map ab
// und schreibt sie nach data/stations.json.
// Läuft in der GitHub Action "update-charging-data.yml".
const fs = require('fs');
const path = require('path');

const OCM_URL =
  'https://api.openchargemap.io/v3/poi/?output=json&countrycode=DE&maxresults=3000&compact=true&verbose=false';

// Zuordnung: Betreibername bei Open Charge Map -> deine internen cpo-IDs
// (aus dem "cpos"-Array in index.html). Bei Bedarf ergänzen/anpassen.
const OPERATOR_MAP = [
  { match: /ionity/i, cpo: 'ionity' },
  { match: /enbw/i, cpo: 'enbw' },
  { match: /allego/i, cpo: 'allego' },
  { match: /aral\s*pulse|aral/i, cpo: 'aral' },
  { match: /shell/i, cpo: 'shell' },
  { match: /ewe/i, cpo: 'ewe' }
];

function mapOperator(name) {
  if (!name) return null;
  for (const o of OPERATOR_MAP) {
    if (o.match.test(name)) return o.cpo;
  }
  return null;
}

async function main() {
  // Optionaler kostenloser API-Key erhöht das Rate-Limit deutlich.
  // Als Repo-Secret OCM_API_KEY hinterlegen (Settings -> Secrets -> Actions).
  const apiKey = process.env.OCM_API_KEY;
  const url = OCM_URL + (apiKey ? '&key=' + apiKey : '');

  const res = await fetch(url, { headers: { 'User-Agent': 'Elveo-App (github.com/7ksmnhgfnp-rgb/ElveoV2)' } });
  if (!res.ok) throw new Error('OCM-Abruf fehlgeschlagen: ' + res.status);
  const raw = await res.json();

  const stations = raw
    .map(function (poi) {
      const opName = poi.OperatorInfo && poi.OperatorInfo.Title;
      const cpo = mapOperator(opName);
      const conn = (poi.Connections || [])[0];
      if (!cpo || !poi.AddressInfo) return null;
      return {
        cpo: cpo,
        lat: poi.AddressInfo.Latitude,
        lng: poi.AddressInfo.Longitude,
        kw: conn && conn.PowerKW ? Math.round(conn.PowerKW) : null,
        title: poi.AddressInfo.Title || null
      };
    })
    .filter(Boolean);

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stations.json'), JSON.stringify(stations, null, 2));

  console.log(
    'Geschrieben: ' + stations.length + ' Ladesäulen von ' + raw.length +
    ' Treffern (nur bekannte Betreiber ' + OPERATOR_MAP.map(function (o) { return o.cpo; }).join(', ') + ').'
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
