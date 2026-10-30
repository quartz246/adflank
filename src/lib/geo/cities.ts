/**
 * Qloo's where_popular returns coordinates, not place names. We label each point with the nearest
 * large metro from this small public-knowledge table (approximate city centres) so ad platforms can
 * target it by name. Points far from any listed metro keep their coordinates.
 */
type City = [name: string, region: string, cc: string, lat: number, lon: number];

const CITIES: City[] = [
  ["New York", "NY", "US", 40.71, -74.01], ["Los Angeles", "CA", "US", 34.05, -118.24], ["Chicago", "IL", "US", 41.88, -87.63],
  ["Houston", "TX", "US", 29.76, -95.37], ["Phoenix", "AZ", "US", 33.45, -112.07], ["Philadelphia", "PA", "US", 39.95, -75.17],
  ["San Antonio", "TX", "US", 29.42, -98.49], ["San Diego", "CA", "US", 32.72, -117.16], ["Dallas", "TX", "US", 32.78, -96.8],
  ["Austin", "TX", "US", 30.27, -97.74], ["San Jose", "CA", "US", 37.34, -121.89], ["San Francisco", "CA", "US", 37.77, -122.42],
  ["Seattle", "WA", "US", 47.61, -122.33], ["Denver", "CO", "US", 39.74, -104.99], ["Washington", "DC", "US", 38.91, -77.04],
  ["Boston", "MA", "US", 42.36, -71.06], ["Nashville", "TN", "US", 36.16, -86.78], ["Atlanta", "GA", "US", 33.75, -84.39],
  ["Miami", "FL", "US", 25.76, -80.19], ["Orlando", "FL", "US", 28.54, -81.38], ["Tampa", "FL", "US", 27.95, -82.46],
  ["Jacksonville", "FL", "US", 30.33, -81.66], ["Charlotte", "NC", "US", 35.23, -80.84], ["Raleigh", "NC", "US", 35.78, -78.64],
  ["Detroit", "MI", "US", 42.33, -83.05], ["Minneapolis", "MN", "US", 44.98, -93.27], ["St. Louis", "MO", "US", 38.63, -90.2],
  ["Kansas City", "MO", "US", 39.1, -94.58], ["Las Vegas", "NV", "US", 36.17, -115.14], ["Portland", "OR", "US", 45.52, -122.68],
  ["Salt Lake City", "UT", "US", 40.76, -111.89], ["Sacramento", "CA", "US", 38.58, -121.49], ["Pittsburgh", "PA", "US", 40.44, -80.0],
  ["Cleveland", "OH", "US", 41.5, -81.69], ["Columbus", "OH", "US", 39.96, -83.0], ["Cincinnati", "OH", "US", 39.1, -84.51],
  ["Indianapolis", "IN", "US", 39.77, -86.16], ["Milwaukee", "WI", "US", 43.04, -87.91], ["Baltimore", "MD", "US", 39.29, -76.61],
  ["New Orleans", "LA", "US", 29.95, -90.07], ["Memphis", "TN", "US", 35.15, -90.05], ["Louisville", "KY", "US", 38.25, -85.76],
  ["Oklahoma City", "OK", "US", 35.47, -97.52], ["Albuquerque", "NM", "US", 35.08, -106.65], ["Tucson", "AZ", "US", 32.22, -110.97],
  ["Honolulu", "HI", "US", 21.31, -157.86], ["Anchorage", "AK", "US", 61.22, -149.9], ["Buffalo", "NY", "US", 42.89, -78.88],
  ["Richmond", "VA", "US", 37.54, -77.44], ["Birmingham", "AL", "US", 33.52, -86.8], ["Boise", "ID", "US", 43.62, -116.2],
  ["Omaha", "NE", "US", 41.26, -95.93], ["El Paso", "TX", "US", 31.76, -106.49], ["Fresno", "CA", "US", 36.74, -119.79],
  ["Toronto", "ON", "CA", 43.65, -79.38], ["Montreal", "QC", "CA", 45.5, -73.57], ["Vancouver", "BC", "CA", 49.28, -123.12],
  ["Calgary", "AB", "CA", 51.05, -114.07], ["Ottawa", "ON", "CA", 45.42, -75.7], ["Mexico City", "CDMX", "MX", 19.43, -99.13],
  ["Guadalajara", "JAL", "MX", 20.67, -103.35], ["Monterrey", "NL", "MX", 25.69, -100.32], ["São Paulo", "SP", "BR", -23.55, -46.63],
  ["Rio de Janeiro", "RJ", "BR", -22.91, -43.17], ["Buenos Aires", "BA", "AR", -34.6, -58.38], ["Santiago", "RM", "CL", -33.45, -70.67],
  ["Bogotá", "DC", "CO", 4.71, -74.07], ["Lima", "LIM", "PE", -12.05, -77.04], ["London", "England", "GB", 51.51, -0.13],
  ["Manchester", "England", "GB", 53.48, -2.24], ["Birmingham", "England", "GB", 52.49, -1.89], ["Glasgow", "Scotland", "GB", 55.86, -4.25],
  ["Edinburgh", "Scotland", "GB", 55.95, -3.19], ["Leeds", "England", "GB", 53.8, -1.55], ["Liverpool", "England", "GB", 53.41, -2.98],
  ["Bristol", "England", "GB", 51.45, -2.59], ["Dublin", "Leinster", "IE", 53.35, -6.26], ["Paris", "Île-de-France", "FR", 48.86, 2.35],
  ["Lyon", "Auvergne-Rhône-Alpes", "FR", 45.76, 4.84], ["Marseille", "PACA", "FR", 43.3, 5.37], ["Toulouse", "Occitanie", "FR", 43.6, 1.44],
  ["Berlin", "Berlin", "DE", 52.52, 13.4], ["Hamburg", "Hamburg", "DE", 53.55, 9.99], ["Munich", "Bavaria", "DE", 48.14, 11.58],
  ["Cologne", "NRW", "DE", 50.94, 6.96], ["Frankfurt", "Hesse", "DE", 50.11, 8.68], ["Stuttgart", "BW", "DE", 48.78, 9.18],
  ["Düsseldorf", "NRW", "DE", 51.23, 6.77], ["Nuremberg", "Bavaria", "DE", 49.45, 11.08], ["Leipzig", "Saxony", "DE", 51.34, 12.37],
  ["Dresden", "Saxony", "DE", 51.05, 13.74], ["Hanover", "Lower Saxony", "DE", 52.38, 9.73], ["Kassel", "Hesse", "DE", 51.31, 9.48],
  ["Madrid", "Madrid", "ES", 40.42, -3.7], ["Barcelona", "Catalonia", "ES", 41.39, 2.17], ["Valencia", "Valencia", "ES", 39.47, -0.38],
  ["Seville", "Andalusia", "ES", 37.39, -5.98], ["Lisbon", "Lisbon", "PT", 38.72, -9.14], ["Porto", "Norte", "PT", 41.15, -8.61],
  ["Rome", "Lazio", "IT", 41.9, 12.5], ["Milan", "Lombardy", "IT", 45.46, 9.19], ["Naples", "Campania", "IT", 40.85, 14.27],
  ["Turin", "Piedmont", "IT", 45.07, 7.69], ["Amsterdam", "North Holland", "NL", 52.37, 4.9], ["Rotterdam", "South Holland", "NL", 51.92, 4.48],
  ["Brussels", "Brussels", "BE", 50.85, 4.35], ["Zurich", "Zurich", "CH", 47.38, 8.54], ["Geneva", "Geneva", "CH", 46.2, 6.14],
  ["Vienna", "Vienna", "AT", 48.21, 16.37], ["Copenhagen", "Capital", "DK", 55.68, 12.57], ["Stockholm", "Stockholm", "SE", 59.33, 18.07],
  ["Oslo", "Oslo", "NO", 59.91, 10.75], ["Helsinki", "Uusimaa", "FI", 60.17, 24.94], ["Warsaw", "Masovia", "PL", 52.23, 21.01],
  ["Prague", "Prague", "CZ", 50.08, 14.44], ["Budapest", "Budapest", "HU", 47.5, 19.04], ["Athens", "Attica", "GR", 37.98, 23.73],
  ["Istanbul", "Istanbul", "TR", 41.01, 28.98], ["Dubai", "Dubai", "AE", 25.2, 55.27], ["Tel Aviv", "Tel Aviv", "IL", 32.09, 34.78],
  ["Cairo", "Cairo", "EG", 30.04, 31.24], ["Lagos", "Lagos", "NG", 6.52, 3.38], ["Nairobi", "Nairobi", "KE", -1.29, 36.82],
  ["Johannesburg", "Gauteng", "ZA", -26.2, 28.05], ["Cape Town", "Western Cape", "ZA", -33.92, 18.42], ["Mumbai", "Maharashtra", "IN", 19.08, 72.88],
  ["Delhi", "Delhi", "IN", 28.61, 77.21], ["Bengaluru", "Karnataka", "IN", 12.97, 77.59], ["Singapore", "Singapore", "SG", 1.35, 103.82],
  ["Bangkok", "Bangkok", "TH", 13.76, 100.5], ["Jakarta", "Jakarta", "ID", -6.2, 106.85], ["Manila", "Metro Manila", "PH", 14.6, 120.98],
  ["Kuala Lumpur", "KL", "MY", 3.14, 101.69], ["Hong Kong", "Hong Kong", "HK", 22.32, 114.17], ["Taipei", "Taipei", "TW", 25.03, 121.57],
  ["Seoul", "Seoul", "KR", 37.57, 126.98], ["Busan", "Busan", "KR", 35.18, 129.08], ["Tokyo", "Tokyo", "JP", 35.68, 139.69],
  ["Osaka", "Osaka", "JP", 34.69, 135.5], ["Shanghai", "Shanghai", "CN", 31.23, 121.47], ["Beijing", "Beijing", "CN", 39.9, 116.41],
  ["Sydney", "NSW", "AU", -33.87, 151.21], ["Melbourne", "VIC", "AU", -37.81, 144.96], ["Brisbane", "QLD", "AU", -27.47, 153.03],
  ["Perth", "WA", "AU", -31.95, 115.86], ["Auckland", "Auckland", "NZ", -36.85, 174.76],
];

