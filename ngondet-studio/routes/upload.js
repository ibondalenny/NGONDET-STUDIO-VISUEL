const express = require('express')
const router = express.Router()
const multer = require('multer')
const { supabase } = require('../lib/supabase')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// POST /api/upload
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' })

  const { client_id, prefix = 'uploads' } = req.body
  const timestamp = Date.now()
  const ext = req.file.originalname.split('.').pop().toLowerCase()
  const folder = client_id ? `${prefix}/${client_id}` : prefix
  const filename = `${folder}/${timestamp}.${ext}`

  const { error } = await supabase.storage
    .from(process.env.SUPABASE_BUCKET)
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    })

  if (error) return res.status(500).json({ error: error.message })

  const { data: { publicUrl } } = supabase.storage
    .from(process.env.SUPABASE_BUCKET)
    .getPublicUrl(filename)

  res.json({ success: true, url: publicUrl, filename })
})

module.exports = router
