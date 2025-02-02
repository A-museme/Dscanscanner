const axios = require("axios");
const express = require("express");
const app = express();
const port = 3000;
require('dotenv').config();

app.use(express.static("public"));
app.use(express.json());

const fetchCharacterIds = async (names) => {
    try {
        const response = await axios.post("https://esi.evetech.net/latest/universe/ids/", names, {
            headers: { "Content-Type": "application/json" },
        });
        return response.data.characters || [];
    } catch (error) {
        console.error("Error fetching character IDs:", error.message);
        return [];
    }
};

const fetchKillboardStats = async (characterId) => {
    try {
        const response = await axios.get(`https://zkillboard.com/api/stats/characterID/${characterId}/`, {
            headers: {
                'User-Agent': 'Local Scanner - Contact coolitzero on Discord',
                'Accept-Encoding': 'gzip',
                'If-None-Match': '0'  // Prevents 304 responses
            },
            timeout: 5000  // 5 second timeout
        });
        
        // Add a delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 second delay
        
        return response.data;
    } catch (error) {
        console.error(`Error fetching killboard stats for ${characterId}:`, error.message);
        return null;
    }
};

const fetchCorporationInfo = async (characterId) => {
    try {
        // First get character info which contains corporation_id
        const charResponse = await axios.get(`https://esi.evetech.net/latest/characters/${characterId}/`);
        const corpId = charResponse.data.corporation_id;
        
        // Then get corporation details
        const corpDetails = await axios.get(`https://esi.evetech.net/latest/corporations/${corpId}/`);
        return {
            id: corpId,
            name: corpDetails.data.name,
            ticker: corpDetails.data.ticker,
            logo: `https://images.evetech.net/corporations/${corpId}/logo`
        };
    } catch (error) {
        console.error(`Error fetching corporation info for ${characterId}:`, error.message);
        return null;
    }
};

const fetchAllianceInfo = async (characterId) => {
    try {
        // First get character info which contains alliance_id
        const charResponse = await axios.get(`https://esi.evetech.net/latest/characters/${characterId}/`);
        const allianceId = charResponse.data.alliance_id;
        
        if (!allianceId) {
            return null;
        }

        // Then get alliance details
        const allianceDetails = await axios.get(`https://esi.evetech.net/latest/alliances/${allianceId}/`);
        return {
            id: allianceId,
            name: allianceDetails.data.name,
            ticker: allianceDetails.data.ticker,
            logo: `https://images.evetech.net/alliances/${allianceId}/logo`
        };
    } catch (error) {
        console.error(`Error fetching alliance info for ${characterId}:`, error.message);
        return null;
    }
};

const fetchRecentKills = async (characterId) => {
    try {
        const response = await axios.get(`https://zkillboard.com/api/characterID/${characterId}/`, {
            headers: {
                'User-Agent': 'Local Scanner - Contact coolitzero on Discord',
                'Accept-Encoding': 'gzip',
                'If-None-Match': '0'
            },
            timeout: 5000
        });
        
        // Add a delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        if (!response.data || !Array.isArray(response.data)) {
            console.log(`No kill data found for character ${characterId}`);
            return [];
        }

        // Only process the first 5 killmails to reduce API load
        const recentKills = response.data.slice(0, 5);
        const ships = [];

        for (const kill of recentKills) {
            try {
                // Get the full killmail data from ESI
                const killmailResponse = await axios.get(
                    `https://esi.evetech.net/latest/killmails/${kill.killmail_id}/${kill.zkb.hash}/`
                );
                
                const killmailData = killmailResponse.data;
                let shipInfo = null;

                // Check if the character was the victim
                if (killmailData.victim.character_id === parseInt(characterId)) {
                    shipInfo = {
                        id: killmailData.victim.ship_type_id,
                        name: await fetchShipName(killmailData.victim.ship_type_id)
                    };
                } else {
                    // Check if the character was an attacker
                    const attacker = killmailData.attackers.find(
                        a => a.character_id === parseInt(characterId)
                    );
                    if (attacker && attacker.ship_type_id) {
                        shipInfo = {
                            id: attacker.ship_type_id,
                            name: await fetchShipName(attacker.ship_type_id)
                        };
                    }
                }

                if (shipInfo && !ships.some(s => s.id === shipInfo.id)) {
                    ships.push(shipInfo);
                }
            } catch (error) {
                console.error(`Error processing killmail ${kill.killmail_id}:`, error.message);
                continue;
            }
        }

        return ships;
    } catch (error) {
        console.error(`Error fetching recent kills for ${characterId}:`, error.message);
        return [];
    }
};

// Add this helper function to fetch ship names
const fetchShipName = async (shipTypeId) => {
    try {
        const response = await axios.get(`https://esi.evetech.net/latest/universe/types/${shipTypeId}/`);
        return response.data.name;
    } catch (error) {
        console.error(`Error fetching ship name for ${shipTypeId}:`, error.message);
        return 'Unknown Ship';
    }
};

