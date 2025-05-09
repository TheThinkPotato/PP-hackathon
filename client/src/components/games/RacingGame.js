import React, { useState, useEffect, useRef, useCallback } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';

const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 500;
const CAR_WIDTH = 20;
const CAR_HEIGHT = 35;
const WINNING_LAPS = 3;
const COUNTDOWN_SECONDS = 5;

// Track dimensions (simple oval)
const TRACK_MARGIN = 50;
const TRACK_WIDTH = CANVAS_WIDTH - 2 * TRACK_MARGIN;
const TRACK_HEIGHT = CANVAS_HEIGHT - 2 * TRACK_MARGIN;
const TRACK_THICKNESS = 100; // Width of the raceable surface
const FINISH_LINE_X = TRACK_MARGIN + TRACK_WIDTH / 2;
const FINISH_LINE_Y_START = TRACK_MARGIN + (TRACK_HEIGHT - TRACK_THICKNESS) / 2;
const FINISH_LINE_Y_END = FINISH_LINE_Y_START + TRACK_THICKNESS;

const carColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F1C40F', '#1ABC9C'];

// Helper to check if point is within the track boundaries (simplified)
const isPointOnTrack = (x, y) => {
    const h_center = CANVAS_WIDTH / 2;
    const k_center = CANVAS_HEIGHT / 2;

    // Outer ellipse bounds
    const a_outer = TRACK_WIDTH / 2;
    const b_outer = TRACK_HEIGHT / 2;
    const term_outer = ((x - h_center) ** 2) / (a_outer ** 2) + ((y - k_center) ** 2) / (b_outer ** 2);

    // Inner ellipse bounds (the hole in the donut)
    const a_inner = (TRACK_WIDTH - 2 * TRACK_THICKNESS) / 2;
    const b_inner = (TRACK_HEIGHT - 2 * TRACK_THICKNESS) / 2;
    const term_inner = ((x - h_center) ** 2) / (a_inner ** 2) + ((y - k_center) ** 2) / (b_inner ** 2);
    
    // Check if point is within the outer ellipse and outside the inner ellipse (or on their edges with leeway)
    return term_outer <= 1.05 && (a_inner <=0 || b_inner <=0 || term_inner >= 0.95); // if inner track is non-existent (too thick), only outer check applies
};

