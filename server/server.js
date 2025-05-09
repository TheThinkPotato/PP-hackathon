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
      adminSocketId: socket.id
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
    if (room && room.users[socket.id] && room.users[socket.id].name === userName && !room.revealed) {
      console.log(`Vote in room ${roomCode} from ${userName}: ${vote} for item ${itemId}`);
      room.users[socket.id].vote = vote;
      room.votesByName[userName] = vote;
      io.to(roomCode).emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
    } else if (room && room.revealed) {
      console.log(`Vote received after reveal in room ${roomCode} from ${userName}, ignoring.`);
    }
  });

  socket.on('showVotes', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room) {
      console.log(`Show votes requested for room ${roomCode}`);
      room.revealed = true;
      io.to(roomCode).emit('allVotesUpdate', { votes: room.votesByName, revealed: room.revealed });
    }
  });

  socket.on('gameEnded', ({ roomCode, winningNumber }) => {
    const room = rooms[roomCode];
    if (room) {
      console.log(`Game ended in room ${roomCode}, winning number: ${winningNumber}`);
      room.winningNumber = winningNumber;
      const teams = calculateTeams(room.votesByName);
      
      // Store the votes and winning number for the current item
      const currentItemId = `item_${room.currentRound}`;
      room.itemVotes[currentItemId] = {
        votes: { ...room.votesByName },
        winningNumber: winningNumber
      };
      
      io.to(roomCode).emit('roundResults', { 
        teams, 
        winningNumber: room.winningNumber,
        itemVotes: room.itemVotes
      });
    }
  });

  socket.on('requestNextRound', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room) {
      console.log(`Next round requested for room ${roomCode}`);
      room.votesByName = {};
      room.revealed = false;
      room.winningNumber = null;
      room.currentRound += 1;
      for (const id in room.users) {
        if (room.users[id]) {
          delete room.users[id].vote;
        }
      }
      io.to(roomCode).emit('startNextRound', { 
        round: room.currentRound,
        itemVotes: room.itemVotes
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Find which room the socket was in
    let roomCodeFound = null;
    let userNameFound = null;
    for (const rc in rooms) {
      if (rooms[rc].users[socket.id]) {
        roomCodeFound = rc;
        userNameFound = rooms[rc].users[socket.id].name;
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