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

const PongGame = ({ teams, onGameEnd, myName, winningNumber: officialWinningNumber }) => {
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const [player1, setPlayer1] = useState(null); // { name, vote, y, score, isCurrentUser }
  const [player2, setPlayer2] = useState(null); // { name, vote, y, score, isCurrentUser }
  const [ball, setBall] = useState({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 0, dy: 0 }); // Initial speed 0 for countdown
  const [gameMessage, setGameMessage] = useState('Loading game...');
  const [gameOver, setGameOver] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [gameStarted, setGameStarted] = useState(false); // To control when ball starts moving

  // Initialize players and game state
  useEffect(() => {
    const teamEntries = Object.entries(teams);
    if (teamEntries.length === 2) {
      const teamAData = { vote: teamEntries[0][0], players: teamEntries[0][1] };
      const teamBData = { vote: teamEntries[1][0], players: teamEntries[1][1] };

      const p1Name = teamAData.players[0]; // First player of Team A
      const p2Name = teamBData.players[0]; // First player of Team B

      setPlayer1({
        name: p1Name,
        vote: teamAData.vote,
        y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        score: 0,
        isCurrentUser: myName === p1Name,
      });
      setPlayer2({
        name: p2Name,
        vote: teamBData.vote,
        y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        score: 0,
        isCurrentUser: myName === p2Name,
      });
      setBall({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 0, dy: 0 }); // Keep speed 0
      setGameMessage(`Game starts in ${COUNTDOWN_SECONDS}...`);
      setCountdown(COUNTDOWN_SECONDS);
      setGameStarted(false);
      setGameOver(false);
    } else {
      setGameMessage('Pong requires exactly 2 teams. Waiting for votes or next round.');
      setPlayer1(null);
      setPlayer2(null);
      setGameOver(true);
    }
    // Cleanup refs on re-initialization or unmount
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [teams, myName]);

  // Countdown Logic
  useEffect(() => {
    if (player1 && player2 && !gameStarted && !gameOver && countdown > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prevCount => {
          const nextCount = prevCount - 1;
          if (nextCount <= 0) {
            clearInterval(countdownIntervalRef.current);
            setGameStarted(true);
            setGameMessage('Go!');
            setBall(b => ({ ...b, dx: Math.random() > 0.5 ? INITIAL_BALL_SPEED_X : -INITIAL_BALL_SPEED_X, dy: Math.random() > 0.5 ? INITIAL_BALL_SPEED_Y : -INITIAL_BALL_SPEED_Y }));
            return 0;
          }
          setGameMessage(`Game starts in ${nextCount}...`);
          return nextCount;
        });
      }, 1000);
    } else if (countdown <= 0 && !gameStarted && player1 && player2 && !gameOver) { // Handles race condition if countdown finishes fast
      clearInterval(countdownIntervalRef.current); // Ensure cleared
      setGameStarted(true);
      setGameMessage('Go!');
      setBall(b => ({ ...b, dx: Math.random() > 0.5 ? INITIAL_BALL_SPEED_X : -INITIAL_BALL_SPEED_X, dy: Math.random() > 0.5 ? INITIAL_BALL_SPEED_Y : -INITIAL_BALL_SPEED_Y }));
    }
    return () => clearInterval(countdownIntervalRef.current);
  }, [player1, player2, gameStarted, gameOver, countdown]);

  // Keyboard controls
  const handleKeyDown = useCallback((e) => {
    if (!player1 || !player2 || gameOver || !gameStarted) return;
    const moveSpeed = 20;
    let keyProcessed = false;
    if (player1.isCurrentUser) {
      if (e.key === 'w' || e.key === 'W') { setPlayer1(p => ({ ...p, y: Math.max(0, p.y - moveSpeed) })); keyProcessed = true; }
      if (e.key === 's' || e.key === 'S') { setPlayer1(p => ({ ...p, y: Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p.y + moveSpeed) })); keyProcessed = true; }
    }
    if (player2.isCurrentUser) {
      if (e.key === 'ArrowUp') { setPlayer2(p => ({ ...p, y: Math.max(0, p.y - moveSpeed) })); keyProcessed = true; }
      if (e.key === 'ArrowDown') { setPlayer2(p => ({ ...p, y: Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p.y + moveSpeed) })); keyProcessed = true; }
    }
    if (keyProcessed) {
      e.preventDefault(); // Prevent page scrolling
    }
  }, [player1, player2, gameOver, gameStarted]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Game Loop & Logic
  useEffect(() => {
    if (!player1 || !player2 || gameOver || !gameStarted) {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      return;
    }
    const game = () => {
      if (gameOver) { // Double check gameOver inside the loop
        cancelAnimationFrame(gameLoopRef.current);
        return;
      }
      setBall(prevBall => {
        if (prevBall.dx === 0 && prevBall.dy === 0 && !gameStarted) return prevBall;
        let newX = prevBall.x + prevBall.dx;
        let newY = prevBall.y + prevBall.dy;
        let newDx = prevBall.dx;
        let newDy = prevBall.dy;

        if (newY + BALL_RADIUS > CANVAS_HEIGHT || newY - BALL_RADIUS < 0) newDy = -newDy;

        if (newX - BALL_RADIUS < PADDLE_WIDTH && newY > player1.y && newY < player1.y + PADDLE_HEIGHT) {
          newDx = -newDx * BALL_SPEED_INCREASE_FACTOR;
          newX = PADDLE_WIDTH + BALL_RADIUS;
        } else if (newX + BALL_RADIUS > CANVAS_WIDTH - PADDLE_WIDTH && newY > player2.y && newY < player2.y + PADDLE_HEIGHT) {
          newDx = -newDx * BALL_SPEED_INCREASE_FACTOR;
          newX = CANVAS_WIDTH - PADDLE_WIDTH - BALL_RADIUS;
        }

        if (newX - BALL_RADIUS < 0) {
          setPlayer2(p => p && !gameOver ? ({ ...p, score: p.score + 1 }) : p);
          newX = CANVAS_WIDTH / 2; newY = CANVAS_HEIGHT / 2; newDx = -INITIAL_BALL_SPEED_X; newDy = (Math.random() - 0.5) * INITIAL_BALL_SPEED_Y * 2;
        } else if (newX + BALL_RADIUS > CANVAS_WIDTH) {
          setPlayer1(p => p && !gameOver ? ({ ...p, score: p.score + 1 }) : p);
          newX = CANVAS_WIDTH / 2; newY = CANVAS_HEIGHT / 2; newDx = INITIAL_BALL_SPEED_X; newDy = (Math.random() - 0.5) * INITIAL_BALL_SPEED_Y * 2;
        }
        return { x: newX, y: newY, dx: newDx, dy: newDy };
      });
      if (!gameOver) gameLoopRef.current = requestAnimationFrame(game);
    };
    if ((player1.isCurrentUser || player2.isCurrentUser) && gameStarted && !gameOver) {
      gameLoopRef.current = requestAnimationFrame(game);
    }
    return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
  }, [player1, player2, gameOver, gameStarted]);

  // Check for Local Winner
  useEffect(() => {
    if (!player1 || !player2 || gameOver || !gameStarted) return;

    if (player1.score >= WINNING_SCORE) {
      if (!gameOver) { // Ensure onGameEnd is called only once
        setGameMessage(`${player1.name} (Team Vote: ${player1.vote}) Wins!`);
        setGameOver(true);
        onGameEnd(player1.vote);
      }
    } else if (player2.score >= WINNING_SCORE) {
      if (!gameOver) { // Ensure onGameEnd is called only once
        setGameMessage(`${player2.name} (Team Vote: ${player2.vote}) Wins!`);
        setGameOver(true);
        onGameEnd(player2.vote);
      }
    }
  }, [player1, player2, onGameEnd, gameOver, gameStarted]);

  // Synchronize Game Over state based on officialWinningNumber from parent
  useEffect(() => {
    if (officialWinningNumber && !gameOver) {
      let winner, loser;
      if (player1 && officialWinningNumber === player1.vote) { winner = player1; loser = player2; }
      else if (player2 && officialWinningNumber === player2.vote) { winner = player2; loser = player1; }

      if (winner) {
        setGameMessage(`${winner.name} (Team Vote: ${winner.vote}) Wins! (Confirmed)`);
        setPlayer1(p => p && p.name === winner.name ? { ...p, score: WINNING_SCORE } : (p && loser && p.name === loser.name ? {...p, score: loser.score} : p));
        setPlayer2(p => p && p.name === winner.name ? { ...p, score: WINNING_SCORE } : (p && loser && p.name === loser.name ? {...p, score: loser.score} : p));
        setGameOver(true);
      }
    }
    // If officialWinningNumber becomes null (e.g. new round started), reset game over if it was set by this effect
    if (!officialWinningNumber && gameOver && gameMessage.includes("(Confirmed)")) {
      // This case might be tricky if game also ended locally. Generally, parent unmounts PongGame for new round.
      // For robustness, if parent says no winner, but game was ended by this sync, consider reset only if component is still mounted.
    }
  }, [officialWinningNumber, gameOver, player1, player2, gameMessage]); // gameMessage dependency added to re-evaluate if it changes

  // Drawing on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !player1 || !player2) return;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw center line
    ctx.strokeStyle = '#cccccc';
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.stroke();

    // Draw paddles
    ctx.fillStyle = '#333';
    ctx.fillRect(0, player1.y, PADDLE_WIDTH, PADDLE_HEIGHT); // Player 1 paddle
    ctx.fillRect(CANVAS_WIDTH - PADDLE_WIDTH, player2.y, PADDLE_WIDTH, PADDLE_HEIGHT); // Player 2 paddle

    // Draw ball
    if ((gameStarted || gameOver) && ball) { // Also check if ball is initialized
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4500';
      ctx.fill();
      ctx.closePath();
    }
  }, [player1, player2, ball, gameStarted, gameOver]);

  if (!player1 || !player2) {
    return (
      <Paper elevation={2} sx={{ mt: 2, p: 3, backgroundColor: 'hsl(0, 0%, 95%)' }}>
        <Typography variant="h5" align="center">{gameMessage}</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ mt: 2, p: 2, backgroundColor: 'hsl(200, 30%, 95%)' }}>
      <Typography variant="h5" gutterBottom align="center" color="primary">
        Pong Game: {player1.name} vs {player2.name}
      </Typography>
      
      <Grid container spacing={1} justifyContent="center" alignItems="center" sx={{ mb: 1 }}>
        <Grid item xs={5} textAlign="center">
          <Typography variant="h6">{player1.name} (Vote: {player1.vote})</Typography>
          <Typography variant="h4">Score: {player1.score}</Typography>
          {player1.isCurrentUser && !gameOver && gameStarted && <Typography variant="caption">(Controls: W/S)</Typography>}
        </Grid>
        <Grid item xs={2} textAlign="center">
          <Typography variant="h5">VS</Typography>
        </Grid>
        <Grid item xs={5} textAlign="center">
          <Typography variant="h6">{player2.name} (Vote: {player2.vote})</Typography>
          <Typography variant="h4">Score: {player2.score}</Typography>
          {player2.isCurrentUser && !gameOver && gameStarted && <Typography variant="caption">(Controls: Arrow Up/Down)</Typography>}
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '1px solid #333' }} />
      </Box>
      
      <Alert severity={gameOver ? (player1.score >= WINNING_SCORE || player2.score >= WINNING_SCORE ? "success" : "info") : "info"} sx={{mt:1}}>
        {countdown > 0 && !gameStarted ? `Starting in ${countdown}...` : gameMessage}
      </Alert>

      <Box sx={{mt:2}}>
        <Typography variant="caption" display="block"> 
            Only the assigned players ({player1.name} and {player2.name}) can control paddles. 
            Others spectate. Game ends when one player reaches {WINNING_SCORE} points.
        </Typography>
      </Box>
    </Paper>
  );
};

export default PongGame; 