const constructPilotProfile = async (characterData) => {
    try {
        const { killboardStats, recentShips } = characterData;
        
        // Check if API key is configured
        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key is not configured');
            return null;
        }

        // Construct the prompt with all relevant data
        const prompt = `
            Create a concise pilot profile based on the following EVE Online player statistics:
            
            Combat Statistics:
            - Danger Ratio: ${killboardStats?.dangerRatio || 'N/A'}
            - Gang Ratio: ${killboardStats?.gangRatio || 'N/A'}
            - Ships Destroyed: ${killboardStats?.shipsDestroyed || 'N/A'}
            - Ships Lost: ${killboardStats?.shipsLost || 'N/A'}
            
            Activity Areas:
            - Highsec Activity: ${killboardStats?.groups?.highsec?.kills_ratio || 0}%
            - Lowsec Activity: ${killboardStats?.groups?.lowsec?.kills_ratio || 0}%
            - Nullsec Activity: ${killboardStats?.groups?.nullsec?.kills_ratio || 0}%
            - Wormhole Activity: ${killboardStats?.groups?.wormhole?.kills_ratio || 0}%
            
            Recently Used Ships:
            ${recentShips.map(ship => `- ${ship.name}`).join('\n')}
            
            Please provide a profile in the following format:
            Pilot Type: (Single word or short phrase describing their primary activity: Miner, Ganker, PvPer, etc.)
            Summary: (2-3 sentences describing their playstyle, preferred space type, and notable patterns)
        `;

        // Make OpenAI API call with correct model name
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [{
                role: "user",
                content: prompt
            }],
            temperature: 0.7,
            max_tokens: 150
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error generating pilot profile:', error.message);
        if (error.response) {
            console.error('OpenAI API Error:', error.response.data);
        }
        return null;
    }
};

const analyzeFleetComposition = async (characterId) => {
    try {
        const response = await axios.get(`https://zkillboard.com/api/characterID/${characterId}/`, {
            headers: {
                'User-Agent': 'Local Scanner - Contact coolitzero on Discord',
                'Accept-Encoding': 'gzip',
                'If-None-Match': '0'
            },
            timeout: 5000
        });
        
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        if (!response.data || !Array.isArray(response.data)) {
            return null;
        }

        const recentKills = response.data.slice(0, 5);
        const fleetMembers = [];

        for (const kill of recentKills) {
            try {
                const killmailResponse = await axios.get(
                    `https://esi.evetech.net/latest/killmails/${kill.killmail_id}/${kill.zkb.hash}/`
                );

                const attackers = killmailResponse.data.attackers;
                
                // Skip if the character was the victim
                if (killmailResponse.data.victim.character_id === parseInt(characterId)) {
                    continue;
                }

                // Process each attacker
                for (const attacker of attackers) {
                    if (attacker.character_id && attacker.ship_type_id) {
                        const existingMember = fleetMembers.find(m => m.shipId === attacker.ship_type_id);
                        if (!existingMember) {
                            fleetMembers.push({
                                shipId: attacker.ship_type_id,
                                shipName: await fetchShipName(attacker.ship_type_id),
                                count: 1
                            });
                        } else {
                            existingMember.count++;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing killmail:`, error.message);
                continue;
            }
        }

        return {
            fleetMembers: fleetMembers.sort((a, b) => b.count - a.count)
        };
    } catch (error) {
        console.error('Error analyzing fleet composition:', error);
        return null;
    }
};

app.post("/api/characters", async (req, res) => {
    try {
        const { characterNames } = req.body;
        if (!Array.isArray(characterNames) || characterNames.length === 0) {
            return res.status(400).json({ error: "Invalid input" });
        }

        const characters = await fetchCharacterIds(characterNames);

        if (characters.length === 0) {
            return res.status(404).json({ error: "No characters found" });
        }

        const results = await Promise.all(
            characters.map(async (char) => {
                try {
                    const [killboardStats, corporationInfo, allianceInfo, recentShips, fleetAnalysis] = await Promise.all([
                        fetchKillboardStats(char.id),
                        fetchCorporationInfo(char.id),
                        fetchAllianceInfo(char.id),
                        fetchRecentKills(char.id),
                        analyzeFleetComposition(char.id)
                    ]);

                    // Create the proper structure that the client expects
                    const updatedKillboardStats = {
                        ...killboardStats,
                        topLists: [
                            {
                                type: "shipType",
                                values: recentShips
                            }
                        ]
                    };

                    return {
                        name: char.name,
                        characterId: char.id,
                        portrait: `https://images.evetech.net/characters/${char.id}/portrait`,
                        killboardStats: updatedKillboardStats,
                        corporation: corporationInfo,
                        alliance: allianceInfo,
                        fleetAnalysis,
                        pilotProfile: await constructPilotProfile({
                            killboardStats,
                            recentShips
                        })
                    };
                } catch (error) {
                    console.error(`Error processing character ${char.name}:`, error);
                    return null;
                }
            })
        );

        const validResults = results.filter(result => result !== null);
        res.json(validResults);
    } catch (error) {
        console.error("API error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
