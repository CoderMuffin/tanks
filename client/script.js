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
var elTankClass = document.getElementById("tank-class");
var elMobileButton = document.getElementById("enable-mobile-button");
var elMobileControls = document.getElementById("mobile-controls");

var demoTank = null;
var socket = io();
var gameID = null;
var game;

var localServer;

var gameResources = {};

var tankClass = 1;
var tankClassNames = [
    "Light",
    "Medium",
    "Heavy"
];

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
    grid.addEventListener("touchend", () => updateWasd({ x: 0, y: 0 }));
    
    let shootButton = document.getElementById("mobile-button-shoot");
    shootButton.addEventListener("touchstart", function() {
        socket.emit("spawn-bullet-start");
    });
    shootButton.addEventListener("touchend", function() {
        socket.emit("spawn-bullet-end");
    });
}

registerMobileButtons();

function toggleMobileControls() {
    elMobileControls.style.display = elMobileControls.style.display == "none" ? "block" : "none";
}

function changeTankClass(change) {
    tankClass += change;
    while (tankClass >= tankClassNames.length) {
        tankClass -= tankClassNames.length;
    }
    while (tankClass < 0) {
        tankClass += tankClassNames.length;
    }
    elTankClass.innerText = tankClassNames[tankClass];
}

function loadResources() {
    const modelLoader = new THREE.OBJLoader();
    modelLoader.load("obj/tank.obj", model => model.traverse(mesh => gameResources.tankGeometry = mesh.geometry));

    const fontLoader = new THREE.FontLoader();
    fontLoader.load("font/golos.json", font => gameResources.threeFont = font);
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
socket.on("hard-sync", function(data) {
    showToast("Joined game");
    elCreateDialog.style.display = "none";
    elJoinDialog.style.display = "none";
    game.hardSync(data);
});
socket.on("verify-game-result", function(exists) {
    if (!exists) {
        showToast(`Cannot join game '${gameID}' as it does not exist!`);
        cancelJoin();
    } else {
        prepareJoin();
    }
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

function createGameLocal() {
    let mode = "2Poffline";
    prepareJoin(mode);
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
    socket.emit("new-game", gameID.toString());
    elLoading.style.opacity = "1";
    setTimeout(function() {
        window.location.replace(window.location.origin + window.location.pathname + `?game=${gameID}`);
    }, 500);
}

function prepareJoin(mode) {
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
    let joinData = {
        id: gameID.toString(),
        type: tankClass,
        color: elTankColor.value,
        name: elTankName.value
    };
    elLoading.style.opacity = "0";
    elMobileButton.style.display = "inline-block";
    showToast(`Joining game "${gameID}"`);
    game.removeDemoTank();
    socket.emit("join-game", joinData);
}

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

socket.on("hit", function(data) {
    game.hit(data);
});

function updateWasd(wasd) {
    if ((!game) || (!socket)) return;
    let player = game.players[game.localID];
    if (player) {
        player.sync.wasd = wasd;
    }
    socket.emit("update-wasd", wasd);
}

let shootCooldown = Date.now();
let wasd = { x: 0, y: 0 };
window.addEventListener("keydown", function(e) {
    let newWasd = { x: wasd.x, y: wasd.y };
    if (e.code == "KeyA" || e.code == "ArrowLeft") {
        newWasd.x = -1;
    } else if (e.code == "KeyD" || e.code == "ArrowRight") {
        newWasd.x = 1;
    } else if (e.code == "KeyW" || e.code == "ArrowUp") {
        newWasd.y = 1;
    } else if (e.code == "KeyS" || e.code == "ArrowDown") {
        newWasd.y = -1;
    } else if (e.code == "Space") {
        socket.emit("spawn-bullet-start");
        return; //prevent WASD update
    } else if (e.code == "BrowserForward") {
        createGameLocal();
    }
    if (newWasd.x != wasd.x || newWasd.y != wasd.y) {
        wasd = newWasd;
        updateWasd(wasd);
    }
});
window.addEventListener("keyup", function(e) {
    if (e.code == "KeyA" || e.code == "ArrowLeft") {
        wasd.x = 0;
    } else if (e.code == "KeyD" || e.code == "ArrowRight") {
        wasd.x = 0;
    } else if (e.code == "KeyW" || e.code == "ArrowUp") {
        wasd.y = 0;
    } else if (e.code == "KeyS" || e.code == "ArrowDown") {
        wasd.y = 0;
    } else if (e.code == "Space") {
        socket.emit("spawn-bullet-end");
    }
    updateWasd(wasd);
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
