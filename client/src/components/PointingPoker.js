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

// Import a CSS file for styling the zombie image (optional, can do inline)
// import './PointingPoker.css'; // Example: Create this file if you prefer separate CSS

const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_SERVER_URL;
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
  const [showZombie, setShowZombie] = useState(false);
  const [zombieOpacity, setZombieOpacity] = useState(1);

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
        // Check if all players voted for the same number
        const allPlayersVoted = players.length > 0 && Object.keys(allVotes).length === players.length;
        const votesArray = Object.values(allVotes);
        const firstVote = votesArray[0];
        const consensusReached = allPlayersVoted && votesArray.every(vote => vote === firstVote);

        if (consensusReached) {
          console.log('Consensus reached! Showing zombie.');
          setShowZombie(true);
          setZombieOpacity(1); // Reset opacity
          // Game still ends, but we show zombie first
          setTimeout(() => {
            if (socket && roomCode) socket.emit('gameEnded', { roomCode, winningNumber: singleWinningNumber });
          }, 2500); // Delay gameEnded to allow zombie to show
        } else {
          // If not consensus (e.g. only one person voted), end game immediately
          if (socket && roomCode) socket.emit('gameEnded', { roomCode, winningNumber: singleWinningNumber });
        }
      } else {
        // No specific game for this team count, or no consensus.
        // UI will show teams, players can proceed to next round when ready.
        // If all votes are unique, teams object might be large but no game assigned.
        // console.log('No specific game for team count:', numTeams, 'Teams:', currentTeams);
      }
    }
  }, [isRoomJoined, revealed, allVotes, winningNumber, currentGame, socket, roomCode, players]);

  useEffect(() => {
    let fadeTimeout;
    let hideTimeout;
    if (showZombie) {
      // Start fade out after a short delay
      fadeTimeout = setTimeout(() => {
        setZombieOpacity(0);
      }, 500); // Start fading after 0.5s

      // Hide zombie and reset after fade animation (1.5s duration)
      hideTimeout = setTimeout(() => {
        setShowZombie(false);
        // setZombieOpacity(1); // Opacity reset is handled when setShowZombie(true)
      }, 2000); // 0.5s delay + 1.5s fade = 2s total
    }
    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(hideTimeout);
    };
  }, [showZombie]);

  const getTeamColor = (vote) => {
    const colors = ['#FFC107', '#2196F3', '#4CAF50', '#E91E63', '#9C27B0', '#00BCD4', '#FF9800'];
    const index = fibonacciNumbers.indexOf(vote) % colors.length;
    return colors[index] || '#757575';
  };

  if (!isRoomJoined) {
    return (
      <Container component="main" maxWidth="xs" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)' /* Adjust 64px if you have a header */ }}>
        <Paper elevation={6} sx={{ p: 4, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: '12px' }}>
          <Typography component="h1" variant="h4" sx={{ mb: 3, color: 'primary.main', fontWeight: 'bold' }}>
            Pointing Poker
          </Typography>
          {errorMessage && <Alert severity="error" sx={{ mb: 2, width: '100%' }}>{errorMessage}</Alert>}
          <TextField
            label="Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            fullWidth
            margin="normal"
            required
            variant="outlined"
            sx={{ mb: 2 }}
          />
          <Button
            onClick={handleCreateRoom}
            variant="contained"
            fullWidth
            sx={{ mt: 2, mb: 1, py: 1.5, borderRadius: '8px', fontWeight: 'medium' }}
            disabled={!userName.trim()}
          >
            Create New Room
          </Button>
          <Typography align="center" sx={{ my: 2, color: 'text.secondary' }}>
            OR
          </Typography>
          <TextField
            label="Room Code"
            value={inputRoomCode}
            onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
            fullWidth
            margin="normal"
            required
            variant="outlined"
            inputProps={{ maxLength: 5, style: { textTransform: 'uppercase', textAlign: 'center' }, "aria-label": "Room Code" }}
            sx={{ mb: 1 }}
          />
          <Button
            onClick={handleJoinRoom}
            variant="outlined"
            fullWidth
            sx={{ mt: 1, mb: 2, py: 1.5, borderRadius: '8px', fontWeight: 'medium' }}
            disabled={!userName.trim() || !inputRoomCode.trim()}
          >
            Join Room
          </Button>
        </Paper>
      </Container>
    );
  }

  // Main Poker Room UI
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={6} sx={{ p: { xs: 2, sm: 3 }, borderRadius: '12px' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h4" component="h1" sx={{ color: 'primary.main', fontWeight: 'bold', mb: { xs: 1, sm: 0 } }}>
            Round {currentRound}
          </Typography>
          <Button 
              onClick={handleLeaveRoom} 
              variant="outlined" 
              color="error" 
              sx={{ py: 0.8, borderRadius: '8px', fontWeight: 'medium' }}
          >
              Leave Room
          </Button>
        </Box>
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Room: <strong>{roomCode}</strong> | User: <strong>{userName}</strong>
        </Typography>
        
        {errorMessage && <Alert severity="error" sx={{ mb: 2, width: '100%' }}>{errorMessage}</Alert>}

        <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, borderRadius: '8px', height: '100%' }}>
                <Typography variant="h6" sx={{ mb: 1, color: 'primary.dark' }}>Players ({players.length})</Typography>
                <List dense sx={{ maxHeight: '200px', overflow: 'auto', mb: 2 }}>
                  {players.map((player, index) => (
                    <ListItem 
                      key={index} 
                      sx={{ 
                        bgcolor: player === userName ? 'primary.light' : 'transparent', 
                        color: player === userName ? 'primary.contrastText' : 'text.primary',
                        borderRadius: '4px', 
                        mb: 0.5 
                      }}
                    >
                      <ListItemText primary={player} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>

            <Grid item xs={12} md={9}>
                {winningNumber && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3, p: 2, background: (theme) => theme.palette.success.light, borderRadius: '8px' }}>
                    <Typography variant="h5" component="h2" sx={{ color: (theme) => theme.palette.success.contrastText, fontWeight: 'medium' }}>
                      Round {currentRound > 1 ? currentRound -1 : 'Previous'} Result: {winningNumber}
                    </Typography>
                  </Box>
                )}

                {!currentGame && !winningNumber && (
                  <Paper sx={{ p: {xs: 2, sm: 3}, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="h5" component="h2" sx={{ mb: 3, color: 'primary.main', fontWeight: 'medium' }}>
                      {revealed ? "Votes Revealed!" : "Cast Your Vote"}
                    </Typography>
                    <Grid container spacing={1} justifyContent="center" sx={{ mb: 3, maxWidth: '600px' }}>
                      {fibonacciNumbers.map((number) => (
                        <Grid item key={number} xs={3} sm={'auto'}>
                          <Button
                            variant={myVote === number ? "contained" : "outlined"}
                            onClick={() => handleVote(number)}
                            disabled={revealed || !!allVotes[userName] || winningNumber}
                            sx={{ 
                              minWidth: {xs: 'auto', sm: '50px'}, 
                              height: '50px', 
                              fontSize: '1.1rem', 
                              borderRadius: '8px',
                              width: '100%'
                            }}
                          >
                            {number}
                          </Button>
                        </Grid>
                      ))}
                    </Grid>

                    {!revealed && (
                      <Box sx={{ mb: 2, width: '100%', maxWidth: '300px' }}>
                        <Button 
                          variant="contained" 
                          color="secondary" // Keep secondary for this distinct action
                          onClick={handleShowVotes}
                          disabled={Object.keys(allVotes).length === 0 || Object.keys(allVotes).length < players.length || winningNumber}
                          fullWidth
                          sx={{ py: 1.5, borderRadius: '8px', fontWeight: 'medium' }}
                        >
                          Show Votes ({Object.keys(allVotes).length}/{players.length})
                        </Button>
                      </Box>
                    )}
                  </Paper>
                )}

                {revealed && teams && !currentGame && !winningNumber && (
                  <Box sx={{ mt: 4, width: '100%' }}>
                    <Typography variant="h5" component="h2" sx={{ mb: 3, color: 'primary.main', fontWeight: 'medium', textAlign: 'center' }}>
                      Teams Formed
                    </Typography>
                    {Object.keys(teams).length > 0 ? (
                      <Grid container spacing={2} justifyContent="center">
                        {Object.entries(teams).map(([vote, teamUsers]) => (
                          <Grid item key={vote} xs={12} sm={6} md={4} lg={3}>
                            <Paper 
                              elevation={3} 
                              sx={{ 
                                p: 2, 
                                backgroundColor: getTeamColor(vote), 
                                color: (theme) => theme.palette.getContrastText(getTeamColor(vote)), // Ensure text contrast
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                height: '100%'
                              }}
                            >
                              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{vote}</Typography>
                              <Typography variant="body1" sx={{ mt: 1 }}>{teamUsers.length} Player{teamUsers.length === 1 ? '' : 's'}</Typography>
                              <Typography variant="caption" sx={{ textAlign: 'center' }}>({teamUsers.join(', ')})</Typography>
                            </Paper>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Typography align="center" sx={{mt: 2, color: 'text.secondary'}}>
                        No clear consensus for teams.
                      </Typography>
                    )}
                    {!currentGame && Object.keys(teams).length > 0 && (
                      <Typography variant="body2" display="block" sx={{ mt: 3, textAlign: 'center', color: 'text.secondary' }}>
                        A mini-game might start based on the number of teams formed.
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
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
                    <Button 
                      variant="contained" 
                      color="primary" 
                      onClick={handleNextRound} 
                      sx={{ py: 1.5, px: 4, borderRadius: '8px', fontWeight: 'medium', fontSize: '1.1rem' }}
                    >
                      Start Next Round ({currentRound})
                    </Button>
                  </Box>
                )}
            </Grid>

            {/* New full-width row for BacklogItems */}
            <Grid item xs={12} sx={{ mt: 4 }}>
                <Typography variant="h5" component="h2" sx={{ mb: 2, color: 'primary.dark', fontWeight: 'bold' }}>
                    Backlog Progress
                </Typography>
                <BacklogItems 
                  currentRound={currentRound} 
                  allVotes={backlogVotes}
                  players={players}
                  revealed={revealed}
                  isSessionComplete={isSessionComplete}
                />
            </Grid>
        </Grid>
      </Paper>

      {showZombie && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)', // Optional: semi-transparent background
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999, // Ensure it's on top
            opacity: zombieOpacity,
            transition: 'opacity 1.5s ease-out',
          }}
        >
          <img 
            src="/zombie1.png" // Assuming zombie1.png is in public folder
            alt="Scary Zombie" 
            style={{ 
              maxWidth: '90%', 
              maxHeight: '90%',
              objectFit: 'contain',
            }} 
          />
        </Box>
      )}
    </Container>
  );
};

export default PointingPoker; 