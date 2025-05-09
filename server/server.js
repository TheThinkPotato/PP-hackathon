const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const port = process.env.PORT || 4001;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Adjust this to your React app's URL
    methods: ["GET", "POST"]
  }
});

// --- BEGIN RACING GAME CONSTANTS ---
const CANVAS_WIDTH = 800; // Used for reference, not for drawing on server
const CANVAS_HEIGHT = 600;
const CAR_WIDTH = 18;
const CAR_HEIGHT = 30;
const WINNING_LAPS = 3;
const COUNTDOWN_SECONDS = 3; // Server can manage its own countdown timing

const TRACK_PADDING = 70;
const TRACK_LANE_WIDTH = 80;
const CORNER_RADIUS_OUTER = TRACK_LANE_WIDTH;

const trackOuterPoints = { // For starting positions and boundary logic
    TL: { x: TRACK_PADDING, y: TRACK_PADDING },
    TR: { x: CANVAS_WIDTH - TRACK_PADDING, y: TRACK_PADDING },
    BR: { x: CANVAS_WIDTH - TRACK_PADDING, y: CANVAS_HEIGHT - TRACK_PADDING },
    BL: { x: TRACK_PADDING, y: CANVAS_HEIGHT - TRACK_PADDING },
};

const R_center = CORNER_RADIUS_OUTER - TRACK_LANE_WIDTH / 2;
// Simplified waypoints for server logic if needed, or use client's waypoints if passed
const serverTrackPathWaypoints = [
    { x: trackOuterPoints.BL.x + R_center, y: trackOuterPoints.BL.y - R_center }, 
    { x: trackOuterPoints.BR.x - R_center, y: trackOuterPoints.BR.y - R_center }, 
    { x: trackOuterPoints.BR.x - R_center, y: trackOuterPoints.TR.y + R_center }, 
    { x: trackOuterPoints.TR.x - R_center, y: trackOuterPoints.TR.y + R_center }, 
    { x: trackOuterPoints.TL.x + R_center, y: trackOuterPoints.TL.y + R_center }, 
    { x: trackOuterPoints.TL.x + R_center, y: trackOuterPoints.BL.y - R_center }, 
];

const FINISH_LINE_Y_CENTER = serverTrackPathWaypoints[0].y; // Approximate
const FINISH_LINE_X_START = serverTrackPathWaypoints[0].x + CAR_WIDTH * 2;
const FINISH_LINE_X_END = FINISH_LINE_X_START + 100;


const carColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F1C40F', '#1ABC9C', '#9B59B6', '#34495E'];

// Physics constants for server simulation
const MAX_SPEED = 4;
const ACCEL = 200;
const DECEL_FRICTION = 100;
const TURN_RATE = 3.5;
const SERVER_TICK_RATE = 1000 / 30; // roughly 30 FPS

// --- BEGIN PONG GAME CONSTANTS ---
const PONG_CANVAS_WIDTH = 600;
const PONG_CANVAS_HEIGHT = 400;
const PONG_PADDLE_WIDTH = 10;
const PONG_PADDLE_HEIGHT = 80;
const PONG_BALL_RADIUS = 7;
const PONG_INITIAL_BALL_SPEED_X = 2.5;
const PONG_INITIAL_BALL_SPEED_Y = 2.5;
const PONG_PADDLE_SPEED = 5; // Simplified: units per tick or needs deltaTime
const PONG_WINNING_SCORE = 5;
const PONG_COUNTDOWN_SECONDS = 3;
// --- END PONG GAME CONSTANTS ---

// --- BEGIN ZOMBIE GAME CONSTANTS ---
const ZOMBIE_CANVAS_WIDTH = 700;
const ZOMBIE_CANVAS_HEIGHT = 500;
const ZOMBIE_PLAYER_RADIUS = 10;
const ZOMBIE_ZOMBIE_RADIUS = 8;
const ZOMBIE_HELICOPTER_X = ZOMBIE_CANVAS_WIDTH - 60;
const ZOMBIE_HELICOPTER_Y = ZOMBIE_CANVAS_HEIGHT / 2;
const ZOMBIE_HELICOPTER_WIDTH = 50; // For area check
const ZOMBIE_HELICOPTER_HEIGHT = 80; // For area check
const ZOMBIE_OIL_SLICK_RADIUS = 15;
const ZOMBIE_OIL_SLICK_DURATION = 5000; // 5 seconds
const ZOMBIE_OIL_SLICK_COOLDOWN = 10000; // 10 seconds
const ZOMBIE_MAX_PLAYER_OIL_SLICKS = 3;
const ZOMBIE_COUNTDOWN_SECONDS_INIT = 5; // Initial countdown for the game
const ZOMBIE_PLAYER_SPEED = 2;
const ZOMBIE_DEFAULT_SPEED = 0.75; // Average zombie speed
const ZOMBIE_SLOW_DURATION = 2000; // 2 seconds
const ZOMBIE_SLOW_FACTOR = 0.4;

const ZOMBIE_HELICOPTER_ANIMATION_SPEED = 1.5;
const ZOMBIE_HELICOPTER_ANIMATION_TARGET_X = ZOMBIE_CANVAS_WIDTH / 2;
const ZOMBIE_HELICOPTER_ANIMATION_TARGET_Y = -ZOMBIE_HELICOPTER_HEIGHT * 2;


const ZOMBIE_DEFAULT_BUILDINGS = [
    { id: 'b1', x: 150, y: 100, width: 80, height: 120 },
    { id: 'b2', x: 400, y: 250, width: 120, height: 70 },
    { id: 'b3', x: 250, y: 350, width: 60, height: 60 },
    { id: 'b4', x: ZOMBIE_CANVAS_WIDTH - 200, y: 50, width: 70, height: 100},
];

const ZOMBIE_PLAYER_COLORS = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F1C40F', '#1ABC9C', '#FFBF00', '#FF7F50'];
const ZOMBIE_SERVER_TICK_RATE = 1000 / 30; // Approx 30 FPS for game logic

// --- END ZOMBIE GAME CONSTANTS ---

// Function to check collision between a circular character and a rectangular building (server-side)
function checkZombieCollisionWithBuilding(character, building, radius) {
    const closestX = Math.max(building.x, Math.min(character.x, building.x + building.width));
    const closestY = Math.max(building.y, Math.min(character.y, building.y + building.height));
    const distanceX = character.x - closestX;
    const distanceY = character.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
    return distanceSquared < (radius * radius);
}

// Function to check if a point is on track (can be adapted from client-side if complex, or simplified)
// For now, we might simplify server-side boundary checks or assume client handles it before sending invalid states
const isPointOnTrackSurfaceServer = (px, py) => {
    // Simplified boundary check for server-side (example, can be more robust)
    // This is a placeholder and should ideally match the client's track boundaries.
    // A more robust solution would involve using the same path logic as the client or a simplified polygon collision.
    if (px < TRACK_PADDING - CAR_WIDTH || px > CANVAS_WIDTH - TRACK_PADDING + CAR_WIDTH || 
        py < TRACK_PADDING - CAR_HEIGHT || py > CANVAS_HEIGHT - TRACK_PADDING + CAR_HEIGHT) {
        // Very basic outer box check, not accurate for corners or inner hole
        // For a real game, this needs to be as accurate as the client's `isPointOnTrackSurface`
        return false; 
    }
    // This is a very naive check. A better approach would be to replicate the client's segment-based check
    // or use a library for polygon checks if the track shape is complex.
    // For initial sync, we rely on client rendering what server sends.
    // If server calculates off-track, it will penalize/correct.
    return true; // Placeholder: always on track for now on server to avoid complex server geometry
};


// --- END RACING GAME CONSTANTS ---

// Store states for multiple rooms
// rooms = { 
//   roomCode: { 
//     users: { socketId: { name, vote } }, 
//     votesByName: { userName: vote }, 
//     itemVotes: { item_1: { votes: { userName: vote }, winningNumber: number } },
//     revealed, 
//     winningNumber, 
//     currentRound, 
//     adminSocketId 
//   } 
// }
const rooms = {};

