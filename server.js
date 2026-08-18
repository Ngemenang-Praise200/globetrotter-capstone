const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'globaltrotter-secret';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DESTINATIONS_FILE = path.join(DATA_DIR, 'destinations.json');
const ITINERARIES_FILE = path.join(DATA_DIR, 'itineraries.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
  } catch (error) {
    console.error(`Failed to parse JSON: ${filePath}`, error);
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = readJson(USERS_FILE);
    const user = users.find((u) => u.id === payload.id && u.email === payload.email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'GlobeTrotter backend is running.' });
});

// Real, freely-licensed photos (Wikimedia Commons) used as a fallback so every
// place a user opens shows a genuine glimpse of Bamenda/Cameroon, even when we
// don't have a photo of that exact spot yet. Keyed by destination.category.
const CATEGORY_IMAGES = {
  culture: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Commercial%20Avenue%2C%20Bamenda%2C%20Cameroon.jpg?width=480',
    imageCredit: 'Ambo64, Wikimedia Commons (CC BY-SA 4.0)',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Commercial_Avenue,_Bamenda,_Cameroon.jpg',
    imageLabel: 'A general street scene in Bamenda — not a photo of this exact place yet'
  },
  nature: {
    image: '/awing-waterfall.jpg',
    imageCredit: '@bamendauptodate',
    imageLabel: 'A Bamenda-area waterfall shown as an example — not a photo of this exact spot'
  },
  adventure: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bamenda%20from%20mountain%20road.jpg?width=480',
    imageCredit: 'Wikimedia Commons contributor (CC BY-SA 3.0)',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Bamenda_from_mountain_road.jpg',
    imageLabel: 'A view over Bamenda from the surrounding hills — not a photo of this exact spot yet'
  },
  relaxation: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bamenda.JPG?width=480',
    imageCredit: 'Wikimedia Commons contributor (CC BY-SA 3.0)',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Bamenda.JPG',
    imageLabel: 'A general view of Bamenda — not a photo of this exact place yet'
  },
  food: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cameroonian%20Porridge%20Plantain.jpg?width=480',
    imageCredit: 'Wikimedia Commons contributor (CC BY-SA)',
    imageSource: 'https://commons.wikimedia.org/wiki/Category:Meals_in_Cameroon',
    imageLabel: 'A Cameroonian dish shown as an example — not a photo of this specific menu'
  },
  administrative: {
    image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bamenda.JPG?width=480',
    imageCredit: 'Wikimedia Commons contributor (CC BY-SA 3.0)',
    imageSource: 'https://commons.wikimedia.org/wiki/File:Bamenda.JPG',
    imageLabel: 'A general view of Bamenda — a photo of this specific office is not available yet'
  }
};

// Attach a photo to a destination that doesn't already have one, so the map
// and place cards always show a real glimpse of the area.
function withCatalogueImage(destination) {
  if (destination.image) return destination;
  const fallback = CATEGORY_IMAGES[(destination.category || '').toLowerCase()];
  return fallback ? { ...destination, ...fallback } : destination;
}

app.post('/api/register', (req, res) => {
  const { name, email, password, interests = [] } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const users = readJson(USERS_FILE);
  if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'This email is already registered.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = {
    id: Date.now().toString(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    interests,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson(USERS_FILE, users);

  res.json({ token: generateToken(newUser), user: { id: newUser.id, name: newUser.name, email: newUser.email, interests: newUser.interests } });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = readJson(USERS_FILE);
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ token: generateToken(user), user: { id: user.id, name: user.name, email: user.email, interests: user.interests } });
});

app.get('/api/me', authenticate, (req, res) => {
  const { id, name, email, interests, createdAt } = req.user;
  res.json({ id, name, email, interests, createdAt });
});

