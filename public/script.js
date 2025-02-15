class Chess {
    constructor() {
        this.board = document.getElementById('board');
        this.currentPlayer = 'white';
        this.selectedPiece = null;
        this.moves = []; // Hamle geçmişi
        this.isCheck = false;
        this.gameId = null; // Online oyun için ID
        this.playerColor = null;
        this.lastMove = null; // Son hamleyi takip etmek için
        this.castlingRights = {
            white: { kingSide: true, queenSide: true },
            black: { kingSide: true, queenSide: true }
        };
        this.ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);
        this.createBoard();
        this.setupPieces();
        this.addResetListener();
        this.setupOnlineGame();
        this.setupWebSocket();
    }

    createBoard() {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = `square ${(row + col) % 2 === 0 ? 'white' : 'black'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                square.addEventListener('click', (e) => this.handleSquareClick(e));
                this.board.appendChild(square);
            }
        }
    }

    setupPieces() {
        const initialSetup = {
            0: ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'],
            1: ['♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟'],
            6: ['♙', '♙', '♙', '♙', '♙', '♙', '♙', '♙'],
            7: ['♖', '♘', '♗', '♕', '♔', '♗', '♘', '♖']
        };

        for (let row in initialSetup) {
            initialSetup[row].forEach((piece, col) => {
                const square = this.getSquare(row, col);
                square.textContent = piece;
                square.dataset.piece = piece;
                square.dataset.color = row < 2 ? 'black' : 'white';
            });
        }
    }

    getSquare(row, col) {
        return this.board.children[row * 8 + col];
    }

    handleSquareClick(e) {
        const square = e.target;
        const piece = square.dataset.piece;
        const pieceColor = square.dataset.color;

        if (this.selectedPiece) {
            if (square === this.selectedPiece) {
                // Aynı kareye tıklandığında seçimi kaldır
                this.clearSelection();
            } else if (pieceColor === this.currentPlayer) {
                // Başka bir kendi taşına tıklandığında seçimi değiştir
                this.clearSelection();
                this.selectPiece(square);
            } else {
                // Hamle yap
                this.movePiece(square);
            }
        } else if (piece && pieceColor === this.currentPlayer) {
            this.selectPiece(square);
        }
    }

    selectPiece(square) {
        square.classList.add('selected');
        this.selectedPiece = square;
    }

    movePiece(targetSquare) {
        if (this.currentPlayer !== this.playerColor) {
            alert('Sıra sizde değil!');
            return;
        }

        if (!this.isValidMove(this.selectedPiece, targetSquare)) {
            this.clearSelection();
            return;
        }

        const fromRow = parseInt(this.selectedPiece.dataset.row);
        const fromCol = parseInt(this.selectedPiece.dataset.col);
        const toRow = parseInt(targetSquare.dataset.row);
        const toCol = parseInt(targetSquare.dataset.col);

        // Rok hamlesi kontrolü
        if (this.selectedPiece.dataset.piece.match(/[♔♚]/) && Math.abs(toCol - fromCol) === 2) {
            const row = this.currentPlayer === 'white' ? 7 : 0;
            if (toCol === 6) { // Kısa rok
                const rook = this.getSquare(row, 7);
                const rookTarget = this.getSquare(row, 5);
                rookTarget.textContent = rook.textContent;
                rookTarget.dataset.piece = rook.dataset.piece;
                rookTarget.dataset.color = rook.dataset.color;
                rook.textContent = '';
                delete rook.dataset.piece;
                delete rook.dataset.color;
            } else if (toCol === 2) { // Uzun rok
                const rook = this.getSquare(row, 0);
                const rookTarget = this.getSquare(row, 3);
                rookTarget.textContent = rook.textContent;
                rookTarget.dataset.piece = rook.dataset.piece;
                rookTarget.dataset.color = rook.dataset.color;
                rook.textContent = '';
                delete rook.dataset.piece;
                delete rook.dataset.color;
            }
        }

        // Geçerken alma kontrolü
        if (this.selectedPiece.dataset.piece.match(/[♙♟]/) && 
            Math.abs(toCol - fromCol) === 1 && 
            !targetSquare.dataset.piece) {
            const capturedPawnRow = fromRow;
            const capturedPawn = this.getSquare(capturedPawnRow, toCol);
            capturedPawn.textContent = '';
            delete capturedPawn.dataset.piece;
            delete capturedPawn.dataset.color;
        }

        // Rok haklarını güncelle
        if (this.selectedPiece.dataset.piece.match(/[♔♚]/)) {
            this.castlingRights[this.currentPlayer].kingSide = false;
            this.castlingRights[this.currentPlayer].queenSide = false;
        } else if (this.selectedPiece.dataset.piece.match(/[♖♜]/)) {
            if (fromCol === 0) this.castlingRights[this.currentPlayer].queenSide = false;
            if (fromCol === 7) this.castlingRights[this.currentPlayer].kingSide = false;
        }

        // Son hamleyi kaydet
        this.lastMove = {
            piece: this.selectedPiece.dataset.piece,
            fromRow: fromRow,
            fromCol: fromCol,
            toRow: toRow,
            toCol: toCol
        };

        // Normal hamle işlemleri
        targetSquare.textContent = this.selectedPiece.textContent;
        targetSquare.dataset.piece = this.selectedPiece.dataset.piece;
        targetSquare.dataset.color = this.selectedPiece.dataset.color;

        this.selectedPiece.textContent = '';
        delete this.selectedPiece.dataset.piece;
        delete this.selectedPiece.dataset.color;

        this.clearSelection();
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        document.getElementById('currentPlayer').textContent = 
            `Sıra: ${this.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'}`;

        // Piyon terfisi kontrolü
        this.checkPromotion(targetSquare);
        
        // Şah kontrolü
        this.isCheck = this.isKingInCheck(this.currentPlayer);
        if (this.isCheck) {
            if (this.isCheckmate()) {
                alert(`${this.currentPlayer === 'white' ? 'Siyah' : 'Beyaz'} oyuncu kazandı!`);
            } else {
                alert('Şah!');
            }
        }

        // WebSocket üzerinden hamleyi gönder
        if (this.gameId) {
            this.ws.send(JSON.stringify({
                type: 'move',
                gameId: this.gameId,
                color: this.playerColor,
                move: this.lastMove,
                board: this.getBoardState(),
                currentPlayer: this.currentPlayer
            }));
        }
    }

    clearSelection() {
        if (this.selectedPiece) {
            this.selectedPiece.classList.remove('selected');
            this.selectedPiece = null;
        }
    }

    addResetListener() {
        document.getElementById('resetBtn').addEventListener('click', () => {
            while (this.board.firstChild) {
                this.board.removeChild(this.board.firstChild);
            }
            this.currentPlayer = 'white';
            document.getElementById('currentPlayer').textContent = 'Sıra: Beyaz';
            this.createBoard();
            this.setupPieces();
        });
    }

    isValidMove(from, to) {
        const piece = from.dataset.piece;
        const fromRow = parseInt(from.dataset.row);
        const fromCol = parseInt(from.dataset.col);
        const toRow = parseInt(to.dataset.row);
        const toCol = parseInt(to.dataset.col);
        
        // Hedef karede kendi taşımız varsa geçersiz hamle
        if (to.dataset.color === this.currentPlayer) return false;
        
        // Geçici hamle yaparak şah kontrolü
        const tempMove = this.makeTemporaryMove(from, to);
        if (this.isKingInCheck(this.currentPlayer)) {
            this.undoTemporaryMove(from, to, tempMove);
            return false;
        }
        this.undoTemporaryMove(from, to, tempMove);

        switch(piece) {
            case '♙': // Beyaz Piyon
            case '♟': // Siyah Piyon
                return this.isValidPawnMove(fromRow, fromCol, toRow, toCol, piece === '♙');
            case '♖': // Kale
            case '♜':
                return this.isValidRookMove(fromRow, fromCol, toRow, toCol);
            case '♘': // At
            case '♞':
                return this.isValidKnightMove(fromRow, fromCol, toRow, toCol);
            case '♗': // Fil
            case '♝':
                return this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
            case '♕': // Vezir
            case '♛':
                return this.isValidQueenMove(fromRow, fromCol, toRow, toCol);
            case '♔': // Şah
            case '♚':
                return this.isValidKingMove(fromRow, fromCol, toRow, toCol);
        }
        return false;
    }

    isValidPawnMove(fromRow, fromCol, toRow, toCol, isWhite) {
        const direction = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;
        const targetSquare = this.getSquare(toRow, toCol);

        // Düz ilerleme
        if (fromCol === toCol && !targetSquare.dataset.piece) {
            if (toRow === fromRow + direction) return true;
            // İlk hamlede 2 kare ilerleme
            if (fromRow === startRow && toRow === fromRow + 2 * direction && 
                !this.getSquare(fromRow + direction, fromCol).dataset.piece) {
                return true;
            }
        }

        // Çapraz yeme hamlesi
        if (Math.abs(toCol - fromCol) === 1 && toRow === fromRow + direction) {
            if (targetSquare.dataset.piece) return true;
            
            // Geçerken alma (en passant)
            if (this.lastMove && 
                this.lastMove.piece === (isWhite ? '♟' : '♙') &&
                this.lastMove.fromRow === (isWhite ? 1 : 6) &&
                this.lastMove.toRow === (isWhite ? 3 : 4) &&
                this.lastMove.toCol === toCol) {
                return true;
            }
        }

        return false;
    }

    isValidRookMove(fromRow, fromCol, toRow, toCol) {
        if (fromRow !== toRow && fromCol !== toCol) return false;
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    isValidKnightMove(fromRow, fromCol, toRow, toCol) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);
        return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
    }

    isValidBishopMove(fromRow, fromCol, toRow, toCol) {
        if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false;
        return this.isPathClear(fromRow, fromCol, toRow, toCol);
    }

    isValidQueenMove(fromRow, fromCol, toRow, toCol) {
        return this.isValidRookMove(fromRow, fromCol, toRow, toCol) || 
               this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
    }

    isValidKingMove(fromRow, fromCol, toRow, toCol) {
        const rowDiff = Math.abs(toRow - fromRow);
        const colDiff = Math.abs(toCol - fromCol);

        // Normal şah hareketi
        if (rowDiff <= 1 && colDiff <= 1) return true;

        // Rok kontrolü
        if (rowDiff === 0 && Math.abs(colDiff) === 2) {
            const isWhite = this.currentPlayer === 'white';
            const row = isWhite ? 7 : 0;
            
            // Şah doğru pozisyonda mı?
            if (fromRow !== row || fromCol !== 4) return false;
            
            // Şah tehdit altında mı?
            if (this.isKingInCheck(this.currentPlayer)) return false;

            // Kısa rok
            if (toCol === 6 && this.castlingRights[this.currentPlayer].kingSide) {
                const rookSquare = this.getSquare(row, 7);
                if (!rookSquare.dataset.piece) return false;
                
                // Yol boş mu ve güvenli mi?
                for (let col = 5; col <= 6; col++) {
                    if (this.getSquare(row, col).dataset.piece) return false;
                    // Geçiş kareleri güvenli mi?
                    const tempMove = this.makeTemporaryMove(
                        this.getSquare(fromRow, fromCol),
                        this.getSquare(row, col)
                    );
                    if (this.isKingInCheck(this.currentPlayer)) {
                        this.undoTemporaryMove(
                            this.getSquare(fromRow, fromCol),
                            this.getSquare(row, col),
                            tempMove
                        );
                        return false;
                    }
                    this.undoTemporaryMove(
                        this.getSquare(fromRow, fromCol),
                        this.getSquare(row, col),
                        tempMove
                    );
                }
                return true;
            }

            // Uzun rok
            if (toCol === 2 && this.castlingRights[this.currentPlayer].queenSide) {
                const rookSquare = this.getSquare(row, 0);
                if (!rookSquare.dataset.piece) return false;
                
                // Yol boş mu ve güvenli mi?
                for (let col = 3; col >= 2; col--) {
                    if (this.getSquare(row, col).dataset.piece) return false;
                    // Geçiş kareleri güvenli mi?
                    const tempMove = this.makeTemporaryMove(
                        this.getSquare(fromRow, fromCol),
                        this.getSquare(row, col)
                    );
                    if (this.isKingInCheck(this.currentPlayer)) {
                        this.undoTemporaryMove(
                            this.getSquare(fromRow, fromCol),
                            this.getSquare(row, col),
                            tempMove
                        );
                        return false;
                    }
                    this.undoTemporaryMove(
                        this.getSquare(fromRow, fromCol),
                        this.getSquare(row, col),
                        tempMove
                    );
                }
                if (this.getSquare(row, 1).dataset.piece) return false;
                return true;
            }
        }
        return false;
    }

    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowStep = fromRow === toRow ? 0 : (toRow - fromRow) / Math.abs(toRow - fromRow);
        const colStep = fromCol === toCol ? 0 : (toCol - fromCol) / Math.abs(toCol - fromCol);

        let currentRow = fromRow + rowStep;
        let currentCol = fromCol + colStep;

        while (currentRow !== toRow || currentCol !== toCol) {
            if (this.getSquare(currentRow, currentCol).dataset.piece) return false;
            currentRow += rowStep;
            currentCol += colStep;
        }
        return true;
    }

    checkPromotion(square) {
        const piece = square.dataset.piece;
        const row = parseInt(square.dataset.row);
        
        if ((piece === '♙' && row === 0) || (piece === '♟' && row === 7)) {
            const newPiece = prompt('Terfi için taş seçin (Q:Vezir, R:Kale, B:Fil, N:At):', 'Q');
            const pieceMap = {
                'Q': this.currentPlayer === 'white' ? '♕' : '♛',
                'R': this.currentPlayer === 'white' ? '♖' : '♜',
                'B': this.currentPlayer === 'white' ? '♗' : '♝',
                'N': this.currentPlayer === 'white' ? '♘' : '♞'
            };
            
            if (pieceMap[newPiece]) {
                square.textContent = pieceMap[newPiece];
                square.dataset.piece = pieceMap[newPiece];
            }
        }
    }

    isKingInCheck(color) {
        // Şahın konumunu bul
        const kingPiece = color === 'white' ? '♔' : '♚';
        let kingSquare;
        for (let i = 0; i < 64; i++) {
            const square = this.board.children[i];
            if (square.dataset.piece === kingPiece) {
                kingSquare = square;
                break;
            }
        }

        // Tüm karşı taş hamlelerini kontrol et
        for (let i = 0; i < 64; i++) {
            const square = this.board.children[i];
            if (square.dataset.color === (color === 'white' ? 'black' : 'white')) {
                if (this.canPieceAttack(square, kingSquare)) {
                    return true;
                }
            }
        }
        return false;
    }

    canPieceAttack(from, to) {
        const piece = from.dataset.piece;
        const fromRow = parseInt(from.dataset.row);
        const fromCol = parseInt(from.dataset.col);
        const toRow = parseInt(to.dataset.row);
        const toCol = parseInt(to.dataset.col);

        switch(piece) {
            case '♙': // Beyaz Piyon
                return toRow === fromRow - 1 && Math.abs(toCol - fromCol) === 1;
            case '♟': // Siyah Piyon
                return toRow === fromRow + 1 && Math.abs(toCol - fromCol) === 1;
            case '♖':
            case '♜':
                return this.isValidRookMove(fromRow, fromCol, toRow, toCol);
            case '♘':
            case '♞':
                return this.isValidKnightMove(fromRow, fromCol, toRow, toCol);
            case '♗':
            case '♝':
                return this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
            case '♕':
            case '♛':
                return this.isValidQueenMove(fromRow, fromCol, toRow, toCol);
            case '♔':
            case '♚':
                return Math.abs(toRow - fromRow) <= 1 && Math.abs(toCol - fromCol) <= 1;
        }
        return false;
    }

    isCheckmate() {
        // Tüm olası hamleleri kontrol et
        for (let fromRow = 0; fromRow < 8; fromRow++) {
            for (let fromCol = 0; fromCol < 8; fromCol++) {
                const fromSquare = this.getSquare(fromRow, fromCol);
                if (fromSquare.dataset.color !== this.currentPlayer) continue;

                for (let toRow = 0; toRow < 8; toRow++) {
                    for (let toCol = 0; toCol < 8; toCol++) {
                        const toSquare = this.getSquare(toRow, toCol);
                        
                        // Geçici hamle yap
                        const tempMove = this.makeTemporaryMove(fromSquare, toSquare);
                        if (!this.isKingInCheck(this.currentPlayer)) {
                            this.undoTemporaryMove(fromSquare, toSquare, tempMove);
                            return false;
                        }
                        this.undoTemporaryMove(fromSquare, toSquare, tempMove);
                    }
                }
            }
        }
        return true;
    }

    makeTemporaryMove(from, to) {
        const tempMove = {
            fromPiece: from.dataset.piece,
            fromColor: from.dataset.color,
            toPiece: to.dataset.piece,
            toColor: to.dataset.color
        };

        to.dataset.piece = from.dataset.piece;
        to.dataset.color = from.dataset.color;
        delete from.dataset.piece;
        delete from.dataset.color;

        return tempMove;
    }

    undoTemporaryMove(from, to, tempMove) {
        from.dataset.piece = tempMove.fromPiece;
        from.dataset.color = tempMove.fromColor;
        
        if (tempMove.toPiece) {
            to.dataset.piece = tempMove.toPiece;
            to.dataset.color = tempMove.toColor;
        } else {
            delete to.dataset.piece;
            delete to.dataset.color;
        }
    }

    setupOnlineGame() {
        document.getElementById('createGameBtn').addEventListener('click', () => this.createGame());
        document.getElementById('joinGameBtn').addEventListener('click', () => this.joinGame());
    }

    createGame() {
        this.ws.send(JSON.stringify({
            type: 'create',
            board: this.getBoardState()
        }));
    }

    joinGame() {
        const gameId = document.getElementById('gameIdInput').value;
        this.ws.send(JSON.stringify({
            type: 'join',
            gameId: gameId
        }));
    }

    setupWebSocket() {
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'created':
                    this.gameId = data.gameId;
                    this.playerColor = data.color;
                    document.getElementById('gameStatus').textContent = 
                        `Oyun ID: ${this.gameId} - Rakip bekleniyor...`;
                    break;

                case 'joined':
                    this.gameId = data.gameId;
                    this.playerColor = data.color;
                    this.updateBoard(data.board);
                    document.getElementById('gameStatus').textContent = 
                        `Oyun başladı! Renginiz: ${this.playerColor === 'white' ? 'Beyaz' : 'Siyah'}`;
                    break;

                case 'opponent-joined':
                    document.getElementById('gameStatus').textContent = 
                        `Oyun başladı! Renginiz: ${this.playerColor === 'white' ? 'Beyaz' : 'Siyah'}`;
                    break;

                case 'move':
                    this.updateBoard(data.board);
                    this.currentPlayer = data.currentPlayer;
                    document.getElementById('currentPlayer').textContent = 
                        `Sıra: ${this.currentPlayer === 'white' ? 'Beyaz' : 'Siyah'}`;
                    break;

                case 'opponent-disconnected':
                    alert('Rakip oyundan ayrıldı!');
                    this.resetGame();
                    break;
            }
        };
    }

    resetGame() {
        while (this.board.firstChild) {
            this.board.removeChild(this.board.firstChild);
        }
        this.currentPlayer = 'white';
        document.getElementById('currentPlayer').textContent = 'Sıra: Beyaz';
        this.createBoard();
        this.setupPieces();
        this.gameId = null;
        this.playerColor = null;
        document.getElementById('gameStatus').textContent = '';
    }

    getBoardState() {
        const state = [];
        for (let i = 0; i < 64; i++) {
            const square = this.board.children[i];
            state.push({
                piece: square.dataset.piece || null,
                color: square.dataset.color || null
            });
        }
        return state;
    }

    updateBoard(boardState) {
        boardState.forEach((square, index) => {
            const element = this.board.children[index];
            if (square.piece) {
                element.textContent = square.piece;
                element.dataset.piece = square.piece;
                element.dataset.color = square.color;
            } else {
                element.textContent = '';
                delete element.dataset.piece;
                delete element.dataset.color;
            }
        });
    }
}

// Oyunu başlat
new Chess(); 