function generateRoomCode() {
  let code = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 5; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  // Ensure uniqueness, though highly unlikely for a 5-char code to collide in small scale
  if (rooms[code]) return generateRoomCode();
  return code;
}

function getRoomFromSocket(socket) {
    const roomCode = Array.from(socket.rooms)[1]; // socket.rooms[0] is the socket's own ID
    return roomCode && rooms[roomCode] ? { roomCode, room: rooms[roomCode] } : null;
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('createRoom', ({ userName }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      users: {},
      votesByName: {},
      itemVotes: {},
      revealed: false,
      winningNumber: null,
      currentRound: 1,
      adminSocketId: socket.id,
      racingGameState: { // Initialize racing game state
        isActive: false,
        cars: [],
        gameLoopIntervalId: null,
        pendingInputs: {} // { carId: { ArrowUp: false, ArrowLeft: false, ArrowRight: false } }
      },
      pongGameState: { // Initialize Pong game state
        isActive: false,
        ball: { x: PONG_CANVAS_WIDTH / 2, y: PONG_CANVAS_HEIGHT / 2, dx: 0, dy: 0 },
        paddles: {
            // teamA and teamB will be populated with { y, score, playerId, vote, name, keysPressed: {up: false, down: false} }
        },
        players: { teamA: null, teamB: null }, // Stores {playerId, name, vote} for who is playing
        gameLoopIntervalId: null,
        countdown: 0
      },
      zombieGameState: { // Initialize Zombie game state
        isActive: false,
        gameStarted: false,
        gameOver: false,
        countdown: 0,
        players: [], // { id, name (socketId for now, could be userName), x, y, color, caught, safe, oilSlickCooldownEnds, lastOilSlickTime, slowedUntil, teamVote, teamMembers }
        zombies: [], // { id, x, y, speed, slowedUntil }
        oilSlicks: [], // { x, y, placedBy (playerId), activeUntil }
        buildings: [...ZOMBIE_DEFAULT_BUILDINGS], // Copy default buildings
        helicopterPosition: { x: ZOMBIE_HELICOPTER_X, y: ZOMBIE_HELICOPTER_Y },
        isHelicopterAnimating: false,
        gameMessage: '',
        gameLoopIntervalId: null,
        pendingActions: {} // { playerId: [{type, payload}, ...] }
      }
    };
    rooms[roomCode].users[socket.id] = { name: userName };
    socket.join(roomCode);
    console.log(`User ${userName} (${socket.id}) created and joined room ${roomCode}`);
    socket.emit('roomCreated', { roomCode, roomState: rooms[roomCode], userName });
    io.to(roomCode).emit('playerListUpdate', Object.values(rooms[roomCode].users).map(u => u.name));
  });

  socket.on('joinRoom', ({ roomCode, userName }) => {
    const room = rooms[roomCode];
    if (room) {
      if (Object.values(room.users).find(user => user.name === userName)) {
        socket.emit('joinError', { message: `Username "${userName}" is already taken in this room.` });
        return;
      }
      socket.join(roomCode);
      room.users[socket.id] = { name: userName };
      console.log(`User ${userName} (${socket.id}) joined room ${roomCode}`);
      socket.emit('roomJoined', { roomCode, roomState: room, userName });
      io.to(roomCode).emit('playerListUpdate', Object.values(room.users).map(u => u.name));
      socket.emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
      if (room.winningNumber) {
        socket.emit('roundResults', { teams: calculateTeams(room.votesByName), winningNumber: room.winningNumber });
      }
    } else {
      socket.emit('joinError', { message: 'Room not found.' });
    }
  });

  socket.on('vote', ({ roomCode, userName, vote, itemId }) => {
    const room = rooms[roomCode];
    if (room && room.users[socket.id] && room.users[socket.id].name === userName && !room.revealed && !room.racingGameState.isActive && !room.pongGameState.isActive && !room.zombieGameState.isActive) {
      console.log(`Vote in room ${roomCode} from ${userName}: ${vote}`);
      room.users[socket.id].vote = vote;
      room.votesByName[userName] = vote;
      io.to(roomCode).emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
    } else if (room && room.revealed) {
      console.log(`Vote received after reveal in room ${roomCode} from ${userName}, ignoring.`);
    }
  });

  socket.on('showVotes', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && !room.racingGameState.isActive && !room.pongGameState.isActive && !room.zombieGameState.isActive) {
      console.log(`Show votes requested for room ${roomCode}`);
      room.revealed = true;
      io.to(roomCode).emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
    }
  });

  socket.on('startRacingGame', ({ roomCode, teams }) => { // teams is { voteValue: [playerName1, playerName2,...] }
    const room = rooms[roomCode];
    if (!room || room.racingGameState.isActive) {
        console.log(`Race already active or room ${roomCode} not found.`);
        return;
    }
    console.log(`Starting racing game in room ${roomCode}`);
    room.racingGameState.isActive = true;
    room.racingGameState.cars = [];
    room.racingGameState.pendingInputs = {};

    let carIndex = 0;
    for (const vote in teams) {
        if (teams[vote] && teams[vote].length > 0) {
            const driverName = teams[vote][0]; // First player of the team is the driver
            const carId = vote; // Use vote as car ID for simplicity, ensure unique

            room.racingGameState.cars.push({
                id: carId,
                name: driverName, // Driver's name
                teamVote: vote,
                x: serverTrackPathWaypoints[0].x + 50 + (carIndex * (CAR_WIDTH + 25)),
                y: serverTrackPathWaypoints[0].y + (carIndex % 2 === 0 ? -TRACK_LANE_WIDTH / 4.5 : TRACK_LANE_WIDTH / 4.5),
                angle: 0,
                speed: 0,
                lap: 0,
                isPlayer: false, // Server doesn't differentiate 'isPlayer' in its state, client does
                color: carColors[carIndex % carColors.length],
                justCrossedFinishLine: true,
                currentCheckpoint: 0,
                // Server specific state for inputs
                keysPressed: { ArrowUp: false, ArrowLeft: false, ArrowRight: false } 
            });
            room.racingGameState.pendingInputs[carId] = { ArrowUp: false, ArrowLeft: false, ArrowRight: false };
            carIndex++;
        }
    }
    
    // Notify clients that game is starting (includes initial car setup)
    io.to(roomCode).emit('racingGameStarted', { cars: room.racingGameState.cars, countdown: COUNTDOWN_SECONDS });

    // Start server-side game loop
    if (room.racingGameState.gameLoopIntervalId) {
      clearInterval(room.racingGameState.gameLoopIntervalId);
    }
    room.racingGameState.gameLoopIntervalId = setInterval(() => {
        if (!room.racingGameState.isActive) {
            clearInterval(room.racingGameState.gameLoopIntervalId);
            room.racingGameState.gameLoopIntervalId = null;
            return;
        }
        
        // --- Main Game Logic Tick (to be filled in next step) ---
        // 1. Apply inputs from room.racingGameState.pendingInputs to car.keysPressed
        // 2. Update physics for each car (speed, angle, position) based on car.keysPressed and deltaTime
        // 3. Boundary checks / Off-track penalties
        // 4. Lap counting
        // 5. Winner check
        // 6. Emit updated state
        
        // For now, just log and emit current state
        // console.log(`Game tick for room ${roomCode}`); 
        
        const now = Date.now();
        // Simulate deltaTime (simplified, ideally performance.now() or process.hrtime for more accuracy if available and needed)
        const deltaTime = (now - (room.racingGameState.lastTickTime || now)) / 1000 || (1 / 30); // seconds
        room.racingGameState.lastTickTime = now;

        let winnerFoundInTick = false; // Flag to stop processing after a winner
        for (const car of room.racingGameState.cars) {
            if (winnerFoundInTick) break; // If winner found in this tick by a previous car, stop processing others

            // Apply pending inputs (simplified: just copy over, could be more complex like queues)
            if(room.racingGameState.pendingInputs[car.id]) {
                car.keysPressed = { ...room.racingGameState.pendingInputs[car.id] }; 
                // Reset pending inputs for this car for this tick if they are processed once per tick
                // Or, if they represent continuous press, client needs to send keyUp too.
                // For now, assume client sends true/false state for keys.
            }

            let { x, y, angle, speed, lap, currentCheckpoint } = car;
            const carInputs = car.keysPressed;

            // --- Basic Physics (copied and adapted from client, will need refinement) ---
            if (carInputs['ArrowUp']) {
                speed = Math.min(MAX_SPEED, speed + ACCEL * deltaTime);
            } else {
                speed = Math.max(0, speed - DECEL_FRICTION * deltaTime);
            }
            if (speed > 0.1) {
                if (carInputs['ArrowLeft']) {
                    angle -= TURN_RATE * (speed / MAX_SPEED) * deltaTime;
                }
                if (carInputs['ArrowRight']) {
                    angle += TURN_RATE * (speed / MAX_SPEED) * deltaTime;
                }
            }
            
            const prevX = x; const prevY = y;
            // The arbitrary '60' scalar was from client; if speed is units/sec, 60*dt is units per 60*dt seconds.
            // If ACCEL is units/sec^2, speed is units/sec. Then new_pos = old_pos + speed * dt.
            // Let's remove the arbitrary 60 for now and adjust MAX_SPEED/ACCEL if movement is too slow/fast.
            x += Math.cos(angle) * speed * deltaTime * 50; // Multiplied by 50 as a placeholder scaling factor, adjust as needed
            y += Math.sin(angle) * speed * deltaTime * 50; // Multiplied by 50 as a placeholder scaling factor, adjust as needed

            // Server-side track boundary (very basic, placeholder)
            if (!isPointOnTrackSurfaceServer(x,y)) {
                x = prevX; y = prevY; speed *= 0.5; // Penalty
            }

            // Server-side lap counting (simplified, needs proper checkpoints)
            const atFinishLineZoneServer = (x > FINISH_LINE_X_START && x < FINISH_LINE_X_END && y > FINISH_LINE_Y_CENTER - TRACK_LANE_WIDTH/2 && y < FINISH_LINE_Y_CENTER + TRACK_LANE_WIDTH/2);
            // This needs the same multi-checkpoint logic as the client.
            // For now, very simple lap increment.
            if (currentCheckpoint === 0 && x > serverTrackPathWaypoints[1].x - R_center && y > serverTrackPathWaypoints[1].y - R_center*2) currentCheckpoint = 1;
            // ... (add other checkpoints similar to client) ...
            else if (currentCheckpoint === 1 /* && other conditions */ && atFinishLineZoneServer /* && correct direction */ ) {
                 if (!car.justCrossedFinishLine) {
                    lap++;
                    car.justCrossedFinishLine = true;
                    currentCheckpoint = 0; // Reset for next lap
                    console.log(`Car ${car.name} completed lap ${lap} in room ${roomCode}`);
                 }
            }
            if (car.justCrossedFinishLine && currentCheckpoint !== 0 /* and not near finish again */) {
                 car.justCrossedFinishLine = false;
            }


            // Update car object
            car.x = x; car.y = y; car.angle = angle; car.speed = speed; car.lap = lap; car.currentCheckpoint = currentCheckpoint;

            // Check for winner
            if (car.lap >= WINNING_LAPS && room.racingGameState.isActive) { // Check isActive again in case of simultaneous finish
                console.log(`Car ${car.name} wins in room ${roomCode}!`);
                room.winningNumber = car.teamVote; // The original poker vote of the winning team
                room.racingGameState.isActive = false; // Stop the game
                
                const teamsForResults = calculateTeams(room.votesByName); // Get current teams based on votes
                io.to(roomCode).emit('roundResults', { teams: teamsForResults, winningNumber: room.winningNumber });
                
                winnerFoundInTick = true; // Set flag
                // The loop will break at the start of the next iteration or naturally end
                // The main interval clear logic will handle stopping the game loop
            }
        }
        if (winnerFoundInTick || !room.racingGameState.isActive) { // Check flag or if isActive was set false elsewhere
             clearInterval(room.racingGameState.gameLoopIntervalId);
             room.racingGameState.gameLoopIntervalId = null;
             // Reset parts of racingGameState for next potential race, or do this in requestNextRound
             room.racingGameState.cars = [];
             room.racingGameState.pendingInputs = {};
             return;
        }

        io.to(roomCode).emit('racingGameStateUpdate', { cars: room.racingGameState.cars });

    }, SERVER_TICK_RATE); // Server tick rate

  });

  socket.on('playerRacingInput', ({ roomCode, carId, inputKey, pressed }) => {
    const room = rooms[roomCode];
    if (room && room.racingGameState.isActive && room.racingGameState.pendingInputs[carId]) {
        // Store the latest state of the key press.
        // The game loop will consume this.
        room.racingGameState.pendingInputs[carId][inputKey] = pressed;
        // console.log(`Input from ${socket.id} for car ${carId} in room ${roomCode}: ${inputKey} = ${pressed}`);
    }
  });

  socket.on('startPongGame', ({ roomCode, teams }) => {
    const room = rooms[roomCode];
    if (!room || room.pongGameState.isActive || Object.keys(teams).length !== 2) {
        console.log(`Pong game already active, room ${roomCode} not found, or incorrect team count.`);
        return;
    }
    console.log(`Starting Pong game in room ${roomCode}`);
    room.pongGameState.isActive = true;
    room.pongGameState.ball = { x: PONG_CANVAS_WIDTH / 2, y: PONG_CANVAS_HEIGHT / 2, dx: 0, dy: 0 };
    room.pongGameState.countdown = PONG_COUNTDOWN_SECONDS;

    const teamKeys = Object.keys(teams);
    const teamAData = { vote: teamKeys[0], players: teams[teamKeys[0]] };
    const teamBData = { vote: teamKeys[1], players: teams[teamKeys[1]] };

    const p1DriverName = teamAData.players[0];
    const p2DriverName = teamBData.players[0];
    
    // Find playerIds (socketIds) for the drivers if possible, or rely on names
    // This part might need adjustment based on how you want to map players to paddles (name vs socketId)
    let p1SocketId = null, p2SocketId = null;
    for(const socketId in room.users){
        if(room.users[socketId].name === p1DriverName) p1SocketId = socketId;
        if(room.users[socketId].name === p2DriverName) p2SocketId = socketId;
    }

    room.pongGameState.paddles = {
        teamA: {
            y: PONG_CANVAS_HEIGHT / 2 - PONG_PADDLE_HEIGHT / 2, score: 0,
            playerId: p1SocketId || p1DriverName, // Store identifier
            name: p1DriverName,
            vote: teamAData.vote,
            keysPressed: { up: false, down: false }
        },
        teamB: {
            y: PONG_CANVAS_HEIGHT / 2 - PONG_PADDLE_HEIGHT / 2, score: 0,
            playerId: p2SocketId || p2DriverName, // Store identifier
            name: p2DriverName,
            vote: teamBData.vote,
            keysPressed: { up: false, down: false }
        }
    };
    // Store who is playing for easier reference if needed
    room.pongGameState.players = { teamA: { name: p1DriverName, vote: teamAData.vote }, teamB: {name: p2DriverName, vote: teamBData.vote}};

    const getClientSafePongState = (currentPongState) => {
        if (!currentPongState) return null;
        return {
            isActive: currentPongState.isActive,
            ball: currentPongState.ball,
            paddles: currentPongState.paddles, // Assuming paddles and its nested keysPressed are plain data
            players: currentPongState.players, // Assuming this is plain data
            countdown: currentPongState.countdown,
            // Explicitly exclude gameLoopIntervalId and any other server-internal properties
        };
    };

    io.to(roomCode).emit('pongGameStarted', { pongGameState: getClientSafePongState(room.pongGameState) });

    if (room.pongGameState.gameLoopIntervalId) clearInterval(room.pongGameState.gameLoopIntervalId);

    let countdownRemaining = PONG_COUNTDOWN_SECONDS;
    const countdownInterval = setInterval(() => {
        countdownRemaining--;
        io.to(roomCode).emit('pongCountdownUpdate', { countdown: countdownRemaining });
        if (countdownRemaining <= 0) {
            clearInterval(countdownInterval);
            room.pongGameState.ball.dx = Math.random() > 0.5 ? PONG_INITIAL_BALL_SPEED_X : -PONG_INITIAL_BALL_SPEED_X;
            room.pongGameState.ball.dy = Math.random() > 0.5 ? PONG_INITIAL_BALL_SPEED_Y : -PONG_INITIAL_BALL_SPEED_Y;
            io.to(roomCode).emit('pongGameUpdate', { pongGameState: getClientSafePongState(room.pongGameState) }); // Send initial ball speed
        }
    }, 1000);

    room.pongGameState.gameLoopIntervalId = setInterval(() => {
        if (!room.pongGameState.isActive || countdownRemaining > 0) {
             // Do not run game logic if not active or countdown is still running
            if (!room.pongGameState.isActive) { // If game became inactive, clear interval
                clearInterval(room.pongGameState.gameLoopIntervalId);
                room.pongGameState.gameLoopIntervalId = null;
            }
            return;
        }

        const { ball, paddles } = room.pongGameState;
        const paddleA = paddles.teamA;
        const paddleB = paddles.teamB;

        // Paddle movement - Simplified: move by fixed amount per tick if key pressed
        if (paddleA.keysPressed.up) paddleA.y = Math.max(0, paddleA.y - PONG_PADDLE_SPEED);
        if (paddleA.keysPressed.down) paddleA.y = Math.min(PONG_CANVAS_HEIGHT - PONG_PADDLE_HEIGHT, paddleA.y + PONG_PADDLE_SPEED);
        if (paddleB.keysPressed.up) paddleB.y = Math.max(0, paddleB.y - PONG_PADDLE_SPEED);
        if (paddleB.keysPressed.down) paddleB.y = Math.min(PONG_CANVAS_HEIGHT - PONG_PADDLE_HEIGHT, paddleB.y + PONG_PADDLE_SPEED);

        // Ball movement
        ball.x += ball.dx;
        ball.y += ball.dy;

        // Ball collision with top/bottom walls
        if (ball.y + PONG_BALL_RADIUS > PONG_CANVAS_HEIGHT || ball.y - PONG_BALL_RADIUS < 0) {
            ball.dy = -ball.dy;
        }

        // Ball collision with paddles
        // Paddle A (left)
        if (ball.dx < 0 && ball.x - PONG_BALL_RADIUS < PONG_PADDLE_WIDTH && ball.x - PONG_BALL_RADIUS > 0 &&
            ball.y > paddleA.y && ball.y < paddleA.y + PONG_PADDLE_HEIGHT) {
            ball.dx = -ball.dx * 1.05; // Increase speed slightly
            ball.x = PONG_PADDLE_WIDTH + PONG_BALL_RADIUS; // Ensure ball is outside paddle
        }
        // Paddle B (right)
        else if (ball.dx > 0 && ball.x + PONG_BALL_RADIUS > PONG_CANVAS_WIDTH - PONG_PADDLE_WIDTH && ball.x + PONG_BALL_RADIUS < PONG_CANVAS_WIDTH &&
            ball.y > paddleB.y && ball.y < paddleB.y + PONG_PADDLE_HEIGHT) {
            ball.dx = -ball.dx * 1.05;
            ball.x = PONG_CANVAS_WIDTH - PONG_PADDLE_WIDTH - PONG_BALL_RADIUS;
        }

        // Scoring
        let scored = false;
        if (ball.x - PONG_BALL_RADIUS < 0) { // Player B (paddleA is left) scores
            paddleB.score++;
            scored = true;
        } else if (ball.x + PONG_BALL_RADIUS > PONG_CANVAS_WIDTH) { // Player A (paddleB is right) scores
            paddleA.score++;
            scored = true;
        }

        if (scored) {
            ball.x = PONG_CANVAS_WIDTH / 2;
            ball.y = PONG_CANVAS_HEIGHT / 2;
            ball.dx = (paddleA.score > paddleB.score ? -1 : 1) * PONG_INITIAL_BALL_SPEED_X; // Serve to losing side or random
            ball.dy = Math.random() > 0.5 ? PONG_INITIAL_BALL_SPEED_Y : -PONG_INITIAL_BALL_SPEED_Y;
        }

        // Check for winner
        let winnerVote = null;
        if (paddleA.score >= PONG_WINNING_SCORE) winnerVote = paddleA.vote;
        if (paddleB.score >= PONG_WINNING_SCORE) winnerVote = paddleB.vote;

        if (winnerVote) {
            room.winningNumber = winnerVote;
            room.pongGameState.isActive = false; // Stop the game
            // clearInterval handled at top of next interval or when isActive becomes false
            const teamsForResults = calculateTeams(room.votesByName);
            io.to(roomCode).emit('roundResults', { teams: teamsForResults, winningNumber: room.winningNumber });
        }
        
        io.to(roomCode).emit('pongGameUpdate', { pongGameState: getClientSafePongState(room.pongGameState) });

    }, SERVER_TICK_RATE);
  });

  socket.on('playerPongInput', ({ roomCode, paddleKey, // e.g. 'teamA' or 'teamB'
                                   inputAction, // e.g. 'up' or 'down'
                                   pressed }) => {
    const room = rooms[roomCode];
    if (room && room.pongGameState.isActive && room.pongGameState.paddles[paddleKey]) {
        // Ensure the socket sending this is the one controlling the paddle
        const currentSocketId = socket.id;
        const actualPlayerId = room.pongGameState.paddles[paddleKey].playerId;
        
        // If playerId is socketId, compare directly. If it's a name, find corresponding socketId.
        let isAuthorized = false;
        if (actualPlayerId === currentSocketId) {
            isAuthorized = true;
        } else if (room.users[currentSocketId] && room.users[currentSocketId].name === actualPlayerId) {
             isAuthorized = true; // If stored playerId was a name and matches sender's name
        }

        if(isAuthorized){
            room.pongGameState.paddles[paddleKey].keysPressed[inputAction] = pressed;
        } else {
            console.log(`Unauthorized pong input from ${socket.id} for paddle ${paddleKey}`);
        }
    }
  });

  socket.on('startZombieGame', ({ roomCode, teams }) => {
    const room = rooms[roomCode];
    if (!room) {
      console.error(`[ZombieGame] Room ${roomCode} not found for starting game.`);
      return;
    }
    if (room.zombieGameState.isActive) {
      console.log(`[ZombieGame] Game already active in room ${roomCode}.`);
      // Optionally, send current state to new joiner or ignore if only one instance allowed
      return;
    }

    console.log(`[ZombieGame] Starting game in room ${roomCode} with teams:`, teams);
    const gameState = room.zombieGameState;
    gameState.isActive = true;
    gameState.gameStarted = false;
    gameState.gameOver = false;
    gameState.countdown = ZOMBIE_COUNTDOWN_SECONDS_INIT;
    gameState.players = [];
    gameState.zombies = [];
    gameState.oilSlicks = [];
    gameState.buildings = [...ZOMBIE_DEFAULT_BUILDINGS]; // Fresh set of buildings
    gameState.helicopterPosition = { x: ZOMBIE_HELICOPTER_X, y: ZOMBIE_HELICOPTER_Y };
    gameState.isHelicopterAnimating = false;
    gameState.gameMessage = `Game starting in ${gameState.countdown}...`;
    gameState.pendingActions = {};

    let playerIndex = 0;
    // Populate players based on teams from PointingPoker
    // teams is like: { "voteValue1": ["playerNameA", "playerNameB"], "voteValue2": ["playerNameC"] }
    for (const teamVote in teams) {
      const teamMembers = teams[teamVote];
      teamMembers.forEach(playerName => {
        // Find the user's socket ID (more robust than just name if names can collide or players reconnect)
        const userSocketEntry = Object.entries(room.users).find(([id, user]) => user.name === playerName);
        const playerId = userSocketEntry ? userSocketEntry[0] : playerName; // Fallback to name if socket ID not found, but ideally it should be

        gameState.players.push({
          id: playerId, // Use socket.id as player ID for easy mapping
          name: playerName,
          teamVote: teamVote, // Store the vote value they belonged to
          teamMembers: teamMembers,
          x: 50 + playerIndex * 30, // Initial positions, can be more sophisticated
          y: ZOMBIE_CANVAS_HEIGHT / 2,
          color: ZOMBIE_PLAYER_COLORS[playerIndex % ZOMBIE_PLAYER_COLORS.length],
          caught: false,
          safe: false,
          oilSlickCooldownEnds: 0,
          lastOilSlickTime: 0,
          slowedUntil: 0,
          // Add any other player-specific state needed from the start
        });
        gameState.pendingActions[playerId] = []; // Initialize pending actions array for the player
        playerIndex++;
      });
    }
    
    // Initialize zombies
    const numZombies = Math.max(1, gameState.players.length * 2); // Example: 2 zombies per player
    for (let i = 0; i < numZombies; i++) {
        let zombieX, zombieY;
        const playerStartXMax = 50 + gameState.players.length * 30 + 50; // Area where players start
        const helicopterStartXMin = ZOMBIE_HELICOPTER_X - ZOMBIE_HELICOPTER_WIDTH - 50; // Area near helicopter
        let validPosition = false;
        let attempts = 0;
        while(!validPosition && attempts < 100) { // Prevent infinite loop
            zombieX = ZOMBIE_ZOMBIE_RADIUS + Math.random() * (ZOMBIE_CANVAS_WIDTH - 2 * ZOMBIE_ZOMBIE_RADIUS);
            zombieY = ZOMBIE_ZOMBIE_RADIUS + Math.random() * (ZOMBIE_CANVAS_HEIGHT - 2 * ZOMBIE_ZOMBIE_RADIUS);
            
            let inPlayerStartZone = (zombieX < playerStartXMax && Math.abs(zombieY - ZOMBIE_CANVAS_HEIGHT / 2) < 100);
            let inHelicopterZone = (zombieX > helicopterStartXMin && Math.abs(zombieY - ZOMBIE_HELICOPTER_Y) < ZOMBIE_HELICOPTER_HEIGHT + 50);
            let inBuilding = gameState.buildings.some(b => checkZombieCollisionWithBuilding({x: zombieX, y: zombieY}, b, ZOMBIE_ZOMBIE_RADIUS));

            if (!inPlayerStartZone && !inHelicopterZone && !inBuilding) {
                validPosition = true;
            }
            attempts++;
        }
        if (!validPosition) { // Fallback if can't find good spot
            zombieX = ZOMBIE_CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 200;
            zombieY = ZOMBIE_CANVAS_HEIGHT / 3 + (Math.random() - 0.5) * 100;
        }

        gameState.zombies.push({
            id: `zombie-${roomCode}-${i}`,
            x: zombieX,
            y: zombieY,
            speed: ZOMBIE_DEFAULT_SPEED * (0.8 + Math.random() * 0.4), // Slight speed variation
            slowedUntil: 0,
            targetPlayerId: null, // Will be updated in game loop
        });
    }

    io.to(roomCode).emit('INITIAL_ZOMBIE_GAME_STATE', getClientSafeZombieState(gameState, roomCode));

    if (gameState.gameLoopIntervalId) {
      clearInterval(gameState.gameLoopIntervalId);
    }
    gameState.gameLoopIntervalId = setInterval(() => {
      zombieGameLoop(roomCode);
    }, ZOMBIE_SERVER_TICK_RATE);
  });

  socket.on('ZOMBIE_GAME_PLAYER_ACTION', ({ roomCode, type, payload }) => {
    const room = rooms[roomCode];
    if (room && room.zombieGameState && room.zombieGameState.isActive && !room.zombieGameState.gameOver) {
        const gameState = room.zombieGameState;
        const playerId = socket.id; // Assuming player action is from the player's own socket
        
        if (!gameState.pendingActions[playerId]) {
            gameState.pendingActions[playerId] = [];
        }
        // Basic validation or rate limiting could be added here
        gameState.pendingActions[playerId].push({ type, payload, receivedAt: Date.now() });
    }
  });
  
  socket.on('REQUEST_ZOMBIE_GAME_RESET', ({ roomCode, officialWinningNumber }) => {
    const room = rooms[roomCode];
    if (room && room.zombieGameState) {
        console.log(`[ZombieGame] Reset requested for room ${roomCode}`);
        if (room.zombieGameState.gameLoopIntervalId) {
            clearInterval(room.zombieGameState.gameLoopIntervalId);
            room.zombieGameState.gameLoopIntervalId = null;
        }
        // Re-initialize by calling a simplified start logic or fully re-calling start.
        // For simplicity, we'll effectively re-trigger the start logic based on current room users.
        // The 'teams' might need to be reconstructed or assumed to be the same players currently in the room.
        // This part might need more thought on how teams are persisted or re-determined for a reset.
        // For now, let's assume reset implies keeping current players.
        
        // Create a 'teams' structure from current players in the room, grouped by their original teamVote if available
        // or just treat each player as their own "team" for re-initialization.
        // This is a simplified approach for reset.
        const currentPlayersInRoom = Object.values(room.users).map(u => u.name);
        const mockTeamsForReset = {};
        currentPlayersInRoom.forEach((name, index) => {
            const playerState = room.zombieGameState.players.find(p => p.name === name);
            const teamVote = playerState ? playerState.teamVote : `team_${index}`; // Use original team vote or mock one
            if (!mockTeamsForReset[teamVote]) mockTeamsForReset[teamVote] = [];
            mockTeamsForReset[teamVote].push(name);
        });

        // Reuse the start logic by directly manipulating gameState and then calling start.
        // This is a bit of a hack; a dedicated reinitialize function would be cleaner.
        room.zombieGameState.isActive = false; // Temporarily set to false so startZombieGame logic runs
        
        // Emit startZombieGame internally or call a shared init function.
        // For simplicity, let's just re-emit startZombieGame to trigger the setup
        // This relies on the client to still have the 'teams' for the PointingPoker logic
        // OR, we need to call an internal function that does what startZombieGame's handler does.
        // Let's try a direct re-initialization here.
        
        const gameState = room.zombieGameState;
        gameState.isActive = true;
        gameState.gameStarted = false;
        gameState.gameOver = false;
        gameState.countdown = ZOMBIE_COUNTDOWN_SECONDS_INIT;
        gameState.players = [];
        gameState.zombies = [];
        gameState.oilSlicks = [];
        gameState.buildings = [...ZOMBIE_DEFAULT_BUILDINGS];
        gameState.helicopterPosition = { x: ZOMBIE_HELICOPTER_X, y: ZOMBIE_HELICOPTER_Y };
        gameState.isHelicopterAnimating = false;
        gameState.gameMessage = `Game starting in ${gameState.countdown}...`;
        gameState.pendingActions = {};

        let playerIndex = 0;
        Object.values(room.users).forEach(user => { // Re-populate players from current users in room
            const playerId = Object.keys(room.users).find(socketId => room.users[socketId].name === user.name);
            gameState.players.push({
                id: playerId, name: user.name,
                x: 50 + playerIndex * 30, y: ZOMBIE_CANVAS_HEIGHT / 2,
                color: ZOMBIE_PLAYER_COLORS[playerIndex % ZOMBIE_PLAYER_COLORS.length],
                caught: false, safe: false, oilSlickCooldownEnds: 0, lastOilSlickTime: 0, slowedUntil: 0,
                teamVote: user.vote || 'N/A', // Attempt to get original vote
                teamMembers: [user.name] // Simplified for reset
            });
            gameState.pendingActions[playerId] = [];
            playerIndex++;
        });

        const numZombies = Math.max(1, gameState.players.length * 2);
        for (let i = 0; i < numZombies; i++) {
            // Simplified zombie placement for reset, same logic as initial start
            let zombieX, zombieY;
            const playerStartXMax = 50 + gameState.players.length * 30 + 50;
            const helicopterStartXMin = ZOMBIE_HELICOPTER_X - ZOMBIE_HELICOPTER_WIDTH - 50;
            let validPosition = false; let attempts = 0;
            while(!validPosition && attempts < 100) {
                zombieX = ZOMBIE_ZOMBIE_RADIUS + Math.random() * (ZOMBIE_CANVAS_WIDTH - 2 * ZOMBIE_ZOMBIE_RADIUS);
                zombieY = ZOMBIE_ZOMBIE_RADIUS + Math.random() * (ZOMBIE_CANVAS_HEIGHT - 2 * ZOMBIE_ZOMBIE_RADIUS);
                let inPlayerStartZone = (zombieX < playerStartXMax && Math.abs(zombieY - ZOMBIE_CANVAS_HEIGHT / 2) < 100);
                let inHelicopterZone = (zombieX > helicopterStartXMin && Math.abs(zombieY - ZOMBIE_HELICOPTER_Y) < ZOMBIE_HELICOPTER_HEIGHT + 50);
                let inBuilding = gameState.buildings.some(b => checkZombieCollisionWithBuilding({x: zombieX, y: zombieY}, b, ZOMBIE_ZOMBIE_RADIUS));
                if (!inPlayerStartZone && !inHelicopterZone && !inBuilding) validPosition = true;
                attempts++;
            }
             if (!validPosition) { zombieX = ZOMBIE_CANVAS_WIDTH / 2; zombieY = ZOMBIE_CANVAS_HEIGHT / 3; }


            gameState.zombies.push({
                id: `zombie-${roomCode}-${i}-reset`, x: zombieX, y: zombieY,
                speed: ZOMBIE_DEFAULT_SPEED * (0.8 + Math.random() * 0.4), slowedUntil: 0, targetPlayerId: null,
            });
        }

        io.to(roomCode).emit('INITIAL_ZOMBIE_GAME_STATE', getClientSafeZombieState(gameState, roomCode));
        if (gameState.gameLoopIntervalId) clearInterval(gameState.gameLoopIntervalId);
        gameState.gameLoopIntervalId = setInterval(() => zombieGameLoop(roomCode), ZOMBIE_SERVER_TICK_RATE);
        
        // After reset, the PointingPoker client might also need to know to clear its winningNumber state.
        // The client's onGameEnd in PointingPoker handles this after gameEnded.
        // For a full reset, we might want to ensure PointingPoker allows a new game round.
        // For now, this resets the zombie game itself.
    }
  });
  
  // --- END ZOMBIE GAME HANDLERS ---

  socket.on('playerRacingInput', ({ roomCode, carId, inputKey, pressed }) => {
    const room = rooms[roomCode];
    if (room && room.racingGameState.isActive && room.racingGameState.pendingInputs[carId]) {
        // Store the latest state of the key press.
        // The game loop will consume this.
        room.racingGameState.pendingInputs[carId][inputKey] = pressed;
        // console.log(`Input from ${socket.id} for car ${carId} in room ${roomCode}: ${inputKey} = ${pressed}`);
    }
  });

  socket.on('playerPongInput', ({ roomCode, paddleKey, // e.g. 'teamA' or 'teamB'
                                   inputAction, // e.g. 'up' or 'down'
                                   pressed }) => {
    const room = rooms[roomCode];
    if (room && room.pongGameState.isActive && room.pongGameState.paddles[paddleKey]) {
        // Ensure the socket sending this is the one controlling the paddle
        const currentSocketId = socket.id;
        const actualPlayerId = room.pongGameState.paddles[paddleKey].playerId;
        
        // If playerId is socketId, compare directly. If it's a name, find corresponding socketId.
        let isAuthorized = false;
        if (actualPlayerId === currentSocketId) {
            isAuthorized = true;
        } else if (room.users[currentSocketId] && room.users[currentSocketId].name === actualPlayerId) {
             isAuthorized = true; // If stored playerId was a name and matches sender's name
        }

        if(isAuthorized){
            room.pongGameState.paddles[paddleKey].keysPressed[inputAction] = pressed;
        } else {
            console.log(`Unauthorized pong input from ${socket.id} for paddle ${paddleKey}`);
        }
    }
  });

  socket.on('gameEnded', ({ roomCode, winningNumber }) => {
    const room = rooms[roomCode];
    if (room) {
      console.log(`Game ended in room ${roomCode}. Winning number: ${winningNumber}`);
      room.winningNumber = winningNumber;
      
      // Store votes for this item/round along with the winning number
      const currentItemKey = `item_${room.currentRound}`;
      if (!room.itemVotes[currentItemKey]) room.itemVotes[currentItemKey] = {};
      room.itemVotes[currentItemKey].votes = { ...room.votesByName }; // Snapshot of votes for this item
      room.itemVotes[currentItemKey].winningNumber = winningNumber;


      // Clear game-specific states if they were active
      if (room.racingGameState && room.racingGameState.isActive) {
        console.log(`Stopping racing game in room ${roomCode} due to gameEnded.`);
        clearInterval(room.racingGameState.gameLoopIntervalId);
        room.racingGameState.isActive = false;
        room.racingGameState.cars = [];
        room.racingGameState.gameLoopIntervalId = null;
      }
      if (room.pongGameState && room.pongGameState.isActive) {
        console.log(`Stopping pong game in room ${roomCode} due to gameEnded.`);
        clearInterval(room.pongGameState.gameLoopIntervalId);
        room.pongGameState.isActive = false;
        // Reset pong specific state if needed for next round (ball, paddles, scores etc.)
        // or handle that upon next pong game start. For now, just deactivating.
      }
      if (room.zombieGameState && room.zombieGameState.isActive) {
        console.log(`Stopping zombie game in room ${roomCode} due to gameEnded.`);
        clearInterval(room.zombieGameState.gameLoopIntervalId);
        room.zombieGameState.isActive = false;
        room.zombieGameState.gameStarted = false;
        room.zombieGameState.gameOver = true; // Mark as over
        room.zombieGameState.gameLoopIntervalId = null;
        // Zombie game state will be fully reset on next 'startZombieGame' or 'REQUEST_ZOMBIE_GAME_RESET'
      }

      io.to(roomCode).emit('roundResults', {
        teams: calculateTeams(room.votesByName),
        winningNumber: room.winningNumber,
        itemVotes: room.itemVotes // Send all item votes so far
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Find which room the socket was in
    let roomCodeFound = null;
    let userName = 'Unknown';
    for (const rc in rooms) {
      if (rooms[rc].users[socket.id]) {
        userName = rooms[rc].users[socket.id].name;
        delete rooms[rc].users[socket.id]; // Remove user from list
        
        // Also remove their vote if present
        const voteKeyToRemove = Object.keys(rooms[rc].votesByName).find(name => name === userName);
        if (voteKeyToRemove) delete rooms[rc].votesByName[voteKeyToRemove];

        roomCodeFound = rc;
        io.to(rc).emit('playerListUpdate', Object.values(rooms[rc].users).map(u => u.name));
        io.to(rc).emit('allVotesUpdate', { votes: rooms[rc].votesByName, revealed: rooms[rc].revealed });


        // Handle player leaving an active Zombie Game
        const gameState = rooms[rc].zombieGameState;
        if (gameState && gameState.isActive) {
            const playerIndex = gameState.players.findIndex(p => p.id === socket.id || p.name === userName);
            if (playerIndex > -1) {
                console.log(`[ZombieGame] Player ${userName} (${socket.id}) disconnected from active game in room ${rc}.`);
                gameState.players.splice(playerIndex, 1);
                // If this makes players array empty, could end game or let it run for remaining.
                // Current game loop will handle empty players by not finding targets / checking game over.
                 io.to(rc).emit('ZOMBIE_GAME_MESSAGE', `${userName} has left the game.`);
            }
            if (gameState.pendingActions[socket.id]) {
                delete gameState.pendingActions[socket.id];
            }
            // Check if game should end if no players left
             if (gameState.players.length === 0 && gameState.gameStarted) {
                console.log(`[ZombieGame] All players left active game in room ${rc}. Ending game.`);
                gameState.gameOver = true;
                gameState.gameMessage = "All players left. Game over.";
                if (gameState.gameLoopIntervalId) {
                    clearInterval(gameState.gameLoopIntervalId);
                    gameState.gameLoopIntervalId = null;
                }
                io.to(rc).emit('ZOMBIE_GAME_OVER', { message: gameState.gameMessage, survivors: [] });
                gameState.isActive = false; 
            }
        }


        // Check if room is empty or admin left
        if (Object.keys(rooms[rc].users).length === 0) {
          console.log(`Room ${rc} is now empty. Deleting room.`);
          if (rooms[rc].racingGameState.gameLoopIntervalId) clearInterval(rooms[rc].racingGameState.gameLoopIntervalId);
          if (rooms[rc].pongGameState.gameLoopIntervalId) clearInterval(rooms[rc].pongGameState.gameLoopIntervalId);
          if (rooms[rc].zombieGameState.gameLoopIntervalId) clearInterval(rooms[rc].zombieGameState.gameLoopIntervalId);
          delete rooms[rc];
        } else if (rooms[rc].adminSocketId === socket.id) {
          // Admin left, assign new admin (e.g., first user in list)
          const newAdminSocketId = Object.keys(rooms[rc].users)[0];
          if (newAdminSocketId) {
            rooms[rc].adminSocketId = newAdminSocketId;
            console.log(`Admin ${userName} left room ${rc}. New admin: ${rooms[rc].users[newAdminSocketId].name}`);
            // Notify clients of admin change if necessary (not currently implemented on client)
          }
        }
        break; 
      }
    }
  });
});

// Note: calculateTeams now takes votesByName { userName: voteValue }
// and returns teams { voteValue: [userName1, userName2] }
function calculateTeams(votesByName) {
  const teams = {};
  for (const userName in votesByName) {
    const voteValue = votesByName[userName];
    if (!teams[voteValue]) {
      teams[voteValue] = [];
    }
    teams[voteValue].push(userName);
  }
  return teams;
}

// --- ZOMBIE GAME SERVER LOGIC ---

function getClientSafeZombieState(gameState, roomCode) {
    // Ensure we don't send server-internal things like pendingActions or interval IDs
    return {
        isActive: gameState.isActive,
        gameStarted: gameState.gameStarted,
        gameOver: gameState.gameOver,
        countdown: gameState.countdown,
        players: gameState.players.map(p => ({ ...p })), // Shallow copy players
        zombies: gameState.zombies.map(z => ({ ...z })), // Shallow copy zombies
        oilSlicks: gameState.oilSlicks.map(os => ({ ...os })),
        buildings: gameState.buildings, // Buildings are static, can send as is
        helicopterPosition: { ...gameState.helicopterPosition },
        isHelicopterAnimating: gameState.isHelicopterAnimating,
        gameMessage: gameState.gameMessage,
        // roomCode is already known by client, or add it if needed by client handlers for some reason
    };
}

function zombieGameLoop(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.zombieGameState || !room.zombieGameState.isActive) {
        if (room && room.zombieGameState && room.zombieGameState.gameLoopIntervalId) {
            clearInterval(room.zombieGameState.gameLoopIntervalId);
            room.zombieGameState.gameLoopIntervalId = null;
        }
        return;
    }

    const gameState = room.zombieGameState;
    const now = Date.now();

    if (gameState.gameOver) { // Should have already been cleared by gameEnded or similar
        if (gameState.gameLoopIntervalId) clearInterval(gameState.gameLoopIntervalId);
        gameState.isActive = false;
        return;
    }

    // 1. Handle Countdown
    if (!gameState.gameStarted && gameState.countdown > 0) {
        // Assuming countdown is handled per tick, not per second here for simplicity of loop
        // For per-second, need to track last update time.
        // For now, let's assume ZOMBIE_SERVER_TICK_RATE is fast enough or countdown updates via separate mechanism.
        // Client-side countdown interval is primary for display; server sends updates.
        // Let's make server decrement once per second conceptually for ZOMBIE_COUNTDOWN_UPDATE
        if (!gameState.lastCountdownUpdateTime || (now - gameState.lastCountdownUpdateTime >= 1000)) {
            gameState.countdown--;
            gameState.lastCountdownUpdateTime = now;
            gameState.gameMessage = `Game starting in ${gameState.countdown}...`;
            io.to(roomCode).emit('ZOMBIE_COUNTDOWN_UPDATE', gameState.countdown);
            if (gameState.countdown <= 0) {
                gameState.gameStarted = true;
                gameState.gameMessage = 'RUN! Survive!';
                io.to(roomCode).emit('ZOMBIE_GAME_STARTED_EVENT', { message: gameState.gameMessage, initialState: getClientSafeZombieState(gameState, roomCode) });
            }
        }
    }

    if (!gameState.gameStarted || gameState.gameOver) {
        // Only broadcast state if game not started yet (e.g. for initial joiners during countdown) or if just ended
        // but game loop should stop if game over.
        // For now, let main broadcast handle updates if game is in countdown.
        // If game over, this loop shouldn't be running.
        // The final state is broadcast on game over event.
        if(!gameState.gameStarted){
             io.to(roomCode).emit('ZOMBIE_GAME_STATE_UPDATE', getClientSafeZombieState(gameState, roomCode));
        }
        return; // Don't run full game logic if not started or already over
    }

    // 2. Process Player Actions from pendingActions
    for (const playerId in gameState.pendingActions) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player || player.caught || player.safe) {
            gameState.pendingActions[playerId] = []; // Clear actions for caught/safe players
            continue;
        }

        let actionsToProcess = gameState.pendingActions[playerId];
        gameState.pendingActions[playerId] = []; // Clear before processing to avoid race conditions with new actions

        actionsToProcess.forEach(action => {
            if (action.type === 'MOVE') {
                let { x, y } = player;
                const currentSpeed = now < player.slowedUntil ? ZOMBIE_PLAYER_SPEED * ZOMBIE_SLOW_FACTOR : ZOMBIE_PLAYER_SPEED;
                
                let dx = 0, dy = 0;
                if (action.payload.direction === 'up') dy = -currentSpeed;
                if (action.payload.direction === 'down') dy = currentSpeed;
                if (action.payload.direction === 'left') dx = -currentSpeed;
                if (action.payload.direction === 'right') dx = currentSpeed;

                let newX = x + dx;
                let newY = y + dy;

                newX = Math.max(ZOMBIE_PLAYER_RADIUS, Math.min(ZOMBIE_CANVAS_WIDTH - ZOMBIE_PLAYER_RADIUS, newX));
                newY = Math.max(ZOMBIE_PLAYER_RADIUS, Math.min(ZOMBIE_CANVAS_HEIGHT - ZOMBIE_PLAYER_RADIUS, newY));
                
                let collisionX = false;
                let collisionY = false;
                let collisionXY = false;

                for (const building of gameState.buildings) {
                    if (checkZombieCollisionWithBuilding({ ...player, x: newX, y: newY }, building, ZOMBIE_PLAYER_RADIUS)) collisionXY = true;
                    if (checkZombieCollisionWithBuilding({ ...player, x: newX, y: y }, building, ZOMBIE_PLAYER_RADIUS)) collisionX = true;
                    if (checkZombieCollisionWithBuilding({ ...player, x: x, y: newY }, building, ZOMBIE_PLAYER_RADIUS)) collisionY = true;
                }
                
                if(!collisionXY) { player.x = newX; player.y = newY;}
                else if (!collisionX && collisionY) player.x = newX; // Can move in X
                else if (collisionX && !collisionY) player.y = newY; // Can move in Y
                // If collision in both or only one attempted axis, no move for that component. Player might get stuck if hitting corner.

            } else if (action.type === 'DROP_OIL_SLICK') {
                const activeSlicksByPlayer = gameState.oilSlicks.filter(slick => slick.placedBy === player.id && now < slick.activeUntil).length;
                if (now >= player.oilSlickCooldownEnds && activeSlicksByPlayer < ZOMBIE_MAX_PLAYER_OIL_SLICKS) {
                    gameState.oilSlicks.push({
                        id: `slick-${player.id}-${now}`,
                        x: player.x,
                        y: player.y,
                        placedBy: player.id,
                        activeUntil: now + ZOMBIE_OIL_SLICK_DURATION,
                        radius: ZOMBIE_OIL_SLICK_RADIUS
                    });
                    player.oilSlickCooldownEnds = now + ZOMBIE_OIL_SLICK_COOLDOWN;
                    player.lastOilSlickTime = now; // Could be useful for client display
                }
            }
        });
    }

    // 3. Update Oil Slicks (remove expired)
    gameState.oilSlicks = gameState.oilSlicks.filter(slick => now < slick.activeUntil);

    // 4. Update Zombie AI & Movement
    gameState.zombies.forEach(zombie => {
        if (zombie.targetPlayerId) { // Check if current target is still valid
            const target = gameState.players.find(p => p.id === zombie.targetPlayerId && !p.caught && !p.safe);
            if (!target) zombie.targetPlayerId = null;
        }

        if (!zombie.targetPlayerId) { // Find new target if needed
            let closestPlayer = null;
            let minDistSq = Infinity;
            gameState.players.forEach(p => {
                if (!p.caught && !p.safe) {
                    const distSq = (p.x - zombie.x)**2 + (p.y - zombie.y)**2;
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        closestPlayer = p;
                    }
                }
            });
            if (closestPlayer) zombie.targetPlayerId = closestPlayer.id;
        }

        if (zombie.targetPlayerId) {
            const targetPlayer = gameState.players.find(p => p.id === zombie.targetPlayerId);
            if (targetPlayer) {
                const angleToPlayer = Math.atan2(targetPlayer.y - zombie.y, targetPlayer.x - zombie.x);
                const currentZombieSpeed = now < zombie.slowedUntil ? zombie.speed * ZOMBIE_SLOW_FACTOR : zombie.speed;
                
                let newZombieX = zombie.x + Math.cos(angleToPlayer) * currentZombieSpeed;
                let newZombieY = zombie.y + Math.sin(angleToPlayer) * currentZombieSpeed;

                // Boundary check for zombies (simple)
                newZombieX = Math.max(ZOMBIE_ZOMBIE_RADIUS, Math.min(ZOMBIE_CANVAS_WIDTH - ZOMBIE_ZOMBIE_RADIUS, newZombieX));
                newZombieY = Math.max(ZOMBIE_ZOMBIE_RADIUS, Math.min(ZOMBIE_CANVAS_HEIGHT - ZOMBIE_ZOMBIE_RADIUS, newZombieY));

                let zCollisionX = false;
                let zCollisionY = false;
                let zCollisionXY = false;

                for (const building of gameState.buildings) {
                    if (checkZombieCollisionWithBuilding({ ...zombie, x: newZombieX, y: newZombieY }, building, ZOMBIE_ZOMBIE_RADIUS)) zCollisionXY = true;
                    if (checkZombieCollisionWithBuilding({ ...zombie, x: newZombieX, y: zombie.y }, building, ZOMBIE_ZOMBIE_RADIUS)) zCollisionX = true;
                    if (checkZombieCollisionWithBuilding({ ...zombie, x: zombie.x, y: newZombieY }, building, ZOMBIE_ZOMBIE_RADIUS)) zCollisionY = true;
                }

                if(!zCollisionXY) { zombie.x = newZombieX; zombie.y = newZombieY;}
                else if (!zCollisionX && zCollisionY) zombie.x = newZombieX;
                else if (zCollisionX && !zCollisionY) zombie.y = newZombieY;
            }
        }
    });

    // 5. Collision Detection
    let firstPlayerReachedSafetyThisFrame = false;
    gameState.players.forEach(player => {
        if (player.caught || player.safe) return;

        // Player-Zombie
        gameState.zombies.forEach(zombie => {
            const distSq = (player.x - zombie.x)**2 + (player.y - zombie.y)**2;
            if (distSq < (ZOMBIE_PLAYER_RADIUS + ZOMBIE_ZOMBIE_RADIUS)**2) {
                player.caught = true;
                // TODO: Emit event? ZOMBIE_GAME_EVENT {type: 'PLAYER_CAUGHT', playerId: player.id}
                // Or rely on next ZOMBIE_GAME_STATE_UPDATE
            }
        });

        // Player-OilSlick (if not placed by this player)
        gameState.oilSlicks.forEach(slick => {
            if (slick.placedBy !== player.id) {
                const distSqToSlick = (player.x - slick.x)**2 + (player.y - slick.y)**2;
                if (distSqToSlick < (ZOMBIE_PLAYER_RADIUS + slick.radius)**2) {
                    player.slowedUntil = now + ZOMBIE_SLOW_DURATION;
                }
            }
        });

        // Player-Helicopter
        if (player.x > ZOMBIE_HELICOPTER_X - ZOMBIE_HELICOPTER_WIDTH / 2 && player.x < ZOMBIE_HELICOPTER_X + ZOMBIE_HELICOPTER_WIDTH / 2 &&
            player.y > ZOMBIE_HELICOPTER_Y - ZOMBIE_HELICOPTER_HEIGHT / 2 && player.y < ZOMBIE_HELICOPTER_Y + ZOMBIE_HELICOPTER_HEIGHT / 2) {
            if(!player.safe) { // only trigger if not already safe
                 player.safe = true;
                 if (!gameState.isHelicopterAnimating) firstPlayerReachedSafetyThisFrame = true;
            }
        }
    });
    
    if(firstPlayerReachedSafetyThisFrame) gameState.isHelicopterAnimating = true;

    // Zombie-OilSlick
    gameState.zombies.forEach(zombie => {
        gameState.oilSlicks.forEach(slick => {
            const distSqToSlick = (zombie.x - slick.x)**2 + (zombie.y - slick.y)**2;
            if (distSqToSlick < (ZOMBIE_ZOMBIE_RADIUS + slick.radius)**2) {
                zombie.slowedUntil = now + ZOMBIE_SLOW_DURATION;
            }
        });
    });
    
    // 6. Update Helicopter Animation
    if (gameState.isHelicopterAnimating) {
        const dx = ZOMBIE_HELICOPTER_ANIMATION_TARGET_X - gameState.helicopterPosition.x;
        const dy = ZOMBIE_HELICOPTER_ANIMATION_TARGET_Y - gameState.helicopterPosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < ZOMBIE_HELICOPTER_ANIMATION_SPEED) {
            gameState.helicopterPosition.x = ZOMBIE_HELICOPTER_ANIMATION_TARGET_X;
            gameState.helicopterPosition.y = ZOMBIE_HELICOPTER_ANIMATION_TARGET_Y;
            // Potentially stop animating if target reached and game not over. Or let it fly off.
        } else {
            gameState.helicopterPosition.x += (dx / dist) * ZOMBIE_HELICOPTER_ANIMATION_SPEED;
            gameState.helicopterPosition.y += (dy / dist) * ZOMBIE_HELICOPTER_ANIMATION_SPEED;
        }
    }

    // 7. Check Game Over
    const activePlayers = gameState.players.filter(p => !p.caught && !p.safe);
    if (activePlayers.length === 0 && gameState.players.length > 0) {
        gameState.gameOver = true;
        gameState.isActive = false; // Stop further processing in this loop iteration
        const survivors = gameState.players.filter(p => p.safe);
        if (survivors.length > 0) {
            gameState.gameMessage = `Survivors: ${survivors.map(s => s.name).join(', ')} made it!`;
        } else {
            gameState.gameMessage = 'The zombies got everyone!';
        }
        
        io.to(roomCode).emit('ZOMBIE_GAME_OVER', { message: gameState.gameMessage, survivors: survivors.map(s => ({id: s.id, name: s.name})) });
        
        if (gameState.gameLoopIntervalId) {
            clearInterval(gameState.gameLoopIntervalId);
            gameState.gameLoopIntervalId = null;
        }
        // The main 'gameEnded' event from PointingPoker will also clean up the interval if onGameEnd is called by client.
        // But server should stop its own loop here.
        return; // End loop
    }
    
    // 8. Broadcast State
    io.to(roomCode).emit('ZOMBIE_GAME_STATE_UPDATE', getClientSafeZombieState(gameState, roomCode));
}

// Ensure server listens on the port
server.listen(port, () => console.log(`Listening on port ${port}`));