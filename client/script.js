var elToastContainer = document.getElementById("toast-container");
var elJoinDialog = document.getElementById("join-dialog");
var elCreateDialog = document.getElementById("create-dialog");
var elGameId = document.getElementById("game-id");
var elGameIdDisplay = document.getElementById("game-id-display");
var elPing = document.getElementById("ping");

var elLoading = document.getElementById("loading");
var elTankColor = document.getElementById("tank-color");
var elTankColorButton = document.getElementById("tank-color-button");
var elTankName = document.getElementById("tank-name");
var elHelpDialog = document.getElementById("help-dialog");
var elMobileButton = document.getElementById("enable-mobile-button");
var elMobileControls = document.getElementById("mobile-controls");
var elLeaderboard = document.getElementById("leaderboard");

var demoTank = null;
var socket = io();
var gameID = null;
var game = null;

var localServer = null;

var gameResources = {};

var joining = false;

class Chooser {
    constructor(contentID, data, startPos = 0) {
        this.elContent = document.getElementById(contentID);
        this.data = data;
        this.value = startPos;
    }
    next() {
        let self = this;
        self.value++;
        while (self.value >= self.data.length) {
            self.value -= self.data.length;
        }
        self.elContent.innerText = self.data[self.value];
    }
    prev() {
        let self = this;
        self.value--;
        while (self.value < 0) {
            self.value += self.data.length;
        }
        self.elContent.innerText = self.data[self.value];
    }
}

let tankClassChooser = new Chooser("tank-class", [
    "Light",
    "Medium",
    "Heavy"
], 1);

let mapChooser = new Chooser("map", [
    "Standard",
    "Flat",
    "Small flat"
]);

function registerMobileButtons() {
    let grid = document.getElementById("mobile-wasd-grid");
    let onmove = function(e) {
        var rect = grid.getBoundingClientRect();
        var x = e.touches[0].clientX - rect.left; //x position within the element.
        var y = e.touches[0].clientY - rect.top;  //y position within the element.
        let newWasd = {
            x: Math.floor(x/rect.width*3)-1,
            y: 1-Math.floor(y/rect.height*3)
        };
        newWasd.x = Math.min(Math.max(newWasd.x, -1), 1);
        newWasd.y = Math.min(Math.max(newWasd.y, -1), 1);
        if (newWasd.x != wasd.x || newWasd.y != wasd.y) {
            wasd = newWasd;
            updateWasd(wasd);
        }
    };
    grid.addEventListener("touchmove", onmove);
    grid.addEventListener("touchstart", onmove);
    document.body.addEventListener("touchend", () => {
        wasd.x = 0;
        wasd.y = 0;
        updateWasd(wasd);
    });
    
    let shootButton = document.getElementById("mobile-button-shoot");
    shootButton.addEventListener("touchstart", function() {
        socket.emit("spawn-bullet-start");
    });
    shootButton.addEventListener("touchend", function() {
        socket.emit("spawn-bullet-end");
    });
}

registerMobileButtons();

setInterval(function() {
    updateWasd(wasd);
}, 100);

function toggleMobileControls() {
    elMobileControls.style.display = elMobileControls.style.display == "none" ? "block" : "none";
}

function loadResources() {
    const modelLoader = new THREE.OBJLoader();
    modelLoader.load("obj/tank.obj", model => model.traverse(mesh => gameResources.tankGeometry = mesh.geometry));

    const fontLoader = new THREE.FontLoader();
    fontLoader.load("font/golos.json", font => gameResources.threeFont = font);

    gameResources.emotes = [
        new THREE.MeshBasicMaterial({ map: (new THREE.TextureLoader()).load('img/codermuffin1024x1024.png'), transparent: true }),
        new THREE.MeshBasicMaterial({ map: (new THREE.TextureLoader()).load('img/laughing-emote-dank.png'), transparent: true }),
        new THREE.MeshBasicMaterial({ map: (new THREE.TextureLoader()).load('img/thumbs-up.png'), transparent: true }),
        new THREE.MeshBasicMaterial({ map: (new THREE.TextureLoader()).load('img/thumbs-up-2.png'), transparent: true }),
        new THREE.MeshBasicMaterial({ map: (new THREE.TextureLoader()).load('img/nerd-emote.jpg') }),
        new THREE.MeshBasicMaterial({ map: (new THREE.TextureLoader()).load('img/moai.png'), transparent: true })
    ];

    gameResources.leaderboard = document.getElementById("leaderboard-content");
}

