require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// MongoDB connectie
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Importeer en gebruik de AI-routes
const aiRoutes = require('./routes/aiRoutes');
app.use('/api/ai', aiRoutes);

// Testroute
app.get('/', (req, res) => {
  res.send('Backend server is running');
});

// Luisteren naar de opgegeven poort
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
