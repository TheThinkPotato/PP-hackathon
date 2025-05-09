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
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Session Summary
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Final Score</TableCell>
                <TableCell>Votes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backlogItems.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="subtitle2">{item.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.description}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.priority}</TableCell>
                  <TableCell>{allVotes[`item_${index + 1}`]?.winningNumber || 'N/A'}</TableCell>
                  <TableCell>
                    {Object.entries(allVotes[`item_${index + 1}`]?.votes || {}).map(([player, vote]) => (
                      <Typography key={player} variant="caption" display="block">
                        {player}: {vote}
                      </Typography>
                    ))}
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
    <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
      {previousItems.length > 0 && (
        <Box mb={3}>
          <Typography variant="h6" gutterBottom>
            Previously Voted Items
          </Typography>
          {previousItems.map((item, index) => {
            const itemKey = `item_${index + 1}`;
            const itemVoteData = allVotes[itemKey];
            return (
              <Box key={item.id} sx={{ mb: 2, p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                <Typography variant="subtitle1" gutterBottom>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary">{item.description}</Typography>
                <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>Priority: {item.priority}</Typography>
                <Typography variant="caption" display="block" sx={{ fontWeight: 'bold' }}>
                  Final Score: {itemVoteData?.winningNumber !== undefined && itemVoteData?.winningNumber !== null ? itemVoteData.winningNumber : 'N/A'}
                </Typography>
                {itemVoteData?.votes && Object.keys(itemVoteData.votes).length > 0 && (
                  <Box mt={1}>
                    <Typography variant="caption" sx={{ fontWeight: 'medium' }}>Votes:</Typography>
                    {Object.entries(itemVoteData.votes).map(([player, vote]) => (
                      <Typography key={player} variant="caption" display="block" sx={{ pl: 1}}>
                        {player}: {vote}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
          <Divider sx={{ my: 2 }}/>
        </Box>
      )}

      {currentItem && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Current Backlog Item ({currentRound} of {backlogItems.length})
          </Typography>
          <List>
            <ListItem sx={{pl:0}}>
              <ListItemText
                primary={
                  <Typography variant="subtitle1" component="div">
                    {currentItem.title}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.secondary">
                      {currentItem.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Priority: {currentItem.priority}
                    </Typography>
                  </>
                }
              />
            </ListItem>
          </List>

          {revealed && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Votes for this item:
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Player</TableCell>
                      <TableCell>Vote</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {players.map((player) => (
                      <TableRow key={player}>
                        <TableCell>{player}</TableCell>
                        <TableCell>{currentItemVotes[player] || 'Not voted'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default BacklogItems; 