import React, { useState, useEffect, useRef, useCallback } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import skullAndCrossbones from '../../skull-and-crossbones.svg'; // Added import
import helicopterIcon from '../../helicopter.svg'; // Import the helicopter SVG

// Game constants
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 500;
const PLAYER_RADIUS = 10;
const ZOMBIE_RADIUS = 8;
const HELICOPTER_X = CANVAS_WIDTH - 60;
const HELICOPTER_Y = CANVAS_HEIGHT / 2;
const HELICOPTER_WIDTH = 50;
const HELICOPTER_HEIGHT = 80;
const OIL_SLICK_RADIUS = 15;
const OIL_SLICK_DURATION = 5000; // 5 seconds
const OIL_SLICK_COOLDOWN = 10000; // 10 seconds
const COUNTDOWN_SECONDS = 5;
const BUILDING_COLOR = '#888888'; // Grey color for buildings
const PLAYER_SPEED = 2;
const MAX_PLAYER_OIL_SLICKS = 3; // Maximum concurrent oil slicks per player
const SLOW_DURATION = 2000; // 2 seconds
const SLOW_FACTOR = 0.4; // Speed is 40% of normal when slowed

// Helicopter animation constants
const HELICOPTER_ANIMATION_SPEED = 1.5;
const HELICOPTER_ANIMATION_TARGET_X = CANVAS_WIDTH / 2;
const HELICOPTER_ANIMATION_TARGET_Y = -HELICOPTER_HEIGHT * 2; // Fly off the top

const playerColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F1C40F', '#1ABC9C', '#FFBF00', '#FF7F50'];

// Helper function to check collision between a circle (player/zombie) and a rectangle (building)
const checkCollisionWithBuilding = (character, building) => {
    // Find the closest point to the circle within the rectangle
    const closestX = Math.max(building.x, Math.min(character.x, building.x + building.width));
    const closestY = Math.max(building.y, Math.min(character.y, building.y + building.height));

    // Calculate the distance between the circle's center and this closest point
    const distanceX = character.x - closestX;
    const distanceY = character.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

    // If the distance is less than the circle's radius, an intersection occurs
    const radius = character.isPlayer ? PLAYER_RADIUS : ZOMBIE_RADIUS;
    return distanceSquared < (radius * radius);
};