const RacingGame = ({ teams, onGameEnd, myName, winningNumber: officialWinningNumber }) => {
    const canvasRef = useRef(null);
    const gameLoopRef = useRef(null);
    const countdownIntervalRef = useRef(null);

    const [cars, setCars] = useState([]); // { id, name, vote, x, y, angle, speed, lap, isPlayer, color, justCrossedFinish }
    const [gameMessage, setGameMessage] = useState('Loading race...');
    const [gameOver, setGameOver] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [gameStarted, setGameStarted] = useState(false);

    // Initialize cars
    useEffect(() => {
        const teamEntries = Object.entries(teams);
        if (teamEntries.length < 1) {
            setGameMessage('Racing game requires at least 1 team/car.');
            setGameOver(true);
            return;
        }
        const initialCars = teamEntries.map(([vote, players], index) => ({
            id: vote,
            name: players[0],
            teamVote: vote,
            x: CANVAS_WIDTH / 2 + (index - (teamEntries.length -1) / 2) * (CAR_WIDTH + 15), 
            y: FINISH_LINE_Y_START + TRACK_THICKNESS / 2, 
            angle: -Math.PI / 2,
            speed: 0,
            lap: 0,
            isPlayer: myName === players[0],
            color: carColors[index % carColors.length],
            justCrossedFinish: false,
            teamMembers: players,
        }));
        setCars(initialCars);
        setGameMessage(`Race starts in ${COUNTDOWN_SECONDS}...`);
        setCountdown(COUNTDOWN_SECONDS);
        setGameStarted(false);
        setGameOver(false);
        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [teams, myName]);

    // Countdown Logic
    useEffect(() => {
        if (cars.length > 0 && !gameStarted && !gameOver && countdown > 0) {
            countdownIntervalRef.current = setInterval(() => {
                setCountdown(prevCount => {
                    const nextCount = prevCount - 1;
                    if (nextCount <= 0) {
                        clearInterval(countdownIntervalRef.current);
                        setGameStarted(true);
                        setGameMessage('GO RACE!');
                        return 0;
                    }
                    setGameMessage(`Race starts in ${nextCount}...`);
                    return nextCount;
                });
            }, 1000);
        } else if (countdown <= 0 && !gameStarted && cars.length > 0 && !gameOver) {
            clearInterval(countdownIntervalRef.current);
            setGameStarted(true);
            setGameMessage('GO RACE!');
        }
        return () => clearInterval(countdownIntervalRef.current);
    }, [cars, gameStarted, gameOver, countdown]);

    // Keyboard controls state
    const keysPressed = useRef({});
    const handleKeyDown = useCallback((e) => {
        if (gameOver || !gameStarted) return;
        keysPressed.current[e.key] = true;
        const myCar = cars.find(car => car.isPlayer);
        if (myCar && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
        }
    }, [cars, gameOver, gameStarted]);
    const handleKeyUp = useCallback((e) => {
        keysPressed.current[e.key] = false;
        const myCar = cars.find(car => car.isPlayer);
        if (myCar && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
             e.preventDefault();
        }
    }, [cars]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // Game Loop & Logic
    useEffect(() => {
        if (cars.length === 0 || gameOver || !gameStarted) {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            return;
        }
        const game = () => {
            if (gameOver) { cancelAnimationFrame(gameLoopRef.current); return; }
            setCars(prevCars => prevCars.map(car => {
                let { x, y, angle, speed, lap, isPlayer, justCrossedFinish } = car;
                if (isPlayer) {
                    if (keysPressed.current['ArrowUp']) speed = Math.min(4, speed + 0.08); // Max speed 4, acceleration 0.08
                    else speed = Math.max(0, speed - 0.06); // Natural deceleration 0.06
                    if (keysPressed.current['ArrowLeft'] && speed > 0.1) angle -= 0.035 * (speed / 4); 
                    if (keysPressed.current['ArrowRight'] && speed > 0.1) angle += 0.035 * (speed / 4);
                } else { /* Basic AI could go here */ }

                const prevX = x; const prevY = y;
                x += Math.sin(angle) * speed;
                y -= Math.cos(angle) * speed;

                if (!isPointOnTrack(x, y)) {
                    x = prevX; y = prevY;
                    speed *= 0.4; 
                }
                if (x > FINISH_LINE_X && prevX <= FINISH_LINE_X && y > FINISH_LINE_Y_START && y < FINISH_LINE_Y_END) {
                    if (!justCrossedFinish) { lap += 1; justCrossedFinish = true; }
                } else if (x < FINISH_LINE_X - (TRACK_WIDTH / 4)) { // Must go far enough (1/4 track width past line) before crossing again counts
                    justCrossedFinish = false;
                }
                return { ...car, x, y, angle, speed, lap, justCrossedFinish };
            }));
            if (!gameOver) gameLoopRef.current = requestAnimationFrame(game);
        };
        if (gameStarted && !gameOver) { // Only run game loop if started and not over
             gameLoopRef.current = requestAnimationFrame(game);
        }
        return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
    }, [gameOver, gameStarted]); // Removed 'cars' from deps to avoid loop based on its own update

    // Check for Winner
    useEffect(() => {
        if (gameOver || !gameStarted) return;
        const winner = cars.find(car => car.lap >= WINNING_LAPS);
        if (winner && !gameOver) {
            setGameMessage(`${winner.name} (Team Vote: ${winner.teamVote}) WINS THE RACE!`);
            setGameOver(true);
            onGameEnd(winner.teamVote);
        }
    }, [cars, onGameEnd, gameOver, gameStarted]);

    // Synchronize Game Over state from parent
    useEffect(() => {
        if (officialWinningNumber && !gameOver) {
            const officialWinnerCar = cars.find(car => car.teamVote === officialWinningNumber);
            if (officialWinnerCar) {
                setGameMessage(`${officialWinnerCar.name} (Team Vote: ${officialWinnerCar.teamVote}) WINS! (Confirmed)`);
                setCars(prevCars => prevCars.map(c => c.id === officialWinnerCar.id ? { ...c, lap: WINNING_LAPS } : c));
                setGameOver(true);
            }
        }
    }, [officialWinningNumber, gameOver, cars]);

    // Drawing on Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || cars.length === 0) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2c6e3a'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.beginPath();
        ctx.ellipse(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, TRACK_WIDTH / 2, TRACK_HEIGHT / 2, 0, 0, 2 * Math.PI);
        ctx.fillStyle = '#505050'; ctx.fill();
        ctx.beginPath();
        const innerTrackWidth = TRACK_WIDTH - 2 * TRACK_THICKNESS;
        const innerTrackHeight = TRACK_HEIGHT - 2 * TRACK_THICKNESS;
        if (innerTrackWidth > 0 && innerTrackHeight > 0) {
            ctx.ellipse(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, innerTrackWidth / 2, innerTrackHeight / 2, 0, 0, 2 * Math.PI);
            ctx.fillStyle = '#2c6e3a'; ctx.fill();
        }
        ctx.beginPath(); ctx.strokeStyle = 'white'; ctx.lineWidth = 5;
        ctx.moveTo(FINISH_LINE_X, FINISH_LINE_Y_START - 5);
        ctx.lineTo(FINISH_LINE_X, FINISH_LINE_Y_END + 5);
        ctx.stroke(); ctx.lineWidth = 1;

        cars.forEach(car => {
            ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
            ctx.fillStyle = car.color; ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);
            if (car.isPlayer) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.strokeRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT); ctx.lineWidth = 1; }
            ctx.fillStyle = '#000000'; 
            ctx.fillRect(-CAR_WIDTH/4 + 2 , -CAR_HEIGHT/4 + 3, CAR_WIDTH/2 -4, CAR_HEIGHT/4); // simplified windshield
            ctx.restore();
        });
    }, [cars, gameStarted, gameOver]);

    if (cars.length === 0 && !gameOver) {
        return <Paper elevation={2} sx={{ mt: 2, p: 3 }}><Typography variant="h5" align="center">{gameMessage}</Typography></Paper>;
    }
    if (gameOver && !cars.find(c => c.lap >= WINNING_LAPS) && !officialWinningNumber) {
        // Edge case: Game over but no winner determined locally or by server (e.g. not enough teams)
         return <Paper elevation={2} sx={{ mt: 2, p: 3 }}><Alert severity="warning">{gameMessage}</Alert></Paper>;
    }

    return (
        <Paper elevation={2} sx={{ mt: 2, p: 2, backgroundColor: 'hsl(120, 10%, 95%)' }}>
            <Typography variant="h5" gutterBottom align="center" color="primary">
                Top-Down Racing! First to {WINNING_LAPS} Laps!
            </Typography>
            <Grid container spacing={1} sx={{ mb: 1 }}>
                {cars.map(car => (
                    <Grid item xs={12} sm={6} md={Math.max(2, 12 / Math.max(1,cars.length))} key={car.id}> {/* Dynamic grid sizing */}
                        <Paper sx={{p:1, backgroundColor: car.isPlayer ? '#e3f2fd' : 'white', border: `3px solid ${car.color}`}}>
                            <Typography variant="subtitle1" sx={{color: car.color, fontWeight: 'bold'}}>
                                Car (Vote: {car.teamVote}) - Driver: {car.name}
                            </Typography>
                            <Typography>Lap: {car.lap} / {WINNING_LAPS}</Typography>
                            {car.isPlayer && !gameOver && gameStarted && <Typography variant="caption">(Controls: Arrows)</Typography>}
                            <Typography variant="caption" display="block">Team: {car.teamMembers.join(', ')}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, backgroundColor:'#2c6e3a' }}>
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '2px solid black'}} />
            </Box>
            <Alert 
                severity={gameOver && cars.some(c => c.lap >= WINNING_LAPS) ? 'success' : 'info'} 
                sx={{mt:1}}
            >
                {countdown > 0 && !gameStarted ? `Starting in ${countdown}...` : gameMessage}
            </Alert>
        </Paper>
    );
};

export default RacingGame; 