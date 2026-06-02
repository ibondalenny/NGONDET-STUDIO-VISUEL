const express = require('express')
const router = express.Router()
const axios = require('axios')
const { supabase } = require('../lib/supabase')

// POST /api/generer
// Lance le pipeline n8n et retourne les templates proposés + resume_url
router.post('/', async (req, res) => {
  const {
    client_id, approche = 'template', mode_selection = 'ia',
    description_libre, type_visuel, titre_principal, sous_titre,
    badge_offre, format, date_validite, contact_info, couleur_fond,
    note_style, image_reference_url, visuel_import_url, templates_disponibles
  } = req.body

  if (!client_id) return res.status(400).json({ error: 'client_id requis' })
  if (!description_libre) return res.status(400).json({ error: 'description_libre requis' })
  if (!type_visuel) return res.status(400).json({ error: 'type_visuel requis' })

  // Créer la génération en base avec statut en_attente
  const { data: generation, error: genError } = await supabase
    .from('generations')
    .insert([{
      client_id, type_visuel, description_libre, titre_principal,
      sous_titre, badge_offre, format, date_validite, contact_info,
      couleur_fond, note_style, approche, image_reference_url,
      visuel_import_url, mode_selection, statut_generation: 'en_attente'
    }])
    .select()
    .single()

  if (genError) return res.status(500).json({ error: genError.message })

  // Appeler le webhook n8n
  let n8nResponse
  try {
    const { data } = await axios.post(process.env.N8N_WEBHOOK_URL, {
      client_id, approche, mode_selection, description_libre,
      type_visuel, titre_principal, sous_titre, badge_offre,
      format, date_validite, contact_info, couleur_fond, note_style,
      image_reference_url, visuel_import_url, templates_disponibles,
      generation_id: generation.id
    }, { timeout: 30000 })
    n8nResponse = data
  } catch (err) {
    await supabase.from('generations').update({ statut_generation: 'erreur' }).eq('id', generation.id)
    return res.status(500).json({ error: 'Erreur pipeline n8n', detail: err.message })
  }

  // Si n8n retourne des templates_proposes (mode Wait)
  if (n8nResponse.templates_proposes) {
    await supabase.from('generations')
      .update({
        templates_proposes: n8nResponse.templates_proposes,
        statut_generation: 'attente_selection'
      })
      .eq('id', generation.id)

    return res.json({
      success: true,
      generation_id: generation.id,
      templates_proposes: n8nResponse.templates_proposes,
      resume_url: n8nResponse.resume_url,
      statut: 'attente_selection'
    })
  }

  // Si n8n retourne directement l'image (mode sans Wait)
  if (n8nResponse.image_url) {
    await supabase.from('generations')
      .update({
        image_url: n8nResponse.image_url,
        template_id: n8nResponse.template_id,
        statut_generation: 'success'
      })
      .eq('id', generation.id)

    return res.json({
      success: true,
      generation_id: generation.id,
      image_url: n8nResponse.image_url,
      template_id: n8nResponse.template_id,
      statut: 'success'
    })
  }

  res.json({ success: true, generation_id: generation.id, statut: 'en_cours' })
})

// POST /api/generer/confirmer
// Envoie le template sélectionné au resume_url de n8n
router.post('/confirmer', async (req, res) => {
  const { generation_id, template_id, resume_url } = req.body

  if (!generation_id || !template_id || !resume_url) {
    return res.status(400).json({ error: 'generation_id, template_id et resume_url requis' })
  }

  // Mettre à jour le statut
  await supabase.from('generations')
    .update({ template_id, statut_generation: 'en_generation' })
    .eq('id', generation_id)

  // Appeler le resume_url de n8n
  try {
    await axios.post(resume_url, { template_id }, { timeout: 120000 })
  } catch (err) {
    await supabase.from('generations').update({ statut_generation: 'erreur' }).eq('id', generation_id)
    return res.status(500).json({ error: 'Erreur reprise n8n', detail: err.message })
  }

  // Récupérer la génération mise à jour
  const { data: updated } = await supabase
    .from('generations')
    .select('*')
    .eq('id', generation_id)
    .single()

  res.json({ success: true, generation: updated })
})

// POST /api/generer/callback
// Reçoit le résultat final de n8n après génération
router.post('/callback', async (req, res) => {
  const { generation_id, image_url, template_id, style_extrait } = req.body

  if (!generation_id || !image_url) {
    return res.status(400).json({ error: 'generation_id et image_url requis' })
  }

  const { data, error } = await supabase
    .from('generations')
    .update({ image_url, template_id, style_extrait, statut_generation: 'success' })
    .eq('id', generation_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, generation: data })
})

module.exports = router