export interface NearCity {
  name: string;
  region: string;
  countryCode: string;
  km: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Approximate centre of a listed metro by name (case-insensitive), or undefined. */
export function cityCoords(name: string): { lat: number; lon: number } | undefined {
  const n = name.trim().toLowerCase();
  const c = CITIES.find(([nm]) => nm.toLowerCase() === n);
  return c ? { lat: c[3], lon: c[4] } : undefined;
}

/** Nearest listed metro within maxKm, or undefined. */
export function nearestCity(lat: number, lon: number, maxKm = 250): NearCity | undefined {
  let best: NearCity | undefined;
  for (const [name, region, cc, la, lo] of CITIES) {
    const km = haversineKm(lat, lon, la, lo);
    if (km <= maxKm && (!best || km < best.km)) best = { name, region, countryCode: cc, km: Math.round(km) };
  }
  return best;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
  GB: "United Kingdom", IE: "Ireland", FR: "France", DE: "Germany", ES: "Spain", PT: "Portugal", IT: "Italy", NL: "Netherlands",
  BE: "Belgium", CH: "Switzerland", AT: "Austria", DK: "Denmark", SE: "Sweden", NO: "Norway", FI: "Finland", PL: "Poland",
  CZ: "Czechia", HU: "Hungary", GR: "Greece", TR: "Turkey", AE: "United Arab Emirates", IL: "Israel", EG: "Egypt", NG: "Nigeria",
  KE: "Kenya", ZA: "South Africa", IN: "India", SG: "Singapore", TH: "Thailand", ID: "Indonesia", PH: "Philippines", MY: "Malaysia",
  HK: "Hong Kong", TW: "Taiwan", KR: "South Korea", JP: "Japan", CN: "China", AU: "Australia", NZ: "New Zealand",
};

export function countryName(code: string): string | undefined {
  return COUNTRY_NAMES[code.toUpperCase()];
}

export const COUNTRY_CODES = Object.keys(COUNTRY_NAMES);

/** Main language per country, for the AttackPackage locale (ads copy language). */
export function countryLanguage(code: string): string {
  const m: Record<string, string> = { MX: "es", AR: "es", CL: "es", CO: "es", PE: "es", ES: "es", BR: "pt", PT: "pt", FR: "fr", BE: "fr", DE: "de", AT: "de", CH: "de", IT: "it", NL: "nl", DK: "da", SE: "sv", NO: "no", FI: "fi", PL: "pl", CZ: "cs", HU: "hu", GR: "el", TR: "tr", AE: "ar", EG: "ar", IL: "he", TH: "th", ID: "id", JP: "ja", KR: "ko", CN: "zh", TW: "zh", HK: "zh" };
  return m[code.toUpperCase()] ?? "en";
}