const ZombieGame = ({ teams, onGameEnd, myName, winningNumber: officialWinningNumber, socket }) => {
    const canvasRef = useRef(null);
    const gameLoopRef = useRef(null);
    const countdownIntervalRef = useRef(null);
    const isHelicopterAnimatingRef = useRef(false); // Ref to track if animation has started

    // Game state
    const [players, setPlayers] = useState([]); // { id, name, estimate, x, y, color, isPlayer, caught, safe, oilSlickCooldownEnds, lastOilSlickTime, slowedUntil, teamMembers }
    const [zombies, setZombies] = useState([]); // { id, x, y, speed, slowedUntil }
    const [oilSlicks, setOilSlicks] = useState([]); // { x, y, placedBy, activeUntil }
    const [gameMessage, setGameMessage] = useState('Loading game...');
    const [gameOver, setGameOver] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [gameStarted, setGameStarted] = useState(false);
    const [buildings, setBuildings] = useState([]); // { x, y, width, height }
    const [helicopterPosition, setHelicopterPosition] = useState({ x: HELICOPTER_X, y: HELICOPTER_Y });
    const [isHelicopterAnimating, setIsHelicopterAnimating] = useState(false);

    const resetGame = useCallback(() => {
        // Clear existing intervals/animations
        if (gameLoopRef.current) {
            cancelAnimationFrame(gameLoopRef.current);
            gameLoopRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        // For multiplayer, resetGame should send a message to the server
        if (socket) {
            socket.emit('REQUEST_GAME_RESET', { officialWinningNumber });
            setGameMessage('Requesting game reset...');
        } else {
            // Fallback for local testing or if socket not available (though ideally it always should be for multiplayer)
            console.warn("Socket not available, performing local reset. This won't sync in multiplayer.");
            // The original local reset logic can be kept for single player or as a fallback,
            // but for multiplayer, the server should dictate the new state.
            // For now, we'll assume the server will send a new state that triggers re-initialization.
            // If we want to keep a fully local fallback:
            const teamEntries = Object.entries(teams);
            if (teamEntries.length < 1) {
                setGameMessage('Cannot restart: No teams data.');
                setGameOver(true);
                setGameStarted(false);
                return;
            }

            const initialPlayers = teamEntries.map(([estimate, teamMembers], index) => ({
                id: teamMembers[0],
                name: teamMembers[0],
                estimate: estimate,
                x: 50 + index * 30,
                y: CANVAS_HEIGHT / 2,
                color: playerColors[index % playerColors.length],
                isPlayer: myName === teamMembers[0],
                caught: false,
                safe: false,
                oilSlickCooldownEnds: 0,
                lastOilSlickTime: 0,
                slowedUntil: 0,
                teamMembers: teamMembers,
            }));
            setPlayers(initialPlayers);

            const numZombies = initialPlayers.length * 3;
            const initialZombies = Array.from({ length: numZombies }).map((_, i) => {
                let zombieX, zombieY;
                const playerStartXMax = 50 + initialPlayers.length * 30 + 50;
                const helicopterStartXMin = HELICOPTER_X - HELICOPTER_WIDTH - 50;
                do {
                    zombieX = ZOMBIE_RADIUS + Math.random() * (CANVAS_WIDTH - 2 * ZOMBIE_RADIUS);
                    zombieY = ZOMBIE_RADIUS + Math.random() * (CANVAS_HEIGHT - 2 * ZOMBIE_RADIUS);
                } while (
                    (zombieX < playerStartXMax && Math.abs(zombieY - CANVAS_HEIGHT / 2) < 100) ||
                    (zombieX > helicopterStartXMin && Math.abs(zombieY - HELICOPTER_Y) < HELICOPTER_HEIGHT)
                );
                return { id: `zombie-${i}`, x: zombieX, y: zombieY, speed: 0.5 + Math.random() * 0.5, slowedUntil: 0 };
            });
            setZombies(initialZombies);

            setOilSlicks([]);
            setGameOver(false);
            setCountdown(COUNTDOWN_SECONDS);
            setGameStarted(false);
            setGameMessage(`Game starts in ${COUNTDOWN_SECONDS}...`);
            keysPressed.current = {};
            setHelicopterPosition({ x: HELICOPTER_X, y: HELICOPTER_Y });
            setIsHelicopterAnimating(false);
            isHelicopterAnimatingRef.current = false;
        }
    }, [teams, myName, socket, officialWinningNumber]);

    // Initialize players - This will now likely be driven by the server sending initial state
    useEffect(() => {
        // When using WebSockets, the server will typically send the initial game state.
        // The client might send a 'JOIN_GAME' message, and the server responds.
        // For now, we'll keep some local initialization if teams data is present and socket isn't fully integrated for this part yet.
        // This section will need significant change once server dictates initial state.

        if (socket) {
            // Example: client informs server it has joined, server sends back full game state
            // socket.emit('JOIN_GAME', { name: myName, teams });
            // The listener below will handle 'GAME_STATE_UPDATE' or 'INITIAL_GAME_STATE'
             setGameMessage('Waiting for server...');
        } else {
            // Fallback for local setup if socket is not used (e.g. single player mode or testing)
            const teamEntries = Object.entries(teams);
            if (teamEntries.length < 1) {
                setGameMessage('Zombie game requires at least 1 player.');
                setGameOver(true);
                return;
            }
            // ... (rest of the original initialization - this part should ideally be removed or conditional)
            // This local initialization should be replaced by server-sent state
            console.warn("Using local game initialization. For multiplayer, server should provide this.");
            const initialPlayers = teamEntries.map(([estimate, teamMembers], index) => ({
                id: teamMembers[0],
                name: teamMembers[0],
                estimate: estimate,
                x: 50 + index * 30,
                y: CANVAS_HEIGHT / 2,
                color: playerColors[index % playerColors.length],
                isPlayer: myName === teamMembers[0],
                caught: false,
                safe: false,
                oilSlickCooldownEnds: 0,
                lastOilSlickTime: 0,
                slowedUntil: 0,
                teamMembers: teamMembers,
            }));
            setPlayers(initialPlayers);

            const numZombies = initialPlayers.length * 3;
            const initialZombies = Array.from({ length: numZombies }).map((_, i) => {
                 let zombieX, zombieY;
                const playerStartXMax = 50 + initialPlayers.length * 30 + 50;
                const helicopterStartXMin = HELICOPTER_X - HELICOPTER_WIDTH - 50;
                do {
                    zombieX = ZOMBIE_RADIUS + Math.random() * (CANVAS_WIDTH - 2 * ZOMBIE_RADIUS);
                    zombieY = ZOMBIE_RADIUS + Math.random() * (CANVAS_HEIGHT - 2 * ZOMBIE_RADIUS);
                } while (
                    (zombieX < playerStartXMax && Math.abs(zombieY - CANVAS_HEIGHT / 2) < 100) ||
                    (zombieX > helicopterStartXMin && Math.abs(zombieY - HELICOPTER_Y) < HELICOPTER_HEIGHT)
                );
                return { id: `zombie-${i}`, x: zombieX, y: zombieY, speed: 0.5 + Math.random() * 0.5, slowedUntil: 0 };
            });
            setZombies(initialZombies);

            setGameMessage(`Game starts in ${COUNTDOWN_SECONDS}...`);
            setCountdown(COUNTDOWN_SECONDS);
            setGameStarted(false);
            setGameOver(false);
            setHelicopterPosition({ x: HELICOPTER_X, y: HELICOPTER_Y });
            setIsHelicopterAnimating(false);
            isHelicopterAnimatingRef.current = false;

            setBuildings([
                { id: 'b1', x: 150, y: 100, width: 80, height: 120 },
                { id: 'b2', x: 400, y: 250, width: 120, height: 70 },
                { id: 'b3', x: 250, y: 350, width: 60, height: 60 },
                { id: 'b4', x: CANVAS_WIDTH - 200, y: 50, width: 70, height: 100},
            ]);
        }


        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            // if (socket) { // Clean up socket listeners if added here
            // socket.off('GAME_STATE_UPDATE');
            // socket.off('GAME_EVENT');
            // etc.
            // }
        };
    }, [teams, myName, socket]); // Added socket

    // Countdown Logic - Server should ideally drive this
    useEffect(() => {
        // if (players.length > 0 && !gameStarted && !gameOver && countdown > 0) { // Original condition
        if (socket) {
            // Countdown will be driven by server messages like 'GAME_COUNTDOWN_UPDATE' or 'GAME_STARTING'
            // Local countdown interval might be removed or only used for display formatting based on server time.
        } else {
            // Fallback to local countdown if no socket
            if (players.length > 0 && !gameStarted && !gameOver && countdown > 0) {
                countdownIntervalRef.current = setInterval(() => {
                    setCountdown(prevCount => {
                        const nextCount = prevCount - 1;
                        if (nextCount <= 0) {
                            clearInterval(countdownIntervalRef.current);
                            setGameStarted(true);
                            setGameMessage('RUN! Survive!');
                            return 0;
                        }
                        setGameMessage(`Game starts in ${nextCount}...`);
                        return nextCount;
                    });
                }, 1000);
            } else if (countdown <= 0 && !gameStarted && players.length > 0 && !gameOver) {
                clearInterval(countdownIntervalRef.current);
                setGameStarted(true);
                setGameMessage('RUN! Survive!');
            }
        }
        return () => clearInterval(countdownIntervalRef.current);
    // }, [players, gameStarted, gameOver, countdown]); // Original deps
    }, [players, gameStarted, gameOver, countdown, socket]); // Added socket


    // Keyboard controls state
    const keysPressed = useRef({});
    const handleKeyDown = useCallback((e) => {
        if (gameOver || !gameStarted || !socket) return; // Ensure socket is present for sending actions

        const key = e.key.toLowerCase();
        keysPressed.current[key] = true;

        // Send actions to server instead of direct state manipulation
        if (key === 'arrowup') socket.emit('PLAYER_ACTION', { type: 'MOVE', direction: 'up' });
        if (key === 'arrowdown') socket.emit('PLAYER_ACTION', { type: 'MOVE', direction: 'down' });
        if (key === 'arrowleft') socket.emit('PLAYER_ACTION', { type: 'MOVE', direction: 'left' });
        if (key === 'arrowright') socket.emit('PLAYER_ACTION', { type: 'MOVE', direction: 'right' });
        if (key === ' ') {
            socket.emit('PLAYER_ACTION', { type: 'DROP_OIL_SLICK' });
            e.preventDefault(); // Prevent space from scrolling page
        }

        // Prevent default for arrow keys
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
            e.preventDefault();
        }
    }, [gameOver, gameStarted, socket]); // Added socket

    const handleKeyUp = useCallback((e) => {
        const key = e.key.toLowerCase();
        keysPressed.current[key] = false; // Still useful for continuous press, server might need 'STOP_MOVE' or handle it via last direction
        
        if (socket) {
            // Optionally, send a 'STOP_MOVE' or rely on server to handle periods of no movement input
            // For simplicity, we might assume server handles momentum or requires continuous 'MOVE' signals.
            // Or, if server expects discrete stop signals:
            // if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
            //     socket.emit('PLAYER_ACTION', { type: 'STOP_MOVE', direction: key.replace('arrow', '') });
            // }
        }

        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
            e.preventDefault();
        }
    }, [socket]); // Added socket

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp); // Ensure keyup listener is added
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp); // Ensure keyup listener is removed
        };
    }, [handleKeyDown, handleKeyUp]); // Add dependencies

    // Game Loop & Logic - This will be heavily refactored or removed as server controls state
    useEffect(() => {
        if (!socket) { // If no socket, run local game loop (for testing/fallback)
            console.warn("Socket not connected, running local game loop. This is not multiplayer.");
            // The original game loop logic:
            if (players.length === 0 || gameOver || !gameStarted) {
                if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
                return;
            }
            const game = () => {
                // ... (Original game loop code from line 264 to 491)
                // This entire block would be for local simulation only.
                // For multiplayer, the client doesn't run this simulation.
                // It just renders state received from the server.

                if (gameOver) {
                    cancelAnimationFrame(gameLoopRef.current);
                    return;
                }

                const now = Date.now();

                // Update helicopter animation if active (This might also be server-driven)
                if (isHelicopterAnimatingRef.current) {
                    setHelicopterPosition(prevPos => {
                        const dx = HELICOPTER_ANIMATION_TARGET_X - prevPos.x;
                        const dy = HELICOPTER_ANIMATION_TARGET_Y - prevPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < HELICOPTER_ANIMATION_SPEED) {
                            return { x: HELICOPTER_ANIMATION_TARGET_X, y: HELICOPTER_ANIMATION_TARGET_Y };
                        }
                        const moveX = (dx / dist) * HELICOPTER_ANIMATION_SPEED;
                        const moveY = (dy / dist) * HELICOPTER_ANIMATION_SPEED;
                        return { x: prevPos.x + moveX, y: prevPos.y + moveY };
                    });
                }

                // Update players (Local simulation - to be replaced by server state)
                setPlayers(prevPlayers => prevPlayers.map(player => {
                    if (player.caught || player.safe) return player;
                    let { x, y, oilSlickCooldownEnds, lastOilSlickTime, slowedUntil: playerSlowedUntil } = player;
                    const baseSpeed = PLAYER_SPEED;
                    const currentSpeed = now < playerSlowedUntil ? baseSpeed * SLOW_FACTOR : baseSpeed;
                    let newX = x;
                    let newY = y;

                    if (player.isPlayer) { // Only control local player if running local sim
                        if (keysPressed.current['arrowup']) newY -= currentSpeed;
                        if (keysPressed.current['arrowdown']) newY += currentSpeed;
                        if (keysPressed.current['arrowleft']) newX -= currentSpeed;
                        if (keysPressed.current['arrowright']) newX += currentSpeed;

                        newX = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, newX));
                        newY = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, newY));
                        
                        let collision = false;
                        for (const building of buildings) {
                            if (checkCollisionWithBuilding({ ...player, x: newX, y: newY, isPlayer: true }, building)) {
                                collision = true;
                                break;
                            }
                        }
                        if (!collision) { x = newX; y = newY; }
                        else {
                            collision = false;
                            for (const building of buildings) { if (checkCollisionWithBuilding({ ...player, x: newX, y: player.y, isPlayer: true }, building)) { collision = true; break; } }
                            if (!collision) { x = newX; }
                            else {
                                collision = false;
                                for (const building of buildings) { if (checkCollisionWithBuilding({ ...player, x: player.x, y: newY, isPlayer: true }, building)) { collision = true; break; } }
                                if (!collision) { y = newY; }
                            }
                        }

                        if (keysPressed.current[' '] && now >= oilSlickCooldownEnds) {
                            const activeSlicksByPlayer = oilSlicks.filter(slick => slick.placedBy === player.id && now < slick.activeUntil).length;
                            if (activeSlicksByPlayer < MAX_PLAYER_OIL_SLICKS) {
                                setOilSlicks(prevSlicks => [...prevSlicks, { x: player.x, y: player.y, placedBy: player.id, activeUntil: now + OIL_SLICK_DURATION }]);
                                player.oilSlickCooldownEnds = now + OIL_SLICK_COOLDOWN;
                                player.lastOilSlickTime = now;
                            }
                        }
                    }

                    let newPlayerSlowedUntil = playerSlowedUntil;
                    oilSlicks.forEach(slick => {
                        if (now < slick.activeUntil && slick.placedBy !== player.id) {
                            const distToSlick = Math.sqrt((x - slick.x)**2 + (y - slick.y)**2);
                            if (distToSlick < PLAYER_RADIUS + OIL_SLICK_RADIUS) newPlayerSlowedUntil = now + SLOW_DURATION;
                        }
                    });
                    return { ...player, x, y, slowedUntil: newPlayerSlowedUntil };
                }));

                // Update zombies (Local simulation - to be replaced by server state)
                setZombies(prevZombies => prevZombies.map(zombie => {
                    let { x, y, speed: baseZombieSpeed, slowedUntil: zombieSlowedUntil } = zombie;
                    const currentZombieSpeed = now < zombieSlowedUntil ? baseZombieSpeed * SLOW_FACTOR : baseZombieSpeed;
                    let newZombieX = x;
                    let newZombieY = y;
                    let closestPlayer = null;
                    let minDistSq = Infinity;
                    players.forEach(p => {
                        if (!p.caught && !p.safe) {
                            const distSq = (p.x - x)**2 + (p.y - y)**2;
                            if (distSq < minDistSq) { minDistSq = distSq; closestPlayer = p; }
                        }
                    });

                    if (closestPlayer) {
                        const angleToPlayer = Math.atan2(closestPlayer.y - y, closestPlayer.x - x);
                        newZombieX += Math.cos(angleToPlayer) * currentZombieSpeed;
                        newZombieY += Math.sin(angleToPlayer) * currentZombieSpeed;
                        let collisionWithBuilding = false;
                        for (const building of buildings) { if (checkCollisionWithBuilding({ ...zombie, x: newZombieX, y: newZombieY, isPlayer: false }, building)) { collisionWithBuilding = true; break; } }
                        if (!collisionWithBuilding) {
                            let collisionWithNewXOnly = false;
                            for (const building of buildings) { if (checkCollisionWithBuilding({ ...zombie, x: newZombieX, y: y, isPlayer: false }, building)) { collisionWithNewXOnly = true; break; } }
                            let collisionWithNewYOnly = false;
                            for (const building of buildings) { if (checkCollisionWithBuilding({ ...zombie, x: x, y: newZombieY, isPlayer: false }, building)) { collisionWithNewYOnly = true; break; } }
                            if(!collisionWithBuilding){ x = newZombieX; y = newZombieY; }
                            else if (!collisionWithNewXOnly && collisionWithNewYOnly) x = newZombieX;
                            else if (collisionWithNewXOnly && !collisionWithNewYOnly) y = newZombieY;
                        }
                    }
                    
                    let newZombieSlowedUntil = zombieSlowedUntil;
                    oilSlicks.forEach(slick => {
                        if (now < slick.activeUntil) {
                            const distToSlick = Math.sqrt((x - slick.x)**2 + (y - slick.y)**2);
                            if (distToSlick < ZOMBIE_RADIUS + OIL_SLICK_RADIUS) newZombieSlowedUntil = now + SLOW_DURATION;
                        }
                    });
                    return { ...zombie, x, y, slowedUntil: newZombieSlowedUntil };
                }));
            
                setOilSlicks(prevSlicks => prevSlicks.filter(slick => now < slick.activeUntil));

                let firstPlayerReachedSafetyThisFrame = false;
                setPlayers(prevPlayers => {
                    const updatedPlayers = prevPlayers.map(player => {
                        if (player.caught || player.safe) return player;
                        zombies.forEach(zombie => {
                            const dist = Math.sqrt((player.x - zombie.x)**2 + (player.y - zombie.y)**2);
                            if (dist < PLAYER_RADIUS + ZOMBIE_RADIUS) player.caught = true;
                        });
                        if (player.x > HELICOPTER_X - HELICOPTER_WIDTH / 2 && player.x < HELICOPTER_X + HELICOPTER_WIDTH / 2 &&
                            player.y > HELICOPTER_Y - HELICOPTER_HEIGHT / 2 && player.y < HELICOPTER_Y + HELICOPTER_HEIGHT / 2) {
                            player.safe = true;
                            if (!isHelicopterAnimatingRef.current) firstPlayerReachedSafetyThisFrame = true;
                        }
                        return player;
                    });
                    if (firstPlayerReachedSafetyThisFrame) { setIsHelicopterAnimating(true); isHelicopterAnimatingRef.current = true; }
                    const activePlayers = updatedPlayers.filter(p => !p.caught && !p.safe);
                    if (activePlayers.length === 0 && updatedPlayers.length > 0 && !gameOver) {
                        setGameOver(true);
                        const survivors = updatedPlayers.filter(p => p.safe);
                        if (survivors.length > 0) {
                            setGameMessage(`Survivors: ${survivors.map(s => s.name).join(', ')} made it to the helicopter!`);
                        } else {
                            setGameMessage('The zombies got everyone!');
                        }
                        // onGameEnd might be called here based on server message in multiplayer
                    }
                    return updatedPlayers;
                });
                if (!gameOver) gameLoopRef.current = requestAnimationFrame(game);
            };

            if (gameStarted && !gameOver) {
                gameLoopRef.current = requestAnimationFrame(game);
            }
            return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
        } // End of local game loop fallback
        
        // For WebSocket, there's no local game loop.
        // Game state updates come from the server.
        // The drawing useEffect will handle rendering.
        // Clean up listeners on unmount
        return () => {
            if (socket) {
                // Example: remove specific listeners
                // socket.off('GAME_STATE_UPDATE', handleGameStateUpdate);
                // socket.off('GAME_EVENT', handleGameEvent);
                // socket.off('GAME_OVER', handleGameOver);
                // socket.off('GAME_MESSAGE', handleGameMessage);
                // socket.off('HELICOPTER_ANIMATION_START', handleHelicopterAnimationStart);
                // socket.off('COUNTDOWN_UPDATE', handleCountdownUpdate);
                // socket.off('GAME_STARTED_EVENT', handleGameStartedEvent);

                // Or remove all listeners for this component's context if socket instance is shared
                // Be careful if socket is used by other components.
            }
        };
    }, [gameStarted, gameOver, players, zombies, oilSlicks, buildings, socket, myName]);


    // WebSocket message handling
    useEffect(() => {
        if (!socket) return;

        const handleGameStateUpdate = (data) => {
            // data = { players, zombies, oilSlicks, helicopterPosition, isHelicopterAnimating }
            setPlayers(data.players || []);
            setZombies(data.zombies || []);
            setOilSlicks(data.oilSlicks || []);
            if (data.helicopterPosition) setHelicopterPosition(data.helicopterPosition);
            if (typeof data.isHelicopterAnimating === 'boolean') {
                setIsHelicopterAnimating(data.isHelicopterAnimating);
                isHelicopterAnimatingRef.current = data.isHelicopterAnimating;
            }
             // Potentially update building state too if it can change or is server-defined
            if (data.buildings) setBuildings(data.buildings);
        };

        const handleGameEvent = (event) => {
            // event = { type: 'PLAYER_CAUGHT', playerId: '...' }
            // event = { type: 'PLAYER_SAFE', playerId: '...' }
            // event = { type: 'OIL_SLICK_DEPLOYED', slick: { x, y, ... } }
            // etc.
            // This might be partially handled by full GameStateUpdate,
            // or used for more immediate feedback/animations.
            console.log('Game event received:', event);
            // Example: If server sends individual player updates
            if (event.type === 'PLAYER_UPDATE') {
                setPlayers(prev => prev.map(p => p.id === event.player.id ? event.player : p));
            }
        };

        const handleGameOver = (data) => {
            // data = { message: '...', survivors: [...] }
            setGameOver(true);
            setGameMessage(data.message || 'Game Over!');
            // onGameEnd could be called here with data.survivors or a transformed result
            if (onGameEnd) {
                const survivorIds = data.survivors ? data.survivors.map(s => s.id) : [];
                // The original onGameEnd expected an array of IDs or null.
                // Adapt based on what `data.survivors` contains.
                onGameEnd(survivorIds.length > 0 ? survivorIds : null);
            }
        };
        
        const handleGameMessage = (message) => {
            setGameMessage(message);
        };

        const handleCountdownUpdate = (newCountdown) => {
            setCountdown(newCountdown);
            if (newCountdown > 0) {
                setGameStarted(false); // Ensure game not marked as started during countdown
                setGameMessage(`Game starts in ${newCountdown}...`);
            }
        };

        const handleGameStartedEvent = (data) => {
            setGameStarted(true);
            setCountdown(0); // Ensure countdown is 0
            setGameMessage(data.message || 'RUN! Survive!');
            // Potentially set initial game state if not already done by a full GAME_STATE_UPDATE
            if (data.initialState) {
                handleGameStateUpdate(data.initialState);
            }
        };
        
        const handleInitialGameState = (data) => {
            // This could be the first message after joining, setting up everything.
            setPlayers(data.players || []);
            setZombies(data.zombies || []);
            setOilSlicks(data.oilSlicks || []);
            setBuildings(data.buildings || [ // Default buildings if not provided by server
                { id: 'b1', x: 150, y: 100, width: 80, height: 120 },
                { id: 'b2', x: 400, y: 250, width: 120, height: 70 },
                { id: 'b3', x: 250, y: 350, width: 60, height: 60 },
                { id: 'b4', x: CANVAS_WIDTH - 200, y: 50, width: 70, height: 100},
            ]);
            setHelicopterPosition(data.helicopterPosition || { x: HELICOPTER_X, y: HELICOPTER_Y });
            setIsHelicopterAnimating(data.isHelicopterAnimating || false);
            isHelicopterAnimatingRef.current = data.isHelicopterAnimating || false;
            setGameOver(data.gameOver || false);
            setGameStarted(data.gameStarted || false);
            setCountdown(data.countdown !== undefined ? data.countdown : COUNTDOWN_SECONDS);
            setGameMessage(data.gameMessage || `Game starts in ${data.countdown !== undefined ? data.countdown : COUNTDOWN_SECONDS}...`);
        };


        // Register listeners
        socket.on('GAME_STATE_UPDATE', handleGameStateUpdate);
        socket.on('GAME_EVENT', handleGameEvent); // For more granular events if needed
        socket.on('GAME_OVER', handleGameOver);
        socket.on('GAME_MESSAGE', handleGameMessage); // For general messages
        socket.on('COUNTDOWN_UPDATE', handleCountdownUpdate);
        socket.on('GAME_STARTED_EVENT', handleGameStartedEvent); // When game transitions from countdown to active
        socket.on('INITIAL_GAME_STATE', handleInitialGameState); // For receiving the full state upon joining/reset

        // Request initial state or join game
        // This might be done once when the component mounts and socket is ready
        // socket.emit('REQUEST_INITIAL_STATE', { name: myName }); // Or 'JOIN_GAME'

        return () => {
            // Clean up listeners
            socket.off('GAME_STATE_UPDATE', handleGameStateUpdate);
            socket.off('GAME_EVENT', handleGameEvent);
            socket.off('GAME_OVER', handleGameOver);
            socket.off('GAME_MESSAGE', handleGameMessage);
            socket.off('COUNTDOWN_UPDATE', handleCountdownUpdate);
            socket.off('GAME_STARTED_EVENT', handleGameStartedEvent);
            socket.off('INITIAL_GAME_STATE', handleInitialGameState);
        };
    }, [socket, onGameEnd, myName]); // Added myName as it might be used in join/request messages

    // Drawing on Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Clear canvas (background)
        ctx.fillStyle = '#333333'; // Dark grey background
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw Helicopter (Safety Zone)
        // Landing Pad Circle
        ctx.beginPath();
        ctx.arc(HELICOPTER_X, HELICOPTER_Y, HELICOPTER_WIDTH / 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#BADA55'; // Light green for pad
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();

        // "H" for Helipad
        ctx.fillStyle = 'white';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', HELICOPTER_X, HELICOPTER_Y);

        // Draw Helicopter SVG using dynamic position
        const helicopterImg = new Image();
        helicopterImg.src = helicopterIcon;
        const helicopterDrawWidth = HELICOPTER_WIDTH * 1.5;
        const helicopterDrawHeight = HELICOPTER_HEIGHT * 1.5;
        // Use helicopterPosition state for drawing the helicopter itself
        const helicopterDrawX = helicopterPosition.x - helicopterDrawWidth / 2;
        const helicopterDrawY = helicopterPosition.y - helicopterDrawHeight / 2 - 30; // Initial offset remains

        if (helicopterImg.complete) {
            ctx.drawImage(helicopterImg, helicopterDrawX, helicopterDrawY, helicopterDrawWidth, helicopterDrawHeight);
        } else {
            helicopterImg.onload = () => {
                // Need to redraw if loaded async, though game loop usually handles this
                 // For simplicity, direct draw. A full redraw of canvas might be better in onload.
                const currentCtx = canvasRef.current?.getContext('2d');
                if (currentCtx) { // Re-check context in case component unmounted
                    // Clear just the helicopter's previous area if needed, or redraw all (simpler for now)
                    // This onload might cause a flicker or draw over if not handled carefully with the game loop.
                    // The main game loop's draw useEffect should handle drawing the most current state.
                    currentCtx.drawImage(helicopterImg, helicopterDrawX, helicopterDrawY, helicopterDrawWidth, helicopterDrawHeight);
                }
            };
        }

        // Draw Buildings
        buildings.forEach(building => {
            ctx.fillStyle = BUILDING_COLOR;
            ctx.fillRect(building.x, building.y, building.width, building.height);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.strokeRect(building.x, building.y, building.width, building.height);
        });

        // Draw Oil Slicks
        oilSlicks.forEach(slick => {
            if (Date.now() < slick.activeUntil) {
                ctx.beginPath();
                ctx.arc(slick.x, slick.y, OIL_SLICK_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Dark, semi-transparent
                ctx.fill();
            }
        });

        // Draw Players
        players.forEach(player => {
            ctx.beginPath();
            ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
            if (player.caught) {
                // Draw Skull and Crossbones SVG
                const img = new Image();
                img.src = skullAndCrossbones;
                // Ensure the image is loaded before drawing, though for SVGs it might draw immediately
                // or you might need an onload handler for raster images.
                // For simplicity here, we'll try to draw directly.
                // Adjust size and position as needed.
                const svgSize = PLAYER_RADIUS * 3; // Example size, adjust as needed
                ctx.drawImage(img, player.x - svgSize / 2, player.y - svgSize / 2, svgSize, svgSize);

            } else if (player.safe) {
                ctx.fillStyle = 'lightgreen'; // Indicate safety
                ctx.fill();
                ctx.fillStyle = 'black';
                 ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('S', player.x, player.y + 4); // "S" for Safe
            } else {
                ctx.fillStyle = player.color;
                ctx.fill();
                if (player.isPlayer) {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
                 // Draw player's estimate number
                ctx.fillStyle = 'black';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(player.estimate, player.x, player.y + 4);
            }
        });

        // Draw Zombies
        zombies.forEach(zombie => {
            ctx.beginPath();
            ctx.arc(zombie.x, zombie.y, ZOMBIE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = '#7CFC00'; // Zombie green
            ctx.fill();
            ctx.strokeStyle = '#556B2F'; // Darker outline
            ctx.lineWidth = 1;
            ctx.stroke();
        });

    }, [players, zombies, oilSlicks, gameStarted, gameOver, buildings, helicopterPosition]); // Added helicopterPosition


    // UI Rendering
    if (players.length === 0 && !gameOver) { // Initial loading or no teams
        return <Paper elevation={2} sx={{ mt: 2, p: 3 }}><Typography variant="h5" align="center">{gameMessage}</Typography></Paper>;
    }
     if (gameOver && !players.some(p => p.safe || p.caught)) { // Should not happen if game ends correctly, but a fallback
        return <Paper elevation={2} sx={{ mt: 2, p: 3 }}><Alert severity="warning">{gameMessage}</Alert></Paper>;
    }

    return (
        <Paper elevation={2} sx={{ mt: 2, p: 2, backgroundColor: 'hsl(0, 0%, 95%)' }}>
            <Typography variant="h5" gutterBottom align="center" color="secondary">
                Zombie Escape! Reach the Helicopter!
            </Typography>
            <Grid container spacing={1} sx={{ mb: 1 }}>
                {players.map(player => (
                    <Grid item xs={12} sm={6} md={Math.max(2, 12 / Math.max(1, players.length))} key={player.id}>
                        <Paper sx={{p:1, backgroundColor: player.isPlayer ? '#e3f2fd' : 'white', border: `3px solid ${player.color}`}}>
                            <Typography variant="subtitle1" sx={{color: player.color, fontWeight: 'bold'}}>
                                Player: {player.name} (Vote: {player.estimate})
                            </Typography>
                            <Typography>
                                Status: {player.caught ? 'Caught!' : player.safe ? 'Safe!' : 
                                (Date.now() < player.slowedUntil ? 'Slowed!' : 'Running...')}
                            </Typography>
                            {player.isPlayer && !gameOver && gameStarted && !player.caught && !player.safe &&
                                <Typography variant="caption">
                                    (Controls: Arrows, Space for oil)
                                    {Date.now() < player.oilSlickCooldownEnds && ` Oil CD: ${Math.ceil((player.oilSlickCooldownEnds - Date.now())/1000)}s`}
                                </Typography>
                            }
                             <Typography variant="caption" display="block">Team: {player.teamMembers.join(', ')}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, backgroundColor:'#333333' }}>
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '2px solid black'}} />
            </Box>
            <Alert
                severity={gameOver ? (players.some(p=>p.safe) ? 'success' : 'error') : (gameStarted ? 'info' : 'warning')} // Adjusted severity for countdown
                sx={{mt:1}}
            >
                {/* {countdown > 0 && !gameStarted ? `Starting in ${countdown}...` : gameMessage} */}
                {/* Game message should now be primarily driven by server or local countdown updates */}
                 {gameMessage}
            </Alert>
            {gameOver && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <Button variant="contained" color="primary" onClick={resetGame}>
                        Restart Game ({officialWinningNumber})
                    </Button>
                </Box>
            )}
        </Paper>
    );
};

export default ZombieGame; 