import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import BacklogItems from './BacklogItems';

// Game component imports - these should point to the actual game files
import PongGame from './games/PongGame'; 
import RacingGame from './games/RacingGame';
import ZombieGame from './games/ZombieGame';

const SOCKET_SERVER_URL = 'https://72df-49-255-11-50.ngrok-free.app';
const fibonacciNumbers = [0, 1, 2, 3, 5, 8, 13, 21, '☕', '?'];

const PointingPoker = () => {
  const [socket, setSocket] = useState(null);
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const [myVote, setMyVote] = useState(null);
  const [allVotes, setAllVotes] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [teams, setTeams] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [winningNumber, setWinningNumber] = useState(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [backlogVotes, setBacklogVotes] = useState({});
  const [isSessionComplete, setIsSessionComplete] = useState(false);

  const resetPokerStateForNewRound = useCallback(() => {
    setMyVote(null);
    setAllVotes({});
    setRevealed(false);
    setTeams(null);
    setCurrentGame(null);
    setWinningNumber(null);
  }, []);

  useEffect(() => {
    //'ngrok-skip-browser-warning': 'true'
    const newSocket = io(SOCKET_SERVER_URL, {
      extraHeaders: {
        'ngrok-skip-browser-warning': 'true'
      }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to socket server:', newSocket.id);
      setErrorMessage('');
    });

    newSocket.on('roomCreated', ({ roomCode: newRoomCode, roomState, userName: creatorName }) => {
      if (userName === creatorName && !isRoomJoined) {
        console.log('Room created by me:', newRoomCode);
        setRoomCode(newRoomCode);
        setIsRoomJoined(true);
        setCurrentRound(roomState.currentRound);
        setPlayers(Object.values(roomState.users).map(u => u.name));
        resetPokerStateForNewRound();
        setErrorMessage('');
      }
    });

    newSocket.on('roomJoined', ({ roomCode: joinedRoomCode, roomState, userName: joinedUserName }) => {
      if (userName === joinedUserName && !isRoomJoined) {
        console.log('Successfully joined room:', joinedRoomCode);
        setRoomCode(joinedRoomCode);
        setIsRoomJoined(true);
        setPlayers(Object.values(roomState.users).map(u => u.name));
        setAllVotes(roomState.votesByName || {});
        setRevealed(roomState.revealed || false);
        setCurrentRound(roomState.currentRound || 1);
        setWinningNumber(roomState.winningNumber || null);
        if(roomState.winningNumber) setTeams(roomState.teams || null);
        setErrorMessage('');
      }
    });

    newSocket.on('joinError', ({ message }) => {
      console.error('Join error:', message);
      setErrorMessage(message);
    });

    newSocket.on('playerListUpdate', (updatedPlayers) => {
      console.log('Player list updated:', updatedPlayers);
      setPlayers(updatedPlayers);
    });

    newSocket.on('allVotesUpdate', ({ votes: updatedVotes, revealed: updatedRevealed }) => {
      console.log('All votes update:', updatedVotes, 'Revealed:', updatedRevealed);
      setAllVotes(updatedVotes || {});
      setRevealed(updatedRevealed || false);
    });

    newSocket.on('roundResults', ({ teams: newTeams, winningNumber: newWinningNumber, itemVotes }) => {
      console.log('Round results:', newTeams, newWinningNumber, itemVotes);
      setTeams(newTeams || null);
      setWinningNumber(newWinningNumber || null);
      setRevealed(true);
      setCurrentGame(null);
      if (itemVotes) {
        setBacklogVotes(prev => {
          const updatedBacklog = { ...prev };
          for (const itemKey in itemVotes) {
            const serverItemData = itemVotes[itemKey] || {};
            const clientItemData = prev[itemKey] || {};

            const mergedData = { ...clientItemData }; // Start with client data

            // Overlay non-critical server data
            for (const propKey in serverItemData) {
              if (propKey !== 'winningNumber' && propKey !== 'votes') {
                mergedData[propKey] = serverItemData[propKey];
              }
            }

            // Intelligently set winningNumber
            mergedData.winningNumber = (serverItemData.hasOwnProperty('winningNumber') && serverItemData.winningNumber !== undefined && serverItemData.winningNumber !== null)
              ? serverItemData.winningNumber
              : clientItemData.winningNumber;

            // Intelligently set votes
            mergedData.votes = (serverItemData.hasOwnProperty('votes') && serverItemData.votes && typeof serverItemData.votes === 'object' && Object.keys(serverItemData.votes).length > 0)
              ? serverItemData.votes
              : clientItemData.votes;

            updatedBacklog[itemKey] = mergedData;
          }
          return updatedBacklog;
        });
      }
    });

    newSocket.on('startNextRound', ({ round, itemVotes }) => {
      console.log('Server started next round:', round);
      resetPokerStateForNewRound();
      setCurrentRound(round);
      if (itemVotes) {
        setBacklogVotes(prev => {
          const updatedBacklog = { ...prev };
          for (const itemKey in itemVotes) {
            const serverItemData = itemVotes[itemKey] || {};
            const clientItemData = prev[itemKey] || {};

            const mergedData = { ...clientItemData }; // Start with client data

            // Overlay non-critical server data
            for (const propKey in serverItemData) {
              if (propKey !== 'winningNumber' && propKey !== 'votes') {
                mergedData[propKey] = serverItemData[propKey];
              }
            }

            // Intelligently set winningNumber
            mergedData.winningNumber = (serverItemData.hasOwnProperty('winningNumber') && serverItemData.winningNumber !== undefined && serverItemData.winningNumber !== null)
              ? serverItemData.winningNumber
              : clientItemData.winningNumber;

            // Intelligently set votes
            mergedData.votes = (serverItemData.hasOwnProperty('votes') && serverItemData.votes && typeof serverItemData.votes === 'object' && Object.keys(serverItemData.votes).length > 0)
              ? serverItemData.votes
              : clientItemData.votes;

            updatedBacklog[itemKey] = mergedData;
          }
          return updatedBacklog;
        });
      }
      setErrorMessage('');
    });
    
    newSocket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        setErrorMessage('Disconnected. Attempting to reconnect or please rejoin.');
    });

    return () => {
      console.log('Cleaning up main socket listeners for socket:', newSocket.id);
      newSocket.off('connect');
      newSocket.off('roomCreated');
      newSocket.off('roomJoined');
      newSocket.off('joinError');
      newSocket.off('playerListUpdate');
      newSocket.off('allVotesUpdate');
      newSocket.off('roundResults');
      newSocket.off('startNextRound');
      newSocket.off('disconnect');
      if(newSocket.connected) newSocket.disconnect();
    };
  }, [userName]);

  const handleCreateRoom = () => {
    if (socket && userName.trim()) {
      socket.emit('createRoom', { userName: userName.trim() });
    } else if (!userName.trim()){
        setErrorMessage('Please enter your name.');
    }
  };

  const handleJoinRoom = () => {
    if (socket && userName.trim() && inputRoomCode.trim()) {
      socket.emit('joinRoom', { roomCode: inputRoomCode.trim().toUpperCase(), userName: userName.trim() });
    } else {
        let err = [];
        if (!userName.trim()) err.push('Please enter your name.');
        if (!inputRoomCode.trim()) err.push('Please enter a room code.');
        setErrorMessage(err.join(' '));
    }
  };

  const handleVote = (number) => {
    if (socket && isRoomJoined && !revealed && userName && roomCode) {
      setMyVote(number);
      socket.emit('vote', { 
        roomCode, 
        userName, 
        vote: number,
        itemId: `item_${currentRound}`
      });
    }
  };

  const handleShowVotes = () => {
    if (socket && isRoomJoined && roomCode) {
      socket.emit('showVotes', { roomCode });
    }
  };

  const handleGameEnd = useCallback((chosenNumber) => {
    if (socket && isRoomJoined && roomCode && !winningNumber) {
      setBacklogVotes(prev => ({
        ...prev,
        [`item_${currentRound}`]: {
          votes: allVotes,
          winningNumber: chosenNumber
        }
      }));

      socket.emit('gameEnded', { roomCode, winningNumber: chosenNumber });
    }
  }, [socket, isRoomJoined, roomCode, winningNumber, currentRound, allVotes]);

  const handleNextRound = () => {
    if (socket && isRoomJoined && roomCode) {
      if (currentRound >= 5) {
        setIsSessionComplete(true);
      } else {
        console.log('Client requesting next round for room:', roomCode);
        socket.emit('requestNextRound', { roomCode });
      }
    }
  };
  
  const handleLeaveRoom = () => {
    if(socket) {
        socket.disconnect();
    }
    setSocket(null);
    setIsRoomJoined(false);
    setRoomCode('');
    setPlayers([]);
    resetPokerStateForNewRound();
    setCurrentRound(1);
    setErrorMessage('');
    setInputRoomCode('');
  };

  useEffect(() => {
    if (isRoomJoined && revealed && Object.keys(allVotes).length > 0 && !winningNumber && !currentGame) {
      const currentTeams = {};
      Object.entries(allVotes).forEach(([name, vote]) => {
        if (!currentTeams[vote]) currentTeams[vote] = [];
        if (!currentTeams[vote].includes(name)) currentTeams[vote].push(name);
      });
      setTeams(currentTeams);

      const numTeams = Object.keys(currentTeams).length;
      if (numTeams === 2) {
        setCurrentGame('pong');
        if (socket && roomCode) {
          console.log('[PointingPoker] Requesting server to start pong game for room:', roomCode, 'with teams:', currentTeams);
          socket.emit('startPongGame', { roomCode, teams: currentTeams });
        }
      } else if (numTeams === 3) {
        setCurrentGame('racing');
        if (socket && roomCode) {
          console.log('Requesting server to start racing game for room:', roomCode, 'with teams:', currentTeams);
          socket.emit('startRacingGame', { roomCode, teams: currentTeams });
        }
      } else if (numTeams >= 4 && numTeams <= 8) {
        setCurrentGame('zombie');
        if (socket && roomCode) {
          console.log('[PointingPoker] Requesting server to start zombie game for room:', roomCode, 'with teams:', currentTeams);
          socket.emit('startZombieGame', { roomCode, teams: currentTeams });
        }
      } else if (numTeams === 1 && Object.keys(currentTeams).length > 0) {
        const singleWinningNumber = Object.keys(currentTeams)[0];
        if (socket && roomCode) socket.emit('gameEnded', { roomCode, winningNumber: singleWinningNumber });
      } else {
        // No specific game for this team count, or no consensus.
        // UI will show teams, players can proceed to next round when ready.
        // If all votes are unique, teams object might be large but no game assigned.
        // console.log('No specific game for team count:', numTeams, 'Teams:', currentTeams);
      }
    }
  }, [isRoomJoined, revealed, allVotes, winningNumber, currentGame, socket, roomCode]);

  const getTeamColor = (vote) => {
    const colors = ['#FFC107', '#2196F3', '#4CAF50', '#E91E63', '#9C27B0', '#00BCD4', '#FF9800'];
    const index = fibonacciNumbers.indexOf(vote) % colors.length;
    return colors[index] || '#757575';
  };

  if (!isRoomJoined) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Pointing Poker
          </Typography>
          {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}
          <TextField
            label="Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
          <Button onClick={handleCreateRoom} variant="contained" fullWidth sx={{ mt: 2, mb:1 }} disabled={!userName.trim()}>
            Create New Room
          </Button>
          <Typography align="center" sx={{my:1}}>OR</Typography>
          <TextField
            label="Room Code"
            value={inputRoomCode}
            onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
            fullWidth
            margin="normal"
            inputProps={{ maxLength: 5, style: { textTransform: 'uppercase' } }}
          />
          <Button onClick={handleJoinRoom} variant="outlined" fullWidth sx={{ mt:1 }} disabled={!userName.trim() || !inputRoomCode.trim()}>
            Join Room
          </Button>
        </Paper>
      </Container>
    );
  }

  // Main Poker Room UI
  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
            <Typography variant="h4" component="h1">
            Pointing Poker - Round {currentRound}
            </Typography>
            <Button onClick={handleLeaveRoom} variant="outlined" color="error" size="small">Leave Room</Button>
        </Box>
        <Typography variant="subtitle1" gutterBottom>
            Room Code: <strong>{roomCode}</strong> (Share this with others) | Your Name: <strong>{userName}</strong>
        </Typography>
        
        {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}

        <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
                <Typography variant="h6">Players ({players.length}):</Typography>
                <List dense>
                    {players.map((player, index) => (
                    <ListItem key={index} sx={{bgcolor: player === userName ? 'action.hover' : 'transparent'}}>
                        <ListItemText primary={player} />
                    </ListItem>
                    ))}
                </List>
                <BacklogItems 
                  currentRound={currentRound} 
                  allVotes={backlogVotes}
                  players={players}
                  revealed={revealed}
                  isSessionComplete={isSessionComplete}
                />
            </Grid>

            <Grid item xs={12} md={9}>
                {winningNumber && (
                <Typography variant="h5" component="h2" color="primary" gutterBottom align="center" sx={{mb: 2}}>
                    Winning Number for Round {currentRound > 1 ? currentRound -1 : 'Previous'}: {winningNumber}
                </Typography>
                )}

                {!currentGame && !winningNumber && (
                <>
                    <Typography variant="h6" gutterBottom align="center">
                    {revealed ? "Votes are in!" : "Cast your vote!"}
                    </Typography>
                    <Grid container spacing={1} justifyContent="center" sx={{ mb: 3 }}>
                    {fibonacciNumbers.map((number) => (
                        <Grid item key={number}>
                        <Button
                            variant={myVote === number ? "contained" : "outlined"}
                            onClick={() => handleVote(number)}
                            disabled={revealed || !!allVotes[userName] || winningNumber}
                            size="large"
                        >
                            {number}
                        </Button>
                        </Grid>
                    ))}
                    </Grid>

                    {!revealed && (
                    <Box textAlign="center" sx={{ mb: 2 }}>
                        <Button variant="contained" color="secondary" onClick={handleShowVotes} 
                                disabled={Object.keys(allVotes).length === 0 || Object.keys(allVotes).length < players.length || winningNumber}
                        >
                        Show Votes ( {Object.keys(allVotes).length} / {players.length} voted )
                        </Button>
                    </Box>
                    )}
                </>
                )}

                {revealed && teams && !currentGame && !winningNumber && (
                <Box sx={{ mt: 3 }}>
                    <Typography variant="h6" gutterBottom align="center">Teams based on votes:</Typography>
                    {Object.keys(teams).length > 0 ? (
                        <Grid container spacing={2} justifyContent="center">
                        {Object.entries(teams).map(([vote, teamUsers]) => (
                            <Grid item key={vote} xs={12} sm={6} md={4}>
                            <Paper elevation={2} sx={{ p: 2, backgroundColor: getTeamColor(vote), color: 'white' }}>
                                <Typography variant="h5" align="center">Vote: {vote}</Typography>
                                <Typography variant="body2" align="center">Players: {teamUsers.length} ({teamUsers.join(', ')})</Typography>
                            </Paper>
                            </Grid>
                        ))}
                        </Grid>
                    ) : (
                        <Typography align="center" sx={{mt:1}}>No consensus or all unique votes. Waiting for game decision or next round.</Typography>
                    )}
                    {!currentGame && Object.keys(teams).length > 0 && (
                        <Typography variant="caption" display="block" sx={{ mt: 2, textAlign: 'center' }}>
                            Game will start based on team count if applicable...
                        </Typography>
                    )}
                </Box>
                )}
                
                {revealed && Object.keys(allVotes).length > 0 && !teams && !winningNumber && !currentGame && (
                    <Typography variant="body1" align="center" sx={{mt: 2}}>Calculating teams...</Typography>
                )}

                {currentGame === 'pong' && teams && <PongGame 
                    teams={teams} 
                    onGameEnd={handleGameEnd} 
                    myName={userName} 
                    winningNumber={winningNumber} 
                    socket={socket}
                    roomCode={roomCode}
                />}
                {currentGame === 'racing' && teams && <RacingGame 
                    teams={teams} 
                    onGameEnd={handleGameEnd} 
                    myName={userName} 
                    winningNumber={winningNumber}
                    socket={socket}
                    roomCode={roomCode}
                />}
                {currentGame === 'zombie' && teams && <ZombieGame 
                    teams={teams} 
                    onGameEnd={handleGameEnd} 
                    myName={userName} 
                    winningNumber={winningNumber}
                    socket={socket}
                    roomCode={roomCode}
                />}

                {winningNumber && !currentGame && (
                <Box textAlign="center" sx={{ mt: 3 }}>
                    <Button variant="contained" color="primary" onClick={handleNextRound} size="large">
                    Start Next Round ({currentRound})
                    </Button>
                </Box>
                )}
            </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default PointingPoker; 