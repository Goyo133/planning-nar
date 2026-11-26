/* Réglages du site. Ces valeurs sont publiques par nature (elles s'affichent dans le navigateur) :
   la protection vient du code du service et des clés gardées dans les secrets GitHub. */
window.NAR_CONFIG = {
  supabaseUrl: "",       // ex. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",   // Supabase → Project Settings → API → clé "anon public"
  vapidPublicKey: ""     // clé publique des notifications (site + ?gestion → « Préparer les notifications »)
};
