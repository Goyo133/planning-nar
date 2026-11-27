-- Planning Neuro-Anesthésie-Réanimation : base des modifications partagées.
-- À coller une seule fois dans Supabase → SQL Editor → New query → Run.
-- Avant de lancer : remplacez CHANGEZ-MOI par le code du service que vous donnerez à l'équipe.

create table if not exists public.modifs (
  cle     text primary key,                 -- "2026-12-14_bloc2"
  jour    date not null,
  poste   text not null,
  valeur  text not null,                    -- "AB", "AB / CD", "AB-CD", "-0-" ou "" (vide)
  avant   text,                             -- ce que prévoyait le planning importé
  auteur  text not null,
  le      timestamptz not null default now()
);

create table if not exists public.historique (
  id          bigint generated always as identity primary key,
  jour        date not null,
  poste       text not null,
  avant       text,
  apres       text,
  auteur      text not null,
  annulation  boolean not null default false,
  le          timestamptz not null default now()
);

create table if not exists public.reglages (
  cle    text primary key,
  valeur text not null
);
insert into public.reglages (cle, valeur) values ('code_service', 'CHANGEZ-MOI')
  on conflict (cle) do nothing;

-- Lecture libre des modifications et de l'historique ; aucune écriture directe.
alter table public.modifs     enable row level security;
alter table public.historique enable row level security;
alter table public.reglages   enable row level security;   -- aucune règle : le code reste invisible
drop policy if exists "lecture" on public.modifs;
drop policy if exists "lecture" on public.historique;
create policy "lecture" on public.modifs     for select to anon, authenticated using (true);
create policy "lecture" on public.historique for select to anon, authenticated using (true);
-- Droits de lecture (les nouveaux projets Supabase ne les donnent plus par défaut)
grant usage on schema public to anon, authenticated;
grant select on public.modifs, public.historique to anon, authenticated;

-- Seul chemin d'écriture : vérifie le code du service, puis enregistre et note dans l'historique.
-- p_valeur = null : revenir au planning d'origine.
create or replace function public.modifier(
  p_code text, p_jour date, p_poste text, p_valeur text, p_avant text, p_auteur text, p_actuel text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cle text := p_jour::text || '_' || p_poste;
begin
  if p_code is null or p_code <> (select valeur from reglages where cle = 'code_service') then
    raise exception 'code_invalide';
  end if;
  if p_poste not in ('rea1','rea2','rea3','rea4','bloc1','bloc2','bloc3','tdm','rx','consultm','consulta','garde','astreinte') then
    raise exception 'poste_inconnu';
  end if;
  if p_auteur !~ '^[A-Z0-9]{1,4}$' then raise exception 'auteur_invalide'; end if;
  if p_valeur is not null and (length(p_valeur) > 40 or p_valeur !~ '^[A-Z0-9 /-]*$') then raise exception 'valeur_invalide'; end if;
  if p_jour < current_date - 400 or p_jour > current_date + 400 then raise exception 'date_invalide'; end if;

  if p_valeur is null then
    insert into historique (jour, poste, avant, apres, auteur, annulation)
      values (p_jour, p_poste, p_actuel, (select avant from modifs where cle = v_cle), p_auteur, true);
    delete from modifs where cle = v_cle;
  else
    insert into modifs (cle, jour, poste, valeur, avant, auteur)
      values (v_cle, p_jour, p_poste, p_valeur, left(p_avant, 40), p_auteur)
      on conflict (cle) do update set valeur = excluded.valeur, auteur = excluded.auteur, le = now();   -- garde le « avant » d'origine
    insert into historique (jour, poste, avant, apres, auteur) values (p_jour, p_poste, left(p_actuel, 40), p_valeur, p_auteur);
  end if;
end $$;

revoke all on function public.modifier(text, date, text, text, text, text, text) from public;
grant execute on function public.modifier(text, date, text, text, text, text, text) to anon, authenticated;

-- Effacer toutes les modifications d'un mois (par exemple après réimport) : à lancer ici, dans SQL Editor.
--   delete from public.modifs where to_char(jour, 'YYYY-MM') = '2027-01';
-- Changer le code du service :
--   update public.reglages set valeur = 'NOUVEAU-CODE' where cle = 'code_service';

-- Mise à jour en direct chez tous les utilisateurs.
do $$ begin
  alter publication supabase_realtime add table public.modifs;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Notifications la veille : téléphones abonnés. Invisibles depuis le site
-- (aucune règle de lecture) ; seul l'envoi du soir les lit, avec la clé service_role.
create table if not exists public.abonnements (
  endpoint  text primary key,
  medecin   text not null,
  p256dh    text not null,
  auth      text not null,
  cree_le   timestamptz not null default now()
);
alter table public.abonnements enable row level security;

create or replace function public.abonner(p_medecin text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_medecin !~ '^[A-Z0-9]{1,4}$' then raise exception 'medecin_invalide'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'abonnement_invalide'; end if;
  if length(p_p256dh) > 200 or length(p_auth) > 100 then raise exception 'abonnement_invalide'; end if;
  insert into abonnements (endpoint, medecin, p256dh, auth) values (p_endpoint, p_medecin, p_p256dh, p_auth)
    on conflict (endpoint) do update set medecin = excluded.medecin, p256dh = excluded.p256dh, auth = excluded.auth, cree_le = now();
end $$;

create or replace function public.desabonner(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from abonnements where endpoint = p_endpoint;
end $$;

revoke all on function public.abonner(text, text, text, text) from public;
revoke all on function public.desabonner(text) from public;
grant execute on function public.abonner(text, text, text, text) to anon, authenticated;
grant execute on function public.desabonner(text) to anon, authenticated;
