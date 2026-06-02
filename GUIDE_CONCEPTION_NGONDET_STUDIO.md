# Guide de Conception — Ngondet Studio Service Visuels IA
## Un retour d'expérience complet pour reproduire ce type de projet

---

## INTRODUCTION

Ce document est un guide interne qui retrace pas à pas la conception du pipeline de génération de visuels IA de Ngondet Studio. Il est écrit comme un cours pratique : on y trouve les étapes, les erreurs rencontrées, les solutions trouvées, et les conseils pour reproduire ou améliorer ce type d'architecture.

Ce projet combine :
- Un VPS Ubuntu avec Docker
- N8n en mode file d'attente (queue mode)
- Claude Haiku (Anthropic) pour l'intelligence artificielle
- Orshot pour la génération de visuels
- Supabase pour le stockage de fichiers
- PostgreSQL pour la base de données
- Une application web Node.js/Express à venir

---

## PARTIE 1 — L'INFRASTRUCTURE VPS

### 1.1 Le Serveur

Le projet tourne sur un VPS Hostinger KVM2 :
- **OS** : Ubuntu 24.04.4 LTS
- **RAM** : 8 Go
- **CPU** : 2 vCPU
- **Stockage** : 100 Go NVMe
- **IP** : 76.13.37.219

**Comment trouver l'IP de son VPS :**
La méthode la plus simple est le panel Hostinger (hpanel.hostinger.com → VPS → ton serveur). L'IP est affichée directement. Hostinger envoie aussi un email de confirmation avec les credentials au moment de la création.

**Connexion SSH :**
```bash
ssh root@76.13.37.219
```
À la première connexion, le terminal affiche un avertissement sur l'authenticité du serveur. C'est normal — taper `yes` pour continuer. Le curseur ne bouge pas lors de la saisie du mot de passe : c'est normal aussi.

**Conseil :** Sur Windows, utiliser PowerShell. Ne pas fermer la fenêtre SSH sans avoir terminé une séquence d'actions — reconnexion nécessaire à chaque fois.

---

### 1.2 Architecture Docker

N8n est installé en mode Docker avec docker compose. La structure est dans `/docker/n8n/`. Le fichier principal est `docker-compose.yml`.

**Containers actifs :**
- `n8n-n8n-1` — Instance principale n8n
- `n8n-n8n-worker-1/2/3` — 3 workers pour le queue mode
- `n8n-postgres` — Base de données PostgreSQL
- `redis` — File d'attente Redis
- `n8n-traefik-1` — Reverse proxy avec SSL automatique

**Commandes essentielles Docker :**
```bash
# Voir les containers actifs
docker ps

# Redémarrer n8n (ne recharge PAS les changements docker-compose)
docker compose restart n8n

# Recréer le container avec les nouveaux paramètres (recharge docker-compose)
docker compose up -d n8n

# Arrêter et redémarrer tout
docker compose down && docker compose up -d

# Voir les variables d'environnement d'un container
docker exec n8n-n8n-1 env | grep NOM_VARIABLE
```

**ERREUR FRÉQUENTE :** Confondre `docker compose restart` et `docker compose up -d`.
- `restart` : redémarre le container sans relire le docker-compose.yml
- `up -d` : recrée le container en appliquant les changements du docker-compose.yml

Si tu modifies une variable dans `docker-compose.yml`, tu dois faire `up -d`, pas `restart`.

---

### 1.3 Traefik et l'accès externe

Traefik est le reverse proxy qui gère le SSL et route les requêtes externes vers n8n. N8n n'est pas exposé directement — il écoute sur `127.0.0.1:5678` (localhost uniquement).

**N8n est accessible à :** `https://n8n.srv1710890.hstgr.cloud`

Pour trouver le domaine d'une instance n8n, inspecter les labels Traefik du container :
```bash
docker inspect n8n-n8n-1 --format '{{json .Config.Labels}}' | python3 -m json.tool
```
Chercher la ligne `traefik.http.routers.n8n.rule` — elle contient le domaine.

---

### 1.4 Variables d'environnement

