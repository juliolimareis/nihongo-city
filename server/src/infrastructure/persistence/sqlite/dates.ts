// O SQLite guarda datas como texto UTC "AAAA-MM-DD HH:MM:SS" (formato de datetime('now')).

export const toSqlDate = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ');

export const fromSqlDate = (s: string): Date => new Date(`${s.replace(' ', 'T')}Z`);
