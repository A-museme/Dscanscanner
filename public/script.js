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
});