Les variables sont définies à deux endroits :
1. **`/docker/n8n/.env`** — Variables de configuration (domaine, timezone, clés API)
2. **`/docker/n8n/docker-compose.yml`** — Référencement des variables avec la syntaxe `${NOM_VARIABLE}`

Pour qu'une variable du `.env` soit disponible dans le container n8n, elle doit :
1. Être dans le `.env`
2. Être déclarée dans la section `environment` du service dans `docker-compose.yml`

**Ajouter une variable d'environnement (méthode recommandée) :**
```bash
# Ajouter dans .env
echo "MA_VARIABLE=ma_valeur" >> /docker/n8n/.env

# Ajouter dans docker-compose.yml (section environment du service n8n)
sed -i '/- NODE_ENV=production/a\      - MA_VARIABLE=${MA_VARIABLE}' /docker/n8n/docker-compose.yml

# Vérifier l'indentation (CRITIQUE)
grep -n "MA_VARIABLE" /docker/n8n/docker-compose.yml

# Appliquer
docker compose up -d n8n
```

**ERREUR FRÉQUENTE — Indentation YAML :**
Le YAML est sensible à l'indentation. Si une ligne a 8 espaces au lieu de 6, elle sera mal interprétée. Toujours vérifier après une modification avec `sed -n '58,62p' /docker/n8n/docker-compose.yml`.

**Exemple d'erreur d'indentation vécue :**
```
# Mauvais (8 espaces)
        - N8N_BLOCK_ENV_ACCESS_IN_NODE=false

# Correct (6 espaces)
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

La correction :
```bash
sed -i 's/        - N8N_BLOCK_ENV_ACCESS_IN_NODE/      - N8N_BLOCK_ENV_ACCESS_IN_NODE/' /docker/n8n/docker-compose.yml
```

---

## PARTIE 2 — N8N ET LES WORKFLOWS

### 2.1 Accéder à l'API n8n

N8n expose une API REST pour créer et modifier les workflows sans passer par l'interface graphique.

**Générer une clé API :**
1. Se connecter sur l'interface n8n
2. Avatar (en bas à gauche) → Settings → API → Create API Key

**Utiliser l'API (depuis PowerShell Windows) :**
```powershell
curl.exe -s -k -X GET "https://n8n.srv1710890.hstgr.cloud/api/v1/workflows" `
  -H "X-N8N-API-KEY: ta_cle_api"
```

**Pourquoi `-k` ?** Le certificat SSL de l'instance utilise Let's Encrypt. Sur certaines configurations, la chaîne de certificats n'est pas reconnue par le client curl. Le flag `-k` ignore la vérification SSL (acceptable pour un usage interne).

**Pourquoi `curl.exe` et pas `curl` ?** Sur PowerShell Windows, `curl` est un alias de `Invoke-WebRequest`. `curl.exe` appelle le vrai binaire curl. Ne pas confondre.

---

### 2.2 Créer un Workflow via l'API

```powershell
curl.exe -s -k -X POST "https://n8n.srv1710890.hstgr.cloud/api/v1/workflows" `
  -H "X-N8N-API-KEY: ta_cle_api" `
  -H "Content-Type: application/json" `
  -d "@chemin/vers/workflow.json"
```

**Champs read-only à exclure du JSON lors de la création :**
L'API n8n refuse les champs `active`, `meta`, et `tags` à la création (ils sont gérés par le système). Les supprimer du JSON avant d'envoyer.

**Mettre à jour un workflow existant :**
```powershell
curl.exe -s -k -X PUT "https://n8n.srv1710890.hstgr.cloud/api/v1/workflows/WORKFLOW_ID" `
  -H "X-N8N-API-KEY: ta_cle_api" `
  -H "Content-Type: application/json" `
  -d "@chemin/vers/workflow.json"
```

**CONSEIL :** Toujours travailler avec un fichier JSON local pour les workflows complexes. Modifier le fichier, puis pousser via l'API. Cela permet le versioning Git.

---

### 2.3 Architecture du Workflow v2

Le workflow "Ngondet Studio — Pipeline Visuels IA v2" suit cette séquence :

