import React, { useState, useEffect, useRef, useCallback } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_RADIUS = 7;
const INITIAL_BALL_SPEED_X = 2.5; // Slower speed
const INITIAL_BALL_SPEED_Y = 2.5; // Slower speed
const BALL_SPEED_INCREASE_FACTOR = 1.03; // Slower increase
const WINNING_SCORE = 5;
const COUNTDOWN_SECONDS = 5;

const PongGame = ({ teams, onGameEnd, myName, winningNumber: officialWinningNumber, socket, roomCode }) => {
  console.log(`[PongGame] Component mounted/rendered. MyName: ${myName}, RoomCode: ${roomCode}, Socket available: ${!!socket}`);
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const myPaddleKey = useRef(null); // To store if this client controls 'teamA' or 'teamB' paddle
  const keysPressed = useRef({});

  const [paddles, setPaddles] = useState({ 
      teamA: { y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, score: 0, name: 'Player A', vote: '', color: '#FF5733' }, 
      teamB: { y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, score: 0, name: 'Player B', vote: '', color: '#3357FF' }
  });
  const [ball, setBall] = useState({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 0, dy: 0 });
  const [gameMessage, setGameMessage] = useState('Waiting for server to start Pong game...');
  const [gameOver, setGameOver] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  const handleInput = useCallback((action, pressed) => {
    if (gameOver || !gameStarted || !myPaddleKey.current) {
      console.log(`[${myName}] Input ignored: gameOver=${gameOver}, gameStarted=${gameStarted}, myPaddleKey=${myPaddleKey.current}`);
      return;
    }

    console.log(`[${myName}] Emitting playerPongInput:`, { 
      roomCode, 
      paddleKey: myPaddleKey.current, 
      inputAction: action, 
      pressed: pressed 
    });
    
    socket.emit('playerPongInput', { 
      roomCode, 
      paddleKey: myPaddleKey.current, 
      inputAction: action, 
      pressed: pressed 
    });
  }, [socket, roomCode, gameOver, gameStarted, myName]);

  const handleKeyDown = useCallback((e) => {
    if (gameOver || !gameStarted || !myPaddleKey.current) return;

    if (e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (!keysPressed.current['w']) {
        handleInput('up', true);
      }
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (!keysPressed.current['s']) {
        handleInput('down', true);
      }
    }
    keysPressed.current[e.key.toLowerCase()] = true;
  }, [handleInput, gameOver, gameStarted]);

  const handleKeyUp = useCallback((e) => {
    if (!myPaddleKey.current) return;
    
    if (e.key === 'w' || e.key === 'W') {
      if (keysPressed.current['w']) {
        handleInput('up', false);
      }
    } else if (e.key === 's' || e.key === 'S') {
      if (keysPressed.current['s']) {
        handleInput('down', false);
      }
    }
    keysPressed.current[e.key.toLowerCase()] = false;
  }, [handleInput]);

  const handleWindowBlur = useCallback(() => {
    if (!myPaddleKey.current || !socket) return;
    
    ['w', 's'].forEach(key => {
      if (keysPressed.current[key]) {
        handleInput(key === 'w' ? 'up' : 'down', false);
        keysPressed.current[key] = false;
      }
    });
  }, [handleInput, socket]);

  const handleWindowFocus = useCallback(() => {
    keysPressed.current = {};
  }, []);

  // Set up keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      
      if (socket && myPaddleKey.current) {
        ['w', 's'].forEach(key => {
          if (keysPressed.current[key]) {
            handleInput(key === 'w' ? 'up' : 'down', false);
          }
        });
      }
    };
  }, [handleKeyDown, handleKeyUp, handleWindowBlur, handleWindowFocus, handleInput, socket]);

  // Cleanup on unmount
  useEffect(() => {
    console.log(`[PongGame ${myName}] Initial useEffect for cleanup. Socket: ${!!socket}, RoomCode: ${roomCode}`);
    return () => {
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (socket && myPaddleKey.current) {
            if (keysPressed.current['w'] || keysPressed.current['W']) {
                socket.emit('playerPongInput', { roomCode, paddleKey: myPaddleKey.current, inputAction: 'up', pressed: false });
            }
            if (keysPressed.current['s'] || keysPressed.current['S']) {
                socket.emit('playerPongInput', { roomCode, paddleKey: myPaddleKey.current, inputAction: 'down', pressed: false });
            }
        }
    };
  }, [socket, roomCode]);

  useEffect(() => {
    console.log(`[PongGame ${myName}] Attempting to set up socket listeners. Socket available: ${!!socket}`);
    if (!socket) {
      console.error(`[PongGame ${myName}] Socket is null, cannot set up listeners.`);
      return;
    }

    const handlePongGameStarted = (data) => {
        console.log(`[PongGame ${myName}] Received pongGameStarted from server:`, data);
        const serverState = data.pongGameState;
        setPaddles(serverState.paddles);
        setBall(serverState.ball);
        setCountdown(serverState.countdown || 0);
        setGameStarted(false);
        setGameOver(false);
        setGameMessage(`Game starting in ${serverState.countdown || 0}...`);

        if (serverState.paddles.teamA && serverState.paddles.teamA.playerId === socket.id) {
            myPaddleKey.current = 'teamA';
            console.log(`[PongGame ${myName}] I am controlling paddle teamA (socket.id match)`);
        } else if (serverState.paddles.teamB && serverState.paddles.teamB.playerId === socket.id) {
            myPaddleKey.current = 'teamB';
            console.log(`[PongGame ${myName}] I am controlling paddle teamB (socket.id match)`);
        } else {
            myPaddleKey.current = null;
            console.log(`[PongGame ${myName}] I am not controlling a paddle (no socket.id match).`);
        }
    };

    const handlePongCountdownUpdate = (data) => {
        setCountdown(data.countdown);
        if (data.countdown > 0) {
            setGameMessage(`Game starts in ${data.countdown}...`);
        } else {
            setGameMessage('Go!');
            setGameStarted(true);
        }
    };

    const handlePongGameUpdate = (data) => {
        if (data.pongGameState) {
            setPaddles(data.pongGameState.paddles);
            setBall(data.pongGameState.ball);
        }
    };

    socket.on('pongGameStarted', handlePongGameStarted);
    socket.on('pongCountdownUpdate', handlePongCountdownUpdate);
    socket.on('pongGameUpdate', handlePongGameUpdate);

    return () => {
        socket.off('pongGameStarted', handlePongGameStarted);
        socket.off('pongCountdownUpdate', handlePongCountdownUpdate);
        socket.off('pongGameUpdate', handlePongGameUpdate);
    };
  }, [socket, myName]);

  useEffect(() => {
    if (officialWinningNumber && !gameOver) {
      let winnerPaddleKey = null;
      if (paddles.teamA && paddles.teamA.vote === officialWinningNumber) winnerPaddleKey = 'teamA';
      else if (paddles.teamB && paddles.teamB.vote === officialWinningNumber) winnerPaddleKey = 'teamB';

      if (winnerPaddleKey) {
        setGameMessage(`${paddles[winnerPaddleKey].name} (Team Vote: ${paddles[winnerPaddleKey].vote}) Wins! (Confirmed)`);
        setGameOver(true);
      }
    }
  }, [officialWinningNumber, gameOver, paddles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = '#cccccc';
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.stroke();

    // Draw paddles with their respective colors
    if (paddles.teamA) {
        ctx.fillStyle = paddles.teamA.color || '#FF5733'; // Default to red-orange if no color
        ctx.fillRect(0, paddles.teamA.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    }
    if (paddles.teamB) {
        ctx.fillStyle = paddles.teamB.color || '#3357FF'; // Default to blue if no color
        ctx.fillRect(CANVAS_WIDTH - PADDLE_WIDTH, paddles.teamB.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    }

    if ((gameStarted || gameOver) && ball) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4500';
      ctx.fill();
      ctx.closePath();
    }
  }, [paddles, ball, gameStarted, gameOver]);

  const paddleAName = paddles.teamA?.name || "Team A";
  const paddleAVote = paddles.teamA?.vote;
  const paddleAScore = paddles.teamA?.score || 0;
  const paddleBName = paddles.teamB?.name || "Team B";
  const paddleBVote = paddles.teamB?.vote;
  const paddleBScore = paddles.teamB?.score || 0;

  const gameInstructions = `Controls: W/S keys or on-screen buttons to move paddle up/down`;

  console.log(`[PongGame ${myName}] Rendering component. GameStarted: ${gameStarted}, GameOver: ${gameOver}, MyPaddle: ${myPaddleKey.current}, Msg: ${gameMessage}`);
  return (
    <Paper elevation={2} sx={{ mt: 2, p: 2, backgroundColor: 'hsl(200, 30%, 95%)' }}>
      <Box sx={{display:'flex', justifyContent:'space-between', alignItems:'center', mb:1}}>
        <Typography variant="h5" gutterBottom align="center" color="primary">
          Server Pong! Target: {WINNING_SCORE}
        </Typography>
        <Tooltip title={gameInstructions}>
          <IconButton size="small">
            <HelpOutlineIcon fontSize="small"/>
          </IconButton>
        </Tooltip>
      </Box>
      <Grid container justifyContent="space-around" sx={{ mb: 1 }}>
        <Grid item xs={5} sx={{textAlign: 'center', border: myPaddleKey.current === 'teamA' ? '2px solid blue' : '1px solid lightgray', p:1}}>
          <Typography variant="h6">{paddleAName}</Typography>
          {paddleAVote && <Typography variant="caption">(Vote: {paddleAVote})</Typography>}
          <Typography variant="h4">{paddleAScore}</Typography>
          {myPaddleKey.current === 'teamA' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="secondary">(Controls: W/S or Buttons)</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mt: 1 }}>
                <Button 
                  variant="contained" 
                  color="primary"
                  onMouseDown={() => handleInput('up', true)}
                  onMouseUp={() => handleInput('up', false)}
                  onMouseLeave={() => handleInput('up', false)}
                  startIcon={<ArrowUpwardIcon />}
                >
                  Up
                </Button>
                <Button 
                  variant="contained" 
                  color="primary"
                  onMouseDown={() => handleInput('down', true)}
                  onMouseUp={() => handleInput('down', false)}
                  onMouseLeave={() => handleInput('down', false)}
                  startIcon={<ArrowDownwardIcon />}
                >
                  Down
                </Button>
              </Box>
            </Box>
          )}
        </Grid>
        <Grid item xs={5} sx={{textAlign: 'center', border: myPaddleKey.current === 'teamB' ? '2px solid blue' : '1px solid lightgray', p:1}}>
          <Typography variant="h6">{paddleBName}</Typography>
          {paddleBVote && <Typography variant="caption">(Vote: {paddleBVote})</Typography>}
          <Typography variant="h4">{paddleBScore}</Typography>
          {myPaddleKey.current === 'teamB' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="secondary">(Controls: W/S or Buttons)</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mt: 1 }}>
                <Button 
                  variant="contained" 
                  color="primary"
                  onMouseDown={() => handleInput('up', true)}
                  onMouseUp={() => handleInput('up', false)}
                  onMouseLeave={() => handleInput('up', false)}
                  startIcon={<ArrowUpwardIcon />}
                >
                  Up
                </Button>
                <Button 
                  variant="contained" 
                  color="primary"
                  onMouseDown={() => handleInput('down', true)}
                  onMouseUp={() => handleInput('down', false)}
                  onMouseLeave={() => handleInput('down', false)}
                  startIcon={<ArrowDownwardIcon />}
                >
                  Down
                </Button>
              </Box>
            </Box>
          )}
        </Grid>
      </Grid>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, backgroundColor: '#e0e0e0' }}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '1px solid #111' }} />
      </Box>
      <Alert severity={gameOver && officialWinningNumber ? 'success' : (countdown > 0 || !gameStarted) ? 'info' : 'success'} sx={{ textAlign: 'center'}}>
        <Typography variant="subtitle1">
          {countdown > 0 && !gameStarted ? `Starting in ${countdown}...` : gameMessage}
        </Typography>
      </Alert>
      <Box sx={{ mt: 1, p:1, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius:1}}>
        <Typography variant="caption" display="block" textAlign="center" sx={{px:1}}>
          <strong>Instructions:</strong> {gameInstructions}
        </Typography>
      </Box>
    </Paper>
  );
};

export default PongGame; 