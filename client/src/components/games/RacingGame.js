import React, { useState, useEffect, useRef, useCallback } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const CAR_WIDTH = 18;
const CAR_HEIGHT = 30;
const WINNING_LAPS = 3;

const TRACK_PADDING = 70;
const TRACK_LANE_WIDTH = 80;
const CORNER_RADIUS_OUTER = TRACK_LANE_WIDTH;

const trackOuterPoints = {
    TL: { x: TRACK_PADDING, y: TRACK_PADDING },
    TR: { x: CANVAS_WIDTH - TRACK_PADDING, y: TRACK_PADDING },
    BR: { x: CANVAS_WIDTH - TRACK_PADDING, y: CANVAS_HEIGHT - TRACK_PADDING },
    BL: { x: TRACK_PADDING, y: CANVAS_HEIGHT - TRACK_PADDING },
};

const R_center = CORNER_RADIUS_OUTER - TRACK_LANE_WIDTH / 2;
const trackPathWaypoints = [
    { x: trackOuterPoints.BL.x + R_center, y: trackOuterPoints.BL.y - R_center }, 
    { x: trackOuterPoints.BR.x - R_center, y: trackOuterPoints.BR.y - R_center }, 
    { x: trackOuterPoints.BR.x - R_center, y: trackOuterPoints.TR.y + R_center }, 
    { x: trackOuterPoints.TR.x - R_center, y: trackOuterPoints.TR.y + R_center }, 
    { x: trackOuterPoints.TL.x + R_center, y: trackOuterPoints.TL.y + R_center }, 
    { x: trackOuterPoints.TL.x + R_center, y: trackOuterPoints.BL.y - R_center }, 
];

const FINISH_LINE_Y_CENTER = trackOuterPoints.BL.y - R_center;
const FINISH_LINE_X_START = trackOuterPoints.BL.x + R_center + CAR_WIDTH * 2;
const FINISH_LINE_X_END = FINISH_LINE_X_START + 100;

const carColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F1C40F', '#1ABC9C', '#9B59B6', '#34495E'];

const isPointOnTrackSurface = (px, py) => {
    for (let i = 0; i < trackPathWaypoints.length; i++) {
        const p1 = trackPathWaypoints[i];
        const p2 = trackPathWaypoints[(i + 1) % trackPathWaypoints.length];
        const lenSq = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
        if (lenSq === 0) {
            if (Math.sqrt((px - p1.x)**2 + (py - p1.y)**2) <= TRACK_LANE_WIDTH / 2) return true;
            continue;
        }
        let t = ((px - p1.x) * (p2.x - p1.x) + (py - p1.y) * (p2.y - p1.y)) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = p1.x + t * (p2.x - p1.x);
        const closestY = p1.y + t * (p2.y - p1.y);
        const distSq = (px - closestX)**2 + (py - closestY)**2;
        if (distSq <= (TRACK_LANE_WIDTH / 2 + CAR_WIDTH / 2)**2) return true;
    }
    return false;
};