```
Webhook Trigger
      ↓
Set — Contexte Claude
(structure toutes les variables avec fallbacks)
      ↓
Claude Haiku — Extraction Variables
(analyse la description, choisit le template, optimise les textes)
      ↓
Function — Parse JSON Claude
(extrait le JSON de la réponse Claude, gère les erreurs)
      ↓
Orshot — Génération Visuel (HTTP Request)
(appelle l'API Orshot Studio pour générer l'image)
      ↓
Output — Retour Application
(formate la réponse finale)
```

**Pourquoi un node "Set — Contexte Claude" ?**
Il centralise toutes les variables avec des valeurs par défaut (fallbacks). Sans ce node, si un champ est null ou absent, l'expression plante. Ce node garantit que Claude reçoit toujours des données propres.

**Pourquoi un node "Function — Parse JSON Claude" ?**
Claude retourne parfois du JSON avec des backticks markdown (```json ... ```). Ce node nettoie la réponse et parse le JSON de manière sécurisée avec un try/catch.

---

### 2.4 Les Nodes Communautaires — Attention

**Erreur vécue avec n8n-nodes-orshot :**
Le package npm `n8n-nodes-orshot` est marqué comme déprécié. Son fichier de node `dist/nodes/Orshot/Orshot.node.js` n'existe pas. L'installation réussit mais le node ne fonctionne pas.

**Solution :** Remplacer tout node communautaire cassé par un node HTTP Request natif. C'est plus fiable et maintenable.

**Règle générale :** Avant d'utiliser un node communautaire, vérifier :
1. La date de dernière publication sur npm
2. Les issues ouvertes sur GitHub
3. Si le package est marqué "deprecated"

---

### 2.5 L'accès aux Variables d'Environnement dans n8n

Par défaut, n8n bloque l'accès à `$env.NOM_VARIABLE` dans les expressions des nodes. C'est une mesure de sécurité.

**Pour débloquer :**
Ajouter `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` dans les variables d'environnement du container.

**PIÈGE :** Cette variable doit être dans le `.env` ET référencée dans le `docker-compose.yml`. Si elle est mal indentée dans le YAML, elle ne sera pas reconnue ou sera concaténée à une autre variable.

**Alternative recommandée :** Utiliser les credentials n8n ou hardcoder temporairement les clés pour les tests, puis sécuriser via les credentials n8n en production.

---

### 2.6 Créer des Credentials n8n via l'API

L'API n8n pour créer des credentials (`POST /api/v1/credentials`) est très stricte sur la validation des schémas. Certains types de credentials ne peuvent pas être créés via l'API publique.

**Ce qui fonctionne via l'API :**
- Créer des workflows complets

**Ce qui nécessite l'interface graphique :**
- Créer des credentials (notamment Anthropic, HTTP Header Auth)

**Comment trouver le champ Credentials dans l'interface n8n en français :**
Le champ est appelé "Diplôme" dans la traduction française (traduction approximative de "Credential"). Pour le configurer : ouvrir le node → onglet Paramètres → champ Diplôme → "Création d'un certificat".

---

## PARTIE 3 — LES APIs EXTERNES

### 3.1 Anthropic (Claude Haiku)

**Pourquoi Claude Haiku et pas GPT-4o ?**
Claude Haiku 4.5 est plus rapide et moins cher que GPT-4o pour une tâche d'extraction JSON structurée. Il est parfaitement adapté à ce cas d'usage où on ne génère pas de contenu créatif complexe — on extrait et structure des données.

**Format de réponse :**
Claude retourne le JSON dans `content[0].text`. Dans n8n, accéder avec :
```javascript
const raw = $input.item.json.content?.[0]?.text || $input.item.json.text || '';
```

**Forcer un JSON valide :**
Utiliser `response_format: { type: 'json_object' }` dans les paramètres du node Anthropic pour forcer une réponse JSON pure. Même avec ce paramètre, nettoyer les backticks markdown par sécurité.

---

### 3.2 Orshot

**Types de templates Orshot :**
Orshot distingue deux types :
- **Utility Templates** : templates prédéfinis de la bibliothèque Orshot
- **Studio Templates** : templates créés dans l'éditeur Orshot Studio (onglet Studio)

