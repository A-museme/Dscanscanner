# EVE Online Intelligence Suite (Alpha)

## Overview
The EVE Online Intelligence Suite is a web-based tool designed to provide real-time intelligence and analysis of EVE Online players. The current alpha version focuses on character analysis, providing detailed information about pilots including their combat statistics, affiliations, and recent activities.

## Features
- **Character Analysis**: Analyze multiple characters simultaneously
- **Combat Statistics**: View danger ratios, gang ratios, and kill/loss statistics
- **Affiliation Details**: Display corporation and alliance information with logos
- **Recent Activity**: Track recently used ships and potential fleet compositions
- **AI-Powered Profiling**: Generate pilot behavior profiles using OpenAI's GPT-3.5
- **Visual Tagging**: Automatic character classification based on activity patterns

## Tech Stack
- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript
- **Styling**: Custom CSS with CSS Variables
- **APIs**: 
  - EVE ESI (EVE Swagger Interface)
  - zKillboard API
  - OpenAI API

## Prerequisites
- Node.js (Latest LTS version recommended)
- EVE Online Developer Application
- OpenAI API Key

## Installation

1. Clone the repository
```bash
git clone [repository-url]
cd eve-intel-suite
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory:
```
OPENAI_API_KEY=your_openai_api_key_here
```

4. Start the server
```bash
node server.js
```

## API Endpoints

### POST /api/characters
Analyzes multiple characters and returns detailed information.

**Request Body:**
```json
{
  "characterNames": ["Character1", "Character2"]
}
```

## Code Structure

### Backend (server.js)
- Character ID fetching: 

```10:20:server.js
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
```

- Killboard statistics retrieval:

```22:41:server.js
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
```

- Corporation and alliance information:

```43:85:server.js
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
```


### Frontend (script.js)
- Character tag generation:

```1:64:public/script.js
function getCharacterTags(killboardStats) {
    const tags = [];
    
    // Gang/Solo tags
    const gangRatio = parseFloat(killboardStats?.gangRatio);
    if (!isNaN(gangRatio)) {
        if (gangRatio >= 90) {
            tags.push({ text: 'GANG', type: 'gang' });
        } else if (gangRatio <= 30) {
            tags.push({ text: 'SOLO', type: 'solo' });
        }
    }
    
    // Danger/Snuggly tags
    const dangerRatio = parseFloat(killboardStats?.dangerRatio);
    if (!isNaN(dangerRatio)) {
        if (dangerRatio >= 75) {
            tags.push({ text: 'VERY DANGEROUS', type: 'very-dangerous' });
        } else if (dangerRatio >= 50) {
            tags.push({ text: 'DANGEROUS', type: 'dangerous' });
        } else if (dangerRatio <= 15) {
            tags.push({ text: 'VERY SNUGGLY', type: 'very-snuggly' });
        } else if (dangerRatio <= 25) {
            tags.push({ text: 'SNUGGLY', type: 'snuggly' });
        }
    }

    // Activity type tags
    if (killboardStats?.iskDestroyed && killboardStats?.iskLost) {
        const iskRatio = killboardStats.iskDestroyed / killboardStats.iskLost;
        if (iskRatio < 0.2 && killboardStats.shipsLost > 10) {
            tags.push({ text: 'CAREBEAR', type: 'carebear' });
        }
    }
    // Security tags based on kills
    if (killboardStats?.groups?.highsec?.kills_ratio >= 80) {
        tags.push({ text: 'HIGHSEC', type: 'highsec' });
    } else if (killboardStats?.groups?.lowsec?.kills_ratio >= 80) {
        tags.push({ text: 'LOWSEC', type: 'lowsec' });
    } else if (killboardStats?.groups?.nullsec?.kills_ratio >= 80) {
        tags.push({ text: 'NULLSEC', type: 'nullsec' });
    } else if (killboardStats?.groups?.wormhole?.kills_ratio >= 50) {
        tags.push({ text: 'WORMHOLER', type: 'wormhole' });
    }

    // Ship type specialization
    const topShips = killboardStats?.topLists?.find(list => list.type === "shipType")?.values || [];
    const hasFreighter = topShips.some(ship => ship.name.includes("Freighter"));
    const hasIndustrial = topShips.some(ship => 
        ship.name.includes("Industrial") || 
        ship.name.includes("Transport") || 
        ship.name.includes("Blockade Runner")
    );

    if (hasFreighter || hasIndustrial) {
        tags.push({ text: 'HAULER', type: 'hauler' });
    }
    
    console.log('Character stats:', { gangRatio, dangerRatio });
    console.log('Generated tags:', tags);
    
    return tags;
}
```

- Results rendering:

```66:173:public/script.js
document.getElementById("searchButton").addEventListener("click", async () => {
    const namesInput = document.getElementById("characterNames").value.trim();
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    if (!namesInput) {
        resultsDiv.innerHTML = "<p>Please enter at least one character name.</p>";
        return;
    }

    const characterNames = namesInput.split("\n").map(name => name.trim()).filter(name => name.length > 0);

    try {
        const response = await fetch("/api/characters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterNames }),
        });

        if (!response.ok) {
            throw new Error("API error or characters not found");
        }

        const data = await response.json();
        console.log('Received character data:', data);

        // Display results
        resultsDiv.innerHTML = data.map(({ characterId, name, portrait, killboardStats, corporation, alliance, pilotProfile, fleetAnalysis }) => {
            const tags = getCharacterTags(killboardStats);
            const isDangerous = killboardStats?.dangerRatio >= 50;
            
            console.log('Ship data:', killboardStats?.topLists?.find(({ type }) => type === "shipType")?.values);
            
            return `
                <div class="character-result ${isDangerous ? 'dangerous-pilot' : ''}">
                    <div class="card-header">
                        <div class="button-group">
                            <a href="https://zkillboard.com/character/${characterId}/" target="_blank" class="profile-button zkill-button">
                                zKillboard
                            </a>
                        </div>
                    </div>
                    <div class="character-header">
                        <img src="${portrait}" alt="${name}" class="character-portrait" />
                        <div class="character-info">
                            <h2>${name}</h2>
                            <div class="tags">
                                ${tags.map(tag => `<span class="tag ${tag.type}">${tag.text}</span>`).join('')}
                            </div>
                            <div class="affiliation">
                                <div class="corp-info">
                                    <img src="${corporation?.logo}" alt="${corporation?.name}" class="corp-logo" />
                                    <p><strong>Corporation:</strong> ${corporation ? `${corporation.name} [${corporation.ticker}]` : 'N/A'}</p>
                                </div>
                                ${alliance ? `
                                    <div class="alliance-info">
                                        <img src="${alliance.logo}" alt="${alliance.name}" class="alliance-logo" />
                                        <p><strong>Alliance:</strong> ${alliance.name} [${alliance.ticker}]</p>
                                    </div>
                                ` : '<p class="no-alliance"><em>No Alliance</em></p>'}
                            </div>
                        </div>
                    </div>
                    <div class="pilot-profile">
                        ${pilotProfile ? `
                            <div class="profile-content">
                                ${pilotProfile}
                            </div>
                        ` : ''}
                    </div>
                    <div class="stats">
                        <p><strong>Danger Ratio:</strong> ${killboardStats?.dangerRatio ?? "N/A"}</p>
                        <p><strong>Gang Ratio:</strong> ${killboardStats?.gangRatio ?? "N/A"}</p>
                        <p><strong>Ships Destroyed:</strong> ${killboardStats?.shipsDestroyed ?? "N/A"}</p>
                        <p><strong>Ships Lost:</strong> ${killboardStats?.shipsLost ?? "N/A"}</p>
                    </div>
                    <div class="ships">
                        <h3>Recently Used Ships:</h3>
                        <ul>
                            ${killboardStats?.topLists?.find(({ type }) => type === "shipType")?.values.map(ship => 
                                `<li>
                                    <img src="https://images.evetech.net/types/${ship.id}/icon" alt="${ship.name}" class="ship-icon" />
                                    ${ship.name}
                                </li>`
                            ).join("") || "<li>No recent activity</li>"}
                        </ul>
                    </div>
                    ${fleetAnalysis?.fleetMembers?.length ? `
                        <div class="ships">
                            <h3>Possible Gang Composition:</h3>
                            <ul>
                                ${fleetAnalysis.fleetMembers.map(member => 
                                    `<li>
                                        <img src="https://images.evetech.net/types/${member.shipId}/icon" alt="${member.shipName}" class="ship-icon" />
                                        ${member.count}x ${member.shipName}
                                    </li>`
                                ).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join("");
    } catch (error) {
        console.error(error);
        resultsDiv.innerHTML = "<p>Error fetching data. Try again later.</p>";
    }
}
```


## Rate Limiting
The application implements rate limiting for API calls:
- zKillboard: 1.1-second delay between requests
- Error handling for timeouts and failed requests

## Future Development Roadmap

### Phase 1 (Next Release)
- User authentication system
- Persistent data storage
- Historical tracking of characters
- Enhanced fleet composition analysis

### Phase 2
- Real-time local chat monitoring
- D-Scan integration
- Intel sharing between corporation members
- Advanced threat assessment algorithms

### Phase 3
- Mobile application development
- Corporation/Alliance-level analytics
- Market intelligence integration
- Custom alert systems

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## API Rate Limits
- EVE ESI: No authentication required for public endpoints
- zKillboard: 1 request per second
- OpenAI: Depends on your API plan

## Known Issues
1. Character analysis may timeout for highly active pilots
2. Fleet composition analysis limited to recent kills
3. Rate limiting may cause delays with multiple character lookups

## License
ISC License (as specified in package.json)

## Contact
For support or contributions, contact the project maintainers through GitHub issues.

---

This project is not affiliated with CCP Games or EVE Online.