app.get('/api/destinations', (req, res) => {
  const search = (req.query.search || '').toLowerCase();
  const category = (req.query.category || '').toLowerCase();
  const interest = (req.query.interest || '').toLowerCase();

  const destinations = readJson(DESTINATIONS_FILE).filter((item) => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.tags.join(' ').toLowerCase().includes(search) || item.description.toLowerCase().includes(search);
    const matchesCategory = !category || item.category.toLowerCase() === category;
    const matchesInterest = !interest || item.tags.map((tag) => tag.toLowerCase()).includes(interest) || item.category.toLowerCase() === interest;
    return matchesSearch && matchesCategory && matchesInterest;
  });

  res.json(destinations.map(withCatalogueImage));
});

app.get('/api/destinations/:id', (req, res) => {
  const destinations = readJson(DESTINATIONS_FILE);
  const destination = destinations.find((item) => item.id === req.params.id);
  if (!destination) {
    return res.status(404).json({ error: 'Destination not found.' });
  }
  res.json(withCatalogueImage(destination));
});

const interestMap = {
  adventure: ['hiking', 'nature', 'waterfall', 'forest', 'mountain', 'park', 'wildlife'],
  culture: ['museum', 'history', 'culture', 'market', 'heritage', 'church', 'monument'],
  relaxation: ['park', 'relaxation', 'lake', 'leisure', 'garden', 'spa'],
  food: ['food', 'restaurant', 'cafe', 'local cuisine', 'market', 'dining']
};

app.get('/api/recommendations', (req, res) => {
  const userInterest = (req.query.interest || '').toLowerCase();
  const destinations = readJson(DESTINATIONS_FILE);

  if (!userInterest) {
    return res.json(destinations.slice(0, 6).map(withCatalogueImage));
  }

  const tags = interestMap[userInterest] || [userInterest];
  const scored = destinations.map((destination) => {
    const score = destination.tags.reduce((count, tag) => {
      return count + (tags.includes(tag.toLowerCase()) ? 1 : 0);
    }, 0) + (destination.category.toLowerCase() === userInterest ? 1 : 0);
    return { destination, score };
  });

  const recommended = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.destination).slice(0, 6);
  res.json((recommended.length ? recommended : destinations.slice(0, 6)).map(withCatalogueImage));
});

app.get('/api/itineraries', authenticate, (req, res) => {
  const itineraries = readJson(ITINERARIES_FILE).filter((item) => item.userId === req.user.id);
  res.json(itineraries);
});

app.post('/api/itineraries', authenticate, (req, res) => {
  const { title, destinationIds = [], notes = '', startDate, endDate } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Itinerary title is required.' });
  }

  const itineraries = readJson(ITINERARIES_FILE);
  const newItem = {
    id: Date.now().toString(),
    userId: req.user.id,
    title,
    destinationIds,
    notes,
    startDate: startDate || null,
    endDate: endDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  itineraries.push(newItem);
  writeJson(ITINERARIES_FILE, itineraries);
  res.status(201).json(newItem);
});

app.get('/api/itineraries/:id', authenticate, (req, res) => {
  const itineraries = readJson(ITINERARIES_FILE);
  const itinerary = itineraries.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!itinerary) {
    return res.status(404).json({ error: 'Itinerary not found.' });
  }
  res.json(itinerary);
});

app.put('/api/itineraries/:id', authenticate, (req, res) => {
  const itineraries = readJson(ITINERARIES_FILE);
  const index = itineraries.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Itinerary not found.' });
  }

  const updatedItem = {
    ...itineraries[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  itineraries[index] = updatedItem;
  writeJson(ITINERARIES_FILE, itineraries);
  res.json(updatedItem);
});

app.delete('/api/itineraries/:id', authenticate, (req, res) => {
  const itineraries = readJson(ITINERARIES_FILE);
  const index = itineraries.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Itinerary not found.' });
  }

  itineraries.splice(index, 1);
  writeJson(ITINERARIES_FILE, itineraries);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`GlobeTrotter server is running on http://localhost:${PORT}`);
});