**Endpoints différents selon le type :**
```
# Utility Templates
POST https://api.orshot.com/v1/generate/images

# Studio Templates (notre cas)
POST https://api.orshot.com/v1/studio/render
```

**ERREUR VÉCUE :** On a d'abord utilisé `/v1/generate/images` qui retournait "TemplateId non trouvé". La correction a été d'utiliser `/v1/studio/render`.

**Format du body pour Studio Templates :**
```json
{
  "templateId": "12022",
  "modifications": {
    "nom_du_layer": "valeur"
  },
  "response": {
    "type": "url",
    "format": "png",
    "scale": 1
  }
}
```

**IMPORTANT — Noms des layers :**
Les clés dans `modifications` doivent correspondre exactement aux noms des layers dans l'éditeur Orshot Studio. Si un layer s'appelle "titre" dans Orshot mais qu'on envoie "titre_principal", la modification ne s'applique pas.

**Plan gratuit Orshot :**
Le plan gratuit ne donne pas accès à l'API REST. L'erreur retournée est "Besoin d'une ref de template" ou similaire — ce qui est trompeur. La vraie cause est l'absence de droits API. Un plan payant est nécessaire pour l'intégration.

---

### 3.3 Supabase Storage

**Créer un bucket via l'API Supabase :**
```powershell
curl.exe -s -X POST "https://TON_PROJET.supabase.co/storage/v1/bucket" `
  -H "Authorization: Bearer SERVICE_ROLE_KEY" `
  -H "Content-Type: application/json" `
  -d "@bucket_config.json"
```

**Contenu du fichier bucket_config.json :**
```json
{
  "id": "ngondet-assets",
  "name": "ngondet-assets",
  "public": true,
  "file_size_limit": 52428800,
  "allowed_mime_types": ["image/png", "image/jpeg", "image/webp", "application/pdf"]
}
```

**Clés Supabase :**
- `anon/publishable` (sb_publishable_...) : clé publique, utilisée côté client/navigateur
- `service_role` (eyJ...) : clé privée avec tous les droits, uniquement côté serveur

**NE JAMAIS** exposer la `service_role` dans le code frontend.

**Nouvelle nomenclature Supabase :**
Supabase a adopté un nouveau format de clés :
- Ancienne anon : `eyJhbGci...` (JWT)
- Nouvelle anon : `sb_publishable_...`
Les deux fonctionnent selon la version du projet Supabase.

---

## PARTIE 4 — GITHUB ET VERSIONING

### 4.1 Installer GitHub CLI sur Windows

```powershell
winget install --id GitHub.cli --silent --accept-package-agreements --accept-source-agreements
```

Après installation, recharger le PATH sans redémarrer :
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### 4.2 Authentification

```powershell
gh auth login --web --git-protocol https
```
Cette commande affiche un code à entrer sur `https://github.com/login/device`. Elle ouvre le navigateur automatiquement.

**ERREUR VÉCUE — Credentials en cache :**
Git peut utiliser des credentials Windows en cache pour un autre compte GitHub. Même si gh CLI est authentifié avec le bon compte, git peut pousser avec l'ancien compte.

**Solution :**
```powershell
gh auth setup-git
```
Cette commande configure git pour utiliser gh CLI comme credential helper. Après ça, git utilisera le bon compte.

### 4.3 Gitignore pour ce type de projet

```gitignore
# Credentials et clés API
cred_*.json
*.env
.env.local

# Dossiers de mémoire Claude
.claude/

# Node modules
node_modules/
```

**RÈGLE IMPORTANTE :** Ne jamais pousser de fichiers contenant des clés API sur un repo public. Vérifier le `.gitignore` avant chaque commit.

---

## PARTIE 5 — ERREURS RÉCURRENTES ET SOLUTIONS

### Erreur 1 — "request/body/active is read-only"
**Contexte :** Création de workflow via l'API n8n
**Cause :** Le champ `active` ne peut pas être envoyé dans le body
**Solution :** Supprimer `active`, `meta`, et `tags` du JSON avant d'envoyer

