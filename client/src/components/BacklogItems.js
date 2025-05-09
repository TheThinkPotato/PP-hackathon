import React from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Divider, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

const backlogItems = [
  {
    id: 1,
    title: "Implement user authentication",
    description: "Add login/signup functionality with JWT tokens",
    priority: "High"
  },
  {
    id: 2,
    title: "Create dashboard layout",
    description: "Design and implement the main dashboard UI with responsive grid",
    priority: "Medium"
  },
  {
    id: 3,
    title: "Add real-time notifications",
    description: "Implement WebSocket-based notification system",
    priority: "High"
  },
  {
    id: 4,
    title: "Optimize database queries",
    description: "Review and optimize existing database queries for better performance",
    priority: "Medium"
  },
  {
    id: 5,
    title: "Implement file upload",
    description: "Add functionality to upload and manage files",
    priority: "Low"
  }
];

const BacklogItems = ({ currentRound, allVotes, players, revealed, isSessionComplete }) => {
  // If session is complete, show the final summary
  if (isSessionComplete) {
    return (
      <Paper elevation={3} sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: '8px', width: '100%' }}>
        <Typography variant="h5" component="h3" gutterBottom sx={{ color: 'primary.dark', fontWeight: 'medium', mb: 2 }}>
          Session Summary
        </Typography>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '4px' }}>
          <Table aria-label="session summary table">
            <TableHead sx={{ bgcolor: 'grey[100]' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Score</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Votes Cast</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backlogItems.map((item, index) => (
                <TableRow key={item.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
                  <TableCell component="th" scope="row">
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>{item.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.priority}</TableCell>
                  <TableCell align="right">
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                      {allVotes[`item_${index + 1}`]?.winningNumber || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {Object.entries(allVotes[`item_${index + 1}`]?.votes || {}).length > 0 ? 
                      Object.entries(allVotes[`item_${index + 1}`].votes).map(([player, vote]) => (
                        <Typography key={player} variant="body2" display="block" sx={{ fontSize: '0.8rem' }}>
                          {player}: <strong>{vote}</strong>
                        </Typography>
                      )) : 
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>No votes</Typography>
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  // Show current item and voting status, plus previous items
  const currentItem = backlogItems[currentRound - 1];
  const currentItemVotes = allVotes[`item_${currentRound}`]?.votes || {};
  const previousItems = backlogItems.slice(0, currentRound - 1);

  return (
    <Box sx={{ width: '100%' }}>
      {previousItems.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.dark', mb: 1.5 }}>
            Previously Voted Items
          </Typography>
          {previousItems.map((item, index) => {
            const itemKey = `item_${index + 1}`;
            const itemVoteData = allVotes[itemKey];
            return (
              <Paper key={item.id} elevation={1} sx={{ mb: 1.5, p: 1.5, borderRadius: '6px', border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'medium' }}>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{item.description}</Typography>
                <Typography variant="caption" display="block" color="text.secondary">Priority: {item.priority}</Typography>
                <Typography variant="subtitle2" display="block" sx={{ mt: 0.5, fontWeight: 'bold', color: 'secondary.dark' }}>
                  Final Score: {itemVoteData?.winningNumber !== undefined && itemVoteData?.winningNumber !== null ? itemVoteData.winningNumber : '-'}
                </Typography>
                {itemVoteData?.votes && Object.keys(itemVoteData.votes).length > 0 && (
                  <Box mt={1}>
                    <Typography variant="caption" sx={{ fontWeight: 'medium' }}>Votes:</Typography>
                    {Object.entries(itemVoteData.votes).map(([player, vote]) => (
                      <Typography key={player} variant="caption" display="block" sx={{ pl: 1, fontSize: '0.75rem' }}>
                        {player}: <strong>{vote}</strong>
                      </Typography>
                    ))}
                  </Box>
                )}
              </Paper>
            );
          })}
          <Divider sx={{ my: 2 }}/>
        </Box>
      )}

      {currentItem && (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ color: 'primary.dark', mb: 1 }}>
            Current Item ({currentRound}/{backlogItems.length}): <Typography component="span" sx={{ fontWeight: 'medium' }}>{currentItem.title}</Typography>
          </Typography>
          <Paper elevation={1} sx={{ p: 1.5, borderRadius: '6px', border: '1px solid', borderColor: 'divider', mb: revealed ? 2 : 0 }}>
            <ListItemText
              primary={
                <Typography variant="subtitle1" component="div" sx={{ fontWeight: 'medium' }}>
                  {currentItem.title}
                </Typography>
              }
              secondary={
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {currentItem.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Priority: {currentItem.priority}
                  </Typography>
                </>
              }
              sx={{m:0}}
            />
          </Paper>

          {revealed && Object.keys(currentItemVotes).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'medium', color: 'primary.dark' }}>
                Votes for Current Item:
              </Typography>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '4px' }}>
                <Table size="small" aria-label="current item votes table">
                  <TableHead sx={{ bgcolor: 'grey[100]' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Player</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Vote</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {players.map((player) => (
                      <TableRow key={player} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
                        <TableCell>{player}</TableCell>
                        <TableCell sx={{ fontWeight: currentItemVotes[player] ? 'bold' : 'normal' }}>
                            {currentItemVotes[player] || <Typography variant="caption" sx={{color: 'text.disabled', fontStyle: 'italic'}}>Not voted</Typography>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
          {revealed && Object.keys(currentItemVotes).length === 0 && (
             <Typography variant="body2" color="text.secondary" sx={{mt: 1, fontStyle: 'italic'}}>No votes recorded for the current item yet.</Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default BacklogItems; 