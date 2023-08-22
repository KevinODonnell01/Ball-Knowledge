const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

// Initialize Express
const app = express();
const PORT = 3001;

// Enable CORS
app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Firebase setup
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Axios instance to simplify Football API requests
const footballAPI = axios.create({
  baseURL: 'https://api-football-v1.p.rapidapi.com/v3/',
  headers: {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
  }
});

const getPreviousClubs = async (playerId) => {
  try {
    const currentYear = new Date().getFullYear();
    const tenYearsAgo = currentYear - 20;

    const options = {
      method: 'GET',
      url: 'https://api-football-v1.p.rapidapi.com/v3/transfers',
      params: { player: playerId.toString() },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
      }
    };

    const transfersResponse = await axios.request(options);

    // Check the entire API response structure
    console.log("API Response:", transfersResponse.data);

    // Extract the transfers array
    const transfers = transfersResponse.data.response[0].transfers || [];

    // Extract clubs from the past ten years
    const clubs = transfers
      .filter(t => {
        const transferYear = new Date(t.date).getFullYear();
        return transferYear >= tenYearsAgo && transferYear <= currentYear;
      })
      .map(t => t.teams.out.name);

    // Return unique clubs
    return [...new Set(clubs)];

  } catch (error) {
    // Log any error that occurs
    console.error("Error fetching previous clubs for player:", playerId, error);
    return []; // Return an empty array in case of an error
  }
}
// A route to get player statistics by player ID
// A route to get player statistics by player ID
app.get('/start', async (req, res) => {
  try {
    // Step 1: Fetch all available leagues.
    const leaguesResponse = await footballAPI.get('leagues');
    const allLeagues = leaguesResponse.data.response;
    if (!allLeagues || allLeagues.length === 0) {
      return res.status(404).json({ error: "No leagues found" });
    }

    // Step 2: Randomly select one league from the list.
    //const randomLeague = allLeagues[Math.floor(Math.random() * allLeagues.length)];

    // Step 3: Fetch all the teams in that league.
    const teamsResponse = await footballAPI.get('teams', {
      params: {
        league: '39',
        season: '2023'
      }
    });

    const allTeams = teamsResponse.data.response;
    if (!allTeams || allTeams.length === 0) {
      return res.status(404).json({ error: "No teams found for selected league" });
    }

    // Step 4: Randomly select one team from the list.
    const randomTeam = allTeams[Math.floor(Math.random() * allTeams.length)];

    // Step 5: Fetch the list of players from the selected team.
    const playersResponse = await footballAPI.get('players', {
      params: {
        team: randomTeam.team.id.toString(),
        season: '2023'
      }
    });

    const players = playersResponse.data.response;
    if (!players || players.length === 0) {
      return res.status(404).json({ error: "No players found for selected team" });
    }

    const randomPlayer = players[Math.floor(Math.random() * players.length)];

    // Step 6: Fetch detailed statistics for the selected player.
    let playerDetails = null;
    while (!playerDetails) {
      const randomPlayer = players[Math.floor(Math.random() * players.length)];

      // Step 6: Fetch detailed statistics for the selected player.
      const playerStatsResponse = await footballAPI.get('players', {
        params: {
          id: randomPlayer.player.id.toString(),
          season: '2023'
        }
      });

      const playerStats = playerStatsResponse.data.response[0];
      const previousClubs = await getPreviousClubs(randomPlayer.player.id);

      // Validate if the player has all the required details
      if (
        playerStats.player.name &&
        playerStats.player.age &&
        playerStats.player.nationality &&
        randomTeam.team.name &&
        playerStats.player.height &&
        playerStats.player.weight &&
        playerStats.statistics[0].games.position
      ) {
        playerDetails = {
          name: playerStats.player.name,
          age: playerStats.player.age,
          nationality: playerStats.player.nationality,
          team: randomTeam.team.name,
          height: playerStats.player.height,
          weight: playerStats.player.weight,
          position: playerStats.statistics[0].games.position,
          previousClubs: previousClubs.join(', ')  // Convert the array to a string
        };
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(playerDetails);

  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({ error: "An error occurred while fetching data." });
  }
});

app.use(express.json());  // This is to parse JSON request bodies.

app.post('/guess', (req, res) => {
  const { guess, playerName } = req.body;

  if (!guess || !playerName) {
    return res.status(400).json({ error: "Guess or playerName not provided" });
  }

  if (typeof guess !== "string" || typeof playerName !== "string") {
    return res.status(400).json({ error: "Invalid input" });
  }

  const formattedGuess = guess.toLowerCase().trim();
  const formattedPlayerName = playerName.toLowerCase().split(' ').pop().trim();

  if (formattedGuess === formattedPlayerName) {
    res.json({ correct: true });
  } else {
    res.json({ correct: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

// Handle 404 - Always keep this as the last route
app.use(function (req, res, next) {
  res.status(404).json({ error: 'Not found' });
});

// Handle 500
app.use(function (error, req, res, next) {
  console.error(error.stack);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