const RacingGame = ({ teams, onGameEnd, myName, winningNumber: officialWinningNumber, socket, roomCode }) => {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);
    const countdownIntervalRef = useRef(null);
    const keysPressed = useRef({});
    const isControllingCarRef = useRef(false);
    const myCarIdRef = useRef(null);

    const [cars, setCars] = useState([]);
    const [gameMessage, setGameMessage] = useState('Waiting for server to start game...');
    const [gameOver, setGameOver] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [gameStarted, setGameStarted] = useState(false);

    useEffect(() => {
        if (teams && myName) {
            const playerCarEntry = Object.values(teams).flat().includes(myName);
            isControllingCarRef.current = playerCarEntry;
        }
        keysPressed.current = {};
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [teams, myName]);

    useEffect(() => {
        if (!socket) return;

        const handleRacingGameStarted = (data) => {
            console.log('Racing game started data from server:', data);
            const serverCars = data.cars.map(car => ({...car, isPlayer: car.name === myName }));
            setCars(serverCars);
            const myCar = serverCars.find(car => car.isPlayer);
            if (myCar) {
                myCarIdRef.current = myCar.id;
                isControllingCarRef.current = true;
            } else {
                myCarIdRef.current = null;
                isControllingCarRef.current = false;
            }
            setCountdown(data.countdown || 0);
            setGameStarted(false);
            setGameOver(false);
            setGameMessage(`Game starting soon... Controls: Accelerate (Up), Steer (Left/Right).`);
        };

        const handleRacingGameStateUpdate = (data) => {
            setCars(data.cars.map(car => ({...car, isPlayer: car.name === myName })));
            if (officialWinningNumber && !gameOver) {
            }
        };
        
        socket.on('racingGameStarted', handleRacingGameStarted);
        socket.on('racingGameStateUpdate', handleRacingGameStateUpdate);

        return () => {
            socket.off('racingGameStarted', handleRacingGameStarted);
            socket.off('racingGameStateUpdate', handleRacingGameStateUpdate);
        };
    }, [socket, myName, officialWinningNumber, gameOver]);

    useEffect(() => {
        if (countdown > 0 && !gameStarted && !gameOver) {
            setGameMessage(`Starting in ${countdown}...`);
            countdownIntervalRef.current = setInterval(() => {
                setCountdown(prevCount => {
                    const nextCount = prevCount - 1;
                    if (nextCount <= 0) {
                        clearInterval(countdownIntervalRef.current);
                        setGameStarted(true);
                        setGameMessage('RACE!');
                        return 0;
                    }
                    setGameMessage(`Starting in ${nextCount}...`);
                    return nextCount;
                });
            }, 1000);
        } else if (countdown === 0 && !gameStarted && cars.length > 0 && !gameOver) {
            setGameStarted(true);
            setGameMessage('RACE!');
        }
        return () => clearInterval(countdownIntervalRef.current);
    }, [countdown, gameStarted, gameOver, cars.length]);

    const handleKeyDown = useCallback((e) => {
        if (gameOver || !gameStarted || !isControllingCarRef.current || !myCarIdRef.current) return;

        if (['ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            if (!keysPressed.current[e.key]) {
                socket.emit('playerRacingInput', { 
                    roomCode, 
                    carId: myCarIdRef.current, 
                    inputKey: e.key, 
                    pressed: true 
                });
            }
        }
        keysPressed.current[e.key] = true;
    }, [socket, roomCode, gameOver, gameStarted]);

    const handleKeyUp = useCallback((e) => {
        if (!isControllingCarRef.current || !myCarIdRef.current) return;
        if (['ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            if (keysPressed.current[e.key]) {
                socket.emit('playerRacingInput', { 
                    roomCode, 
                    carId: myCarIdRef.current, 
                    inputKey: e.key, 
                    pressed: false 
                });
            }
        }
        keysPressed.current[e.key] = false;
    }, [socket, roomCode]);

    const handleWindowBlur = useCallback(() => {
        if (!isControllingCarRef.current || !myCarIdRef.current || !socket) {
            return;
        }
        ['ArrowUp', 'ArrowLeft', 'ArrowRight'].forEach(key => {
            if (keysPressed.current[key]) {
                socket.emit('playerRacingInput', {
                    roomCode,
                    carId: myCarIdRef.current,
                    inputKey: key,
                    pressed: false
                });
                keysPressed.current[key] = false;
            }
        });
    }, [socket, roomCode]);

    const handleWindowFocus = useCallback(() => {
        keysPressed.current = {};
    }, []);

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
            if (socket && myCarIdRef.current && isControllingCarRef.current) {
                ['ArrowUp', 'ArrowLeft', 'ArrowRight'].forEach(key => {
                    if (keysPressed.current[key]) {
                        socket.emit('playerRacingInput', { roomCode, carId: myCarIdRef.current, inputKey: key, pressed: false });
                    }
                });
            }
        };
    }, [handleKeyDown, handleKeyUp, handleWindowBlur, handleWindowFocus, socket, roomCode]);

    useEffect(() => {
        if (!gameStarted || cars.length === 0) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            return;
        }

        const gameTick = (timestamp) => {
            animationFrameId.current = requestAnimationFrame(gameTick);
        };

        animationFrameId.current = requestAnimationFrame(gameTick);
        return () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); };
    }, [gameStarted, cars.length]);

    useEffect(() => {
        if (officialWinningNumber && !gameOver) {
            const officialWinnerCar = cars.find(car => car.teamVote === officialWinningNumber);
            if (officialWinnerCar) {
                setGameMessage(`${officialWinnerCar.name} (Team Vote: ${officialWinnerCar.teamVote}) WINS! (Confirmed by server)`);
                setCars(prevCars => prevCars.map(c => ({...c, speed: 0 })));
                setGameOver(true);
            }
        }
    }, [officialWinningNumber, cars, gameOver, onGameEnd]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || cars.length === 0) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#228B22'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const R_OUT = CORNER_RADIUS_OUTER;
        const R_IN = Math.max(0, CORNER_RADIUS_OUTER - TRACK_LANE_WIDTH);
        const trackSurfacePath = new Path2D();
        trackSurfacePath.moveTo(trackOuterPoints.TL.x + R_OUT, trackOuterPoints.TL.y);
        trackSurfacePath.lineTo(trackOuterPoints.TR.x - R_OUT, trackOuterPoints.TR.y);
        trackSurfacePath.arcTo(trackOuterPoints.TR.x, trackOuterPoints.TR.y, trackOuterPoints.TR.x, trackOuterPoints.TR.y + R_OUT, R_OUT);
        trackSurfacePath.lineTo(trackOuterPoints.BR.x, trackOuterPoints.BR.y - R_OUT);
        trackSurfacePath.arcTo(trackOuterPoints.BR.x, trackOuterPoints.BR.y, trackOuterPoints.BR.x - R_OUT, trackOuterPoints.BR.y, R_OUT);
        trackSurfacePath.lineTo(trackOuterPoints.BL.x + R_OUT, trackOuterPoints.BL.y);
        trackSurfacePath.arcTo(trackOuterPoints.BL.x, trackOuterPoints.BL.y, trackOuterPoints.BL.x, trackOuterPoints.BL.y - R_OUT, R_OUT);
        trackSurfacePath.lineTo(trackOuterPoints.TL.x, trackOuterPoints.TL.y + R_OUT);
        trackSurfacePath.arcTo(trackOuterPoints.TL.x, trackOuterPoints.TL.y, trackOuterPoints.TL.x + R_OUT, trackOuterPoints.TL.y, R_OUT);
        trackSurfacePath.closePath();
        ctx.fillStyle = '#4A4A4A'; ctx.fill(trackSurfacePath);
        let innerPath = null; 
        if (R_IN > 0) { 
            innerPath = new Path2D(); 
            innerPath.moveTo(trackOuterPoints.TL.x + R_OUT, trackOuterPoints.TL.y + TRACK_LANE_WIDTH);
            innerPath.lineTo(trackOuterPoints.TR.x - R_OUT, trackOuterPoints.TR.y + TRACK_LANE_WIDTH);
            innerPath.arcTo(trackOuterPoints.TR.x - TRACK_LANE_WIDTH, trackOuterPoints.TR.y + TRACK_LANE_WIDTH, trackOuterPoints.TR.x - TRACK_LANE_WIDTH, trackOuterPoints.TR.y + R_OUT, R_IN);
            innerPath.lineTo(trackOuterPoints.BR.x - TRACK_LANE_WIDTH, trackOuterPoints.BR.y - R_OUT);
            innerPath.arcTo(trackOuterPoints.BR.x - TRACK_LANE_WIDTH, trackOuterPoints.BR.y - TRACK_LANE_WIDTH, trackOuterPoints.BR.x - R_OUT, trackOuterPoints.BR.y - TRACK_LANE_WIDTH, R_IN);
            innerPath.lineTo(trackOuterPoints.BL.x + R_OUT, trackOuterPoints.BL.y - TRACK_LANE_WIDTH);
            innerPath.arcTo(trackOuterPoints.BL.x + TRACK_LANE_WIDTH, trackOuterPoints.BL.y - TRACK_LANE_WIDTH, trackOuterPoints.BL.x + TRACK_LANE_WIDTH, trackOuterPoints.BL.y - R_OUT, R_IN);
            innerPath.lineTo(trackOuterPoints.TL.x + TRACK_LANE_WIDTH, trackOuterPoints.TL.y + R_OUT);
            innerPath.arcTo(trackOuterPoints.TL.x + TRACK_LANE_WIDTH, trackOuterPoints.TL.y + TRACK_LANE_WIDTH, trackOuterPoints.TL.x + R_OUT, trackOuterPoints.TL.y + TRACK_LANE_WIDTH, R_IN);
            innerPath.closePath();
            ctx.fillStyle = '#228B22'; ctx.fill(innerPath);
        }
        const finishLineMidX = FINISH_LINE_X_START + (FINISH_LINE_X_END - FINISH_LINE_X_START) / 2;
        const squareSize = TRACK_LANE_WIDTH / 5;
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 2; j++) { 
                ctx.fillStyle = ((i + j) % 2 === 0) ? 'white' : '#222';
                ctx.fillRect( finishLineMidX - (CAR_WIDTH/1.5) + (j * squareSize), FINISH_LINE_Y_CENTER - TRACK_LANE_WIDTH / 2 + i * squareSize, squareSize, squareSize );
            }
        }
        ctx.strokeStyle = '#E0E0E0'; ctx.lineWidth = 2;
        ctx.stroke(trackSurfacePath); 
        if (R_IN > 0 && innerPath) { ctx.stroke(innerPath); }
        cars.forEach(car => {
            ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
            ctx.fillStyle = car.color || '#CCCCCC'; 
            ctx.fillRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);
            if (car.isPlayer) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5; ctx.strokeRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT); }
            else {ctx.strokeStyle = '#777'; ctx.lineWidth = 1; ctx.strokeRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT); }
            ctx.fillStyle = '#1A1A1A'; 
            ctx.fillRect(-CAR_WIDTH/2 + 3, -CAR_HEIGHT/2 + 2, CAR_WIDTH - 6, CAR_HEIGHT/4); 
            ctx.restore();
        });
    }, [cars, gameStarted, gameOver]);

    const gameInstructions = `Accelerate: ArrowUp, Steer: ArrowLeft/Right. First to ${WINNING_LAPS} laps. Server is authoritative.`;

    return (
        <Paper elevation={2} sx={{ mt: 2, p: 2, backgroundColor: 'hsl(100, 15%, 96%)' }}>
            <Box sx={{display:'flex', justifyContent:'space-between', alignItems:'center', mb:1}}>
                <Typography variant="h5" gutterBottom color="primary">Pixel Racer Pro - {WINNING_LAPS} Laps! (Server Synced)</Typography>
                <Tooltip title={gameInstructions}><IconButton size="small"><HelpOutlineIcon fontSize="small"/></IconButton></Tooltip>
            </Box>
            <Grid container spacing={1} sx={{ mb: 1, maxHeight: '120px', overflowY: 'auto' }}>
                {cars.map(car => (
                    <Grid item xs={12} sm={6} md={Math.max(2, Math.min(3, 12 / Math.max(1,cars.length)))} key={car.id}>
                        <Paper sx={{p:0.5, backgroundColor: car.isPlayer ? '#E3F2FD' : '#F8F8F8', border: `2px solid ${car.color || '#CCCCCC'}`}}>
                            <Typography variant="caption" sx={{color: car.color || '#333', fontWeight: 'bold', display:'block'}} noWrap>{car.name} (Vote: {car.teamVote})</Typography>
                            <Typography variant="body2" sx={{fontWeight: 'bold'}}>Lap: {car.lap}/{WINNING_LAPS}</Typography>
                            {car.isPlayer && !gameOver && gameStarted && <Typography variant="caption" sx={{color: '#1976D2'}}>(Your Car!)</Typography>}
                        </Paper>
                    </Grid>
                ))}
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, backgroundColor:'#228B22' }}>
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '1px solid #111'}} />
            </Box>
            <Alert severity={gameOver && officialWinningNumber ? 'success' : 'info'} sx={{mt:1, textAlign: 'center', py: 0.5}}>
                <Typography variant="subtitle1">
                    {countdown > 0 && !gameStarted ? `Starting in ${countdown}...` : gameMessage}
                </Typography>
            </Alert>
             <Box sx={{ mt: 1, p:1, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius:1}}>
                <Typography variant="caption" display="block" textAlign="center" sx={{px:1}}><strong>Instructions:</strong> {gameInstructions}</Typography>
            </Box>
        </Paper>
    );
};

export default RacingGame; 