### Erreur 2 — "N8N_BLOCK_ENV_ACCESS_IN_NODE"
**Contexte :** Accès à `$env.MA_VARIABLE` dans un node
**Cause :** N8n bloque l'accès aux variables d'env par défaut
**Solution :** Ajouter `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` dans `.env` et `docker-compose.yml`, puis faire `docker compose up -d n8n`

### Erreur 3 — Variable Docker visible mais vide
**Contexte :** Variable ajoutée dans `.env` mais non reconnue
**Cause :** Variable présente dans `.env` mais pas référencée dans `docker-compose.yml`
**Solution :** Ajouter `- MA_VARIABLE=${MA_VARIABLE}` dans la section `environment` du service

### Erreur 4 — Deux lignes identiques dans docker-compose
**Contexte :** Exécution de plusieurs commandes `sed` successives
**Cause :** Chaque `sed` a ajouté la ligne
**Solution :**
```bash
# Trouver le numéro de ligne dupliquée
grep -n "NOM_VARIABLE" /docker/n8n/docker-compose.yml
# Supprimer la ligne en double (ex: ligne 56)
sed -i '56d' /docker/n8n/docker-compose.yml
```

### Erreur 5 — "Cannot find module Orshot.node.js"
**Contexte :** Installation du node communautaire n8n-nodes-orshot
**Cause :** Package déprécié, structure interne cassée
**Solution :** Remplacer par un node HTTP Request natif vers l'API Orshot

### Erreur 6 — "TemplateId non trouvé" sur Orshot
**Contexte :** Appel API Orshot avec `/v1/generate/images`
**Cause :** Mauvais endpoint — les templates Studio utilisent `/v1/studio/render`
**Solution :** Changer l'URL vers `https://api.orshot.com/v1/studio/render`

### Erreur 7 — Push GitHub refusé (403)
**Contexte :** `git push` vers un repo GitHub
**Cause :** Credentials Windows en cache pour un autre compte
**Solution :** `gh auth setup-git` puis relancer le push

### Erreur 8 — "Body is not valid JSON"
**Contexte :** Envoi d'un body JSON via `curl.exe -d '...'` dans PowerShell
**Cause :** Les guillemets simples ne fonctionnent pas avec curl.exe sur Windows PowerShell pour du JSON complexe
**Solution :** Écrire le JSON dans un fichier et utiliser `-d "@chemin/vers/fichier.json"`

---

## PARTIE 6 — BONNES PRATIQUES

### Sur le VPS
- Toujours faire un backup avant de modifier `docker-compose.yml`
- Utiliser `grep -n` pour vérifier les changements avant de redémarrer
- Préférer `echo "VAR=val" >> /fichier` à nano pour les ajouts simples
- Tester chaque variable avec `docker exec container env | grep NOM_VAR` après redémarrage

### Sur n8n
- Travailler en mode "inactif" pendant le développement, activer seulement pour la production
- Utiliser des données mockées (pinData) pour tester sans appeler les vraies APIs
- Nommer les nodes clairement : "Construire prompt GPT", "Parser réponse Claude", etc.
- Ajouter des notes sur chaque node pour expliquer son rôle

### Sur les APIs
- Ne jamais hardcoder les clés API en production — utiliser les credentials n8n
- Tester d'abord l'authentification avec un appel simple avant d'envoyer le payload complet
- Vérifier le plan de chaque service avant de passer du temps à déboguer (ex: Orshot plan gratuit = pas d'API)

### Sur PowerShell Windows
- Utiliser `curl.exe` (pas `curl`) pour les appels HTTP
- Passer les gros JSON via des fichiers, pas en inline
- Recharger le PATH après installation d'un nouveau programme sans redémarrer : `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`

---

## CONCLUSION

Ce projet a permis de valider le pipeline complet de génération de visuels IA :
1. Une description en langage naturel entre dans le système
2. Claude Haiku analyse et structure les données
3. Orshot génère le visuel depuis un template Studio
4. L'image est retournée via une URL publique

Les prochaines étapes sont la construction de l'application web (backend Express + frontend HTML/CSS/JS) qui consommera ce pipeline via le webhook n8n.

---

*Document créé le 02/06/2026 — Ngondet Studio Phase 1*