loadResources();

var randomColor = "#" + Math.floor(Math.random() * 16**6).toString(16);
elTankColor.value = randomColor;

var params = new URLSearchParams(window.location.search);
if (params.get("game")) { //at some point we are going to load a game
    elLoading.style.opacity = "1";
}
elTankColor.addEventListener("change", function() {
    updateColors();
});

var ammo;
Ammo().then(function(_ammo) {
    ammo = _ammo;
});

socket.on("sync", function(data) {
    game.sync(data);
});
socket.on("ping", function(data) {
    let ping = Date.now() - data;
    elPing.innerText = ping;
});
socket.on("spawn-bullet", function(data) {
    game.spawnBullet(data);
});
socket.on("add-player", function(data) {
    console.log(data);
    game.createPlayer(data);
});
socket.on("hard-sync", function(data) {
    showToast("Joined game");
    elCreateDialog.style.display = "none";
    elJoinDialog.style.display = "none";
    game.hardSync(data);
    for (var i = 0; i < game.cameras.length; i++) {
        console.log(game.cameras, game.localIDs, i);
        game.cameras[i].target = game.players[game.localIDs[i]].model;
    }
});
socket.on("verify-game-result", function(exists) {
    if (!exists) {
        showToast(`Cannot join game '${gameID}' as it does not exist!`);
        cancelJoin();
        joining = false;
    } else {
        prepareJoin();
    }
});
socket.on("disconnect", function() {
    showToast("Disconnected from server");
});
socket.on("reconnect", function() {
    //showToast("Reconnected to server");
    //game.reconnect();
});
socket.on("failure", function(message) {
    showToast("Error: " + message);
});
socket.on("connect", function() {
    showToast("Connected to server");
    let gameIDurl = params.get("game");
    if (gameIDurl !== null) {
        gameID = gameIDurl;
        showToast(`Joining game "${gameID}"`);
        socket.emit("verify-game", gameID);
    }
});
socket.on("emote", function(data) {
    game.emote(data.id, data.emote);
})

async function createGameLocal() {
    while (!ammo) await new Promise(resolve => setTimeout(resolve, 100));
    let mode = "2Poffline";
    prepareJoin(mode);
    game.removeDemoTank();
    elJoinDialog.style.display = "none";
    let hardSynced = false;
    localServer = new GameServer(ammo, {
        hardSync: function(player, data) {
            if (hardSynced) return;
            hardSynced = true;
            game.hardSync(data);
        },
        sync: function(data) {
            game.sync(data);
        },
        spawnBullet: function(data) {
            game.spawnBullet(data);
        },
        hit: function(data) {}
    });
    localServer.addPlayer(null, "Player 1", "#0000ff", 1);
    localServer.addPlayer(null, "Player 2", "#ff0000", 1);
}

function updateColors() {
    if (game.demoTank) {
        game.demoTank.material.color = new THREE.Color(parseInt(elTankColor.value.replace("#", ""), 16));
    }
    elTankColorButton.style.backgroundColor = elTankColor.value;
}

var helpOpen = false;
function toggleHelp() {
    helpOpen = !helpOpen;
    elHelpDialog.style.top = helpOpen ? "0" : "-100%";
    elHelpDialog.style.bottom = helpOpen ? "0" : "100%";
}

function createGame() {
    gameID = elGameId.value;
    socket.emit("new-game", {
        id: gameID.toString(),
        mapID: mapChooser.value
    });
    elLoading.style.opacity = "1";
    setTimeout(function() {
        window.location.replace(window.location.origin + window.location.pathname + `?game=${gameID}`);
    }, 500);
}

async function prepareJoin(mode) {
    while (!ammo) await new Promise(resolve => setTimeout(resolve, 100));
    game = new GameClient(gameResources, ammo, mode);
    elLoading.style.opacity = "0";
    if (gameID === null) {
        gameID = elGameId.value;
    }

    game.addDemoTank();
    updateColors();

    elGameIdDisplay.innerText = gameID;
    elJoinDialog.style.display = "flex";
    elCreateDialog.style.display = "none";
}

