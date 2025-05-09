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
// rooms = { roomCode: { users: { socketId: { name, vote } }, votesByName: { userName: vote }, revealed, winningNumber, currentRound, adminSocketId, racingGameState: {} } }
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
      users: {}, // { socketId: { name, vote } }
      votesByName: {}, // { userName: voteValue }
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
      // Send current vote status if already started/revealed
      socket.emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
      if (room.winningNumber) {
          socket.emit('roundResults', { teams: calculateTeams(room.votesByName), winningNumber: room.winningNumber });
      }
    } else {
      socket.emit('joinError', { message: 'Room not found.' });
    }
  });

  socket.on('vote', ({ roomCode, userName, vote }) => {
    const room = rooms[roomCode];
    if (room && room.users[socket.id] && room.users[socket.id].name === userName && !room.revealed && !room.racingGameState.isActive && !room.pongGameState.isActive) {
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
    if (room && !room.racingGameState.isActive && !room.pongGameState.isActive) {
      console.log(`Show votes requested for room ${roomCode}`);
      room.revealed = true;
      io.to(roomCode).emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
      // Client-side will now use this updated allVotesUpdate to derive teams and decide on game
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

  socket.on('gameEnded', ({ roomCode, winningNumber }) => {
    const room = rooms[roomCode];
    // This event might now be deprecated if server solely determines game end for racing/pong.
    if (room && !room.racingGameState.isActive && !room.pongGameState.isActive) {
      console.log(`Game ended (non-racing/pong or already concluded) in room ${roomCode}, winningNumber: ${winningNumber}`);
      room.winningNumber = winningNumber;
      const teams = calculateTeams(room.votesByName);
      io.to(roomCode).emit('roundResults', { teams, winningNumber: room.winningNumber });
    } else if (room && (room.racingGameState.isActive || room.pongGameState.isActive)) {
        console.log(`'gameEnded' received for room ${roomCode} while a game is active. Server should handle game end.`);
    }
  });

  socket.on('requestNextRound', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room) {
      console.log(`Next round requested for room ${roomCode}`);
      // Clear racing game state if any
      if (room.racingGameState.gameLoopIntervalId) {
        clearInterval(room.racingGameState.gameLoopIntervalId);
      }
      room.racingGameState = {
        isActive: false, cars: [], gameLoopIntervalId: null, pendingInputs: {}
      };
      // Clear pong game state if any
      if (room.pongGameState.gameLoopIntervalId) {
        clearInterval(room.pongGameState.gameLoopIntervalId);
      }
      room.pongGameState = {
        isActive: false, ball: { x: PONG_CANVAS_WIDTH / 2, y: PONG_CANVAS_HEIGHT / 2, dx: 0, dy: 0 },
        paddles: {}, players: { teamA: null, teamB: null }, gameLoopIntervalId: null, countdown: 0
      };
      // Reset poker state
      room.votesByName = {};
      room.revealed = false;
      room.winningNumber = null;
      room.currentRound += 1;
      for (const id in room.users) {
        if (room.users[id]) {
          delete room.users[id].vote;
        }
      }
      io.to(roomCode).emit('startNextRound', { round: room.currentRound });
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    let roomCodeFound = null;
    let userNameFound = null;
    let carIdToClearInputs = null; // For racing
    let paddleKeyToClearInputs = null; // For pong

    for (const rc in rooms) {
      if (rooms[rc].users[socket.id]) {
        roomCodeFound = rc;
        userNameFound = rooms[rc].users[socket.id].name;
        
        // If the disconnected user was a driver in an active race, clear their inputs
        if (rooms[rc].racingGameState && rooms[rc].racingGameState.isActive) {
            const car = rooms[rc].racingGameState.cars.find(c => c.name === userNameFound);
            if (car) {
                carIdToClearInputs = car.id;
                if (rooms[rc].racingGameState.pendingInputs[carIdToClearInputs]) {
                    rooms[rc].racingGameState.pendingInputs[carIdToClearInputs] = { ArrowUp: false, ArrowLeft: false, ArrowRight: false };
                }
                if (car.keysPressed) { // Also reset direct keysPressed on car if it exists
                    car.keysPressed = { ArrowUp: false, ArrowLeft: false, ArrowRight: false };
                }
                console.log(`Driver ${userNameFound} disconnected, inputs cleared for car ${carIdToClearInputs} in room ${rc}`);
            }
        }
        // If the disconnected user was a player in an active pong game, clear their inputs
        if (rooms[rc].pongGameState && rooms[rc].pongGameState.isActive) {
            const paddles = rooms[rc].pongGameState.paddles;
            if (paddles.teamA && paddles.teamA.name === userNameFound) paddleKeyToClearInputs = 'teamA';
            else if (paddles.teamB && paddles.teamB.name === userNameFound) paddleKeyToClearInputs = 'teamB';
            
            if (paddleKeyToClearInputs && paddles[paddleKeyToClearInputs]) {
                paddles[paddleKeyToClearInputs].keysPressed = { up: false, down: false };
                console.log(`Pong player ${userNameFound} disconnected, inputs cleared for paddle ${paddleKeyToClearInputs} in room ${rc}`);
            }
        }

        delete rooms[rc].users[socket.id];
        // If user had voted and round not revealed, remove their vote
        if (!rooms[rc].revealed && rooms[rc].votesByName[userNameFound]) {
          delete rooms[rc].votesByName[userNameFound];
          io.to(rc).emit('allVotesUpdate', { votes: rooms[rc].votesByName, revealed: rooms[rc].revealed });
        }
        console.log(`User ${userNameFound} (${socket.id}) disconnected from room ${roomCodeFound}`);
        io.to(rc).emit('playerListUpdate', Object.values(rooms[rc].users).map(u => u.name));
        // Optional: if room becomes empty, delete it
        if (Object.keys(rooms[rc].users).length === 0) {
            console.log(`Room ${rc} is empty, deleting.`);
            delete rooms[rc];
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

server.listen(port, () => console.log(`Listening on port ${port}`));