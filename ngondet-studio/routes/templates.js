const express = require('express')
const router = express.Router()
const { supabase } = require('../lib/supabase')

// GET /api/templates
router.get('/', async (req, res) => {
  const { type_visuel, source, client_id, favori } = req.query

  let query = supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (type_visuel) query = query.eq('type_visuel', type_visuel)
  if (source) query = query.eq('source', source)
  if (client_id) query = query.eq('client_id', client_id)
  if (favori === 'true') query = query.eq('est_favori', true)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/templates/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Template non trouvé' })
  res.json(data)
})

// POST /api/templates
router.post('/', async (req, res) => {
  const { nom, source, type_visuel, format, client_id,
          orshot_template_id, fichier_url, miniature_url, style, tags, notes } = req.body

  if (!nom) return res.status(400).json({ error: 'nom requis' })

  const { data, error } = await supabase
    .from('templates')
    .insert([{ nom, source, type_visuel, format, client_id,
               orshot_template_id, fichier_url, miniature_url, style, tags, notes }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /api/templates/:id/favori
router.put('/:id/favori', async (req, res) => {
  const { est_favori } = req.body

  const { data, error } = await supabase
    .from('templates')
    .update({ est_favori })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

module.exports = router