function cancelJoin() {
    elLoading.style.opacity = "0";
    elJoinDialog.style.display = "none";
    elCreateDialog.style.display = "flex";
    if (game) {
        game.removeDemoTank();
    }
}

function startJoin() {
    elLoading.style.opacity = "1";
    gameID = elGameId.value;
    socket.emit("verify-game", gameID);
}

let joiningPlayer1 = true;
function joinGame() {
    if (joining) return;
    let joinData = {
        id: gameID.toString(),
        type: tankClassChooser.value,
        color: elTankColor.value,
        name: elTankName.value
    };
    elLoading.style.opacity = "0";
    elLeaderboard.style.display = "block";
    elMobileButton.style.display = "inline-block";
    showToast(`Joining game "${gameID}"`);
    game.removeDemoTank();
    socket.emit("join-game", joinData);
    joining = true;
}

function updateWasd(wasd) {
    if ((!game) || (!socket)) return;
    let player = game.players[game.localIDs[0]];
    if (player) {
        player.sync.wasd = wasd;
        socket.emit("update-wasd", {
            wasd: wasd,
            sync: game.physics.getSync(player.body)
        });
    }
}
function calcWasd(inputs) {
    return {
        x: (inputs.right ? 1 : 0) - (inputs.left ? 1 : 0),
        y: (inputs.up ? 1 : 0) - (inputs.down ? 1 : 0)
    };
}
let shootCooldown = Date.now();
let wasd = { x: 0, y: 0 };
let inputs = {
    left: false,
    right: false,
    up: false,
    down: false
};
window.addEventListener("keydown", function(e) {
    if (e.code == "KeyA" || e.code == "ArrowLeft") {
        inputs.left = true;
    } else if (e.code == "KeyD" || e.code == "ArrowRight") {
        inputs.right = true;
    } else if (e.code == "KeyW" || e.code == "ArrowUp") {
        inputs.up = true;
    } else if (e.code == "KeyS" || e.code == "ArrowDown") {
        inputs.down = true;
    } else if (e.code == "Space" && !e.repeat) {
        socket.emit("spawn-bullet-start");
        return; //prevent WASD update
    } else if (e.code == "BrowserForward") {
        createGameLocal();
    } else if (e.code == "Slash") {
        if (game) {
            
        }
    }
    let newWasd = calcWasd(inputs);
    if (newWasd.x != wasd.x || newWasd.y != wasd.y) {
        wasd = newWasd;
        updateWasd(wasd);
    }
});
window.addEventListener("keyup", function(e) {
    if (e.code == "KeyA" || e.code == "ArrowLeft") {
        inputs.left = false;
    } else if (e.code == "KeyD" || e.code == "ArrowRight") {
        inputs.right = false;
    } else if (e.code == "KeyW" || e.code == "ArrowUp") {
        inputs.up = false;
    } else if (e.code == "KeyS" || e.code == "ArrowDown") {
        inputs.down = false;
    } else if (e.code == "Space") {
        socket.emit("spawn-bullet-end");
    }
    let newWasd = calcWasd(inputs);
    wasd = newWasd;
    updateWasd(wasd);
});
window.addEventListener("keypress", function(e) {
    //i know this can be optimised
    //i dont wanna hear it :D
    if (e.code == "Digit1") {
        socket.emit("emote", 0);
    }
    if (e.code == "Digit2") {
        socket.emit("emote", 1);
    }
    if (e.code == "Digit3") {
        socket.emit("emote", 2);
    }
    if (e.code == "Digit4") {
        socket.emit("emote", 3);
    }
    if (e.code == "Digit5") {
        socket.emit("emote", 4);
    }
    if (e.code == "Digit6") {
        socket.emit("emote", 5);
    }
});

function showToast(message) {
    let toast = document.createElement("div");
    toast.innerText = message;
    elToastContainer.prepend(toast);

    setTimeout(function() {
        toast.classList.add("active");
    }, 100);
    setTimeout(function() {
        toast.style.opacity = "0";
        setTimeout(function() {
            elToastContainer.removeChild(toast);
        }, 1000);
    }, 5000);
}

