import type { Database, DocumentGenere } from '../types';

// La librairie PDF (~400 Ko) n'est chargée qu'au premier téléchargement
export function telechargerPDF(db: Database, d: DocumentGenere): void {
  void import('./pdf').then((m) => m.telechargerPDF(db, d));
}

export function exporterRapportPDF(...args: Parameters<typeof import('./pdf').exporterRapportPDF>): void {
  void import('./pdf').then((m) => m.exporterRapportPDF(...args));
}
