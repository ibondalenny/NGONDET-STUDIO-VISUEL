const express = require('express')
const router = express.Router()
const { supabase } = require('../lib/supabase')

// GET /api/clients
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Client non trouvé' })
  res.json(data)
})

// POST /api/clients
router.post('/', async (req, res) => {
  const { nom_client, secteur, couleur_principale, couleur_secondaire,
          logo_url, police, contact_default, template_flyer_id,
          template_story_id, template_post_id, template_banniere_id, notes } = req.body

  if (!nom_client) return res.status(400).json({ error: 'nom_client requis' })

  const { data, error } = await supabase
    .from('clients')
    .insert([{ nom_client, secteur, couleur_principale, couleur_secondaire,
               logo_url, police, contact_default, template_flyer_id,
               template_story_id, template_post_id, template_banniere_id, notes }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/clients/:id
router.put('/:id', async (req, res) => {
  const updates = req.body
  delete updates.id
  delete updates.created_at

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// GET /api/clients/:id/generations
router.get('/:id/generations', async (req, res) => {
  const { type_visuel, limit = 20, offset = 0 } = req.query

  let query = supabase
    .from('generations')
    .select('*')
    .eq('client_id', req.params.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type_visuel) query = query.eq('type_visuel', type_visuel)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
