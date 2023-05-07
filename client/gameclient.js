class GameClient {
    constructor(resources, ammo, mode = "online") {
        this.threeFont = resources.threeFont;
        this.tankGeometry = resources.tankGeometry;
        this.elDebug = document.getElementById("debug");
        this.debug = {
            cubes: 0,
        };
        this.emotes = resources.emotes;
        this.mode = mode;
        
        this.cubes = {};
        this.bullets = {};
        this.players = {};
        this.localIDs = [];

        this.physics = new Physics(ammo);
        this.initTHREE();
        
        let self = this;
        if (mode == "online") {
            setInterval(function() {
                for (var id in self.players) {
                    let player = self.players[id];
                    if (!self.localIDs.includes(id) && !player.sync.connected) {
                        console.log("dc'd "+id);
                        self.physics.remove(player.body);
                        self.scene.remove(player.model);
                        delete self.players[id];
                    }
                    //if server doesn't reset it, either they or we have lost contact
                    player.sync.connected = false;                
                }
            }, 3000);
        }

        this.lastTime = Date.now();
        this.animate();
    }
    
    initTHREE(multiplayer) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x00c8ff);
        this.threeTmp = {
            v: new THREE.Vector3(),
            q: new THREE.Quaternion(),
            o: new THREE.Object3D()
        }
        
        this.cameras = [];

        let cameraCount = this.mode == "2Poffline" ? 2 : 1;

        for (var i = 0; i < cameraCount; i++) {
            let renderer = new THREE.WebGLRenderer();
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.setSize(window.innerWidth / cameraCount, window.innerHeight);
            renderer.domElement.className = "game-canvas";
            renderer.domElement.style.left = 100 / cameraCount * i;
            renderer.domElement.style.right = 100 - 100 / cameraCount * (i + 1);
            document.body.appendChild(renderer.domElement);
            this.cameras.push({
                camera: new THREE.PerspectiveCamera(75, window.innerWidth / cameraCount / window.innerHeight, 0.1, 1000),
                target: null,
                renderer: renderer
            });
            this.cameras[i].camera.position.set(3, 3, 3);
            this.cameras[i].camera.lookAt(0, 0, 0);
        }

        let directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(-10, 10, 5);
        directionalLight.lookAt(0, 0, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.bottom = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);
        
        let ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        let self = this;
        window.addEventListener("resize", function() {
            for (var camera of self.cameras) {
                camera.camera.aspect = window.innerWidth / cameraCount / window.innerHeight;
                camera.camera.updateProjectionMatrix();
                camera.renderer.setSize(window.innerWidth / cameraCount, window.innerHeight);
            }
        });
    }

    addDemoTank() {
        let material = new THREE.MeshPhongMaterial({ color: 0xff0000, side: THREE.DoubleSide });
        this.demoTank = new THREE.Mesh(this.tankGeometry, material);
        this.scene.add(this.demoTank);
    }

    removeDemoTank() {
        this.scene.remove(this.demoTank);
    }

    spawnBullet(data) {
        let ball = Util.spawnBullet(this.physics, data.from, data.vel, data.mass);

        let geometry = new THREE.SphereGeometry(Util.bulletSize(data.mass));
        let material = new THREE.MeshPhongMaterial({ color: data.color });
        let mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(data.from.x, data.from.y, data.from.z);
        this.scene.add(mesh);
        this.bullets[data.id] = {
            body: ball,
            model: mesh
        }
        let self = this;
        // this.players[data.firer].body.setIgnoreCollisionCheck(ball, true); //stop firer from hitting themself
        setTimeout(function() {
            self.physics.remove(self.bullets[data.id].body);
            self.scene.remove(self.bullets[data.id].model);
            delete self.bullets[data.id];
        }, Util.BULLET_DESPAWN_DELAY); //small antidelay to prevent deletion after server
    }

    animate() {
        let now = Date.now();
        let deltaTime = now - this.lastTime;
        this.lastTime = now;

        this.elDebug.innerText = `fps ${Math.round(1/deltaTime*1000)} cubes ${this.debug.cubes}`;
        this.physics.step(deltaTime);
        requestAnimationFrame(() => this.animate());

        if (this.demoTank) {
            this.demoTank.rotation.y += deltaTime / 3000;
        }
        
        for (var id in this.players) {
            this.players[id] = Util.stepPlayer(this.physics.ammo, this.players[id], deltaTime);
            if (this.cameras.length == 1) {
                this.players[id].text.lookAt(this.cameras[0].camera.position);
                this.players[id].emote.lookAt(this.cameras[0].camera.position);
            }
            if (this.players[id].physicsSyncAspiration) {
                this.physics.lerpSync(this.players[id].body, this.players[id].physicsSyncAspiration, 0.01);
            }
            Util.updateModel(this.physics.ammo, this.players[id].body, this.players[id].model, true);
        }

        for (var id in this.bullets) {
            Util.updateModel(this.physics.ammo, this.bullets[id].body, this.bullets[id].model);
        }

        for (var id in this.cubes) {
            Util.updateModel(this.physics.ammo, this.cubes[id].body, this.cubes[id].model);
        }

        for (var camera of this.cameras) {
            if (camera.target) {
                camera.target.getWorldDirection(this.threeTmp.v);
                this.threeTmp.v.setY(0).normalize().negate().multiplyScalar(2).setY(1).add(camera.target.position);
                //threejs is stupid here
                //i never thought id see the day
                //doesnt matter though because 30mins of work is now worth nothing :DDDDD
                // this.threeTmp.o.position.copy(camera.target.position);
                // this.threeTmp.o.lookAt(this.threeTmp.v);
                camera.camera.position.copy(this.threeTmp.v);
                camera.camera.lookAt(camera.target.position)
                //camera.camera.quaternion.slerp(this.threeTmp.o.quaternion, 0.2);
            }
            camera.renderer.render(this.scene, camera.camera);
        }
    }

    hit() {
        
    }

    createPlayer(data) {
        if (this.players[data.id]) return;

        if (data.local) {
            this.localIDs.push(data.id);
        }
        
        let meshGroup = new THREE.Group();
        
        let material = new THREE.MeshPhongMaterial({ color: data.color, side: THREE.DoubleSide });
        let cube = new THREE.Mesh(this.tankGeometry, material);
        cube.castShadow = true;
        meshGroup.add(cube);
        
        let fontGeometry = this.tankText(data.name + ": 0");
        let text = new THREE.Mesh(fontGeometry, material);
        text.position.set(0, 0.5, 0);
        text.scale.set(0.2, 0.2, 0.2);
        meshGroup.add(text);
        
        let planeGeometry = new THREE.PlaneGeometry(0.4, 0.4);
        let emote = new THREE.Mesh(planeGeometry, material);
        emote.position.set(0.3, 0.2, 0.5);
        emote.scale.set(0, 0, 0);
        meshGroup.add(emote);
        
        this.scene.add(meshGroup);

        this.players[data.id] = {
            model: meshGroup,
            text: text,
            emote: emote,
            name: data.name,
            color: data.color,
            type: data.type,
            body: Util.newPlayerBody(this.physics, data.type),
            lastFetched: Date.now(),
            sync: {
                wasd: { x: 0, y: 0 },
                hp: 5,
                connected: true //assume connected until we reset otherwise weird stuff happens
            }
        }
    }

    tankText(name) {
        let geometry = new THREE.TextGeometry(name, {
            font: this.threeFont,
            size: 1,
            height: 0.5,
            curveSegments: 4,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.05,
            bevelSegments: 3
        });
        geometry.center();
        return geometry;
    }

    sync(syncData) {
        for (var remotePlayer of syncData.players) {
            if (this.players[remotePlayer.id] == null) {
                console.warn(`No such player for id "${remotePlayer.id}"`);
                continue;
            }
            
            let forceSync = !this.localIDs.includes(remotePlayer.id) || remotePlayer.authoritative;
            
            if (forceSync) {
                this.players[remotePlayer.id].sync = remotePlayer.sync;
                this.physics.setSync(this.players[remotePlayer.id].body, remotePlayer.physicsSync);
            } else {
                //this.players[remotePlayer.id].physicsSyncAspiration = remotePlayer.physicsSync;
            }
        }
        for (var remoteBullet of syncData.bullets) {
            if (this.bullets[remoteBullet.id]) {
                this.physics.setSync(this.bullets[remoteBullet.id].body, remoteBullet.sync);
            } else {
                console.warn(`No such bullet for id "${remoteBullet.id}"`)
            }
        }
        for (var remoteMoveableCube of syncData.moveableCubes) {
            if (this.cubes[remoteMoveableCube.id]) {
                this.physics.setSync(this.cubes[remoteMoveableCube.id].body, remoteMoveableCube.sync);
            } else {
                console.warn(`No such cube for id "${remoteMoveableCube.id}"`)
            }
        }
        this.debug.cubes = syncData.moveableCubes.length;
        for (var scoreData of syncData.scoreData) {
            console.log(scoreData);
            this.updateScore(scoreData[0], scoreData[1]);
            if (this.players[scoreData[2]]) {
                this.updateScore(scoreData[2], scoreData[3]);
            }
        }
    }

    emote(id, emote) {
        let player = this.players[id];
        if (!player) return;
        clearInterval(player.emoteTimeout);
        player.emote.material = this.emotes[emote];
        player.emote.scale.set(1, 1, 1);
        player.emoteTimeout = setTimeout(function() {
            player.emote.scale.set(0, 0, 0);
        }, 3000);
    }

    updateScore(playerID, score) {
        let player = this.players[playerID];
        player.score = score;
        //1 is text, 0 is model
        let text = player.text;
        text.geometry.dispose();
        text.geometry = this.tankText(player.name + ": " + score);
    }

    hardSync(syncData) {
        for (var cube of syncData.cubes) {
            this.cubes[cube.id] = cube;
        }
        for (var player of syncData.players) {
            this.createPlayer(player);
        }
        Util.addCubeBodies(this.physics, Object.values(this.cubes), this.scene);
    }
}
