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

const ZombieGame = ({ teams, onGameEnd, myName, winningNumber: officialWinningNumber, socket, roomCode }) => {
    const canvasRef = useRef(null);
    const countdownIntervalRef = useRef(null);

    // Game state - primarily driven by server
    const [players, setPlayers] = useState([]);
    const [zombies, setZombies] = useState([]);
    const [oilSlicks, setOilSlicks] = useState([]);
    const [gameMessage, setGameMessage] = useState('Waiting for server to start game...');
    const [gameOver, setGameOver] = useState(false);
    const [countdown, setCountdown] = useState(0); // Server will send initial countdown
    const [gameStarted, setGameStarted] = useState(false);
    const [buildings, setBuildings] = useState([]);
    const [helicopterPosition, setHelicopterPosition] = useState({ x: HELICOPTER_X, y: HELICOPTER_Y });
    const [isHelicopterAnimating, setIsHelicopterAnimating] = useState(false); // Server drives this

    // keysPressed ref might still be used for client-side input aggregation before sending to server if needed,
    // but direct emits on keydown are also fine. RacingGame uses it.
    const keysPressed = useRef({});

    const resetGame = useCallback(() => {
        // Clear client-side timers
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }

        if (socket && roomCode) {
            // Request server to reset the game for this room
            socket.emit('REQUEST_ZOMBIE_GAME_RESET', { roomCode, officialWinningNumber });
            setGameMessage('Requesting game reset...');
        } else {
            console.warn("Socket not available or no roomCode, cannot request game reset.");
            // Fallback to a very minimal local reset, server should ideally handle all.
            setGameMessage('Error: Cannot reset game. Try rejoining.');
            setGameOver(true);
        }
        // Client state will be overwritten by server's INITIAL_ZOMBIE_GAME_STATE or similar after reset.
    }, [socket, roomCode, officialWinningNumber]);

    // Initial setup useEffect: Primarily for setting up listeners. Game data comes from server.
    useEffect(() => {
        if (socket) {
            // Client ready, waiting for server to initiate game (e.g., via 'zombieGameStarted' or 'INITIAL_ZOMBIE_GAME_STATE')
            // PointingPoker.js now emits 'startZombieGame', server should respond.
            setGameMessage('Waiting for server to initialize Zombie Game...');
        } else {
            setGameMessage('Socket not connected. Cannot start Zombie Game.');
            setGameOver(true);
        }

        return () => {
            // Clean up local timers if any were started by this effect
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            // Socket listeners are cleaned up in their own dedicated useEffect.
        };
    }, [socket]); // Removed teams, myName dependencies, as server will provide player list

    // Countdown Logic - Based on server messages or initial countdown value
    useEffect(() => {
        if (countdown > 0 && !gameStarted && !gameOver) {
            setGameMessage(`Game starts in ${countdown}...`); // Message updated by server or local tick
            // If server sends continuous countdown updates, this interval is not needed.
            // If server sends initial countdown, client can tick it down for display.
            // RacingGame uses a client-side interval for display after getting initial countdown.
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); // Clear previous
            countdownIntervalRef.current = setInterval(() => {
                setCountdown(prevCount => {
                    const nextCount = prevCount - 1;
                    if (nextCount <= 0) {
                        clearInterval(countdownIntervalRef.current);
                        // setGameStarted(true); // Server should confirm game start
                        // setGameMessage('RUN! Survive!'); // Server can send this message
                        // Do not change gameStarted locally, wait for server confirmation.
                        return 0;
                    }
                    // setGameMessage(`Game starts in ${nextCount}...`); // Message can also be updated here
                    return nextCount;
                });
            }, 1000);
        } else if (countdown <= 0 && !gameStarted && !gameOver && players.length > 0) {
            // This case might be handled by a specific "game started" event from server.
            // For now, if countdown hits 0 locally, clear interval.
             if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        }
        
        return () => {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [gameStarted, gameOver, countdown]); // players and socket removed as countdown is server-driven or based on server initial value

    // Keyboard controls state
    const handleKeyDown = useCallback((e) => {
        if (gameOver || !gameStarted || !socket || !roomCode) return;

        const key = e.key.toLowerCase();
        // keysPressed.current[key] = true; // Can be used if server needs key up/down state continuously

        let actionType = null;
        let actionPayload = {};

        if (key === 'arrowup') { actionType = 'MOVE'; actionPayload = { direction: 'up' }; }
        else if (key === 'arrowdown') { actionType = 'MOVE'; actionPayload = { direction: 'down' }; }
        else if (key === 'arrowleft') { actionType = 'MOVE'; actionPayload = { direction: 'left' }; }
        else if (key === 'arrowright') { actionType = 'MOVE'; actionPayload = { direction: 'right' }; }
        else if (key === ' ') {
            actionType = 'DROP_OIL_SLICK';
            e.preventDefault(); // Prevent space from scrolling page
        }

        if (actionType) {
            socket.emit('ZOMBIE_GAME_PLAYER_ACTION', { roomCode, type: actionType, payload: actionPayload });
        }

        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
            e.preventDefault();
        }
    }, [gameOver, gameStarted, socket, roomCode]); // Added roomCode

    const handleKeyUp = useCallback((e) => {
        // const key = e.key.toLowerCase();
        // keysPressed.current[key] = false; 
        // Optional: send 'STOP_MOVE' or rely on server to handle lack of continuous 'MOVE' signals
        // For example, if server expects explicit stop:
        // let actionType = null;
        // let actionPayload = {};
        // if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        //    actionType = 'STOP_MOVE'; actionPayload = { direction: key.replace('arrow', '') };
        // }
        // if (actionType && socket && roomCode && gameStarted && !gameOver) {
        //     socket.emit('ZOMBIE_GAME_PLAYER_ACTION', { roomCode, type: actionType, payload: actionPayload });
        // }

        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
    }, [socket, roomCode, gameStarted, gameOver]); // Added roomCode, gameStarted, gameOver

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // WebSocket message handling
    useEffect(() => {
        if (!socket) return;

        // Renaming for clarity and specificity
        const handleInitialZombieGameState = (data) => {
            console.log('[ZombieGame] Received INITIAL_ZOMBIE_GAME_STATE raw data:', JSON.stringify(data, null, 2)); // Added log for raw data
            const processedPlayers = data.players?.map(p => ({...p, isPlayer: p.id === myName})) || [];
            console.log('[ZombieGame Client] Processed players state on initial load:', JSON.stringify(processedPlayers, null, 2)); // Added log for processed players
            setPlayers(processedPlayers);
            setZombies(data.zombies || []);
            setOilSlicks(data.oilSlicks || []);
            setBuildings(data.buildings || [ // Default buildings if server doesn't send
                { id: 'b1', x: 150, y: 100, width: 80, height: 120 },
                { id: 'b2', x: 400, y: 250, width: 120, height: 70 },
                { id: 'b3', x: 250, y: 350, width: 60, height: 60 },
                { id: 'b4', x: CANVAS_WIDTH - 200, y: 50, width: 70, height: 100},
            ]);
            setHelicopterPosition(data.helicopterPosition || { x: HELICOPTER_X, y: HELICOPTER_Y });
            setIsHelicopterAnimating(data.isHelicopterAnimating || false);
            setGameOver(data.gameOver || false);
            setGameStarted(data.gameStarted || false); // Server dictates if game is already started (e.g. rejoining)
            setCountdown(data.countdown !== undefined ? data.countdown : 0); // Set countdown from server
            setGameMessage(data.gameMessage || (data.countdown > 0 ? `Game starts in ${data.countdown}...` : 'Game active!'));
             if (data.gameStarted && data.countdown <=0) { // If game is started and no countdown
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                setGameMessage(data.gameMessage || 'RUN! Survive!');
            }
        };
        
        const handleZombieGameStateUpdate = (data) => {
            // console.log('[ZombieGame] Received ZOMBIE_GAME_STATE_UPDATE:', data);
            if (data.players) {
                const updatedPlayers = data.players.map(p => ({...p, isPlayer: p.id === myName}));
                // console.log('[ZombieGame Client] Processed players state on update:', JSON.stringify(updatedPlayers, null, 2)); // Optional log for updates
                setPlayers(updatedPlayers);
            }
            if (data.zombies) setZombies(data.zombies);
            if (data.oilSlicks) setOilSlicks(data.oilSlicks);
            if (data.helicopterPosition) setHelicopterPosition(data.helicopterPosition);
            if (typeof data.isHelicopterAnimating === 'boolean') setIsHelicopterAnimating(data.isHelicopterAnimating);
            if (data.buildings) setBuildings(data.buildings); // if buildings can change
             // Individual player updates (e.g. caught, safe) might come in full state or specific events
        };

        const handleZombieGameEvent = (event) => {
            console.log('[ZombieGame] Received ZOMBIE_GAME_EVENT:', event);
            // Example: Server sends specific smaller events if not covered by full state update
            // if (event.type === 'PLAYER_CAUGHT') {
            //     setPlayers(prev => prev.map(p => p.id === event.playerId ? { ...p, caught: true } : p));
            // }
            // if (event.type === 'PLAYER_SAFE') {
            //     setPlayers(prev => prev.map(p => p.id === event.playerId ? { ...p, safe: true } : p));
            // }
            // if (event.type === 'HELICOPTER_ANIMATION_START') {
            //     setIsHelicopterAnimating(true);
            // }
        };

        const handleZombieGameOver = (data) => {
            console.log('[ZombieGame] Received ZOMBIE_GAME_OVER:', data);
            setGameOver(true);
            setGameStarted(false); // Game is no longer "active" in the playing sense
            setGameMessage(data.message || 'Game Over!');
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            
            if (onGameEnd) {
                // Use the winningTeamVote from the server payload
                onGameEnd(data.winningTeamVote || null); 
            }
        };
        
        const handleZombieGameMessage = (message) => {
            setGameMessage(message);
        };

        const handleZombieCountdownUpdate = (newCountdown) => {
            setCountdown(newCountdown);
            if (newCountdown > 0) {
                setGameStarted(false); 
                setGameMessage(`Game starts in ${newCountdown}...`);
            } else if (newCountdown === 0 && !gameStarted) {
                // If countdown hits zero via this event, server should soon send a GAME_STARTED_EVENT
                // or include gameStarted:true in the next state update.
                 // setGameMessage('Get Ready!'); // Or let GAME_STARTED_EVENT handle this
            }
        };

        const handleZombieGameStartedEvent = (data) => {
            console.log('[ZombieGame] Received ZOMBIE_GAME_STARTED_EVENT:', data);
            setGameStarted(true);
            setCountdown(0); 
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setGameMessage(data.message || 'RUN! Survive!');
            // Server might send initial entities if not covered by INITIAL_ZOMBIE_GAME_STATE
            if (data.initialState) {
                handleInitialZombieGameState(data.initialState);
            }
        };
        
        // Register listeners with game-specific event names
        socket.on('INITIAL_ZOMBIE_GAME_STATE', handleInitialZombieGameState);
        socket.on('ZOMBIE_GAME_STATE_UPDATE', handleZombieGameStateUpdate);
        socket.on('ZOMBIE_GAME_EVENT', handleZombieGameEvent); 
        socket.on('ZOMBIE_GAME_OVER', handleZombieGameOver);
        socket.on('ZOMBIE_GAME_MESSAGE', handleZombieGameMessage); 
        socket.on('ZOMBIE_COUNTDOWN_UPDATE', handleZombieCountdownUpdate);
        socket.on('ZOMBIE_GAME_STARTED_EVENT', handleZombieGameStartedEvent); 

        // When component mounts and socket is ready, if this client joined an ongoing game or is starting one,
        // it might need to signal readiness or the server might just send INITIAL_ZOMBIE_GAME_STATE
        // based on the 'startZombieGame' event from PointingPoker.
        // For example, server handles 'startZombieGame', sets up state, then broadcasts 'INITIAL_ZOMBIE_GAME_STATE'.

        return () => {
            // Clean up listeners
            socket.off('INITIAL_ZOMBIE_GAME_STATE', handleInitialZombieGameState);
            socket.off('ZOMBIE_GAME_STATE_UPDATE', handleZombieGameStateUpdate);
            socket.off('ZOMBIE_GAME_EVENT', handleZombieGameEvent);
            socket.off('ZOMBIE_GAME_OVER', handleZombieGameOver);
            socket.off('ZOMBIE_GAME_MESSAGE', handleZombieGameMessage);
            socket.off('ZOMBIE_COUNTDOWN_UPDATE', handleZombieCountdownUpdate);
            socket.off('ZOMBIE_GAME_STARTED_EVENT', handleZombieGameStartedEvent);
        };
    }, [socket, onGameEnd, myName, roomCode]); // Added roomCode, myName. onGameEnd might be needed.

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
        const helicopterDrawY = helicopterPosition.y - helicopterDrawHeight / 2 - 30;

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

    }, [players, zombies, oilSlicks, gameStarted, gameOver, buildings, helicopterPosition, isHelicopterAnimating]); // Added isHelicopterAnimating, helicopterPosition might be dynamic from server

    // UI Rendering
    if (!socket || (players.length === 0 && !gameStarted && !gameOver && !gameMessage.toLowerCase().includes("waiting for server"))) { 
        // Adjusted loading condition slightly
        return <Paper elevation={2} sx={{ mt: 2, p: 3 }}><Typography variant="h5" align="center">{gameMessage || 'Loading Zombie Game...'}</Typography></Paper>;
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
                                (player.slowedUntil && Date.now() < player.slowedUntil ? 'Slowed!' : (gameStarted ? 'Running...' : 'Waiting...'))}
                            </Typography>
                            {player.isPlayer && !gameOver && gameStarted && !player.caught && !player.safe &&
                                <Typography variant="caption">
                                    (Controls: Arrows, Space for oil)
                                    {player.oilSlickCooldownEnds && Date.now() < player.oilSlickCooldownEnds && ` Oil CD: ${Math.ceil((player.oilSlickCooldownEnds - Date.now())/1000)}s`}
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
                severity={gameOver ? (players.some(p=>p.safe) ? 'success' : 'error') : (gameStarted ? 'info' : (countdown > 0 ? 'warning' : 'info'))} // Adjusted severity for countdown/waiting
                sx={{mt:1}}
            >
                 {gameMessage}
            </Alert>
            {gameOver && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <Button variant="contained" color="primary" onClick={resetGame}>
                        Restart Game ({officialWinningNumber || 'New Round'})
                    </Button>
                </Box>
            )}
        </Paper>
    );
};

export default ZombieGame; 