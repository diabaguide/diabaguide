/* Voix et partage : services du navigateur, sans envoyer le texte à un serveur tiers. */

export const langueVoix = (lang: string): string => {
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'ar') return 'ar-SA';
  return 'fr-FR';
};

export function textePartageFiche(p: { name: string; addrCn?: string | null }, url: string): string {
  const lignes = [p.name.trim()];
  if (p.addrCn?.trim()) lignes.push(`Adresse chinoise : ${p.addrCn.trim()}`);
  lignes.push(url);
  return lignes.join('\n');
}

/** WhatsApp ouvre le texte déjà prêt ; le voyageur choisit ensuite le destinataire. */
export function lienPartageWhatsApp(p: { name: string; addrCn?: string | null }, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(textePartageFiche(p, url))}`;
}

export function peutDicter(): boolean {
  return typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
    || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

export function peutLire(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function lireTexte(texte: string, lang: string): boolean {
  if (!texte.trim() || !peutLire()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = langueVoix(lang);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}
