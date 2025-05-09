import React, { useState, useEffect, useRef, useCallback } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';

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
  const keysPressed = useRef({});
  const myPaddleKey = useRef(null); // To store if this client controls 'teamA' or 'teamB' paddle

  const [paddles, setPaddles] = useState({ 
      teamA: { y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, score: 0, name: 'Player A', vote: '' }, 
      teamB: { y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, score: 0, name: 'Player B', vote: '' }
  });
  const [ball, setBall] = useState({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 0, dy: 0 });
  const [gameMessage, setGameMessage] = useState('Waiting for server to start Pong game...');
  const [gameOver, setGameOver] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    console.log(`[PongGame ${myName}] Initial useEffect for key/ref cleanup. Socket: ${!!socket}, RoomCode: ${roomCode}`);
    keysPressed.current = {};
    return () => {
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        if (socket && myPaddleKey.current) {
            if (keysPressed.current['w'] || keysPressed.current['s']) {
                socket.emit('playerPongInput', { roomCode, paddleKey: myPaddleKey.current, inputAction: 'up', pressed: false });
                socket.emit('playerPongInput', { roomCode, paddleKey: myPaddleKey.current, inputAction: 'down', pressed: false });
            }
            if (keysPressed.current['ArrowUp'] || keysPressed.current['ArrowDown']) {
                 socket.emit('playerPongInput', { roomCode, paddleKey: myPaddleKey.current, inputAction: 'up', pressed: false });
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

        if (serverState.paddles.teamA && serverState.paddles.teamA.name === myName) {
            myPaddleKey.current = 'teamA';
            console.log(`[PongGame ${myName}] I am controlling paddle teamA`);
        } else if (serverState.paddles.teamB && serverState.paddles.teamB.name === myName) {
            myPaddleKey.current = 'teamB';
            console.log(`[PongGame ${myName}] I am controlling paddle teamB`);
        } else {
            myPaddleKey.current = null;
            console.log(`[PongGame ${myName}] I am not controlling a paddle.`);
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

  const handleKeyPressChange = useCallback((key, isPressed) => {
    if (gameOver || !gameStarted || !myPaddleKey.current) return;

    let action = null;
    const isTeamAPlayer = myPaddleKey.current === 'teamA';
    const isTeamBPlayer = myPaddleKey.current === 'teamB';

    if (isTeamAPlayer) {
        if (key === 'w' || key === 'W') action = 'up';
        if (key === 's' || key === 'S') action = 'down';
    }
    if (isTeamBPlayer) {
        if (key === 'ArrowUp') action = 'up';
        if (key === 'ArrowDown') action = 'down';
    }

    if (action) {
        console.log(`[${myName}] Emitting playerPongInput:`, { roomCode, paddleKey: myPaddleKey.current, inputAction: action, pressed: isPressed });
        socket.emit('playerPongInput', { 
            roomCode, 
            paddleKey: myPaddleKey.current, 
            inputAction: action, 
            pressed: isPressed 
        });
        keysPressed.current[key] = isPressed;
        if (isPressed && ( (isTeamAPlayer && (key === 'w' || key === 's')) || (isTeamBPlayer && (key === 'ArrowUp' || key === 'ArrowDown')) ) ) {
        }
    }
  }, [socket, roomCode, gameOver, gameStarted, myName]);
  
  useEffect(() => {
    console.log(`[PongGame ${myName}] Setting up keydown/keyup listeners. MyPaddleKey: ${myPaddleKey.current}`);
    const onKeyDown = (e) => {
        const isTeamAControlKey = (myPaddleKey.current === 'teamA' && (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S'));
        const isTeamBControlKey = (myPaddleKey.current === 'teamB' && (e.key === 'ArrowUp' || e.key === 'ArrowDown'));

        if (isTeamAControlKey || isTeamBControlKey) {
            console.log(`[PongGame ${myName}] KeyDown for game: ${e.key}. My paddle: ${myPaddleKey.current}. Attempting preventDefault.`);
            e.preventDefault(); 
            if (!keysPressed.current[e.key]) {
                 handleKeyPressChange(e.key, true);
            }
        }
    };
    const onKeyUp = (e) => {
        if ( (myPaddleKey.current === 'teamA' && (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S')) || 
             (myPaddleKey.current === 'teamB' && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) {
            if (keysPressed.current[e.key]) {
                handleKeyPressChange(e.key, false);
            }
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleKeyPressChange, myName]);

  useEffect(() => {
    if (!gameStarted && !gameOver) {
    }
    const renderLoop = () => {
        gameLoopRef.current = requestAnimationFrame(renderLoop);
    };
    if (!gameOver) {
        gameLoopRef.current = requestAnimationFrame(renderLoop);
    }
    return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
  }, [gameStarted, gameOver]);

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

    ctx.fillStyle = '#333';
    if (paddles.teamA) ctx.fillRect(0, paddles.teamA.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    if (paddles.teamB) ctx.fillRect(CANVAS_WIDTH - PADDLE_WIDTH, paddles.teamB.y, PADDLE_WIDTH, PADDLE_HEIGHT);

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

  console.log(`[PongGame ${myName}] Rendering component. GameStarted: ${gameStarted}, GameOver: ${gameOver}, MyPaddle: ${myPaddleKey.current}, Msg: ${gameMessage}`);
  return (
    <Paper elevation={2} sx={{ mt: 2, p: 2, backgroundColor: 'hsl(200, 30%, 95%)' }}>
      <Typography variant="h5" gutterBottom align="center" color="primary">
        Server Pong! Target: {WINNING_SCORE}
      </Typography>
      <Grid container justifyContent="space-around" sx={{ mb: 1 }}>
        <Grid item xs={5} sx={{textAlign: 'center', border: myPaddleKey.current === 'teamA' ? '2px solid blue' : '1px solid lightgray', p:1}}>
          <Typography variant="h6">{paddleAName}</Typography>
          {paddleAVote && <Typography variant="caption">(Vote: {paddleAVote})</Typography>}
          <Typography variant="h4">{paddleAScore}</Typography>
          {myPaddleKey.current === 'teamA' && <Typography variant="caption" color="secondary">(Controls: W/S)</Typography>}
        </Grid>
        <Grid item xs={5} sx={{textAlign: 'center', border: myPaddleKey.current === 'teamB' ? '2px solid blue' : '1px solid lightgray', p:1}}>
          <Typography variant="h6">{paddleBName}</Typography>
          {paddleBVote && <Typography variant="caption">(Vote: {paddleBVote})</Typography>}
          <Typography variant="h4">{paddleBScore}</Typography>
          {myPaddleKey.current === 'teamB' && <Typography variant="caption" color="secondary">(Controls: ↑/↓)</Typography>}
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
    </Paper>
  );
};

export default PongGame; 