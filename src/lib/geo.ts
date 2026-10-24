import type { GeoPoint, Parametres } from '../types';

/** Distance en mètres entre deux coordonnées (formule de Haversine) */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function versGeoPoint(pos: GeolocationPosition, site: Parametres['site']): GeoPoint {
  const { latitude, longitude, accuracy } = pos.coords;
  const distance = Math.round(distanceMetres(latitude, longitude, site.lat, site.lng));
  return {
    lat: latitude,
    lng: longitude,
    precision: Math.round(accuracy),
    distance,
    // La précision GPS est prise en compte pour ne pas pénaliser un signal imprécis
    dansZone: distance <= site.rayon + Math.min(accuracy, 100),
  };
}

export function localiser(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      const messages: Record<number, string> = {
        1: "Autorisation de localisation refusée. Autorisez l'accès à la position dans le navigateur.",
        2: 'Position indisponible. Vérifiez le GPS ou la connexion.',
        3: 'La localisation a pris trop de temps. Réessayez.',
      };
      reject(new Error(messages[err.code] ?? 'Localisation impossible.'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

export const lienCarte = (lat: number, lng: number): string =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

export const formatDistance = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
