import { dateCourte, dateKey } from './time';

/** "à l'instant", "il y a 5 min", "il y a 3 h", "Hier", "19 Oct 2024" */
export function depuis(iso: string, now: Date): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${Math.floor(diff)} min`;
  if (diff < 24 * 60 && dateKey(new Date(iso)) === dateKey(now)) return `il y a ${Math.floor(diff / 60)} h`;
  const hier = new Date(now.getTime() - 86400000);
  if (dateKey(new Date(iso)) === dateKey(hier)) return 'Hier';
  return dateCourte(dateKey(new Date(iso)));
}
