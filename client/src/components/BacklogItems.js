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

  // Show current item and voting status
  const currentItem = backlogItems[currentRound - 1];
  const currentItemVotes = allVotes[`item_${currentRound}`]?.votes || {};

  return (
    <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        Current Backlog Item ({currentRound} of {backlogItems.length})
      </Typography>
      <List>
        <ListItem>
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
    </Paper>
  );
};

export default BacklogItems; 