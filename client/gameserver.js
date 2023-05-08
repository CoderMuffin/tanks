if (typeof module == "object") {
    globalThis.Util = require("./util.js");
    globalThis.Physics = require("./physics.js");
}

class GameServer {
    constructor(ammo, callbacks, mapID = 0) {
        function simpleCube(x, z, size, mass) {
            return {
                position: { x: x, y: size / 2 - 0.5, z: z },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: size, y: size, z: size },
                friction: 0.8,
                mass: mass,
                texture: mass == 0 ? 0 : 1
            };
        }
        function deepCube(x, z, size) {
            return {
                position: { x: x, y: -0.5, z: z },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: size, y: size * 2, z: size },
                friction: 0.8,
                mass: 0,
                texture: 0
            };
        }
        function ring(fn, args, radius, step, excepts) {
            let result = [];
            for (var i = step - radius; i < radius; i += step) {
                if (!excepts.some(l => l.x == radius && l.z == i)) {
                    result.push(fn(radius, i, ...args));
                }
                if (!excepts.some(l => l.x == -radius && l.z == i)) {
                    result.push(fn(-radius, i, ...args));
                }
            }
            for (var i = step - radius; i < radius; i += step) {
                if (!excepts.some(l => l.z == radius && l.x == i)) {
                    result.push(fn(i, radius, ...args));
                }
                if (!excepts.some(l => l.z == -radius && l.x == i)) {
                    result.push(fn(i, -radius, ...args));
                }
            }

            if (!excepts.some(l => l.x == radius && l.z == radius)) {
                result.push(fn(radius, radius, ...args));
            }
            if (!excepts.some(l => l.x == radius && l.z == -radius)) {
                result.push(fn(radius, -radius, ...args));
            }
            if (!excepts.some(l => l.x == -radius && l.z == radius)) {
                result.push(fn(-radius, radius, ...args));
            }
            if (!excepts.some(l => l.x == -radius && l.z == -radius)) {
                result.push(fn(-radius, -radius, ...args));
            }

            return result;
        }
        this.callbacks = callbacks;
        this.players = {};
        this.cubes = [[
            {
                position: { x: 0, y: -1, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: 40, y: 1, z: 40 },
                friction: 0.5,
                mass: 0,
                texture: 0
            },
            deepCube(4, 4, 2, 0),
            deepCube(-4, 4, 2, 0),
            deepCube(4, -4, 2, 0),
            deepCube(-4, -4, 2, 0),

            simpleCube(0, 4, 2, 20),
            simpleCube(0, -4, 2, 20),
            simpleCube(4, 0, 2, 20),
            simpleCube(-4, 0, 2, 20),

            ...ring(simpleCube, [2, 20], 8, 2, [{ x: 0, z: 8 }, { x: 8, z: 0 }, { x: 0, z: -8 }, { x: -8, z: 0 }]),
            ...ring(simpleCube, [4, 30], 14, 4, [])
        ], [
            {
                position: { x: 0, y: -1, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: 40, y: 1, z: 40 },
                friction: 0.5,
                mass: 0,
                texture: 0
            }
        ], [
            {
                position: { x: 0, y: -1, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                size: { x: 20, y: 1, z: 20 },
                friction: 0.5,
                mass: 0,
                texture: 0
            },
            ...ring(simpleCube, [0.8, 20], 9, 1, [])
        ]][mapID];
        for (var cube of this.cubes) {
            cube.id = this.generateID();
        }
        this.moveableCubes = this.cubes.filter(cube => cube.mass > 0);
        this.bullets = [];
        this.lastTime = Date.now();
        this.tmpTrans = new ammo.btTransform();
        this.tmpVec = new ammo.btVector3();

        this.ready = true;

        this.intervals = [
            setInterval(() => this.ping(), 3000),
            setInterval(() => this.sync(), 300),
            setInterval(() => this.step(), 16)
        ];

        this.physics = new Physics(ammo, (a, b) => this.onCollision(a, b));

        Util.addCubeBodies(this.physics, this.cubes);
    }
    onCollision(a, b) {
        let bullet = this.bullets.find(bullet => bullet.body == a || bullet.body == b);
        if (bullet) {
            for (var key in this.players) {
                let player = this.players[key];
                if (player.id == bullet.firer) {
                    continue;
                }
                if (player.body == a || player.body == b) {
                    if (this.callbacks.hit) {
                        this.callbacks.hit({ who: player.id, by: bullet.firer });
                    }
                    player.lastHitBy = bullet.firer;
                    player.lastControlLoss = Date.now();
                    player.sync.hp -= 1;
                }
            }
        }
    }
    generateID() {
        return (new Array(16)).fill().map(_ => Math.floor(Math.random() * 16).toString(16)).join("");
    }
    ping() {
        //this.emit("ping", Date.now());
    }
    addPlayer(socket, name, color, type) {
        let localID = this.generateID();
        let player = {
            body: Util.newPlayerBody(this.physics, type),
            shooting: false,
            ammoCooldown: false,
            ammo: Util.tankData[type].ammo,
            lastControlLoss: 0,
            lastHitBy: null,
            lastShot: Date.now(),
            score: 0,
            color: color,
            type: type,
            name: name,
            sync: {
                wasd: { x: 0, y: 0 },
                hp: 5,
                connected: true //marker for disconnects on clients
            },
            id: localID
        };
        player.socket = socket;
        this.players[player.id] = player;

        if (this.callbacks.hardSync) {
            this.callbacks.hardSync(player, {
                cubes: this.cubes,
                moveableCubes: this.serializeMoveable(true),
                id: player.id,
                players: Object.values(this.players).map(function(player) {
                    return {
                        id: player.id,
                        color: player.color,
                        type: player.type,
                        name: player.name,
                        score: player.score,
                        local: localID == player.id
                    };
                })
            });
        }

        if (this.callbacks.addPlayer) {
            this.callbacks.addPlayer({
                id: player.id,
                color: player.color,
                type: player.type,
                name: player.name,
                score: player.score
            });
        }

        return player.id;
    }
    serializeMoveable(all = false) {
        let self = this;
        return this.moveableCubes.reduce(function(acc, cube) {
            let sync = self.physics.getSync(cube.body);
            if (all || (cube.body.isActive() && sync.position.y >= -10)) {
                acc.push({
                    id: cube.id,
                    sync: sync
                });
            }
            return acc;
        }, []);
    }
    removePlayer(playerID) {
        //clients delete it in their own time
        this.physics.remove(this.players[playerID].body);
        delete this.players[playerID];
    }
    destroy() {
        for (var interval of this.intervals) {
            clearInterval(interval);
        }
        try {
            this.physics.ammo.destroy(this.physics.physicsWorld);
        } catch (e) {
            console.error(e);
        }
    }
    step() {
        if (!this.ready) {
            console.warn("Overclocked!");
            return;
        }
        this.ready = false;
        let now = Date.now();
        let deltaTime = now - this.lastTime;
        this.lastTime = now;
        this.physics.step(deltaTime);
        for (var key in this.players) {
            let player = this.players[key];
            if (/* !player.ammoCooldown && */ player.shooting && now - player.lastShot > Util.tankData[player.type].cooldown) {
                player.lastShot = now;
                // player.ammo--;
                // if (player.ammo <= 0) {
                //     player.ammoCooldown = true;
                //     player.ammo = Util.tankData[player.type].ammo;
                //     setTimeout(function() {
                //         player.ammoCooldown = false;
                //     }, Util.tankData[player.type].ammoCooldown);
                // }
                this.spawnBullet(player);
            }
            this.players[key] = Util.stepPlayer(this.physics.ammo, this.players[key], deltaTime);
        }
        this.ready = true;
    }
    sync() {
        let self = this;
        let scoreData = [];
        let syncData = {
            players: Object.values(this.players).map(function(player) {
                let physicsSync = self.physics.getSync(player.body);
                
                if (physicsSync && physicsSync.position.y <= -10) {
                    physicsSync.position = { x: 0, y: 0, z: 0 };
                    physicsSync.rotation = { x: 0, y: 0, z: 0, w: 1 };
                    self.physics.setSync(player.body, physicsSync);
                    
                    player.score = Math.max(0, player.score - 1);
                    let firer = self.players[player.lastHitBy];
                    if (firer) {
                        firer.score++;
                    }
                    
                    scoreData.push([player.id, player.score, player.lastHitBy, firer ? firer.score : 0]);
                    player.lastHitBy = null;
                    player.lastControlLoss = Date.now();
                }
                let syncData = {
                    id: player.id,
                    sync: player.sync,
                    physicsSync: physicsSync
                };
                if (!self.inControl(player)) {
                    syncData.authoritative = true;
                }
                return syncData;
            }),
            bullets: this.bullets.map(bullet => ({
                id: bullet.id,
                sync: this.physics.getSync(bullet.body)
            })),
            moveableCubes: this.serializeMoveable()
        }

        syncData.scoreData = scoreData;
        if (this.callbacks.sync) {
            this.callbacks.sync(syncData);
        }
    }
    inControl(player) {
        return Date.now() - player.lastControlLoss > 2000;
    }
    spawnBullet(player) {
        let bulletID = this.generateID();
        let ms = player.body.getMotionState();
        if (!ms) {
            console.log("no motion state!");
        }

        ms.getWorldTransform(this.tmpTrans);

        let speed = Util.tankData[player.type].bulletSpeed;
        let p = this.tmpTrans.getOrigin();
        let from = { x: p.x(), y: p.y(), z: p.z() };

        let q = this.tmpTrans.getRotation();
        Util.getFacingFromQuaternion(q, this.tmpVec);
        this.tmpVec.normalize();
        let vel = { x: this.tmpVec.x(), y: this.tmpVec.y(), z: this.tmpVec.z() };

        from.x += vel.x * 0.8;
        from.y += vel.y * 0.8;
        from.z += vel.z * 0.8;

        vel.x *= speed;
        vel.y *= speed;
        vel.z *= speed;

        let mass = Util.tankData[player.type].bulletMass;

        if (this.callbacks.spawnBullet) {
            this.callbacks.spawnBullet({
                id: bulletID,
                color: player.color,
                firer: player.id,
                mass: mass,
                from: from,
                vel: vel
            });
        }
        
        let ball = Util.spawnBullet(this.physics, from, vel, mass);
        this.bullets.push({
            id: bulletID,
            body: ball,
            mass: mass,
            firer: player.id
        });
        //player.body.setIgnoreCollisionCheck(ball, true); //stop firer from hitting themself
        let self = this;
        setTimeout(function() {
            let bulletIndex = self.bullets.findIndex(bullet => bullet.id == bulletID);
            self.physics.remove(self.bullets[bulletIndex].body);
            self.bullets.splice(bulletIndex, 1);
        }, Util.BULLET_DESPAWN_DELAY);
    }
}

if (typeof module == "object") {
    module.exports = GameServer;
}
