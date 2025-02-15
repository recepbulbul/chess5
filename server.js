const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Statik dosyaları serve et
app.use(express.static(path.join(__dirname, 'public')));

// HTTP server
const server = app.listen(port, () => {
    console.log(`Server ${port} portunda çalışıyor`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

const games = new Map();

wss.on('connection', (ws) => {
    console.log('Yeni bir client bağlandı');

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        console.log('Gelen mesaj:', data.type);
        
        switch(data.type) {
            case 'create':
                const gameId = Math.random().toString(36).substr(2, 9);
                games.set(gameId, {
                    white: ws,
                    gameId: gameId,
                    board: data.board
                });
                console.log(`Yeni oyun oluşturuldu. ID: ${gameId}`);
                ws.send(JSON.stringify({
                    type: 'created',
                    gameId: gameId,
                    color: 'white'
                }));
                break;

            case 'join':
                const game = games.get(data.gameId);
                if (game && !game.black) {
                    game.black = ws;
                    console.log(`${data.gameId} ID'li oyuna katılım sağlandı`);
                    ws.send(JSON.stringify({
                        type: 'joined',
                        gameId: data.gameId,
                        color: 'black',
                        board: game.board
                    }));
                    game.white.send(JSON.stringify({
                        type: 'opponent-joined'
                    }));
                } else {
                    console.log(`${data.gameId} ID'li oyuna katılım başarısız`);
                }
                break;

            case 'move':
                const currentGame = games.get(data.gameId);
                if (currentGame) {
                    const opponent = data.color === 'white' ? currentGame.black : currentGame.white;
                    if (opponent) {
                        console.log(`${data.gameId} ID'li oyunda hamle yapıldı`);
                        opponent.send(JSON.stringify({
                            type: 'move',
                            move: data.move,
                            board: data.board,
                            currentPlayer: data.currentPlayer
                        }));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log('Bir client bağlantısı koptu');
        games.forEach((game, gameId) => {
            if (game.white === ws || game.black === ws) {
                const opponent = game.white === ws ? game.black : game.white;
                if (opponent) {
                    console.log(`${gameId} ID'li oyun sonlandırıldı`);
                    opponent.send(JSON.stringify({
                        type: 'opponent-disconnected'
                    }));
                }
                games.delete(gameId);
            }
        });
    });

    ws.on('error', (error) => {
        console.error('WebSocket hatası:', error);
    });
});

server.on('error', (error) => {
    console.error('Server hatası:', error);
}); 