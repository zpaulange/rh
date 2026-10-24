/** Export CSV compatible Excel (séparateur « ; », BOM UTF-8) */
export function exporterCSV(fichier: string, colonnes: string[], lignes: (string | number)[][]): void {
  const echapper = (v: string | number) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenu = [colonnes, ...lignes].map((l) => l.map(echapper).join(';')).join('\r\n');
  const blob = new Blob(['﻿', contenu], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
