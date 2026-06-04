require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.APP_PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/clients', require('./routes/clients'))
app.use('/api/templates', require('./routes/templates'))
app.use('/api/generer', require('./routes/generate'))
app.use('/api/generations', require('./routes/generate'))
app.use('/api/upload', require('./routes/upload'))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Ngondet Studio', version: '1.0.0' })
})

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} non trouvée` })
})

// Erreur globale
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Erreur serveur interne' })
})

app.listen(PORT, () => {
  console.log(`Ngondet Studio API démarrée sur http://localhost:${PORT}`)
})

module.exports = app
