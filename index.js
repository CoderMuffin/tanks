const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const GameServer = require("./client/gameserver.js");
const Ammo = require("./client/muffin_ammo.js");
var ammo;
Ammo().then(function(_ammo) {
    ammo = _ammo;
});
var games = new Map();

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});
app.use(express.static(__dirname + "/client"));

io.on('connection', (socket) => {
    let gameID = null;
    let playerID = null;

    function joinGame(data) {
        let game = games.get(data.id.toString());
        if (game == null) {
            socket.emit("failure", `Cannot join game "${data.id}": game doesn't exist!`);
            return;
        }
        try {
            clearInterval(game.dcTimeout);
            console.log(`[${new Date()}] Cancelled closure of game "${data.id}"`);
        } catch { };
        playerID = game.addPlayer(socket, data.name.toString(), parseInt(data.color.replace("#", ""), 16), data.type);
        gameID = data.id;
    }

    function emit(game, message, data) {
        for (var key in game.players) {
            game.players[key].socket.emit(message, data);
        }
    }

    socket.on("disconnect", function() {
        let game = games.get(gameID);
        if (game) {
            game.removePlayer(playerID);
            
            if (Object.keys(game.players).length == 0) {
                console.log(`[${new Date()}] Queueing closure of game "${gameID}"`);
                game.dcTimeout = setTimeout(function() { //wait to allow reconnect
                    if (Object.keys(game.players).length == 0) {
                        console.log(`[${new Date()}] Closed game "${gameID}"`);
                        game.destroy();
                        games.delete(gameID);
                        console.log("Games open: " + games.size);
                    }
                }, 20000);
            }
        }
    });

    socket.on("new-game", async function(data) {
        let id = data.id.toString();

        if (games.get(id)) {
            socket.emit("failure", `Cannot create game "${id}": game already exists!`);
            return;
        }

        console.log(`[${new Date()}] Created game "${id}"`);
        let game = new GameServer(ammo, {
            hardSync: function(player, data) {
                player.socket.emit("hard-sync", data);
            },
            sync: function(data) {
                emit(game, "sync", data);
            },
            spawnBullet: function(data) {
                emit(game, "spawn-bullet", data);
            },
            addPlayer: function(data) {
                emit(game, "add-player", data);
            },
            hit: function(data) {}
        }, data.mapID);
        games.set(id, game);
        console.log("Games open: " + games.size);
    });

    socket.on("spawn-bullet-start", function() {
        let game = games.get(gameID);
        if (game == null) return;

        game.players[playerID].shooting = true;
    });

    socket.on("spawn-bullet-end", function() {
        let game = games.get(gameID);
        if (game == null) return;
        
        game.players[playerID].shooting = false;
    });

    socket.on("verify-game", function(id) {
        socket.emit("verify-game-result", games.get(id) != null);
    })

    socket.on("join-game", function(data) {
        joinGame(data);
    });

    socket.on("update-wasd", function(data) {
        let game = games.get(gameID);
        if (game == null) return;

        let player = game.players[playerID];
        if (!player) return;
        player.sync.wasd = data.wasd;
        if (game.inControl(player)) {
            //game.physics.lerpSync(player.body, data.sync, 0.2);
            game.physics.setSync(player.body, data.sync);
        }
    });

    socket.on("emote", function(emote) {
        let game = games.get(gameID);
        if (game == null) return;
        
        emit(game, "emote", { id: playerID, emote: emote });
    })

    socket.on("spawn-bullet", function() {
        let game = games.get(gameID);
        if (game == null) return;

        game.spawnBullet(playerID);
    })
});

server.listen(9211, () => {
    console.log('listening on *:9211');
});


