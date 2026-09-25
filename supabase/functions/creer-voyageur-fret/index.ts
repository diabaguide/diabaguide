import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) return json({ error: 'Configuration serveur manquante.' }, 500);

  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ error: 'Connexion requise.' }, 401);

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Session invalide.' }, 401);

  const { data: caller, error: roleError } = await admin.from('profiles')
    .select('role').eq('id', auth.user.id).single();
  if (roleError || !['team', 'admin'].includes(caller?.role ?? '')) {
    return json({ error: 'Accès réservé à l’équipe.' }, 403);
  }

  let input: { name?: unknown; email?: unknown; phone?: unknown };
  try { input = await req.json(); } catch { return json({ error: 'Données invalides.' }, 400); }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || phone.length > 40) {
    return json({ error: 'Nom, e-mail et téléphone valides sont obligatoires.' }, 400);
  }

  const { data: existing, error: lookupError } = await admin.from('profiles')
    .select('id').eq('email', email).maybeSingle();
  if (lookupError) return json({ error: 'Vérification du compte impossible.' }, 500);
  if (existing) return json({ error: 'Ce compte existe déjà. Actualisez la liste et sélectionnez-le.' }, 409);

  // Une invitation d'équipe en attente ne doit pas transformer le nouveau
  // compte fret en membre privilégié à la confirmation de l'e-mail.
  const { data: staffInvite, error: inviteLookupError } = await admin.from('team_invitations')
    .select('email').eq('email', email).is('accepted_at', null).maybeSingle();
  if (inviteLookupError) return json({ error: 'Vérification des invitations impossible.' }, 500);
  if (staffInvite) return json({ error: 'Cet e-mail possède une invitation d’équipe en attente.' }, 409);

  const appUrl = Deno.env.get('DIABA_APP_URL') ?? 'https://www.diabaguide.com';
  const redirectTo = `${appUrl.replace(/\/$/, '')}/reinitialiser`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, phone }, redirectTo,
  });
  if (error || !data.user) return json({ error: error?.message ?? 'Création du compte impossible.' }, 400);

  const { data: profile, error: profileError } = await admin.from('profiles')
    .update({ name, phone }).eq('id', data.user.id).select('id, role').single();
  if (profileError || profile?.role !== 'traveler') {
    return json({ error: 'Compte créé, mais profil incomplet. Contactez un administrateur avant de rattacher le colis.' }, 500);
  }
  return json({ id: data.user.id, name, phone });
});
