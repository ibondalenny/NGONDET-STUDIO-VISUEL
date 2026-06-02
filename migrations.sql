-- Ngondet Studio — Migrations PostgreSQL
-- Supabase Project: kvucdlvbxlmvnrzvtcgv

-- Extension UUID
create extension if not exists "uuid-ossp";

-- =====================
-- TABLE : clients
-- =====================
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  nom_client varchar not null,
  secteur varchar,
  couleur_principale varchar,
  couleur_secondaire varchar,
  logo_url text,
  police varchar,
  contact_default text,
  template_flyer_id varchar,
  template_story_id varchar,
  template_post_id varchar,
  template_banniere_id varchar,
  notes text,
  statut varchar default 'actif',
  created_at timestamp default now()
);

-- =====================
-- TABLE : templates
-- =====================
create table if not exists templates (
  id uuid primary key default uuid_generate_v4(),
  nom varchar not null,
  source varchar,
  type_visuel varchar,
  format varchar,
  client_id uuid references clients(id) on delete set null,
  orshot_template_id varchar,
  fichier_url text,
  miniature_url text,
  est_favori boolean default false,
  style text,
  tags text[],
  notes text,
  created_at timestamp default now()
);

-- =====================
-- TABLE : generations
-- =====================
create table if not exists generations (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  type_visuel varchar,
  description_libre text,
  titre_principal varchar,
  sous_titre varchar,
  badge_offre varchar,
  format varchar,
  date_validite varchar,
  contact_info text,
  couleur_fond varchar,
  note_style text,
  template_id varchar,
  template_source varchar,
  approche varchar,
  image_reference_url text,
  visuel_import_url text,
  image_url text,
  mode_selection varchar,
  statut_generation varchar default 'en_attente',
  style_extrait text,
  templates_proposes jsonb,
  created_at timestamp default now()
);

-- =====================
-- ROW LEVEL SECURITY
-- =====================
alter table clients enable row level security;
alter table templates enable row level security;
alter table generations enable row level security;

-- Policies (service_role a tous les droits par défaut)
-- Anon peut lire les clients et templates (pour l'app frontend)
create policy "Lecture publique clients" on clients for select using (true);
create policy "Lecture publique templates" on templates for select using (true);
create policy "Lecture publique generations" on generations for select using (true);

-- =====================
-- DONNÉES DE TEST
-- =====================
insert into clients (id, nom_client, secteur, couleur_principale, couleur_secondaire, logo_url, police, contact_default, template_flyer_id, statut)
values (
  'a0000001-0000-0000-0000-000000000001',
  'Client Test Ngondet',
  'Boutique',
  '#1A1A2E',
  '#534AB7',
  'https://via.placeholder.com/200x80',
  'Inter',
  '+241 06 00 00 00',
  '12022',
  'actif'
)
on conflict (id) do nothing;

insert into templates (id, nom, source, type_visuel, format, orshot_template_id, est_favori)
values (
  'b0000001-0000-0000-0000-000000000001',
  'Flyer Promo Standard',
  'orshot',
  'flyer',
  'portrait',
  '12022',
  true
)
on conflict (id) do nothing;
